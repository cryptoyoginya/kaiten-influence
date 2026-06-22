-- Kaiten · инфлюенс-маркетинг — начальная схема
-- Модель: один блогер — одна строка; бэклог/спринт/интеграции — виды поверх.
-- Доступ: 4 роли. viewer — только чтение, остальные — чтение+запись.

-- ───────────────────────── профили и роли ─────────────────────────
create table if not exists profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  email      text,
  full_name  text,
  role       text not null default 'viewer'
             check (role in ('admin', 'producer', 'researcher', 'viewer')),
  created_at timestamptz not null default now()
);

-- роль текущего пользователя (для политик)
create or replace function auth_role() returns text
language sql stable security definer set search_path = public as $$
  select coalesce((select role from profiles where id = auth.uid()), 'viewer');
$$;

-- может ли текущий пользователь писать
create or replace function can_write() returns boolean
language sql stable as $$
  select auth_role() in ('admin', 'producer', 'researcher');
$$;

-- автосоздание профиля при регистрации (первый юзер — admin)
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, email, role)
  values (
    new.id, new.email,
    case when (select count(*) from profiles) = 0 then 'admin' else 'viewer' end
  );
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ───────────────────────── каналы (бэклог) ─────────────────────────
create table if not exists channels (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  link         text,
  niches       text[] not null default '{}',
  subscribers  text default '',
  audience     text default '',
  themes       text default '',
  err_views    text default '',
  price_raw    text default '',
  referral     text default '',
  comments     text[] not null default '{}',
  draft        boolean not null default false,
  shortlisted  boolean not null default false,
  post_date    text default '',
  post_topic   text default '',
  offer        text default '',
  creative     text default '',
  landing      text default '',
  utm          text default '',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists channels_niches_idx on channels using gin (niches);

-- ───────────────────────── спринты ─────────────────────────
create table if not exists sprints (
  id         text primary key,
  title      text not null,
  date_from  date,
  date_to    date,
  status     text not null default 'active'
);

create table if not exists placements (
  id             uuid primary key default gen_random_uuid(),
  sprint_id      text references sprints (id) on delete cascade,
  channel_id     uuid references channels (id) on delete set null,
  name           text not null,
  author_desc    text default '',
  audience       text default '',
  post_date      text default '',
  post_topic     text default '',
  offer          text default '',
  creative       text default '',
  landing        text default '',
  utm            text default '',
  price          text default '',
  price_discount text default '',
  subscribers    text default '',
  avg_views      text default '',
  err            text default '',
  forecast_reach text default '',
  forecast_cpv   text default '',
  steps          jsonb not null default '{}',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- ───────────────────────── интеграции (результаты) ─────────────────────────
create table if not exists integrations (
  id         text primary key,
  sprint_id  text references sprints (id) on delete cascade,
  name       text not null,
  niche      text default '',
  date       text default '',
  landing    text default '',
  published  boolean not null default false,
  plan       jsonb not null default '{}',
  result     jsonb not null default '{}',
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id)
);

-- ───────────────────────── аудит ─────────────────────────
create table if not exists audit_log (
  id         bigint generated always as identity primary key,
  table_name text not null,
  row_id     text,
  actor      uuid references auth.users (id),
  summary    text,
  at         timestamptz not null default now()
);

-- ───────────────────────── RLS ─────────────────────────
alter table profiles     enable row level security;
alter table channels     enable row level security;
alter table sprints      enable row level security;
alter table placements   enable row level security;
alter table integrations enable row level security;
alter table audit_log    enable row level security;

-- профили: каждый видит все, правит свой; admin правит любые
drop policy if exists profiles_read on profiles;
create policy profiles_read on profiles for select to authenticated using (true);
drop policy if exists profiles_self on profiles;
create policy profiles_self on profiles for update to authenticated
  using (id = auth.uid() or auth_role() = 'admin')
  with check (id = auth.uid() or auth_role() = 'admin');

-- контентные таблицы: читают все авторизованные, пишут не-viewer
do $$
declare t text;
begin
  foreach t in array array['channels','sprints','placements','integrations'] loop
    execute format('drop policy if exists %1$s_read on %1$s', t);
    execute format('create policy %1$s_read on %1$s for select to authenticated using (true)', t);
    execute format('drop policy if exists %1$s_write on %1$s', t);
    execute format('create policy %1$s_write on %1$s for all to authenticated using (can_write()) with check (can_write())', t);
  end loop;
end $$;

-- аудит: пишут все авторизованные, читают admin
drop policy if exists audit_insert on audit_log;
create policy audit_insert on audit_log for insert to authenticated with check (true);
drop policy if exists audit_read on audit_log;
create policy audit_read on audit_log for select to authenticated using (auth_role() = 'admin');

-- ───────────────────────── storage: скрины ─────────────────────────
insert into storage.buckets (id, name, public)
values ('screens', 'screens', true)
on conflict (id) do nothing;

drop policy if exists screens_read on storage.objects;
create policy screens_read on storage.objects for select
  using (bucket_id = 'screens');
drop policy if exists screens_write on storage.objects;
create policy screens_write on storage.objects for insert to authenticated
  with check (bucket_id = 'screens' and can_write());
drop policy if exists screens_delete on storage.objects;
create policy screens_delete on storage.objects for delete to authenticated
  using (bucket_id = 'screens' and can_write());
