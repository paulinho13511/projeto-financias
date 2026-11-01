// Testes da entrada HTTP (api/index.js), do adaptador de produção (db.js) e do envio de avisos (lembretes-job.js).
// O driver do Neon é trocado por um falso que consulta o Postgres local, mas com a mesma forma: neon(url).query(texto, params).
const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('module');
const path = require('path');
const dbt = require('./db-psql.js');
const { hashSenha } = require('../../api/_lib/app.js');
const { spawnSync } = require('child_process');

const orig = Module._load;
Module._load = function (req, ...r) {
  if (req === '@neondatabase/serverless') return { neon: () => ({ query: async (t, p) => dbt.querySync(t, p) }) };
  return orig.call(this, req, ...r);
};
process.env.DATABASE_URL = 'postgres://falso';
process.env.CRON_SECRET = 'segredo-de-teste';
const entrada = require('../../api/index.js');
const { executar } = require('../../api/_lib/lembretes-job.js');
const { query } = dbt;

function reset() {
  const psql = a => spawnSync('psql', [...dbt.CONN.filter(x => x !== '-A' && x !== '-t'), '-v', 'ON_ERROR_STOP=1', ...a], { encoding: 'utf8' });
  const r1 = psql(['-c', 'drop schema public cascade; create schema public;']), r2 = psql(['-f', path.join(__dirname, '../schema.sql')]);
  assert.equal(r1.status + r2.status, 0, r1.stderr + r2.stderr);
}
test.beforeEach(reset);

async function http(method, url, { body, headers = {} } = {}) {
  const req = { method, url, headers: { host: 'app.exemplo', 'content-type': 'application/json', ...headers }, body };
  const out = { headers: {} };
  const res = { status(s) { out.status = s; return this; }, setHeader(k, v) { out.headers[k.toLowerCase()] = v; }, json(b) { out.body = b; } };
  await entrada(req, res);
  return out;
}
async function usuario(email, senha, admin = false) {
  const id = (await query(`insert into usuarios(email,senha_hash) values($1,$2) returning id`, [email, await hashSenha(senha)]))[0].id;
  await query(`insert into acessos(email,is_admin) values($1,$2::boolean) returning 1`, [email, String(admin)]);
  return id;
}

test('entrada: login pelo caminho real, cookie volta no Set-Cookie e a sessão funciona', async () => {
  await usuario('a@x.com', 'senha-boa-123');
  const l = await http('POST', '/api/login', { body: { email: 'a@x.com', senha: 'senha-boa-123' }, headers: { 'x-real-ip': '5.5.5.5' } });
  assert.equal(l.status, 200);
  assert.match(l.headers['set-cookie'], /^sid=[0-9a-f]{64}; HttpOnly; Secure; SameSite=Strict/);
  assert.equal(l.headers['cache-control'], 'no-store');
  const cookie = l.headers['set-cookie'].split(';')[0];
  const me = await http('GET', '/api/me', { headers: { cookie } });
  assert.deepEqual(me.body, { email: 'a@x.com', is_admin: false });
  const d = await http('GET', '/api/dados', { headers: { cookie } });
  assert.equal(d.status, 200);
  const p = await http('PUT', '/api/dados', { body: { data: { tx: [{ desc: 'oi' }] }, versao: d.body.versao }, headers: { cookie } });
  assert.equal(p.status, 200, 'a versão (texto) volta intacta pelo caminho de produção');
});

test('entrada: rewrite que entrega /api/index?p=... também funciona', async () => {
  await usuario('a@x.com', 'senha-boa-123');
  const l = await http('POST', '/api/index?p=login', { body: { email: 'a@x.com', senha: 'senha-boa-123' } });
  assert.equal(l.status, 200);
});

test('entrada: outro site (Origin diferente) e corpo que não é JSON são recusados', async () => {
  await usuario('a@x.com', 'senha-boa-123');
  const o = await http('POST', '/api/login', { body: { email: 'a@x.com', senha: 'senha-boa-123' }, headers: { origin: 'https://malvado.exemplo' } });
  assert.equal(o.status, 403);
  const ok = await http('POST', '/api/login', { body: { email: 'a@x.com', senha: 'senha-boa-123' }, headers: { origin: 'https://app.exemplo' } });
  assert.equal(ok.status, 200);
  const t = await http('POST', '/api/login', { body: 'email=a', headers: { 'content-type': 'text/plain' } });
  assert.equal(t.status, 415);
});

test('entrada: JSON quebrado => 400', async () => {
  const r = await http('POST', '/api/login', { body: '{quebrado' });
  assert.equal(r.status, 400);
});

test('lembretes: sem o segredo => 401; com o segredo roda; modo dry não envia nem grava', async () => {
  assert.equal((await http('GET', '/api/lembretes')).status, 401);
  assert.equal((await http('GET', '/api/lembretes', { headers: { authorization: 'Bearer errado' } })).status, 401);
  const r = await http('POST', '/api/lembretes', { body: { modo: 'dry' }, headers: { authorization: 'Bearer segredo-de-teste' } });
  assert.equal(r.status, 200); assert.equal(r.body.dry, true);
});

test('job de avisos: envia 1 vez por aparelho, não repete, remove aparelho morto, ignora quem perdeu o acesso', async () => {
  const idA = await usuario('a@x.com', 'senha-boa-123'), idB = await usuario('b@x.com', 'senha-boa-123');
  const hoje = '2026-11-05', agora = new Date('2026-11-05T15:00:00Z');
  const data = { bills: [{ id: 'c1', kind: 'unica', name: 'Luz', amount: 100, date: hoje, paid: [] }], tx: [], cards: [] };
  await query(`insert into app_data(user_id,data) values($1::uuid,$2::jsonb), ($3::uuid,$2::jsonb) returning 1`, [idA, JSON.stringify(data), idB]);
  const sub = (id, n) => query(`insert into push_subscriptions(endpoint,user_id,p256dh,auth) values($1,$2::uuid,'p','a') returning 1`, [`https://push.exemplo/${n}`, id]);
  await sub(idA, 'a1'); await sub(idA, 'a2'); await sub(idB, 'b1');
  await query(`delete from acessos where email = 'b@x.com' returning 1`);   // B perdeu o acesso: não recebe
  const enviados = [];
  const enviar = async (s, payload) => { if (s.endpoint.endsWith('a2')) { const e = new Error('gone'); e.statusCode = 410; throw e; } enviados.push({ ep: s.endpoint, p: JSON.parse(payload) }); };

  const dry = await executar({ query, modo: 'dry', agora, enviar });
  assert.equal(dry.candidatos, 2); assert.equal(enviados.length, 0);
  assert.equal((await query(`select count(*)::int n from reminder_log`))[0].n, 0, 'dry não grava');

  const r1 = await executar({ query, agora, enviar });
  assert.equal(r1.enviados, 1); assert.equal(r1.removidos, 1);
  assert.equal(enviados[0].ep, 'https://push.exemplo/a1'); assert.equal(enviados[0].p.title, 'Conta vence hoje');
  assert.match(enviados[0].p.body, /Luz: R\$ 100,00/);
  assert.equal((await query(`select count(*)::int n from push_subscriptions where endpoint like '%a2'`))[0].n, 0, 'aparelho que devolveu 410 foi removido');

  const r2 = await executar({ query, agora, enviar });
  assert.equal(r2.enviados, 0, 'segunda rodada no mesmo dia não repete');
  assert.equal(enviados.length, 1);

  const amanha = await executar({ query, agora: new Date('2026-11-06T15:00:00Z'), enviar });
  assert.equal(enviados.at(-1).p.title, 'Conta atrasada há 1 dia(s)', 'no dia seguinte avisa o atraso');
  assert.equal(amanha.enviados, 1);
});

test('job de avisos: falha comum não registra (tenta de novo) e modo teste manda aviso fixo', async () => {
  const id = await usuario('a@x.com', 'senha-boa-123');
  await query(`insert into app_data(user_id,data) values($1::uuid,$2::jsonb) returning 1`, [id, JSON.stringify({ bills: [{ id: 'c1', kind: 'unica', name: 'Luz', amount: 100, date: '2026-11-05', paid: [] }] })]);
  await query(`insert into push_subscriptions(endpoint,user_id,p256dh,auth) values('https://push.exemplo/x',$1::uuid,'p','a') returning 1`, [id]);
  const agora = new Date('2026-11-05T15:00:00Z');
  let falhar = true; const vistos = [];
  const enviar = async (s, payload) => { if (falhar) { const e = new Error('503'); e.statusCode = 503; throw e; } vistos.push(JSON.parse(payload).title); };
  const r1 = await executar({ query, agora, enviar });
  assert.equal(r1.falhas, 1); assert.equal((await query(`select count(*)::int n from reminder_log`))[0].n, 0);
  falhar = false;
  const r2 = await executar({ query, agora, enviar });
  assert.equal(r2.enviados, 1);
  const t = await executar({ query, modo: 'teste', enviar });
  assert.equal(t.enviados, 1); assert.equal(vistos.at(-1), 'Aviso de teste');
});

test('push: aparelho é gravado só para quem está logado, valida o formato e sai ao remover', async () => {
  await usuario('a@x.com', 'senha-boa-123');
  assert.equal((await http('POST', '/api/push', { body: { endpoint: 'https://push.exemplo/1', p256dh: 'abcdefgh', auth: 'abcdefgh' } })).status, 401);
  const cookie = (await http('POST', '/api/login', { body: { email: 'a@x.com', senha: 'senha-boa-123' } })).headers['set-cookie'].split(';')[0];
  for (const ruim of [{ endpoint: 'http://inseguro/1' }, { endpoint: 'https://ok/1', p256dh: 'curto', auth: 'abcdefgh' }, { endpoint: 'https://ok/1', p256dh: 'abcdefgh', auth: '<script>x</script>' }])
    assert.equal((await http('POST', '/api/push', { body: { p256dh: 'abcdefgh', auth: 'abcdefgh', ...ruim }, headers: { cookie } })).status, 400);
  assert.equal((await http('POST', '/api/push', { body: { endpoint: 'https://push.exemplo/1', p256dh: 'abcdefgh', auth: 'abcdefgh' }, headers: { cookie } })).status, 200);
  assert.equal((await http('POST', '/api/push', { body: { endpoint: 'https://push.exemplo/1', p256dh: 'novachave1', auth: 'novaauth12' }, headers: { cookie } })).status, 200);
  assert.deepEqual(await query(`select p256dh from push_subscriptions`), [{ p256dh: 'novachave1' }], 'repetir atualiza em vez de duplicar');
  assert.equal((await http('DELETE', '/api/push', { body: { endpoint: 'https://push.exemplo/1' }, headers: { cookie } })).status, 200);
  assert.equal((await query(`select count(*)::int n from push_subscriptions`))[0].n, 0);
});
