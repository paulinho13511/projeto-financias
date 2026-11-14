// Dados em tabelas (api/_lib/dados.js): o que entra volta idêntico, a conversão do JSON antigo, conflito e avisos.
const test = require('node:test');
const assert = require('node:assert/strict');
const dbt = require('./db-pglite.js');
const { query } = dbt;
const dados = require('../../api/_lib/dados.js');
const { criarApp, hashSenha } = require('../../api/_lib/app.js');
const { buildReminders } = require('../../api/_lib/lembretes.js');
const { executar } = require('../../api/_lib/lembretes-job.js');

test.beforeEach(() => dbt.reset());
const novo = async email => (await query(`insert into usuarios(email) values($1) returning id::text as id`, [email]))[0].id;
const conta = (sql, p) => query(sql, p).then(r => Number(r[0].n));

// dados parecidos com os reais, com todo tipo de coisa fora do padrão que o app antigo pode ter deixado
const REAL = {
  accounts: [{ id: 'a1', name: 'Nubank', type: 'corrente', initial: 1000 }, { id: 'a2', name: 'Carteira', type: 'carteira', initial: 0, cor: 'roxo' }],
  cards: [{ id: 'c1', name: 'paulo vitor', closeDay: 5, dueDay: 12, paid: ['2026-10'], limit: 3000 }, { id: 'c2', name: 'Velho', closeDay: 40, dueDay: 8, paid: [] }],
  tx: [
    { id: 't1', type: 'expense', desc: 'Mercado', amount: 25.9, date: '2026-11-13', category: 'Alimentação', account: 'a1', card: null, created: 1794600000000 },
    { id: 't2', type: 'expense', desc: 'Tênis', amount: 120, date: '2026-11-13', category: 'Lazer', card: 'c1', created: 1794600000001 },
    { id: 't3', type: 'income', desc: 'Salário', amount: 3000, date: '2026-11-05', category: 'Salário', account: 'a1', card: null },
    { id: 't4', type: 'transfer', desc: 'T', amount: 100, date: '2026-11-06', category: 'Transferência', from: 'a1', to: 'a2' },
    { id: 't5', type: 'payment', desc: 'Fatura', amount: 120, date: '2026-11-10', category: 'Cartão', account: 'a1', ref: { kind: 'fatura', card: 'c1', ym: '2026-11' } },
    { id: 't6', type: 'expense', desc: 'Conta apagada', amount: 10, date: '2026-11-01', category: 'Outros', account: 'conta-que-sumiu' },   // referência órfã
    { id: 't6', type: 'expense', desc: 'id repetido', amount: 3.333, date: '2026-13-40', category: 'Outros' },                            // id repetido, 3 casas, data inválida
    { desc: 'sem id', amount: '12', date: '2026-11-02', extraNovo: { a: [1, 2] } },
  ],
  bills: [
    { id: 'b1', kind: 'mensal', name: 'Aluguel', amount: 1000, day: 28, category: 'Moradia', card: null, paid: ['2026-10'], start: '2026-01' },
    { id: 'b2', kind: 'parcelada', name: 'TV', amount: 200, parcels: 6, start: '2026-09', day: 5, category: 'Outros', card: 'c1', paid: [], last: 199.99 },
    { id: 'b3', kind: 'unica', name: 'IPVA', amount: 800, date: '2026-12-10', category: 'Transporte', card: null, paid: [], sub: false },
  ],
  goals: [{ id: 'g1', name: 'Viagem', target: 2000, deadline: '2027-06', saved: 150 }],
  budgets: { 'Alimentação': 800, 'Lazer': 300 },
  settings: { ultimoMeio: 'a:a1', teto: 1500, variable: false },
  quickEntries: ['Padaria'],
};

test('dados: tudo volta idêntico (inclusive o que está fora do padrão)', async () => {
  const id = await novo('a@x.com');
  const m = await dados.carregar(dbt, id, 'a@x.com');
  assert.deepEqual(m.data, {});
  const v = await dados.gravar(dbt, id, m.versao, 'a@x.com', REAL);
  assert.ok(v && v !== m.versao);
  const volta = await dados.carregar(dbt, id, 'a@x.com');
  assert.deepEqual(volta.data, REAL);
  assert.deepEqual(Object.keys(volta.data), Object.keys(REAL), 'mesma ordem dos blocos');
});

test('dados: ficam em tabelas de verdade, com ligações entre elas', async () => {
  const id = await novo('a@x.com');
  const m = await dados.carregar(dbt, id, 'a');
  await dados.gravar(dbt, id, m.versao, 'a', REAL);
  assert.equal(await conta(`select count(*)::int n from contas where user_id = $1::uuid`, [id]), 2);
  assert.equal(await conta(`select count(*)::int n from cartoes where user_id = $1::uuid`, [id]), 2);
  assert.equal(await conta(`select count(*)::int n from lancamentos where user_id = $1::uuid`, [id]), 8);
  assert.equal(await conta(`select count(*)::int n from contas_fixas where user_id = $1::uuid`, [id]), 3);
  assert.equal(await conta(`select count(*)::int n from orcamentos where user_id = $1::uuid`, [id]), 2);
  // gasto por conta direto no banco (o que o JSON único não permitia)
  const r = await query(`select c.nome, sum(l.valor)::float8 as total from lancamentos l join contas c on c.user_id = l.user_id and c.id = l.conta_id
                          where l.user_id = $1::uuid and l.tipo = 'expense' group by c.nome`, [id]);
  assert.deepEqual(r.map(x => [x.nome, Number(x.total)]), [['Nubank', 25.9]]);
  // o que não cabe na coluna ficou no "extra", não sumiu
  const orf = (await query(`select conta_id, extra from lancamentos where user_id = $1::uuid and descricao = 'Conta apagada'`, [id]))[0];
  assert.equal(orf.conta_id, null);
  assert.equal((typeof orf.extra === 'string' ? JSON.parse(orf.extra) : orf.extra).account, 'conta-que-sumiu');
  const vel = (await query(`select dia_fecha from cartoes where user_id = $1::uuid and id = 'c2'`, [id]))[0];
  assert.equal(vel.dia_fecha, null, 'dia 40 não entra na coluna (fica no extra)');
});

test('dados: primeira abertura converte o JSON antigo e não mexe nele', async () => {
  const id = await novo('a@x.com');
  await query(`insert into app_data(user_id, data) values($1::uuid, $2::jsonb) returning 1`, [id, JSON.stringify(REAL)]);
  const antes = (await query(`select updated_at::text v from app_data where user_id = $1::uuid`, [id]))[0].v;
  const m = await dados.carregar(dbt, id, 'a');
  assert.deepEqual(m.data, REAL);
  const depois = (await query(`select data, updated_at::text v from app_data where user_id = $1::uuid`, [id]))[0];
  assert.equal(depois.v, antes, 'app_data intacta (cópia de segurança)');
  assert.deepEqual(typeof depois.data === 'string' ? JSON.parse(depois.data) : depois.data, REAL);
  // segunda abertura não converte de novo (mesmo que o JSON antigo mude)
  await query(`update app_data set data = '{"tx":[]}'::jsonb where user_id = $1::uuid returning 1`, [id]);
  assert.deepEqual((await dados.carregar(dbt, id, 'a')).data, REAL);
});

test('dados: conflito (outro aparelho gravou antes) não muda nenhuma tabela', async () => {
  const id = await novo('a@x.com');
  const m = await dados.carregar(dbt, id, 'a');
  const v1 = await dados.gravar(dbt, id, m.versao, 'a', REAL);
  assert.ok(v1);
  const v2 = await dados.gravar(dbt, id, m.versao, 'a', { tx: [] });   // versão velha
  assert.equal(v2, null);
  assert.deepEqual((await dados.carregar(dbt, id, 'a')).data, REAL);
});

test('dados: remover a pessoa apaga as tabelas dela junto; a outra pessoa não é afetada', async () => {
  const a = await novo('a@x.com'), b = await novo('b@x.com');
  for (const id of [a, b]) { const m = await dados.carregar(dbt, id, 'x'); await dados.gravar(dbt, id, m.versao, 'x', REAL); }
  await query(`delete from usuarios where id = $1::uuid returning 1`, [a]);
  for (const t of ['dados_versao', 'contas', 'cartoes', 'lancamentos', 'contas_fixas', 'metas', 'orcamentos'])
    assert.equal(await conta(`select count(*)::int n from ${t} where user_id = $1::uuid`, [a]), 0, t);
  assert.deepEqual((await dados.carregar(dbt, b, 'x')).data, REAL);
});

test('avisos: fatura paga pelo app (pagamento registrado) não avisa; compra depois do pagamento avisa só o que falta', () => {
  const card = { id: 'c1', name: 'Roxinho', closeDay: 5, dueDay: 12, paid: [] };
  const base = { bills: [], cards: [card], tx: [{ id: 'x', type: 'expense', desc: 'Loja', amount: 300, date: '2026-10-20', category: 'Lazer', card: 'c1' }] };
  const hoje = '2026-11-10';   // fatura que fechou em 05/11 vence 12/11 (2 dias)
  assert.match(buildReminders(base, hoje).find(r => r.key.startsWith('due:')).body, /R\$ 300,00/);
  const paga = { ...base, cards: [{ ...card, paid: ['2026-11'] }], tx: [...base.tx, { id: 'p', type: 'payment', amount: 300, date: hoje, account: 'a1', ref: { kind: 'fatura', card: 'c1', ym: '2026-11' } }] };
  assert.equal(buildReminders(paga, hoje).filter(r => r.key.startsWith('due:')).length, 0);
  const falta = { ...paga, tx: [...paga.tx, { id: 'y', type: 'expense', desc: 'Mais', amount: 50, date: '2026-11-01', category: 'Lazer', card: 'c1' }] };
  assert.match(buildReminders(falta, hoje).find(r => r.key.startsWith('due:')).body, /R\$ 50,00/);
});

test('avisos do servidor: leem das tabelas e, de quem ainda não abriu o app, do JSON antigo (sem converter)', async () => {
  const a = await novo('a@x.com'), b = await novo('b@x.com');
  for (const e of ['a@x.com', 'b@x.com']) await query(`insert into acessos(email) values($1) returning 1`, [e]);
  const hoje = '2026-11-05', agora = new Date('2026-11-05T15:00:00Z');
  const conta1 = { bills: [{ id: 'c1', kind: 'unica', name: 'Luz', amount: 100, date: hoje, paid: [] }], tx: [], cards: [] };
  const m = await dados.carregar(dbt, a, 'a'); await dados.gravar(dbt, a, m.versao, 'a', conta1);                 // A já convertida
  await query(`insert into app_data(user_id, data) values($1::uuid, $2::jsonb) returning 1`, [b, JSON.stringify(conta1)]);   // B ainda não
  await query(`insert into push_subscriptions(endpoint,user_id,p256dh,auth) values('https://push.exemplo/a',$1::uuid,'p','a') returning 1`, [a]);
  await query(`insert into push_subscriptions(endpoint,user_id,p256dh,auth) values('https://push.exemplo/b',$1::uuid,'p','a') returning 1`, [b]);
  const r = await executar({ query, modo: 'dry', agora, enviar: async () => {} });
  assert.equal(r.candidatos, 2);
  assert.equal(await conta(`select count(*)::int n from dados_versao where user_id = $1::uuid`, [b]), 0, 'o aviso não converte ninguém');
});

test('API: remover acesso com cópia guarda os dados montados das tabelas', async () => {
  const { handle } = criarApp(dbt);
  await query(`insert into usuarios(email,senha_hash) values('adm@x.com',$1) returning 1`, [await hashSenha('senha-admin-123')]);
  await query(`insert into acessos(email,is_admin) values('adm@x.com',true) returning 1`);
  const l = await handle({ method: 'POST', path: '/api/login', body: { email: 'adm@x.com', senha: 'senha-admin-123' }, ip: '1.1.1.1' });
  const c = /sid=[0-9a-f]{64}/.exec(l.setCookie)[0];
  assert.equal((await handle({ method: 'POST', path: '/api/acessos', body: { email: 'n@x.com', senha: 'senha-nova-123' }, cookie: c })).status, 201);
  const id = (await query(`select id::text as id from usuarios where email = 'n@x.com'`))[0].id;
  const m = await dados.carregar(dbt, id, 'n'); await dados.gravar(dbt, id, m.versao, 'n', REAL);
  assert.equal((await handle({ method: 'DELETE', path: '/api/acessos', body: { email: 'n@x.com', guardar_backup: true }, cookie: c })).status, 200);
  const bk = (await query(`select data from app_data_removidos where email = 'n@x.com'`))[0].data;
  assert.deepEqual(typeof bk === 'string' ? JSON.parse(bk) : bk, REAL);
  assert.equal(await conta(`select count(*)::int n from lancamentos where user_id = $1::uuid`, [id]), 0);
});

test('migração: relacional.sql é igual ao trecho do schema.sql e pode rodar duas vezes', async () => {
  const fs = require('fs'), path = require('path');
  const rel = fs.readFileSync(path.join(__dirname, '../relacional.sql'), 'utf8');
  assert.ok(fs.readFileSync(path.join(__dirname, '../schema.sql'), 'utf8').includes(rel));
  await dbt.exec(rel); await dbt.exec(rel);
  assert.equal(await conta(`select count(*)::int n from information_schema.tables where table_name in ('contas','cartoes','lancamentos','contas_fixas','metas','orcamentos','dados_versao')`), 7);
});
