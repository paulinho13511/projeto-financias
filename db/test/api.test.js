// Testes da API contra um Postgres de verdade dentro do Node (PGlite faz o papel do Neon). Rodar: npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), os = require('os'), path = require('path');
const { spawnSync } = require('child_process');
const { criarApp, hashSenha, sha } = require('../../api/_lib/app.js');
const dbt = require('./db-pglite.js');
const { query } = dbt;
const { handle } = criarApp(dbt);

const call = (method, path, body, cookie, ip) => handle({ method, path, body, cookie, ip: ip || '1.1.1.1' });
const sid = r => { const m = /sid=([0-9a-f]{64})/.exec(r.setCookie || ''); return m ? 'sid=' + m[1] : null; };
async function novoUsuario(email, senha, { admin = false, acesso = true } = {}) {
  const id = (await query(`insert into usuarios(email,senha_hash) values($1,$2) returning id`, [email, await hashSenha(senha)]))[0].id;
  if (acesso) (await query(`insert into acessos(email,is_admin) values($1,$2::boolean) returning 1`, [email, String(admin)]));
  return id;
}
async function logar(email, senha, ip) { const r = (await call('POST', '/api/login', { email, senha }, null, ip)); return { r, c: sid(r) }; }

test.beforeEach(() => dbt.reset());

test('login: sucesso grava só o hash do token e usa cookie seguro', async () => {
  (await novoUsuario('a@x.com', 'senha-boa-123'));
  const { r, c } = (await logar('A@X.com ', 'senha-boa-123'));
  assert.equal(r.status, 200);
  for (const f of ['HttpOnly', 'Secure', 'SameSite=Strict', 'Path=/']) assert.match(r.setCookie, new RegExp(f));
  const tok = c.slice(4);
  assert.equal((await query(`select count(*)::int n from sessoes where token_hash = $1`, [sha(tok)]))[0].n, 1);
  assert.equal((await query(`select count(*)::int n from sessoes where token_hash = $1`, [tok]))[0].n, 0, 'token puro não pode estar no banco');
  assert.equal((await call('GET', '/api/me', null, c)).body.email, 'a@x.com');
});

test('login: erro não revela se o e-mail existe', async () => {
  (await novoUsuario('a@x.com', 'senha-boa-123'));
  const errada = (await call('POST', '/api/login', { email: 'a@x.com', senha: 'errada-errada' }));
  const inexistente = (await call('POST', '/api/login', { email: 'nao@x.com', senha: 'errada-errada' }));
  assert.equal(errada.status, 401); assert.equal(inexistente.status, 401);
  assert.deepEqual(errada.body, inexistente.body);
});

test('login: tempo de resposta parecido com e-mail inexistente (scrypt de mentira)', async () => {
  await novoUsuario('a@x.com', 'senha-boa-123');
  const t = async f => { const i = process.hrtime.bigint(); await f(); return Number(process.hrtime.bigint() - i) / 1e6; };
  await call('POST', '/api/login', { email: 'aquece@x.com', senha: 'errada-errada' }, null, '9.9.9.0');   // primeira chamada cria o hash de mentira
  const a = await t(() => call('POST', '/api/login', { email: 'a@x.com', senha: 'errada-errada' }, null, '9.9.9.1'));
  const b = await t(() => call('POST', '/api/login', { email: 'nao@x.com', senha: 'errada-errada' }, null, '9.9.9.2'));
  assert.ok(Math.max(a, b) / Math.min(a, b) < 3, `tempos muito diferentes: ${a.toFixed(0)}ms x ${b.toFixed(0)}ms`);
});

test('login: 5 erros bloqueiam até com a senha certa; passada a janela, volta', async () => {
  (await novoUsuario('a@x.com', 'senha-boa-123'));
  for (let i = 0; i < 5; i++) assert.equal((await call('POST', '/api/login', { email: 'a@x.com', senha: 'errada-errada' })).status, 401);
  assert.equal((await call('POST', '/api/login', { email: 'a@x.com', senha: 'senha-boa-123' })).status, 429);
  (await query(`update tentativas_login set em = now() - interval '20 minutes' returning 1`));
  assert.equal((await call('POST', '/api/login', { email: 'a@x.com', senha: 'senha-boa-123' })).status, 200);
  assert.equal((await query(`select count(*)::int n from tentativas_login where email='a@x.com'`))[0].n, 0, 'sucesso zera as tentativas');
});

test('login: bloqueio por IP vale para vários e-mails (20 tentativas)', async () => {
  for (let i = 0; i < 20; i++) (await call('POST', '/api/login', { email: `x${i}@x.com`, senha: 'errada-errada' }, null, '7.7.7.7'));
  assert.equal((await call('POST', '/api/login', { email: 'novo@x.com', senha: 'errada-errada' }, null, '7.7.7.7')).status, 429);
  assert.notEqual((await call('POST', '/api/login', { email: 'novo@x.com', senha: 'errada-errada' }, null, '8.8.8.8')).status, 429);
});

test('login: senha certa sem acesso liberado => 403 e nenhum cookie', async () => {
  (await novoUsuario('b@x.com', 'senha-boa-123', { acesso: false }));
  const { r, c } = (await logar('b@x.com', 'senha-boa-123'));
  assert.equal(r.status, 403); assert.equal(c, null);
});

test('sessão: sem cookie, cookie falso e depois do logout => 401', async () => {
  (await novoUsuario('a@x.com', 'senha-boa-123'));
  assert.equal((await call('GET', '/api/dados')).status, 401);
  assert.equal((await call('GET', '/api/dados', null, 'sid=' + 'a'.repeat(64))).status, 401);
  const { c } = (await logar('a@x.com', 'senha-boa-123'));
  assert.equal((await call('GET', '/api/dados', null, c)).status, 200);
  assert.equal((await call('POST', '/api/logout', null, c)).status, 200);
  assert.equal((await call('GET', '/api/dados', null, c)).status, 401);
});

test('sessão: perder o acesso derruba a sessão na hora', async () => {
  (await novoUsuario('a@x.com', 'senha-boa-123'));
  const { c } = (await logar('a@x.com', 'senha-boa-123'));
  (await query(`delete from acessos where email = 'a@x.com' returning 1`));
  assert.equal((await call('GET', '/api/dados', null, c)).status, 401);
});

test('sessão: expirada não vale', async () => {
  (await novoUsuario('a@x.com', 'senha-boa-123'));
  const { c } = (await logar('a@x.com', 'senha-boa-123'));
  (await query(`update sessoes set expira_em = now() - interval '1 minute' returning 1`));
  assert.equal((await call('GET', '/api/me', null, c)).status, 401);
});

test('dados: cada pessoa só enxerga e grava os próprios', async () => {
  (await novoUsuario('a@x.com', 'senha-boa-123')); (await novoUsuario('b@x.com', 'outra-senha-123'));
  const A = (await logar('a@x.com', 'senha-boa-123')).c, B = (await logar('b@x.com', 'outra-senha-123')).c;
  const a0 = (await call('GET', '/api/dados', null, A)).body;
  const put = (await call('PUT', '/api/dados', { data: { tx: [{ desc: 'segredo da A', amount: 10 }] }, versao: a0.versao }, A));
  assert.equal(put.status, 200);
  const b0 = (await call('GET', '/api/dados', null, B)).body;
  assert.deepEqual(b0.data, {});
  assert.equal(JSON.stringify(b0).includes('segredo'), false);
  // B tenta gravar usando a versão da A: só mexe na linha da própria B
  (await call('PUT', '/api/dados', { data: { tx: [] }, versao: put.body.versao }, B));
  assert.equal((await call('GET', '/api/dados', null, A)).body.data.tx[0].desc, 'segredo da A');
});

test('dados: conflito de versão (dois aparelhos) devolve 409 e não sobrescreve', async () => {
  (await novoUsuario('a@x.com', 'senha-boa-123'));
  const A1 = (await logar('a@x.com', 'senha-boa-123')).c, A2 = (await logar('a@x.com', 'senha-boa-123')).c;
  const v0 = (await call('GET', '/api/dados', null, A1)).body.versao;
  assert.equal((await call('PUT', '/api/dados', { data: { n: 1 }, versao: v0 }, A1)).status, 200);
  const r = (await call('PUT', '/api/dados', { data: { n: 2 }, versao: v0 }, A2));
  assert.equal(r.status, 409);
  assert.equal((await call('GET', '/api/dados', null, A1)).body.data.n, 1);
});

test('dados: versão a cada gravação muda; formato inválido e grande demais são recusados', async () => {
  (await novoUsuario('a@x.com', 'senha-boa-123'));
  const c = (await logar('a@x.com', 'senha-boa-123')).c;
  let v = (await call('GET', '/api/dados', null, c)).body.versao; const vistas = new Set([v]);
  for (let i = 0; i < 3; i++) { await new Promise(ok => setTimeout(ok, 5));   // o relógio do PGlite (WASM) tem resolução de ms; o Postgres real tem µs
    const r = (await call('PUT', '/api/dados', { data: { i }, versao: v }, c)); assert.equal(r.status, 200); v = r.body.versao; vistas.add(v); }
  assert.equal(vistas.size, 4);
  assert.equal((await call('PUT', '/api/dados', { data: [1, 2], versao: v }, c)).status, 400);
  assert.equal((await call('PUT', '/api/dados', { data: 'texto', versao: v }, c)).status, 400);
  assert.equal((await call('PUT', '/api/dados', { data: { grande: 'x'.repeat(1100000) }, versao: v }, c)).status, 413);
});

test('dados: aspas, barras, quebras de linha e acentos voltam idênticos; injeção de SQL não faz efeito', async () => {
  (await novoUsuario('a@x.com', 'senha-boa-123'));
  const c = (await logar('a@x.com', 'senha-boa-123')).c;
  const estranho = { desc: "Salário d'água \\ \"x\" '; drop table usuarios; --", nota: 'linha1\nlinha2\r\n\ttab', emoji: '💸 ação', n: 1234.56 };
  const v = (await call('GET', '/api/dados', null, c)).body.versao;
  assert.equal((await call('PUT', '/api/dados', { data: { tx: [estranho] }, versao: v }, c)).status, 200);
  assert.deepEqual((await call('GET', '/api/dados', null, c)).body.data.tx[0], estranho);
  const inj = (await call('POST', '/api/login', { email: "' or 1=1 --", senha: "' or '1'='1" }));
  assert.equal(inj.status, 401);
  assert.equal((await query(`select count(*)::int n from usuarios`))[0].n, 1, 'tabela intacta');
});

test('administração: só admin; cria, duplica, promove, não remove admin, remove com backup', async () => {
  (await novoUsuario('adm@x.com', 'senha-admin-123', { admin: true })); (await novoUsuario('u@x.com', 'senha-user-1234'));
  const ADM = (await logar('adm@x.com', 'senha-admin-123')).c, U = (await logar('u@x.com', 'senha-user-1234')).c;
  for (const [m, b] of [['GET'], ['POST', { email: 'n@x.com', senha: 'senha-nova-123' }], ['PATCH', { email: 'u@x.com', is_admin: true }], ['DELETE', { email: 'adm@x.com' }]])
    assert.equal((await call(m, '/api/acessos', b, U)).status, 403, m);
  assert.equal((await call('POST', '/api/acessos', { email: 'n@x.com', senha: 'curta' }, ADM)).status, 400);
  assert.equal((await call('POST', '/api/acessos', { email: 'invalido', senha: 'senha-nova-123' }, ADM)).status, 400);
  assert.equal((await call('POST', '/api/acessos', { email: 'N@x.com', senha: 'senha-nova-123' }, ADM)).status, 201);
  assert.equal((await call('POST', '/api/acessos', { email: 'n@x.com', senha: 'senha-nova-123' }, ADM)).status, 409);
  const N = (await logar('n@x.com', 'senha-nova-123')).c; assert.ok(N);
  const v = (await call('GET', '/api/dados', null, N)).body.versao;
  (await call('PUT', '/api/dados', { data: { tx: [{ desc: 'guardar' }] }, versao: v }, N));
  assert.equal((await call('PATCH', '/api/acessos', { email: 'adm@x.com', is_admin: false }, ADM)).status, 400, 'não muda a própria permissão');
  assert.equal((await call('DELETE', '/api/acessos', { email: 'adm@x.com' }, ADM)).status, 400);
  assert.equal((await call('DELETE', '/api/acessos', { email: 'n@x.com', guardar_backup: true }, ADM)).status, 200);
  assert.equal((await call('GET', '/api/me', null, N)).status, 401, 'sessão do removido morre');
  assert.equal((await logar('n@x.com', 'senha-nova-123')).r.status, 401);
  assert.equal((await query(`select data->'tx'->0->>'desc' d from app_data_removidos where email='n@x.com'`))[0].d, 'guardar');
  assert.equal((await query(`select count(*)::int n from app_data where user_id not in (select id from usuarios)`))[0].n, 0, 'sem dados órfãos');
});

test('administração: se a criação parar no meio, repetir completa sem duplicar nem deixar acesso pela metade', async () => {
  await novoUsuario('adm@x.com', 'senha-admin-123', { admin: true });
  const ADM = (await logar('adm@x.com', 'senha-admin-123')).c;
  await query(`insert into usuarios(email,senha_hash) values('meio@x.com', 'lixo') returning 1`);   // 1º passo feito, sem acesso
  assert.equal((await logar('meio@x.com', 'qualquer-coisa-1')).r.status, 401, 'sem acesso e sem senha válida não entra');
  assert.equal((await call('POST', '/api/acessos', { email: 'meio@x.com', senha: 'senha-nova-123' }, ADM)).status, 201);
  assert.equal((await logar('meio@x.com', 'senha-nova-123')).r.status, 200);
  assert.equal((await query(`select count(*)::int n from usuarios where email='meio@x.com'`))[0].n, 1);
  assert.equal((await query(`select count(*)::int n from app_data where user_id = (select id from usuarios where email='meio@x.com')`))[0].n, 1);
});

test('administração: se a remoção parar depois de tirar o acesso, repetir termina o serviço', async () => {
  await novoUsuario('adm@x.com', 'senha-admin-123', { admin: true });
  await novoUsuario('u@x.com', 'senha-user-1234', { acesso: false });   // acesso já caiu, usuário ainda existe
  const ADM = (await logar('adm@x.com', 'senha-admin-123')).c;
  assert.equal((await call('DELETE', '/api/acessos', { email: 'u@x.com' }, ADM)).status, 200);
  assert.equal((await query(`select count(*)::int n from usuarios where email='u@x.com'`))[0].n, 0);
  assert.equal((await call('DELETE', '/api/acessos', { email: 'u@x.com' }, ADM)).status, 404);
});

test('senha: troca exige 10+ caracteres, derruba os outros aparelhos e invalida a antiga', async () => {
  (await novoUsuario('a@x.com', 'senha-boa-123'));
  const c1 = (await logar('a@x.com', 'senha-boa-123')).c, c2 = (await logar('a@x.com', 'senha-boa-123')).c;
  assert.equal((await call('POST', '/api/senha', { atual: 'senha-boa-123', nova: 'curta' }, c1)).status, 400);
  assert.equal((await call('POST', '/api/senha', { nova: 'senha-novissima-9' }, c1)).status, 403, 'sem a senha atual não troca');
  assert.equal((await call('POST', '/api/senha', { atual: 'errada-errada', nova: 'senha-novissima-9' }, c1)).status, 403);
  assert.equal((await call('POST', '/api/senha', { atual: 'senha-boa-123', nova: 'senha-novissima-9' }, c1)).status, 200);
  assert.equal((await call('GET', '/api/me', null, c1)).status, 200);
  assert.equal((await call('GET', '/api/me', null, c2)).status, 401);
  assert.equal((await logar('a@x.com', 'senha-boa-123')).r.status, 401);
  assert.equal((await logar('a@x.com', 'senha-novissima-9')).r.status, 200);
});

test('senha: senha atual errada conta no limite de tentativas', async () => {
  (await novoUsuario('a@x.com', 'senha-boa-123'));
  const c = (await logar('a@x.com', 'senha-boa-123')).c;
  for (let i = 0; i < 5; i++) assert.equal((await call('POST', '/api/senha', { atual: 'errada-' + i + 'xxxx', nova: 'senha-novissima-9' }, c)).status, 403);
  assert.equal((await call('POST', '/api/senha', { atual: 'senha-boa-123', nova: 'senha-novissima-9' }, c)).status, 429);
});

test('dados: versão vazia ou inválida vira conflito (409), não erro 500', async () => {
  (await novoUsuario('a@x.com', 'senha-boa-123'));
  const c = (await logar('a@x.com', 'senha-boa-123')).c;
  const v = (await call('GET', '/api/dados', null, c)).body.versao;
  for (const versao of [undefined, '', 'lixo', "2026-01-01'; drop table x"]) assert.equal((await call('PUT', '/api/dados', { data: { a: 1 }, versao }, c)).status, 409);
  assert.equal((await call('PUT', '/api/dados', { data: { a: 1 }, versao: v }, c)).status, 200, 'a versão de verdade ainda passa');
});

test('convite: uso único, expira, guarda só o hash e libera o primeiro login', async () => {
  const id = (await query(`insert into usuarios(email) values('n@x.com') returning id`))[0].id;
  (await query(`insert into acessos(email) values('n@x.com') returning 1`));
  (await query(`insert into convites(token_hash,user_id,expira_em) values($1,$2::uuid, now()+interval '7 days') returning 1`, [sha('tok-bom'), id]));
  (await query(`insert into convites(token_hash,user_id,expira_em) values($1,$2::uuid, now()-interval '1 day') returning 1`, [sha('tok-velho'), id]));
  assert.equal((await logar('n@x.com', 'qualquer-coisa-1')).r.status, 401, 'sem senha definida não entra');
  assert.equal((await call('POST', '/api/definir-senha', { token: 'tok-velho', senha: 'senha-escolhida-1' })).status, 400);
  assert.equal((await call('POST', '/api/definir-senha', { token: 'tok-bom', senha: 'curta' })).status, 400);
  assert.equal((await call('POST', '/api/definir-senha', { token: 'tok-bom', senha: 'senha-escolhida-1' })).status, 200);
  assert.equal((await call('POST', '/api/definir-senha', { token: 'tok-bom', senha: 'outra-senha-bem-1' })).status, 400, 'não reutiliza');
  assert.equal((await logar('n@x.com', 'senha-escolhida-1')).r.status, 200);
});

const BACKUP = process.env.BACKUP_JSON;
test('migração: dados reais do backup entram idênticos e os convites funcionam (defina BACKUP_JSON)', { skip: !BACKUP || !fs.existsSync(BACKUP) }, async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mig-'));
  const g = spawnSync('node', [path.join(__dirname, '../gen-migracao.js'), BACKUP, path.join(tmp, 'migracao.sql')], { cwd: tmp, encoding: 'utf8' });
  assert.equal(g.status, 0, g.stderr);
  await dbt.exec(fs.readFileSync(path.join(tmp, 'migracao.sql'), 'utf8'));
  const bk = JSON.parse(fs.readFileSync(BACKUP, 'utf8')).dados;
  const paulo = bk.app_data.find(x => x.updated_by.startsWith('paulovictor'));
  const row = (await query(`select data, to_char(updated_at at time zone 'utc','YYYY-MM-DD"T"HH24:MI:SS.MS') v from app_data where user_id = $1::uuid`, [paulo.user_id]))[0];
  assert.deepEqual(row.data, paulo.data, 'JSON idêntico ao do backup');
  assert.equal(row.v, paulo.updated_at.slice(0, 23), 'versão preservada');
  assert.equal((await query(`select count(*)::int n from usuarios`))[0].n, bk.auth_users.length);
  assert.deepEqual(await query(`select email, is_admin from acessos order by email`), bk.allowed_emails.map(a => ({ email: a.email, is_admin: a.is_admin })).sort((a, b) => a.email < b.email ? -1 : 1));
  assert.equal((await query(`select count(*)::int n from app_data_removidos`))[0].n, bk.app_data_removidos.length);
  const convites = JSON.parse(fs.readFileSync(path.join(tmp, 'convites.json'), 'utf8'));
  assert.equal(JSON.stringify(await query(`select * from convites`)).includes(convites[0].token), false, 'token puro não está no banco');
  assert.equal(fs.readFileSync(path.join(tmp, 'migracao.sql'), 'utf8').includes(convites[0].token), false, 'token puro não está no SQL');
  const cv = convites.find(c => c.email.startsWith('paulovictor'));
  assert.equal((await call('POST', '/api/definir-senha', { token: cv.token, senha: 'minha-senha-nova-1' })).status, 200);
  const { r: lr, c } = await logar('paulovictor.fs8@gmail.com', 'minha-senha-nova-1'); assert.equal(lr.status, 200);
  const d = (await call('GET', '/api/dados', null, c)).body;
  assert.deepEqual(d.data, paulo.data);
  assert.equal((await call('PUT', '/api/dados', { data: d.data, versao: d.versao }, c)).status, 200, 'gravar logo depois do login funciona');
  assert.equal((await call('GET', '/api/me', null, c)).body.is_admin, true);
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('código: nenhuma consulta monta SQL concatenando valores', () => {
  let total = 0;
  for (const f of ['app.js', 'db.js', 'lembretes-job.js']) {
    const fonte = fs.readFileSync(path.join(__dirname, '../../api/_lib', f), 'utf8');
    const sqls = [...fonte.matchAll(/`([^`]*)`/g)].map(m => m[1]).filter(x => /\b(select|insert|update|delete)\b/i.test(x));
    total += sqls.length;
    for (const x of sqls) assert.equal(/\$\{/.test(x), false, `interpolação em SQL (${f}): ` + x.slice(0, 80));
  }
  assert.ok(total > 20);
});

test('administração: criação de acesso é tudo-ou-nada (falha no último passo não deixa usuário nem dados)', async () => {
  await novoUsuario('adm@x.com', 'senha-admin-123', { admin: true });
  // mesmo banco, mas o 3º comando (liberar o acesso) quebra de propósito
  const quebrado = { query, transaction: lista => dbt.transaction(lista.map(([sql, p], i) => i === 2 ? ['select * from tabela_que_nao_existe', []] : [sql, p])) };
  const app2 = criarApp(quebrado);
  const ADM = (await logar('adm@x.com', 'senha-admin-123')).c;
  const r = await app2.handle({ method: 'POST', path: '/api/acessos', body: { email: 'novo@x.com', senha: 'senha-nova-123' }, cookie: ADM, ip: '1.1.1.1' });
  assert.equal(r.status, 500);
  assert.equal((await query(`select count(*)::int n from usuarios where email='novo@x.com'`))[0].n, 0, 'nada ficou pela metade');
  assert.equal((await query(`select count(*)::int n from app_data`))[0].n, 0);
});
