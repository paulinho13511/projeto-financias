// Adaptador de TESTE: roda cada consulta num Postgres local pelo psql, com parâmetros de verdade
// (protocolo estendido, \bind), então `$1` nunca é concatenado no SQL. Mesma assinatura do db.js de produção: query(sql, params).
const { spawnSync } = require('child_process');
const CONN = ['-h', process.env.PGSOCK || '/tmp/pgsock', '-p', process.env.PGPORT || '54329', '-U', 'postgres', '-d', process.env.PGDB || 'proto', '-X', '-A', '-t', '-q'];
const lit = v => "'" + String(v).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n').replace(/\r/g, '\\r') + "'";

function querySync(sql, params = []) {
  const wrapped = `with q as (${sql}) select coalesce(json_agg(q),'[]'::json) from q`;
  const script = wrapped + (params.length ? ` \\bind ${params.map(lit).join(' ')} \\g\n` : ';\n');
  const r = spawnSync('psql', CONN, { input: script, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0 || /ERROR/.test(r.stderr || '')) throw new Error((r.stderr || 'psql falhou').trim());
  return JSON.parse(r.stdout.trim() || '[]');
}
const query = async (sql, params) => querySync(sql, params);
module.exports = { query, querySync, CONN };
