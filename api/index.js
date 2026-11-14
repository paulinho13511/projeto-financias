// Ponto de entrada único da API na Vercel (todas as rotas /api/* chegam aqui pelo rewrite do vercel.json).
'use strict';
const { criarApp } = require('./_lib/app.js');
const db = require('./_lib/db.js');
const { executar } = require('./_lib/lembretes-job.js');

// DADOS_TABELAS=1 liga os dados em tabelas; sem ela, continua o JSON único (app_data). Ver db/README.md.
const app = criarApp(db, { tabelas: process.env.DADOS_TABELAS === '1' });
const SEM_CACHE = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };

function caminho(req) {
  const u = new URL(req.url, 'http://x');
  if (u.pathname.startsWith('/api/') && u.pathname !== '/api/index') return u.pathname.replace(/\/+$/, '');
  return '/api/' + (u.searchParams.get('p') || '');   // quando o rewrite entrega só /api/index?p=...
}
// Na Vercel esses cabeçalhos são reescritos pela borda (o cliente não consegue forjar); x-vercel-forwarded-for é o mais confiável.
const ip = req => String(req.headers['x-vercel-forwarded-for'] || req.headers['x-real-ip'] || (req.headers['x-forwarded-for'] || '').split(',')[0] || 'desconhecido').split(',')[0].trim();

function responder(res, status, corpo, cookie) {
  res.status(status);
  for (const [k, v] of Object.entries(SEM_CACHE)) res.setHeader(k, v);
  if (cookie) res.setHeader('Set-Cookie', cookie);
  res.json(corpo);
}

module.exports = async (req, res) => {
  try {
    const path = caminho(req);
    const metodo = req.method;

    // Cron diário da Vercel (GET) ou chamada manual (POST) — só com o segredo; o corpo {"modo":"dry"|"teste"} é opcional.
    if (path === '/api/lembretes') {
      const segredo = process.env.CRON_SECRET;
      if (!segredo || req.headers.authorization !== `Bearer ${segredo}`) return responder(res, 401, { erro: 'não autorizado' });
      const modo = ['dry', 'teste'].includes((req.body || {}).modo) ? req.body.modo : 'real';
      return responder(res, 200, await executar({ query: db.query, modo }));
    }

    // Defesa extra contra requisições vindas de outro site (o cookie já é SameSite=Strict)
    if (metodo !== 'GET') {
      const origem = req.headers.origin;
      let hostOrigem = null;
      try { hostOrigem = origem ? new URL(origem).host : null; } catch { /* "null" ou lixo: tratado como outro site */ }
      if (origem && hostOrigem !== req.headers.host) return responder(res, 403, { erro: 'origem não permitida' });
      if (!/^application\/json/i.test(req.headers['content-type'] || '')) return responder(res, 415, { erro: 'use JSON' });
    }

    let corpo = req.body;
    if (typeof corpo === 'string') { try { corpo = JSON.parse(corpo); } catch { return responder(res, 400, { erro: 'JSON inválido' }); } }
    const r = await app.handle({ method: metodo, path, body: corpo && typeof corpo === 'object' ? corpo : {}, cookie: req.headers.cookie, ip: ip(req) });
    responder(res, r.status, r.body, r.setCookie);
  } catch (e) {
    console.error('api/index:', e && e.message);
    responder(res, 500, { erro: 'Erro interno.' });
  }
};
