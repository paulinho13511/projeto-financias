# API — Minhas Finanças

API Node.js + Express + SQLite com autenticação JWT (Bearer). Cada conta vê somente os próprios dados. Contas são criadas por um administrador.

## Requisitos

- Node.js 20 ou superior (testado no ambiente de desenvolvimento com Node 22).
- Dependências nativas: `better-sqlite3` precisa compilar na instalação. Em Linux, geralmente basta ter `build-essential` e `python3`, ou usar uma imagem Node oficial.

## Como rodar localmente

```bash
cd backend
npm install
cp .env.example .env        # edite JWT_SECRET e ALLOWED_ORIGINS
node --env-file=.env src/server.js
```

Teste rápido:

```bash
curl http://localhost:3000/api/health
# {"ok":true}
```

## Criar a primeira conta administradora

```bash
cd backend
ADMIN_EMAIL=voce@exemplo.com ADMIN_PASSWORD='uma-senha-com-10-ou-mais-caracteres' ADMIN_NAME='Seu Nome' \
  node --env-file=.env scripts/create-admin.js
```

O script não altera contas existentes. Depois de criar a conta, apague a senha do histórico do shell.

## Variáveis de ambiente

| Variável | Obrigatória | Padrão | Descrição |
|---|---|---|---|
| `JWT_SECRET` | sim | — | Segredo para assinar tokens. Mínimo de 32 caracteres. |
| `PORT` | não | `3000` | Porta HTTP. |
| `ALLOWED_ORIGINS` | não | vazio | Origens do front, separadas por vírgula (ex.: `https://seu-app.vercel.app`). Sem origem listada, o navegador bloqueia as chamadas. |
| `DB_FILE` | não | `data/financas.db` | Caminho do arquivo SQLite. |
| `JWT_EXPIRES_IN` | não | `8h` | Duração do token. |
| `TRUST_PROXY` | não | `false` | Use `true` apenas atrás de um proxy confiável. |

## Endpoints

Todas as respostas de erro têm o formato `{ "error": { "code": "...", "message": "..." } }`.

### Públicos

- `GET /api/health`: status da API.
- `POST /api/auth/login`: body `{ email, password }`. Retorna `{ token, expiresIn, user }`. Após 5 falhas do mesmo IP e e-mail em 15 minutos, responde `429`.

### Autenticados (header `Authorization: Bearer <token>`)

- `GET /api/auth/me`: dados do usuário logado.
- `POST /api/auth/password`: body `{ currentPassword, newPassword }`. Troca a senha, invalida as sessões antigas e retorna um token novo.

### Administrador

- `GET /api/admin/users`: lista as contas.
- `POST /api/admin/users`: body `{ email, name, password, role? }`. `role` é `member` por padrão. Retorna `201`.
- `PATCH /api/admin/users/:id`: altera `name`, `role`, `active` e/ou `password` (redefinição). Alterar papel ou status derruba as sessões do usuário afetado. Não é possível remover o último administrador ativo nem desativar a própria conta.

## Segurança implementada

- Senhas com bcrypt (custo 12). Limite de 72 bytes, o máximo do bcrypt.
- Login com tempo de resposta constante, para não revelar quais e-mails têm conta.
- Tokens HS256 com emissor e audiência. Cada token carrega uma `tv` (token version), conferida no banco a cada requisição. Troca de senha, desativação e mudança de papel invalidam tokens antigos.
- Limite de tentativas de login em memória (uma instância).
- Corpo JSON limitado a 100 KB. Cabeçalhos `nosniff`, `X-Frame-Options: DENY` e `Cache-Control: no-store`.
- O campo `password_hash` nunca sai da API.

## Deploy

O SQLite exige disco persistente. **A Vercel não serve para esta API**: o sistema de arquivos é efêmero e o banco se perderia a cada deploy. Use uma hospedagem com volume persistente, como VPS (Hetzner, DigitalOcean), Railway com volume ou Fly.io com volume.

Checklist:

1. Monte um volume e aponte `DB_FILE` para ele (ex.: `/data/financas.db`).
2. Defina `JWT_SECRET`, `ALLOWED_ORIGINS` e, se houver proxy, `TRUST_PROXY=true`.
3. Sirva a API somente por HTTPS.
4. Rode `create-admin` uma vez.
5. Faça backup periódico do arquivo do banco. Com WAL ativo, copie com a API parada ou use `sqlite3 .backup`.

## Estrutura

```
backend/
├── scripts/create-admin.js    criação da primeira conta administradora
├── src/
│   ├── app.js                 montagem do Express, CORS, erros
│   ├── server.js              ponto de entrada (listen, encerramento limpo)
│   ├── config.js              leitura e validação de variáveis de ambiente
│   ├── db/index.js            abertura do SQLite e migrações versionadas
│   ├── lib/                   erros HTTP e validações
│   ├── middleware/auth.js     Bearer, papel administrador, revogação de sessão
│   ├── routes/                auth e admin
│   └── services/              usuários e limite de login
└── tests/                     (a implementar)
```

## Status

- Etapa 1 (estrutura, autenticação e contas): código escrito e sintaxe validada. Ainda sem testes de execução: é preciso rodar `npm install` e `npm test` no seu ambiente.
- Etapa 2 (transações, contas a pagar, cartões e metas): pendente.
- Etapa 3 (front-end usando `fetch` com Bearer e remoção do Supabase): pendente.
