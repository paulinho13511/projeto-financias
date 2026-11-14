// Dados do app em tabelas (contas, cartões, lançamentos, contas fixas, metas, orçamentos).
// O app continua recebendo e mandando o mesmo formato de sempre ({accounts, cards, tx, bills, goals, budgets, settings});
// aqui ele é separado em tabelas na gravação e montado de volta na leitura.
// Regra de ouro: NADA se perde. Campo que não cabe na coluna (formato estranho, referência a conta que não existe,
// valor com mais de 2 casas) fica guardado como veio no "extra" da linha e volta igual.
'use strict';

const OBJ = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const TXT = v => typeof v === 'string';
const NUM = v => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) < 1e12 && Math.round(v * 100) / 100 === v;   // cabe em numeric(14,2) sem arredondar
const DIA = v => Number.isInteger(v) && v >= 1 && v <= 31;
const INT = v => Number.isSafeInteger(v);
const YM = v => TXT(v) && /^\d{4}-(0[1-9]|1[0-2])$/.test(v);
const DATA = v => { if (!TXT(v) || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false; const d = new Date(v + 'T00:00:00Z'); return !isNaN(d) && d.toISOString().slice(0, 10) === v; };
const um = lista => v => lista.includes(v);

// [coluna, campo no app, validação] — a validação 'ref:<tabela>' exige que o id exista nessa tabela
const MAPA = {
  contas:       { chave: 'accounts', cols: [['id', 'id', TXT], ['nome', 'name', TXT], ['tipo', 'type', TXT], ['saldo_inicial', 'initial', NUM]] },
  cartoes:      { chave: 'cards', cols: [['id', 'id', TXT], ['nome', 'name', TXT], ['dia_fecha', 'closeDay', DIA], ['dia_vence', 'dueDay', DIA],
                  ['limite', 'limit', v => NUM(v) && v > 0], ['faturas_pagas', 'paid', v => Array.isArray(v) && v.every(YM)]] },
  lancamentos:  { chave: 'tx', cols: [['id', 'id', TXT], ['tipo', 'type', um(['expense', 'income', 'transfer', 'payment'])], ['descricao', 'desc', TXT],
                  ['valor', 'amount', NUM], ['data', 'date', DATA], ['categoria', 'category', TXT], ['conta_id', 'account', 'ref:contas'],
                  ['cartao_id', 'card', 'ref:cartoes'], ['de_conta', 'from', 'ref:contas'], ['para_conta', 'to', 'ref:contas'], ['ref', 'ref', OBJ], ['criado', 'created', INT]] },
  contas_fixas: { chave: 'bills', cols: [['id', 'id', TXT], ['tipo', 'kind', um(['mensal', 'parcelada', 'unica'])], ['nome', 'name', TXT], ['valor', 'amount', NUM],
                  ['dia', 'day', DIA], ['categoria', 'category', TXT], ['cartao_id', 'card', 'ref:cartoes'], ['pagas', 'paid', v => Array.isArray(v) && v.every(YM)],
                  ['inicio', 'start', YM], ['parcelas', 'parcels', v => Number.isInteger(v) && v > 0 && v < 1e6], ['ultima', 'last', NUM], ['fim', 'end', YM],
                  ['data', 'date', DATA], ['assinatura', 'sub', v => typeof v === 'boolean']] },
  metas:        { chave: 'goals', cols: [['id', 'id', TXT], ['nome', 'name', TXT], ['alvo', 'target', NUM], ['prazo', 'deadline', TXT], ['guardado', 'saved', NUM]] },
};
const TABELAS = ['contas', 'cartoes', 'lancamentos', 'contas_fixas', 'metas'];   // ordem de gravação: quem é referenciado vem antes
const CHAVE_TABELA = Object.fromEntries(TABELAS.map(t => [MAPA[t].chave, t]));

// ---------- app -> linhas ----------
function separar(data) {
  const chaves = Object.keys(data);
  const extras = {}, linhas = { orcamentos: [] };
  let settings = null;
  for (const t of TABELAS) linhas[t] = [];
  // listas que não são lista de objetos ficam inteiras no extras (não dá para separar sem perder)
  const lista = k => Array.isArray(data[k]) && data[k].every(OBJ) ? data[k] : null;
  const ids = {};
  for (const t of TABELAS) {
    const arr = lista(MAPA[t].chave);
    if (MAPA[t].chave in data && !arr) { extras[MAPA[t].chave] = data[MAPA[t].chave]; continue; }
    if (!arr) continue;
    const vistos = new Set();
    ids[t] = new Set();
    for (const it of arr) if (TXT(it.id) && !vistos.has(it.id)) { vistos.add(it.id); }
    // id repetido: só o primeiro vira id da linha; os outros ficam no extra
    const usados = new Set();
    arr.forEach(it => { if (TXT(it.id) && !usados.has(it.id)) { usados.add(it.id); ids[t].add(it.id); } });
  }
  for (const t of TABELAS) {
    const arr = lista(MAPA[t].chave);
    if (!arr) continue;
    const usados = new Set();
    arr.forEach((it, ordem) => {
      const lin = { ordem }, extra = {};
      const colDe = {};
      for (const [col, campo, ok] of MAPA[t].cols) colDe[campo] = [col, ok];
      for (const [campo, v] of Object.entries(it)) {
        const m = colDe[campo];
        let cabe = false;
        if (m && v !== null && v !== undefined) {
          const [col, ok] = m;
          if (campo === 'id') cabe = TXT(v) && !usados.has(v);
          else if (typeof ok === 'string') cabe = TXT(v) && !!ids[ok.slice(4)] && ids[ok.slice(4)].has(v);
          else cabe = ok(v);
          if (cabe) { lin[col] = v; if (campo === 'id') usados.add(v); }
        }
        if (!cabe) extra[campo] = v;
      }
      lin.extra = extra;
      linhas[t].push(lin);
    });
  }
  if ('budgets' in data) {
    const b = data.budgets;
    if (OBJ(b) && Object.values(b).every(NUM)) linhas.orcamentos = Object.entries(b).map(([categoria, valor], ordem) => ({ ordem, categoria, valor }));
    else extras.budgets = b;
  }
  if ('settings' in data) { if (OBJ(data.settings)) settings = data.settings; else extras.settings = data.settings; }
  for (const k of chaves) if (!(k in CHAVE_TABELA) && k !== 'budgets' && k !== 'settings') extras[k] = data[k];
  return { chaves, settings, extras, linhas };
}

// Comandos da gravação (uma transação só): cabeçalho com a versão, apaga as linhas da pessoa e põe as novas.
// SQL fixo; os dados vão como parâmetro JSON e o Postgres separa em linhas (jsonb_to_recordset).
const SQL = {
  cabecalho: `select grava_cabecalho($1::uuid, $2::text, $3::text, array(select jsonb_array_elements_text($4::jsonb)), nullif($5::jsonb, 'null'::jsonb), $6::jsonb, $7::boolean) as versao`,
  apagar: [
    `delete from lancamentos where user_id = $1::uuid returning 1`,
    `delete from contas_fixas where user_id = $1::uuid returning 1`,
    `delete from metas where user_id = $1::uuid returning 1`,
    `delete from orcamentos where user_id = $1::uuid returning 1`,
    `delete from cartoes where user_id = $1::uuid returning 1`,
    `delete from contas where user_id = $1::uuid returning 1`,
  ],
  inserir: {
    contas: `insert into contas(user_id, ordem, id, nome, tipo, saldo_inicial, extra)
             select $1::uuid, x.ordem, x.id, x.nome, x.tipo, x.saldo_inicial, coalesce(x.extra, '{}')
               from jsonb_to_recordset($2::jsonb) as x(ordem int, id text, nome text, tipo text, saldo_inicial numeric, extra jsonb) returning 1`,
    cartoes: `insert into cartoes(user_id, ordem, id, nome, dia_fecha, dia_vence, limite, faturas_pagas, extra)
             select $1::uuid, x.ordem, x.id, x.nome, x.dia_fecha, x.dia_vence, x.limite, x.faturas_pagas, coalesce(x.extra, '{}')
               from jsonb_to_recordset($2::jsonb) as x(ordem int, id text, nome text, dia_fecha smallint, dia_vence smallint, limite numeric, faturas_pagas text[], extra jsonb) returning 1`,
    lancamentos: `insert into lancamentos(user_id, ordem, id, tipo, descricao, valor, data, categoria, conta_id, cartao_id, de_conta, para_conta, ref, criado, extra)
             select $1::uuid, x.ordem, x.id, x.tipo, x.descricao, x.valor, x.data, x.categoria, x.conta_id, x.cartao_id, x.de_conta, x.para_conta, x.ref, x.criado, coalesce(x.extra, '{}')
               from jsonb_to_recordset($2::jsonb) as x(ordem int, id text, tipo text, descricao text, valor numeric, data date, categoria text, conta_id text, cartao_id text,
                                                       de_conta text, para_conta text, ref jsonb, criado bigint, extra jsonb) returning 1`,
    contas_fixas: `insert into contas_fixas(user_id, ordem, id, tipo, nome, valor, dia, categoria, cartao_id, pagas, inicio, parcelas, ultima, fim, data, assinatura, extra)
             select $1::uuid, x.ordem, x.id, x.tipo, x.nome, x.valor, x.dia, x.categoria, x.cartao_id, x.pagas, x.inicio, x.parcelas, x.ultima, x.fim, x.data, x.assinatura, coalesce(x.extra, '{}')
               from jsonb_to_recordset($2::jsonb) as x(ordem int, id text, tipo text, nome text, valor numeric, dia smallint, categoria text, cartao_id text, pagas text[],
                                                       inicio text, parcelas int, ultima numeric, fim text, data date, assinatura boolean, extra jsonb) returning 1`,
    metas: `insert into metas(user_id, ordem, id, nome, alvo, prazo, guardado, extra)
             select $1::uuid, x.ordem, x.id, x.nome, x.alvo, x.prazo, x.guardado, coalesce(x.extra, '{}')
               from jsonb_to_recordset($2::jsonb) as x(ordem int, id text, nome text, alvo numeric, prazo text, guardado numeric, extra jsonb) returning 1`,
    orcamentos: `insert into orcamentos(user_id, ordem, categoria, valor)
             select $1::uuid, x.ordem, x.categoria, x.valor from jsonb_to_recordset($2::jsonb) as x(ordem int, categoria text, valor numeric) returning 1`,
  },
  ler: `select
      (select to_jsonb(d) from (select versao::text as versao, chaves, settings, extras from dados_versao where user_id = $1::uuid) d) as cab,
      (select coalesce(jsonb_agg(to_jsonb(x) - 'user_id' order by x.ordem), '[]') from contas x where x.user_id = $1::uuid) as contas,
      (select coalesce(jsonb_agg(to_jsonb(x) - 'user_id' order by x.ordem), '[]') from cartoes x where x.user_id = $1::uuid) as cartoes,
      (select coalesce(jsonb_agg(to_jsonb(x) - 'user_id' order by x.ordem), '[]') from lancamentos x where x.user_id = $1::uuid) as lancamentos,
      (select coalesce(jsonb_agg(to_jsonb(x) - 'user_id' order by x.ordem), '[]') from contas_fixas x where x.user_id = $1::uuid) as contas_fixas,
      (select coalesce(jsonb_agg(to_jsonb(x) - 'user_id' order by x.ordem), '[]') from metas x where x.user_id = $1::uuid) as metas,
      (select coalesce(jsonb_agg(to_jsonb(x) - 'user_id' order by x.ordem), '[]') from orcamentos x where x.user_id = $1::uuid) as orcamentos`,
  legado: `select data from app_data where user_id = $1::uuid`,
};

function comandos(userId, versao, por, data, novo) {
  const { chaves, settings, extras, linhas } = separar(data);
  const lista = [[SQL.cabecalho, [userId, versao || '', por, JSON.stringify(chaves), JSON.stringify(settings), JSON.stringify(extras), novo ? 'true' : 'false']]];
  for (const s of SQL.apagar) lista.push([s, [userId]]);
  for (const t of [...TABELAS, 'orcamentos']) if (linhas[t].length) lista.push([SQL.inserir[t], [userId, JSON.stringify(linhas[t])]]);
  return lista;
}

// ---------- linhas -> app ----------
const num = v => v === null || v === undefined ? v : Number(v);   // numeric pode voltar como texto em alguns drivers
function montar(r) {
  const parse = v => typeof v === 'string' ? JSON.parse(v) : v;
  const cab = parse(r.cab);
  if (!cab) return null;
  const extras = parse(cab.extras) || {};
  const blocos = {};
  for (const t of TABELAS) {
    const cols = MAPA[t].cols;
    blocos[MAPA[t].chave] = parse(r[t]).map(lin => {
      const o = { ...(parse(lin.extra) || {}) };
      for (const [col, campo, ok] of cols) {
        let v = lin[col];
        if (v === null || v === undefined) continue;
        if (ok === NUM || col === 'limite' || col === 'saldo_inicial' || col === 'valor' || col === 'ultima' || col === 'alvo' || col === 'guardado') v = num(v);
        if (col === 'criado' || col === 'parcelas' || col === 'dia' || col === 'dia_fecha' || col === 'dia_vence') v = Number(v);
        if (col === 'data') v = String(v).slice(0, 10);
        o[campo] = v;
      }
      return o;
    });
  }
  const orc = parse(r.orcamentos);
  blocos.budgets = Object.fromEntries(orc.map(x => [x.categoria, num(x.valor)]));
  blocos.settings = parse(cab.settings);
  const data = {};
  for (const k of cab.chaves || []) {
    if (k in extras) data[k] = extras[k];
    else if (k in blocos && blocos[k] !== null) data[k] = blocos[k];
  }
  return { data, versao: cab.versao };
}

// Lê os dados de uma pessoa; na primeira vez, converte o JSON antigo (app_data) para as tabelas.
async function carregar({ query, transaction }, userId, por) {
  let r = (await query(SQL.ler, [userId]))[0];
  let m = montar(r);
  if (m) return m;
  const antigo = (await query(SQL.legado, [userId]))[0];
  const data = antigo && OBJ(antigo.data) ? antigo.data : {};
  try { await transaction(comandos(userId, '', por || 'conversao', data, true)); }
  catch (e) { if (!/ja_convertido/.test(String(e && e.message))) throw e; }   // outro aparelho converteu no mesmo instante
  r = (await query(SQL.ler, [userId]))[0];
  return montar(r);
}

// Só leitura (avisos do servidor): quem ainda não foi convertido é lido do JSON antigo, sem gravar nada.
async function lerSemConverter(query, userId) {
  let m = null;
  try { m = montar((await query(SQL.ler, [userId]))[0]); }
  catch (e) { if (!/dados_versao|does not exist|não existe/.test(String(e && e.message))) throw e; }   // banco ainda sem as tabelas novas
  if (m) return m.data;
  const antigo = (await query(SQL.legado, [userId]))[0];
  return antigo && OBJ(antigo.data) ? antigo.data : {};
}

// Grava tudo (tudo ou nada). Devolve a nova versão ou null se outro aparelho gravou antes (conflito).
async function gravar({ transaction }, userId, versao, por, data) {
  try {
    const out = await transaction(comandos(userId, versao, por, data, false));
    return out[0][0].versao;
  } catch (e) {
    if (/conflito_versao|invalid input syntax for type timestamp/.test(String(e && e.message))) return null;
    throw e;
  }
}

module.exports = { carregar, gravar, lerSemConverter, separar, montar, SQL };
