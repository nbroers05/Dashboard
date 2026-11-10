-- Planner: tabellen en beveiliging (ronde 1 en 2).
-- Plak dit hele bestand in Supabase > SQL Editor > New query en klik op Run.
-- Opnieuw draaien kan geen kwaad: bestaande tabellen en rijen blijven staan.

-- ---------- Vak-labels ----------
create table if not exists public.planner_subjects (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 40),
  color       text not null default '#7F77DD' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, name)
);

-- ---------- Taken en eigen tijdblokken ----------
-- Inbox:      day leeg
-- Op een dag: day ingevuld, start_min leeg
-- Tijdlijn:   day en start_min ingevuld (start_min = minuten na middernacht, lokale tijd)
create table if not exists public.planner_tasks (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind          text not null default 'task' check (kind in ('task', 'block')),
  title         text not null check (char_length(title) between 1 and 200),
  done          boolean not null default false,
  day           date,
  start_min     smallint check (start_min between 0 and 1439),
  duration_min  smallint not null default 60 check (duration_min between 5 and 1440),
  subject_id    uuid references public.planner_subjects (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (start_min is null or day is not null),
  check (kind = 'task' or (day is not null and start_min is not null))
);

create index if not exists planner_tasks_user_day on public.planner_tasks (user_id, day);

-- ---------- updated_at bijhouden ----------
create or replace function public.planner_touch()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists planner_subjects_touch on public.planner_subjects;
create trigger planner_subjects_touch before update on public.planner_subjects
  for each row execute function public.planner_touch();

drop trigger if exists planner_tasks_touch on public.planner_tasks;
create trigger planner_tasks_touch before update on public.planner_tasks
  for each row execute function public.planner_touch();

-- ---------- Row Level Security: alleen de eigenaar van een rij ----------
alter table public.planner_subjects enable row level security;
alter table public.planner_tasks    enable row level security;

revoke all on public.planner_subjects from anon;
revoke all on public.planner_tasks    from anon;
grant select, insert, update, delete on public.planner_subjects to authenticated;
grant select, insert, update, delete on public.planner_tasks    to authenticated;

drop policy if exists planner_subjects_select on public.planner_subjects;
drop policy if exists planner_subjects_insert on public.planner_subjects;
drop policy if exists planner_subjects_update on public.planner_subjects;
drop policy if exists planner_subjects_delete on public.planner_subjects;

create policy planner_subjects_select on public.planner_subjects
  for select to authenticated using ((select auth.uid()) = user_id);
create policy planner_subjects_insert on public.planner_subjects
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy planner_subjects_update on public.planner_subjects
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy planner_subjects_delete on public.planner_subjects
  for delete to authenticated using ((select auth.uid()) = user_id);

drop policy if exists planner_tasks_select on public.planner_tasks;
drop policy if exists planner_tasks_insert on public.planner_tasks;
drop policy if exists planner_tasks_update on public.planner_tasks;
drop policy if exists planner_tasks_delete on public.planner_tasks;

create policy planner_tasks_select on public.planner_tasks
  for select to authenticated using ((select auth.uid()) = user_id);
create policy planner_tasks_insert on public.planner_tasks
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy planner_tasks_update on public.planner_tasks
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy planner_tasks_delete on public.planner_tasks
  for delete to authenticated using ((select auth.uid()) = user_id);

-- ---------- Binnen seconden op je andere apparaten ----------
do $$
begin
  alter publication supabase_realtime add table public.planner_subjects;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.planner_tasks;
exception when duplicate_object then null;
end $$;

-- ---------- Ronde 2: gewoontes, boodschappen, Nog reageren ----------
create table if not exists public.planner_habits (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 40),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, name)
);

create table if not exists public.planner_habit_checks (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  habit_id    uuid not null references public.planner_habits (id) on delete cascade,
  day         date not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (habit_id, day)
);

create index if not exists planner_habit_checks_user_day on public.planner_habit_checks (user_id, day);

create table if not exists public.planner_groceries (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title       text not null check (char_length(title) between 1 and 120),
  done        boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Wie je nog moet antwoorden: naam, app en sinds wanneer. Kolom last_message staat verderop.
create table if not exists public.planner_replies (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  person      text not null check (char_length(person) between 1 and 100),
  app         text not null check (char_length(app) between 1 and 40),
  since       timestamptz not null default now(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, app, person)
);

-- Zelfde regels als hierboven voor alle vier de tabellen: alleen de eigenaar van een rij, en live bijwerken.
do $$
declare
  t text;
begin
  foreach t in array array['planner_habits', 'planner_habit_checks', 'planner_groceries', 'planner_replies'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_touch', t);
    execute format('create trigger %I before update on public.%I for each row execute function public.planner_touch()', t || '_touch', t);

    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);

    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format('drop policy if exists %I on public.%I', t || '_insert', t);
    execute format('drop policy if exists %I on public.%I', t || '_update', t);
    execute format('drop policy if exists %I on public.%I', t || '_delete', t);

    execute format('create policy %I on public.%I for select to authenticated using ((select auth.uid()) = user_id)', t || '_select', t);
    execute format('create policy %I on public.%I for insert to authenticated with check ((select auth.uid()) = user_id)', t || '_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)', t || '_update', t);
    execute format('create policy %I on public.%I for delete to authenticated using ((select auth.uid()) = user_id)', t || '_delete', t);

    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;

-- ---------- Archief: aantallen en reactietijden per app per dag ----------
-- Alleen getallen: geen namen en geen berichten. Regel erbij = ontvangen. Regel weg = gereageerd, met de tijd die dat duurde.
-- Met het kruisje in de planner afgehandeld (dismissed) telt niet als reactie.
alter table public.planner_replies add column if not exists dismissed boolean not null default false;

create table if not exists public.planner_reply_stats (
  user_id        uuid not null,
  day            date not null,
  app            text not null check (char_length(app) between 1 and 40),
  received       integer not null default 0,
  answered       integer not null default 0,
  reply_seconds  integer[] not null default '{}',
  primary key (user_id, day, app)
);

-- Vingerafdruk van de sleutel waarmee het archief de cijfers mag ophalen. Zie dashboard-data/scripts/setup/planner_export.py.
create table if not exists public.planner_export_tokens (
  token_hash  text primary key check (token_hash ~ '^[0-9a-f]{64}$')
);

alter table public.planner_reply_stats    enable row level security;
alter table public.planner_export_tokens  enable row level security;
revoke all on public.planner_reply_stats   from anon, authenticated;
revoke all on public.planner_export_tokens from anon, authenticated;
grant select on public.planner_reply_stats to authenticated;

drop policy if exists planner_reply_stats_select on public.planner_reply_stats;
create policy planner_reply_stats_select on public.planner_reply_stats
  for select to authenticated using ((select auth.uid()) = user_id);

create or replace function public.planner_reply_received()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.planner_reply_stats as s (user_id, day, app, received)
  values (new.user_id, (new.since at time zone 'Europe/Amsterdam')::date, new.app, 1)
  on conflict (user_id, day, app) do update set received = s.received + 1;
  return null;
end;
$$;

create or replace function public.planner_reply_answered()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  seconds integer := greatest(0, extract(epoch from now() - old.since)::integer);
begin
  if old.dismissed then
    return null;
  end if;
  insert into public.planner_reply_stats as s (user_id, day, app, answered, reply_seconds)
  values (old.user_id, (now() at time zone 'Europe/Amsterdam')::date, old.app, 1, array[seconds])
  on conflict (user_id, day, app) do update
    set answered = s.answered + 1, reply_seconds = s.reply_seconds || seconds;
  return null;
end;
$$;

drop trigger if exists planner_replies_received on public.planner_replies;
create trigger planner_replies_received after insert on public.planner_replies
  for each row execute function public.planner_reply_received();

drop trigger if exists planner_replies_answered on public.planner_replies;
create trigger planner_replies_answered after delete on public.planner_replies
  for each row execute function public.planner_reply_answered();

-- Het archief haalt hiermee afgeronde dagen op. Zonder de juiste sleutel: niets.
create or replace function public.planner_reply_stats_export(p_token text, p_since date)
returns table (day date, app text, received integer, answered integer, reply_seconds integer[])
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.planner_export_tokens t
    where t.token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex')
  ) then
    raise exception 'geen toegang' using errcode = '42501';
  end if;
  return query
    select s.day, s.app, s.received, s.answered, s.reply_seconds
    from public.planner_reply_stats s
    where s.day >= p_since and s.day < (now() at time zone 'Europe/Amsterdam')::date
    order by 1, 2;
end;
$$;

revoke all on function public.planner_reply_stats_export(text, date) from public, authenticated;
grant execute on function public.planner_reply_stats_export(text, date) to anon;

-- ---------- Laatste bericht onder de naam ----------
-- Eén veld per regel: een nieuw bericht overschrijft het en het verdwijnt samen met de regel (gereageerd of het kruisje).
-- Zelfde Row Level Security als de rest van planner_replies. De triggers en de export hierboven lezen dit veld niet,
-- dus het komt nooit in planner_reply_stats of in het archief.
alter table public.planner_replies add column if not exists last_message text check (char_length(last_message) <= 500);