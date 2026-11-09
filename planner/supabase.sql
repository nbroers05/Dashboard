-- Planner, ronde 1: tabellen en beveiliging.
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
