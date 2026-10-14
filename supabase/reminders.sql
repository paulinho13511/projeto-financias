-- Registro de avisos já enviados (evita repetir o mesmo aviso). Acesso só pelo serviço.
create table if not exists public.reminder_log (
  key text primary key,
  sent_at timestamptz not null default now()
);
alter table public.reminder_log enable row level security;
-- Sem políticas: clientes (anon/authenticated) não leem nem escrevem; a função usa a service role.

-- Agendamento diário às 08:00 de São Paulo (11:00 UTC).
-- ANTES de rodar: troque SEU_CRON_SECRET pelo mesmo valor configurado em CRON_SECRET
-- e prefira guardá-lo no Vault do Supabase (não versionar o valor real).
create extension if not exists pg_cron;
create extension if not exists pg_net;
select cron.unschedule('send-reminders') where exists (select 1 from cron.job where jobname = 'send-reminders');
select cron.schedule(
  'send-reminders',
  '0 11 * * *',
  $$ select net.http_post(
       url := 'https://htkrdndcbfnngzlghcjj.supabase.co/functions/v1/send-reminders',
       headers := jsonb_build_object('Content-Type','application/json','x-cron-secret','SEU_CRON_SECRET'),
       body := '{}'::jsonb
     ); $$
);
