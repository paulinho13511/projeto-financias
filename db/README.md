# Banco e testes do backend (Neon + funções da Vercel)

- `schema.sql` — tabelas. Rode **uma vez**, num banco vazio (não é repetível).
- `gen-migracao.js` — gera `migracao.sql` e `convites.json` a partir do backup do Supabase:
  `node db/gen-migracao.js backup.json migracao.sql`. O SQL guarda só o *hash* dos convites;
  os códigos em texto puro ficam em `convites.json` (privado, não vai para o git).
- `test/` — `npm test`. Não precisa instalar Postgres: os testes usam o PGlite (Postgres dentro do Node).
  O teste de migração só roda com `BACKUP_JSON=caminho/do/backup.json`. O GitHub Actions roda o mesmo comando a cada push.

Variáveis na Vercel: `DATABASE_URL` (Neon), `CRON_SECRET`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`.
Aviso manual: `POST /api/lembretes` com `Authorization: Bearer $CRON_SECRET` e corpo `{"modo":"dry"}` (só calcula) ou `{"modo":"teste"}` (aviso fixo).
