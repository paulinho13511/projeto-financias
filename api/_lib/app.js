// Regras da API (login, dados, acessos, senha, avisos push). Função pura: handle({method,path,body,cookie,ip}) -> {status,body,setCookie}
// O banco entra de fora (criarApp({query})): em produção é o Neon (db.js), nos testes é um Postgres local.
// Sem transações: cada operação é uma sequência de comandos que pode ser repetida sem estragar nada.
'use strict';
const crypto = require('crypto');
const { promisify } = require('util');
const scrypt = promisify(crypto.scrypt);

const SESSAO_DIAS = 30, MAX_TENT_EMAIL = 5, MAX_TENT_IP = 20, JANELA_MIN = 15, MAX_DADOS = 1024 * 1024;
const norm = e => String(e || '').trim().toLowerCase();
const sha = t => crypto.createHash('sha256').update(t).digest('hex');
const SC = { N: 16384, r: 8, p: 1 };
// Versão do registro = updated_at como TEXTO (microssegundos intactos). Um Date do JavaScript perderia precisão e toda gravação daria conflito.

async function hashSenha(s) {
  const salt = crypto.randomBytes(16);
  const h = await scrypt(s, salt, 64, SC);
  return `scrypt$${SC.N}$${salt.toString('hex')}$${h.toString('hex')}`;
}
async function confere(s, stored) {
  if (!stored) return false;
  const [alg, N, salt, hex] = stored.split('$');
  if (alg !== 'scrypt') return false;
  const h = await scrypt(s, Buffer.from(salt, 'hex'), 64, { ...SC, N: +N });
  const b = Buffer.from(hex, 'hex');
  return b.length === h.length && crypto.timingSafeEqual(h, b);
}
let dummy;   // hash de mentira: igualar o tempo evita revelar se o e-mail existe
const DUMMY = () => dummy || (dummy = hashSenha('senha-falsa-para-igualar-o-tempo'));

const cookieSid = tok => `sid=${tok}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${SESSAO_DIAS * 86400}`;
const cookieFim = 'sid=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0';
const lerSid = c => { const m = /(?:^|;\s*)sid=([0-9a-f]{64})/.exec(c || ''); return m ? m[1] : null; };
const R = (status, body, setCookie) => ({ status, body, setCookie });
const senhaValida = s => typeof s === 'string' && s.length >= 10 && s.length <= 200;
const endpointValido = e => typeof e === 'string' && e.length <= 1000 && /^https:\/\/[^\s]+$/.test(e);
const b64urlValido = s => typeof s === 'string' && s.length >= 8 && s.length <= 200 && /^[A-Za-z0-9_-]+$/.test(s);

function criarApp({ query }) {
  async function autenticar(req) {
    const tok = lerSid(req.cookie);
    if (!tok) return null;
    const r = await query(
      `select u.id, u.email, a.is_admin from sessoes s
         join usuarios u on u.id = s.user_id
         join acessos a on a.email = u.email           -- perdeu o acesso = sessão deixa de valer
        where s.token_hash = $1 and s.expira_em > now()`, [sha(tok)]);
    return r[0] || null;
  }

  async function criarSessao(userId) {
    const tok = crypto.randomBytes(32).toString('hex');
    await query(`insert into sessoes(token_hash,user_id,expira_em) values($1,$2::uuid, now() + ($3 || ' days')::interval) returning 1`,
      [sha(tok), userId, String(SESSAO_DIAS)]);
    return tok;
  }

  async function handle(req) {
    const { method, path } = req, body = req.body || {};
    try {
      // ---- rotas públicas ----
      if (method === 'POST' && path === '/api/login') {
        const email = norm(body.email), senha = String(body.senha || '');
        const ip = String(req.ip || 'desconhecido');
        const t = (await query(`select count(*) filter (where email = $1) as por_email, count(*) filter (where ip = $2) as por_ip
                                  from tentativas_login where em > now() - ($3 || ' minutes')::interval`, [email, ip, String(JANELA_MIN)]))[0];
        if (+t.por_email >= MAX_TENT_EMAIL || +t.por_ip >= MAX_TENT_IP) return R(429, { erro: 'Muitas tentativas. Aguarde alguns minutos.' });
        const u = (await query(`select id, email, senha_hash from usuarios where email = $1`, [email]))[0];
        const ok = (await confere(senha, u ? u.senha_hash : await DUMMY())) && !!u;
        if (!ok) {
          await query(`insert into tentativas_login(email,ip) values($1,$2) returning 1`, [email, ip]);
          return R(401, { erro: 'E-mail ou senha incorretos.' });
        }
        const ac = (await query(`select is_admin from acessos where email = $1`, [email]))[0];
        if (!ac) return R(403, { erro: 'sem-acesso' });
        await query(`delete from tentativas_login where email = $1 or em < now() - interval '1 day' returning 1`, [email]);
        await query(`delete from sessoes where expira_em < now() returning 1`);   // limpeza
        return R(200, { email, is_admin: ac.is_admin }, cookieSid(await criarSessao(u.id)));
      }
      if (method === 'POST' && path === '/api/definir-senha') {           // convite de uso único
        if (!senhaValida(body.senha)) return R(400, { erro: 'A senha precisa ter pelo menos 10 caracteres.' });
        const c = (await query(`update convites set usado_em = now()
                                 where token_hash = $1 and usado_em is null and expira_em > now() returning user_id`, [sha(String(body.token || ''))]))[0];
        if (!c) return R(400, { erro: 'Convite inválido ou já usado.' });
        await query(`update usuarios set senha_hash = $1 where id = $2::uuid returning 1`, [await hashSenha(body.senha), c.user_id]);
        return R(200, { ok: true });
      }

      // ---- daqui para baixo, só logado ----
      const eu = await autenticar(req);
      if (!eu) return R(401, { erro: 'sessao' });

      if (method === 'POST' && path === '/api/logout') {
        await query(`delete from sessoes where token_hash = $1 returning 1`, [sha(lerSid(req.cookie))]);
        return R(200, { ok: true }, cookieFim);
      }
      if (method === 'GET' && path === '/api/me') return R(200, { email: eu.email, is_admin: eu.is_admin });

      if (method === 'GET' && path === '/api/dados') {
        let r = (await query(`select data, updated_at::text as versao from app_data where user_id = $1::uuid`, [eu.id]))[0];
        if (!r) r = (await query(`insert into app_data(user_id,updated_by) values($1::uuid,$2) on conflict (user_id) do update set user_id = excluded.user_id returning data, updated_at::text as versao`, [eu.id, eu.email]))[0];
        return R(200, r);
      }
      if (method === 'PUT' && path === '/api/dados') {
        if (!body.data || typeof body.data !== 'object' || Array.isArray(body.data)) return R(400, { erro: 'Dados inválidos.' });
        const txt = JSON.stringify(body.data);
        if (txt.length > MAX_DADOS) return R(413, { erro: 'Dados grandes demais.' });
        const r = (await query(`update app_data set data = $1::jsonb, updated_at = clock_timestamp(), updated_by = $2
                                 where user_id = $3::uuid and updated_at = $4::timestamptz returning updated_at::text as versao`,
          [txt, eu.email, eu.id, String(body.versao || '')]))[0];
        return r ? R(200, r) : R(409, { erro: 'conflito' });
      }
      if (method === 'POST' && path === '/api/senha') {
        if (!senhaValida(body.nova)) return R(400, { erro: 'A senha precisa ter pelo menos 10 caracteres.' });
        await query(`update usuarios set senha_hash = $1 where id = $2::uuid returning 1`, [await hashSenha(body.nova), eu.id]);
        await query(`delete from sessoes where user_id = $1::uuid and token_hash <> $2 returning 1`, [eu.id, sha(lerSid(req.cookie))]);  // derruba os outros aparelhos
        return R(200, { ok: true });
      }

      // ---- avisos push (um aparelho por endpoint) ----
      if (path === '/api/push') {
        if (method === 'POST') {
          if (!endpointValido(body.endpoint) || !b64urlValido(body.p256dh) || !b64urlValido(body.auth)) return R(400, { erro: 'Inscrição inválida.' });
          await query(`insert into push_subscriptions(endpoint,user_id,p256dh,auth) values($1,$2::uuid,$3,$4)
                       on conflict (endpoint) do update set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth returning 1`,
            [body.endpoint, eu.id, body.p256dh, body.auth]);
          return R(200, { ok: true });
        }
        if (method === 'DELETE') {
          await query(`delete from push_subscriptions where endpoint = $1 and user_id = $2::uuid returning 1`, [String(body.endpoint || ''), eu.id]);
          return R(200, { ok: true });
        }
      }

      // ---- administração de acessos ----
      if (path === '/api/acessos') {
        if (!eu.is_admin) return R(403, { erro: 'Só administrador.' });
        if (method === 'GET') return R(200, { lista: await query(`select email, is_admin from acessos order by email`) });
        const alvo = norm(body.email);
        if (method === 'POST') {
          if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(alvo)) return R(400, { erro: 'E-mail inválido.' });
          if (!senhaValida(body.senha)) return R(400, { erro: 'A senha precisa ter pelo menos 10 caracteres.' });
          if ((await query(`select 1 from acessos where email = $1`, [alvo])).length) return R(409, { erro: 'Esse e-mail já tem acesso.' });
          // ordem importa: o acesso só é liberado depois que usuário e dados existem. Se algo falhar no meio, repetir resolve.
          await query(`insert into usuarios(email,senha_hash) values($1,$2) on conflict (email) do update set senha_hash = excluded.senha_hash returning 1`, [alvo, await hashSenha(body.senha)]);
          await query(`insert into app_data(user_id,updated_by) select id,$2 from usuarios where email = $1 on conflict (user_id) do nothing returning 1`, [alvo, eu.email]);
          await query(`insert into acessos(email) values($1) on conflict (email) do nothing returning 1`, [alvo]);
          return R(201, { ok: true });
        }
        if (method === 'PATCH') {
          if (alvo === eu.email) return R(400, { erro: 'Você não pode mudar a própria permissão.' });
          const r = await query(`update acessos set is_admin = $2::boolean where email = $1 returning email`, [alvo, body.is_admin ? 'true' : 'false']);
          return r.length ? R(200, { ok: true }) : R(404, { erro: 'Não encontrado.' });
        }
        if (method === 'DELETE') {
          const a = (await query(`select a.is_admin from usuarios u left join acessos a on a.email = u.email where u.email = $1`, [alvo]))[0];
          if (!a) return R(404, { erro: 'Não encontrado.' });
          if (a.is_admin) return R(400, { erro: 'Tire a permissão de administrador antes de remover.' });
          if (body.guardar_backup) await query(`insert into app_data_removidos(email,user_id,data,removed_by) select u.email,u.id,d.data,$2 from usuarios u left join app_data d on d.user_id=u.id where u.email=$1 returning 1`, [alvo, eu.email]);
          await query(`delete from acessos where email = $1 returning 1`, [alvo]);     // o acesso cai primeiro
          await query(`delete from usuarios where email = $1 returning 1`, [alvo]);     // apaga sessões, dados e avisos junto (cascade)
          return R(200, { ok: true });
        }
      }
      return R(404, { erro: 'Rota não existe.' });
    } catch (e) {
      console.error('api:', method, path, e && e.message);
      return R(500, { erro: 'Erro interno.' });
    }
  }
  return { handle };
}
module.exports = { criarApp, hashSenha, confere, sha, norm };
