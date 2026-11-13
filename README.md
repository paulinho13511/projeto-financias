# TravaDin

App pessoal de finanças. Front estático (HTML, CSS e JavaScript puro, sem etapa de build) + API em funções da Vercel + banco Postgres no Neon.

## Como as peças se falam

```
Navegador (index.html + frontend/)  ──/api/*──▶  api/index.js (função da Vercel)  ──▶  Neon (Postgres)
                                                       ▲
                          cron diário da Vercel ──/api/lembretes──▶ avisos push
```

- Cada pessoa tem uma linha em `app_data` com todos os dados (JSON). Gravar usa controle de versão: se dois aparelhos salvam ao mesmo tempo, o segundo recebe "conflito" em vez de apagar o primeiro.
- Login por e-mail e senha; a sessão é um cookie protegido (`sid`). Quem perde o acesso na lista de acessos perde a sessão na hora.
- Contas novas entram por convite de uso único (`/definir-senha?token=...`).

## Onde fica cada coisa

| Pasta / arquivo | O que tem |
| --- | --- |
| `index.html` | Casca da página: carrega o CSS, o `loader.js` e o `api.js`. |
| `definir-senha.html` | Tela onde a pessoa cria a senha a partir do convite. |
| `frontend/js/loader.js` | Carrega as telas abaixo e depois inicia o app. |
| `frontend/js/app.js` | Lógica do app: dados, cálculos, eventos e telas. |
| `frontend/js/api.js` | Cliente da API (chamadas a `/api/*`). |
| `frontend/js/login-globe.js` | Animação da tela de entrada. |
| `frontend/styles/` | `app.css` (visual do app), `tema.css` (cores do TravaDin: grafite, prata e vermelho), `login.css` (entrada), `definir-senha.css`. |
| `frontend/screens/shell/` | Barra lateral, barra inferior e cabeçalho. |
| `frontend/screens/views/` | Uma tela por arquivo: início (com o **como estou**), **metas**, lançamentos, carteira, contas, calendário, categorias e assinaturas. |
| `frontend/screens/dialogs/` | Janelas por cima: menu, editar conta, acessos, trocar senha, confirmação, pagar. |
| `frontend/screens/overlays/` | Tela de entrada (`lock.html`) e aviso rápido (`toast.html`). |
| `api/index.js` | Porta de entrada da API (a Vercel manda tudo de `/api/*` para cá). |
| `api/_lib/app.js` | Regras da API: login, dados, acessos, senha, push. |
| `api/_lib/lembretes*.js` | Cálculo e envio dos avisos de contas e cartões. |
| `api/_lib/db.js` | Conexão com o Neon. |
| `db/` | `schema.sql` (tabelas), testes do backend e a ferramenta de migração (`gen-migracao.js`). Não é publicado. |
| `sw.js` | Service worker das notificações push (precisa ficar na raiz). |
| `vercel.json` | Rotas da API, cron diário, região e cabeçalhos de segurança (CSP). |

## Telas principais

- **Início**: saldo do mês, receitas e despesas no topo e, logo abaixo, três respostas em frases: *Estou bem?* (sinal verde, amarelo ou vermelho), *Posso gastar?* e *O que vem aí?* (as próximas contas, com botão "Paguei"). Esse bloco só aparece no mês de hoje. Depois vêm o gráfico de gastos, as notificações, os últimos lançamentos e o botão "Ver detalhes (gráficos)".
- **Previsão de renda** (sem cadastro): o app olha o último mês (dos 3 anteriores) com receita na categoria "Salário" e repete os mesmos dias e valores; o que já entrou como Salário neste mês abate o previsto, e extras (Freelance, Investimentos) só contam quando lançados. Parcelas de dias que já passaram sem lançamento não são inventadas.
- **Metas**: metas e caixinhas, numa tela própria.

## Como editar

- Mudou uma tela? Abra o arquivo em `frontend/screens/views/` ou `dialogs/`.
- Mudou o visual? `frontend/styles/app.css`.
- Mudou uma regra do app? `frontend/js/app.js`. Mudou uma regra da API? `api/_lib/app.js`.
- Tela nova: crie o arquivo em `views/`, inclua-o na lista `SCREENS` de `frontend/js/loader.js` e o nome em `TITLES` no `app.js`.
- Campos de dinheiro usam `data-money` e `parseValor()` (aceitam `1.626,76`).

## Testes

```
npm test        # backend; usa o PGlite (Postgres dentro do Node), não precisa instalar nada (ver db/README.md)
```

O que mexe na tela é conferido no navegador (Playwright), fora do repositório.

Medidor de quadros da tela de entrada: abra o app com `?fps=1` no endereço (ex.: `/?fps=1`) para ver fps, p95, resolução e placa de vídeo do globo.

## Variáveis na Vercel

`DATABASE_URL` (Neon), `CRON_SECRET`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`. Nenhum segredo fica no código.

## Histórico

O backend anterior (Supabase) foi removido do código. Ele continua guardado no histórico do Git e o projeto parado no Supabase serve de reserva dos dados antigos.
