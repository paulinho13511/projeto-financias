# Banco e testes do backend (Neon + funções da Vercel)

- `schema.sql` — todas as tabelas, para um banco **vazio** (não é repetível).
- `relacional.sql` — só as tabelas novas de dados (contas, cartões, lançamentos, contas fixas, metas, orçamentos).
  Pode rodar mais de uma vez e **não apaga nada**. É o que se roda num banco que já existe.
- `gen-migracao.js` — gera `migracao.sql` e `convites.json` a partir do backup do Supabase (histórico).
- `test/` — `npm test` (PGlite, Postgres dentro do Node). O GitHub Actions roda o mesmo comando a cada push.

## Dados em tabelas (TravaDin)

Antes, os dados de cada pessoa eram um JSON único em `app_data`. Agora ficam em tabelas de verdade, ligadas entre si
(`lancamentos.conta_id → contas`, `lancamentos.cartao_id → cartoes`, ...). O app continua mandando e recebendo o mesmo
formato; `api/_lib/dados.js` separa na gravação e monta na leitura. Campo fora do padrão fica no `extra` da linha: nada se perde.

A troca é ligada pela variável **`DADOS_TABELAS=1`** na Vercel. Sem ela, a API continua no JSON único.
Na primeira vez que a pessoa abre o app com a chave ligada, o JSON antigo é convertido sozinho; a `app_data` fica intacta como cópia de segurança.

### Banco de teste (preview da branch `testes`) — fazer primeiro
1. Neon → seu projeto → **Branches** → **Create branch** a partir da `main`, com o nome `testes` (é uma cópia dos dados reais).
2. Na branch `testes` do Neon: **SQL Editor** → colar e rodar o conteúdo de `db/relacional.sql`.
3. Copiar a *connection string* dessa branch.
4. Vercel → projeto → Settings → Environment Variables:
   - `DATABASE_URL` = a connection string da branch `testes`, ambiente **Preview**, *Git branch* `testes`.
   - `DADOS_TABELAS` = `1`, ambiente **Preview**, *Git branch* `testes`.
5. Redeploy da branch `testes`. Produção não muda em nada.

### Produção (só depois de aprovar o teste)
1. No banco de produção (branch `main` do Neon): rodar `db/relacional.sql`.
2. Merge da `testes` na `main`.
3. Vercel: `DADOS_TABELAS` = `1` em **Production** e redeploy.
4. Voltar atrás: apagar `DADOS_TABELAS` e redeploy (o app volta a ler a `app_data`, que ficou parada no momento da troca).

Variáveis na Vercel: `DATABASE_URL` (Neon), `DADOS_TABELAS`, `CRON_SECRET`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`.
Aviso manual: `POST /api/lembretes` com `Authorization: Bearer $CRON_SECRET` e corpo `{"modo":"dry"}` (só calcula) ou `{"modo":"teste"}` (aviso fixo).
