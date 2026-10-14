-- Avisos automáticos de contas e cartões. Rode este arquivo inteiro no SQL Editor (é idempotente).
-- Nenhum segredo fica escrito aqui: o token de chamada é gerado no próprio banco.

-- 1) Registro de avisos já enviados (cada aviso sai uma vez). Só o serviço acessa.
create table if not exists public.reminder_log (
  key text primary key,
  sent_at timestamptz not null default now()
);
alter table public.reminder_log enable row level security;

-- 2) Token de chamada do agendamento. Só o serviço acessa; o pg_cron lê daqui.
create table if not exists public.reminder_config (
  key text primary key,
  value text not null
);
alter table public.reminder_config enable row level security;
insert into public.reminder_config (key, value)
values ('cron_token', encode(gen_random_bytes(32), 'hex'))
on conflict (key) do nothing;

-- 3) Agendamento diário às 08:00 de São Paulo (11:00 UTC). Substitui o agendamento antigo,
--    que apontava para uma função inexistente e com cabeçalho inválido.
create extension if not exists pg_cron;
create extension if not exists pg_net;
select cron.unschedule(jobid) from cron.job where jobname in ('lembretes-financas-diarios','send-reminders');
select cron.schedule(
  'send-reminders',
  '0 11 * * *',
  $$ select net.http_post(
       url := 'https://htkrdndcbfnngzlghcjj.supabase.co/functions/v1/send-reminders',
       headers := jsonb_build_object(
         'Content-Type', 'application/json',
         'x-cron-secret', (select value from public.reminder_config where key = 'cron_token')
       ),
       body := '{}'::jsonb
     ); $$
);
