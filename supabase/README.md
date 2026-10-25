# Supabase: avisos automáticos e configuração

## 1. Segredos da função (Supabase → Edge Functions → Secrets)
- Nenhum segredo manual: o token de chamada é gerado pelo `reminders.sql` e guardado na tabela `reminder_config`.
- `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY`: par VAPID. A chave pública precisa ser a mesma usada em `js/app.js` (`VAPID_PUBLIC`).
  Se a chave privada antiga não estiver disponível, gere um novo par e troque também a constante no app; quem já tinha ativado notificações precisa ativar de novo.
- `VAPID_SUBJECT`: `mailto:seu-email@dominio`.
- `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` já são fornecidos pelo Supabase às funções.

## 2. Tabela e agendamento
1. Rode `reminders.sql` no SQL Editor (é idempotente).
2. Publique a função: `supabase functions deploy send-reminders --no-verify-jwt`
   (o acesso é protegido pelo `x-cron-secret`, não por JWT).

## 3. Teste manual
```
curl -X POST https://htkrdndcbfnngzlghcjj.supabase.co/functions/v1/send-reminders \
  -H "x-cron-secret: SEU_CRON_SECRET"
```
A resposta mostra `candidates` (avisos calculados) e `sent` (enviados agora).

Para só ver o que seria enviado, sem enviar nem registrar nada, mande o corpo `{"dry": true}`.

## Regras
- Cada pessoa recebe só os avisos dos próprios dados (`app_data.user_id`), nos próprios aparelhos.
- Fechamento do cartão em até 3 dias; vencimento da fatura 3, 2 e 1 dia antes e no dia; conta sem cartão 2 e 1 dia antes e no dia.
- Contas e faturas atrasadas avisam todo dia por até 7 dias.
- Contas do mês seguinte entram (vencimento do dia 1 ou 2 avisado nos últimos dias do mês).
- Compras no cartão não geram aviso de conta: são pagas pela fatura.
- Todo aviso informa quanto ainda falta pagar no mês; no dia 1 sai um resumo do mês.
- Cada aviso é enviado uma vez por aparelho (`reminder_log`); aparelho que falhou tenta de novo no dia seguinte.
- Só são enviados avisos para e-mails que ainda estão em `allowed_emails`.
- Testes da lógica: `node --experimental-strip-types --test supabase/functions/send-reminders/logic.test.ts`.
