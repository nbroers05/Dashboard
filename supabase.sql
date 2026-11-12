-- Dashboard: snelle sync via Supabase (sinds 1.1.0). Eigen project "dashboard", los van het planner-project.
-- Plakken in Supabase › SQL Editor › New query › Run. Opnieuw draaien mag (alles is "if not exists" / "or replace").
--
-- Row Level Security: elk account leest en schrijft alleen zijn eigen rijen (user_id = auth.uid()).
-- Er is maar één account (Noah, gemaakt door het dashboard zelf; README "Supabase"). Fase 2 (Mensen) voegt later
-- accounts toe: die kunnen dankzij dezelfde regels nooit bij deze rijen.

-- ---------- Gedeelde instellingen (sync.js) ----------
-- Eén rij per sleutel, bijv. dash.links (eigen snelkoppelingen). value = dezelfde JSON als in localStorage.
-- Sleutels die met _ beginnen zijn interne vlaggen (bijv. _canvas.imported).
create table if not exists public.dashboard_settings (
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  key         text not null check (key ~ '^[a-z_][a-z0-9._-]{0,63}$'),
  value       jsonb,
  updated_at  timestamptz not null default now(),
  primary key (user_id, key),
  check (pg_column_size(value) <= 65536)
);

-- ---------- Canvas: ingeleverd (widgets/canvas.js) ----------
-- Eén rij per opdracht (id uit de Canvas-agenda). changed_at = moment van afvinken in ms; nieuwste wint.
create table if not exists public.dashboard_canvas_done (
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  item_id     text not null check (char_length(item_id) between 1 and 300),
  done        boolean not null,
  changed_at  bigint not null check (changed_at >= 0),
  primary key (user_id, item_id)
);

-- ---------- Nieuwste wint, ook als twee apparaten tegelijk schrijven ----------
-- Een upsert met een oudere tijd dan wat er al staat laat de bestaande rij staan.
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

-- ---------- Rechten ----------
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

-- ---------- Dagelijkse kopie naar het archief ----------
-- Het archief (dashboard-data, scripts/canvas_copy.py) haalt één keer per dag de Canvas-vinkjes op met een eigen sleutel.
-- Hier staat alleen een vingerafdruk van die sleutel plus van welk account de rijen zijn.
-- Sleutel maken: python scripts/setup/dashboard_export.py in dashboard-data (geeft één regel om hier te plakken).
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
