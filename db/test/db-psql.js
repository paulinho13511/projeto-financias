// Adaptador de TESTE: Postgres de verdade rodando dentro do Node (PGlite, WASM), sem instalar nada.
// Mesma assinatura do db.js de produção: query(sql, params) -> lista de linhas. Parâmetros vão separados do SQL ($1 nunca é concatenado).
// Os tipos voltam como texto (timestamp, bigint, numeric), igual ao driver do Neon.
const fs = require('fs'), path = require('path');
const { PGlite, types } = require('@electric-sql/pglite');

const comoTexto = v => v;
let pg;
const novo = () => new PGlite({ parsers: { [types.TIMESTAMPTZ]: comoTexto, [types.TIMESTAMP]: comoTexto, [types.INT8]: comoTexto, [types.NUMERIC]: comoTexto, [types.DATE]: comoTexto } });
const banco = () => pg || (pg = novo());

async function query(sql, params = []) {
  return (await banco().query(sql, params)).rows;
}
// Recria o banco do zero com o schema.sql (um banco novo por teste: rápido e isolado).
async function reset() {
  if (pg) await pg.close();
  pg = novo();
  // gen_random_uuid() já vem no Postgres 13+; o PGlite não traz a extensão pgcrypto, então a linha é pulada aqui.
  await pg.exec(fs.readFileSync(path.join(__dirname, '../schema.sql'), 'utf8').replace(/create extension[^;]*;/i, ''));
}
// Roda um script SQL inteiro (vários comandos), como o migracao.sql.
async function exec(sql) { await banco().exec(sql); }

// Mesma ideia do db.transaction de produção: tudo ou nada.
async function transaction(lista) {
  return banco().transaction(async tx => { const out = []; for (const [sql, ps] of lista) out.push((await tx.query(sql, ps || [])).rows); return out; });
}

module.exports = { query, querySync: query, transaction, reset, exec };
