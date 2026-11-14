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

-- ===== dados em tabelas (mesmo conteúdo de db/relacional.sql) =====
-- TravaDin — dados em tabelas de verdade (substitui o JSON único da app_data).
-- Pode rodar mais de uma vez (só cria o que falta). NÃO apaga nada: a app_data continua como cópia de segurança.
-- Cada pessoa é convertida sozinha na primeira vez que abre o app depois desta mudança (a API lê a app_data e grava aqui).
-- Tudo é por pessoa (user_id) e apaga junto quando a pessoa é removida (on delete cascade).

-- cabeçalho: versão (para detectar dois aparelhos gravando ao mesmo tempo), preferências e o que não tem tabela própria
create table if not exists dados_versao (
  user_id uuid primary key references usuarios(id) on delete cascade,
  versao timestamptz not null default clock_timestamp(),
  updated_by text,
  chaves text[] not null default '{}',          -- quais blocos existem nos dados, na ordem (contas, cartões, ...)
  settings jsonb,                               -- preferências do app
  extras jsonb not null default '{}',           -- qualquer outro bloco, guardado como veio (nada se perde)
  migrado_em timestamptz not null default now()
);

create table if not exists contas (
  user_id uuid not null references usuarios(id) on delete cascade,
  ordem int not null,
  id text,
  nome text,
  tipo text,
  saldo_inicial numeric(14,2),
  extra jsonb not null default '{}',            -- campos fora do padrão, guardados como vieram
  primary key (user_id, ordem),
  unique (user_id, id)
);

create table if not exists cartoes (
  user_id uuid not null references usuarios(id) on delete cascade,
  ordem int not null,
  id text,
  nome text,
  dia_fecha smallint check (dia_fecha between 1 and 31),
  dia_vence smallint check (dia_vence between 1 and 31),
  limite numeric(14,2) check (limite > 0),
  faturas_pagas text[],
  extra jsonb not null default '{}',
  primary key (user_id, ordem),
  unique (user_id, id)
);

create table if not exists lancamentos (
  user_id uuid not null references usuarios(id) on delete cascade,
  ordem int not null,
  id text,
  tipo text check (tipo in ('expense','income','transfer','payment')),
  descricao text,
  valor numeric(14,2),
  data date,
  categoria text,
  conta_id text,
  cartao_id text,
  de_conta text,
  para_conta text,
  ref jsonb,                                    -- pagamento: de qual fatura ou conta fixa
  criado bigint,
  extra jsonb not null default '{}',
  primary key (user_id, ordem),
  unique (user_id, id),
  foreign key (user_id, conta_id)   references contas(user_id, id)  deferrable initially deferred,
  foreign key (user_id, de_conta)   references contas(user_id, id)  deferrable initially deferred,
  foreign key (user_id, para_conta) references contas(user_id, id)  deferrable initially deferred,
  foreign key (user_id, cartao_id)  references cartoes(user_id, id) deferrable initially deferred
);
create index if not exists lancamentos_data on lancamentos (user_id, data);

create table if not exists contas_fixas (
  user_id uuid not null references usuarios(id) on delete cascade,
  ordem int not null,
  id text,
  tipo text check (tipo in ('mensal','parcelada','unica')),
  nome text,
  valor numeric(14,2),
  dia smallint check (dia between 1 and 31),
  categoria text,
  cartao_id text,
  pagas text[],
  inicio text check (inicio ~ '^\d{4}-\d{2}$'),
  parcelas int check (parcelas > 0),
  ultima numeric(14,2),
  fim text check (fim ~ '^\d{4}-\d{2}$'),
  data date,
  assinatura boolean,
  extra jsonb not null default '{}',
  primary key (user_id, ordem),
  unique (user_id, id),
  foreign key (user_id, cartao_id) references cartoes(user_id, id) deferrable initially deferred
);

create table if not exists metas (
  user_id uuid not null references usuarios(id) on delete cascade,
  ordem int not null,
  id text,
  nome text,
  alvo numeric(14,2),
  prazo text,
  guardado numeric(14,2),
  extra jsonb not null default '{}',
  primary key (user_id, ordem),
  unique (user_id, id)
);

create table if not exists orcamentos (             -- limite de gasto por categoria
  user_id uuid not null references usuarios(id) on delete cascade,
  ordem int not null,
  categoria text not null,
  valor numeric(14,2) not null,
  primary key (user_id, ordem),
  unique (user_id, categoria)
);

-- Grava o cabeçalho e confere a versão numa coisa só. Se a versão não bate (outro aparelho gravou antes), dá erro
-- e a transação inteira volta: nenhuma tabela é mexida. p_novo = primeira conversão (só se ainda não existir).
create or replace function grava_cabecalho(p_user uuid, p_versao text, p_por text, p_chaves text[], p_settings jsonb, p_extras jsonb, p_novo boolean)
returns text language plpgsql as $$
declare v text;
begin
  if p_novo then
    insert into dados_versao(user_id, updated_by, chaves, settings, extras) values (p_user, p_por, p_chaves, p_settings, p_extras)
      on conflict (user_id) do nothing returning versao::text into v;
    if v is null then raise exception 'ja_convertido'; end if;
  else
    update dados_versao set versao = clock_timestamp(), updated_by = p_por, chaves = p_chaves, settings = p_settings, extras = p_extras
     where user_id = p_user and versao = p_versao::timestamptz returning versao::text into v;
    if v is null then raise exception 'conflito_versao'; end if;
  end if;
  return v;
end $$;
