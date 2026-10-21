# Minhas Finanças

App pessoal de finanças. Front estático (HTML, CSS e JavaScript puro) com Supabase como backend (banco, autenticação e Edge Functions).

## Onde fica cada coisa

| Pasta / arquivo | O que tem |
| --- | --- |
| `index.html` | Casca da página: carrega o CSS, o Supabase e o `loader.js`. |
| `frontend/styles/app.css` | Todo o visual (cores, layout, telas). |
| `frontend/screens/shell/` | Barra lateral, barra inferior e cabeçalho do app. |
| `frontend/screens/views/` | Uma tela por arquivo: início, lançamentos, contas, calendário, categorias, assinaturas, insights e dicas. |
| `frontend/screens/dialogs/` | Janelas que abrem por cima: menu, editar conta, acessos, trocar senha e confirmação. |
| `frontend/screens/overlays/` | Tela de entrada (`lock.html`) e aviso rápido (`toast.html`). |
| `frontend/js/loader.js` | Carrega as telas acima e depois inicia o app. |
| `frontend/js/app.js` | Lógica do app: dados, cálculos, eventos e comunicação com o Supabase. |
| `frontend/assets/` | Logos e imagens. |
| `supabase/` | Função de lembretes (`send-reminders`) e SQL. Não é publicado na Vercel. |
| `sw.js` | Service worker das notificações push (precisa ficar na raiz). |
| `vercel.json` | Cabeçalhos de segurança (CSP) e configuração da Vercel. |

## Como editar

- Mudou uma tela? Abra o arquivo em `frontend/screens/views/` ou `dialogs/`.
- Mudou o visual? `frontend/styles/app.css`.
- Mudou uma regra ou a comunicação com o Supabase? `frontend/js/app.js`.

## Observações

- Os arquivos de tela são carregados pelo navegador. Não há etapa de build: basta publicar a pasta.
- Se você adicionar uma tela nova, inclua o arquivo na lista `SCREENS` de `frontend/js/loader.js`, na ordem em que deve aparecer.
