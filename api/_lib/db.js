// Banco de produção: Neon (Postgres) pelo driver HTTP, sem conexão aberta entre chamadas.
'use strict';
const { neon } = require('@neondatabase/serverless');

let sql;
async function query(texto, params = []) {
  if (!sql) {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL não configurada');
    sql = neon(process.env.DATABASE_URL);
  }
  return sql.query(texto, params);   // sempre devolve a lista de linhas
}
// Vários comandos numa transação só (tudo ou nada). lista = [[sql, params], ...]
async function transaction(lista) {
  if (!sql) await query('select 1');   // garante o cliente criado
  return sql.transaction(lista.map(([texto, params]) => sql.query(texto, params || [])));
}
module.exports = { query, transaction };
