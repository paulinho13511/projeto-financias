// Gera migracao.sql a partir do backup do Supabase. O SQL leva só o HASH dos convites; os códigos em texto
// puro saem apenas no terminal (convites.json), para você abrir /definir-senha?token=...
const fs = require('fs'), crypto = require('crypto');
const arq = process.argv[2], saida = process.argv[3] || 'migracao.sql';
const b = JSON.parse(fs.readFileSync(arq, 'utf8')).dados;
const q = s => "'" + String(s).replace(/'/g, "''") + "'";
const j = o => `$json$${JSON.stringify(o)}$json$::jsonb`;
const sha = t => crypto.createHash('sha256').update(t).digest('hex');
const out = ['begin;'], convites = [];
for (const u of b.auth_users) out.push(`insert into usuarios(id,email,criado_em) values(${q(u.id)},${q(u.email.toLowerCase())},${q(u.created_at)});`);
for (const a of b.allowed_emails) out.push(`insert into acessos(email,is_admin,criado_em) values(${q(a.email.toLowerCase())},${a.is_admin},${q(a.created_at)});`);
for (const d of b.app_data) out.push(`insert into app_data(user_id,data,updated_at,updated_by) values(${q(d.user_id)},${j(d.data)},${q(d.updated_at)},${q(d.updated_by)});`);
for (const r of b.app_data_removidos) out.push(`insert into app_data_removidos(email,user_id,data,removed_at,removed_by) values(${q(r.email)},${r.user_id ? q(r.user_id) : 'null'},${r.data ? j(r.data) : 'null'},${q(r.removed_at)},${q(r.removed_by)});`);
for (const u of b.auth_users) {
  const tok = crypto.randomBytes(32).toString('hex');
  convites.push({ email: u.email, token: tok });
  out.push(`insert into convites(token_hash,user_id,expira_em) values(${q(sha(tok))},${q(u.id)},now() + interval '7 days');`);
}
out.push('commit;');
fs.writeFileSync(saida, out.join('\n') + '\n');
fs.writeFileSync('convites.json', JSON.stringify(convites, null, 2));
console.log('migracao.sql gerado com', out.length - 2, 'instruções;', convites.length, 'convites em convites.json');
