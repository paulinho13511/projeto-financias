# Supabase: avisos automáticos e configuração

## 1. Segredos da função (Supabase → Edge Functions → Secrets)
- Nenhum segredo manual: o token de chamada é gerado pelo `reminders.sql` e guardado na tabela `reminder_config`.
- `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY`: par VAPID. A chave pública precisa ser a mesma usada em `js/services/push.js` (`VAPID_PUBLIC`).
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

## Regras
- Mesmas datas do app: fechamento em até 3 dias, vencimento em até 3 dias, conta vencendo em até 2 dias ou atrasada.
- Cada aviso é enviado uma vez (`reminder_log`).
- Só são enviados avisos para e-mails que ainda estão em `allowed_emails`.
