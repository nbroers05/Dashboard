-- Dashboard: fast sync via Supabase (since 1.1.0). Own project "dashboard", separate from the planner project.
-- Paste into Supabase › SQL Editor › New query › Run. Running it again is fine (everything is "if not exists" / "or replace").
--
-- Row Level Security: each account only reads and writes its own rows (user_id = auth.uid()).
-- There is only one account (Noah, created by the dashboard itself; README "Supabase"). Should more accounts ever be
-- added, the same rules mean they can never reach these rows.

-- ---------- Shared settings (sync.js) ----------
-- One row per key, e.g. dash.links (own shortcuts). value = the same JSON as in localStorage.
-- Keys starting with _ are internal flags (e.g. _canvas.imported, _phone.status).
create table if not exists public.dashboard_settings (
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  key         text not null check (key ~ '^[a-z_][a-z0-9._-]{0,63}$'),
  value       jsonb,
  updated_at  timestamptz not null default now(),
  primary key (user_id, key),
  check (pg_column_size(value) <= 65536)
);

-- ---------- Canvas: handed in (widgets/canvas.js) ----------
-- One row per assignment (id from the Canvas calendar). changed_at = moment of checking off in ms; newest wins.
create table if not exists public.dashboard_canvas_done (
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  item_id     text not null check (char_length(item_id) between 1 and 300),
  done        boolean not null,
  changed_at  bigint not null check (changed_at >= 0),
  primary key (user_id, item_id)
);

-- ---------- Newest wins, also when two devices write at the same time ----------
-- An upsert with an older time than what is already there leaves the existing row as it is.
create or replace function public.dashboard_keep_newest_setting()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.updated_at < old.updated_at then return old; end if;
  return new;
end;
$$;
drop trigger if exists dashboard_settings_newest on public.dashboard_settings;
create trigger dashboard_settings_newest before update on public.dashboard_settings
  for each row execute function public.dashboard_keep_newest_setting();

create or replace function public.dashboard_keep_newest_canvas()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.changed_at < old.changed_at then return old; end if;
  return new;
end;
$$;
drop trigger if exists dashboard_canvas_newest on public.dashboard_canvas_done;
create trigger dashboard_canvas_newest before update on public.dashboard_canvas_done
  for each row execute function public.dashboard_keep_newest_canvas();

-- ---------- Permissions ----------
alter table public.dashboard_settings    enable row level security;
alter table public.dashboard_canvas_done enable row level security;
revoke all on public.dashboard_settings    from anon, authenticated;
revoke all on public.dashboard_canvas_done from anon, authenticated;
grant select, insert, update, delete on public.dashboard_settings    to authenticated;
grant select, insert, update, delete on public.dashboard_canvas_done to authenticated;

drop policy if exists dashboard_settings_own on public.dashboard_settings;
create policy dashboard_settings_own on public.dashboard_settings
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists dashboard_canvas_own on public.dashboard_canvas_done;
create policy dashboard_canvas_own on public.dashboard_canvas_done
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- ---------- Daily copy to the archive ----------
-- The archive (dashboard-data, scripts/canvas_copy.py) fetches the Canvas check marks once a day with its own key.
-- Only a fingerprint of that key is stored here, plus which account the rows belong to.
-- Making the key: python scripts/setup/dashboard_export.py in dashboard-data (gives one line to paste here).
-- (The error text 'geen toegang' below means "no access"; it is left as it is so the function doesn't change.)
create table if not exists public.dashboard_export_tokens (
  token_hash  text primary key check (token_hash ~ '^[0-9a-f]{64}$'),
  user_id     uuid not null references auth.users (id) on delete cascade
);
alter table public.dashboard_export_tokens enable row level security;
revoke all on public.dashboard_export_tokens from anon, authenticated;

create or replace function public.dashboard_canvas_export(p_token text)
returns table (item_id text, done boolean, changed_at bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  owner uuid;
begin
  select t.user_id into owner from public.dashboard_export_tokens t
  where t.token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex');
  if owner is null then
    raise exception 'geen toegang' using errcode = '42501';
  end if;
  return query
    select c.item_id, c.done, c.changed_at from public.dashboard_canvas_done c
    where c.user_id = owner
    order by 1;
end;
$$;

revoke all on function public.dashboard_canvas_export(text) from public, authenticated;
grant execute on function public.dashboard_canvas_export(text) to anon;
