-- Esquema do backend próprio (Neon/Postgres). Autorização é feita no código da API, não em RLS.
create extension if not exists pgcrypto;

create table usuarios (
  id uuid primary key default gen_random_uuid(),
  email text not null unique check (email = lower(email)),
  senha_hash text,                         -- scrypt$N$salt$hash; nulo até a pessoa usar o convite
  criado_em timestamptz not null default now()
);

create table acessos (                     -- quem pode usar o app (substitui allowed_emails)
  email text primary key check (email = lower(email)),
  is_admin boolean not null default false,
  criado_em timestamptz not null default now()
);

create table app_data (                    -- um JSON por pessoa; updated_at é a versão
  user_id uuid primary key references usuarios(id) on delete cascade,
  data jsonb not null default '{}',
  updated_at timestamptz not null default clock_timestamp(),
  updated_by text
);

create table sessoes (                     -- só o hash do token fica no banco
  token_hash text primary key,
  user_id uuid not null references usuarios(id) on delete cascade,
  expira_em timestamptz not null,
  criado_em timestamptz not null default now()
);

create table tentativas_login (
  id bigserial primary key,
  email text not null,
  ip text not null,
  em timestamptz not null default now()
);
create index on tentativas_login (email, em);
create index on tentativas_login (ip, em);

create table convites (                    -- convite de uso único para definir a primeira senha
  token_hash text primary key,
  user_id uuid not null references usuarios(id) on delete cascade,
  expira_em timestamptz not null,
  usado_em timestamptz
);

create table push_subscriptions (
  endpoint text primary key,
  user_id uuid not null references usuarios(id) on delete cascade,
  p256dh text not null,
  auth text not null,
  criado_em timestamptz not null default now()
);

create table reminder_log (
  key text primary key,
  sent_at timestamptz not null default now()
);

create table app_data_removidos (
  id bigserial primary key,
  email text not null,
  user_id uuid,
  data jsonb,
  removed_at timestamptz not null default now(),
  removed_by text
);
