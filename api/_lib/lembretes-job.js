// Envia por push os avisos de contas e cartões (uma vez por aviso e por aparelho). Chamado pelo cron diário da Vercel.
// Cada pessoa recebe só os avisos dos próprios dados, nos próprios aparelhos, e só se ainda tem acesso.
//   modo "real" (padrão): calcula, envia e registra   |  "dry": só calcula e devolve   |  "teste": manda um aviso fixo a cada aparelho
'use strict';
const crypto = require('crypto');
const { buildReminders, todaySP } = require('./lembretes.js');

const curto = s => crypto.createHash('sha256').update(s).digest('hex').slice(0, 12);   // identifica o aparelho sem guardar o endpoint inteiro
const host = e => { try { return new URL(e).host; } catch { return '?'; } };

function webpushConfigurado() {
  const wp = require('web-push');
  const { VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY } = process.env;
  if (!VAPID_SUBJECT || !VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) throw new Error('chaves VAPID não configuradas');
  wp.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  return wp;
}

async function executar({ query, modo = 'real', agora = new Date(), enviar }) {
  const subs = await query(
    `select s.endpoint, s.p256dh, s.auth, s.user_id::text as user_id
       from push_subscriptions s
       join usuarios u on u.id = s.user_id
       join acessos a on a.email = u.email`);
  const mandar = enviar || (async (sub, payload, opts) => (webpushConfigurado()).sendNotification(sub, payload, opts));
  const dePush = s => ({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } });

  if (modo === 'teste') {
    let enviados = 0, falhas = 0; const erros = [];
    for (const s of subs) {
      try { await mandar(dePush(s), JSON.stringify({ title: 'Aviso de teste', body: 'Os avisos estão chegando neste aparelho.', tag: 'teste' }), { TTL: 600, urgency: 'high' }); enviados++; }
      catch (e) { falhas++; erros.push({ aparelho: host(s.endpoint), status: e.statusCode, msg: String(e.message || e).slice(0, 120) }); }
    }
    return { teste: true, aparelhos: subs.length, enviados, falhas, erros };
  }

  const hoje = todaySP(agora);
  const ids = [...new Set(subs.map(s => s.user_id))];
  const linhas = ids.length
    ? await query(`select user_id::text as user_id, data from app_data where user_id::text in (select jsonb_array_elements_text($1::jsonb))`, [JSON.stringify(ids)])
    : [];
  const dados = new Map(linhas.map(r => [r.user_id, r.data]));

  const avisos = new Map(ids.map(id => [id, buildReminders({ tx: [], bills: [], cards: [], ...(dados.get(id) || {}) }, hoje)]));
  const tarefas = [];
  for (const s of subs) {
    for (const r of avisos.get(s.user_id)) tarefas.push({ chave: `${s.user_id}:${r.key}:${curto(s.endpoint)}`, aviso: r, sub: s });
  }
  if (modo === 'dry') {
    return { hoje, dry: true, usuarios: ids.length, aparelhos: subs.length, candidatos: tarefas.length,
             previa: tarefas.map(t => ({ titulo: t.aviso.title, corpo: t.aviso.body, aparelho: host(t.sub.endpoint) })) };
  }
  if (!tarefas.length) return { hoje, usuarios: ids.length, aparelhos: subs.length, candidatos: 0, enviados: 0 };

  const jaEnviadas = new Set((await query(`select key from reminder_log where key in (select jsonb_array_elements_text($1::jsonb))`,
    [JSON.stringify(tarefas.map(t => t.chave))])).map(r => r.key));

  let enviados = 0, falhas = 0, removidos = 0; const erros = [];
  for (const t of tarefas.filter(t => !jaEnviadas.has(t.chave))) {
    try {
      await mandar(dePush(t.sub), JSON.stringify({ title: t.aviso.title, body: t.aviso.body, tag: t.aviso.key }), { TTL: 60 * 60 * 12, urgency: 'high' });
      await query(`insert into reminder_log(key) values($1) on conflict (key) do nothing returning 1`, [t.chave]);   // por aparelho: quem falhou tenta de novo
      enviados++;
    } catch (e) {
      if (e.statusCode === 404 || e.statusCode === 410) { await query(`delete from push_subscriptions where endpoint = $1 returning 1`, [t.sub.endpoint]); removidos++; }
      else { falhas++; erros.push({ status: e.statusCode, msg: String(e.message || e).slice(0, 160) }); }
    }
  }
  await query(`delete from reminder_log where sent_at < now() - interval '120 days' returning 1`);
  return { hoje, usuarios: ids.length, aparelhos: subs.length, candidatos: tarefas.length, enviados, falhas, removidos, erros: erros.slice(0, 3) };
}
module.exports = { executar };
