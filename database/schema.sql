-- University Navigator — PostgreSQL schema for Supabase.
-- Run in the Supabase SQL editor (or `supabase db push`) BEFORE database/seed.sql.
--
-- Security model (see docs/architecture.md):
--   * Row Level Security is ENABLED on every table.
--   * Anonymous visitors can only SELECT published / active rows. They can never write.
--   * Staff are users that have a row in public.profiles with role 'admin' or 'editor'.
--       - editor : create/update departments, department services and rooms (+ delete services)
--       - admin  : everything an editor can do, plus buildings, floors, entrances, facilities,
--                  navigation nodes/edges, deletes, and managing public.profiles
--   * The role is ALWAYS read from public.profiles by the database. A role sent by the browser is never trusted.
--   * No service-role key is needed or used by the application.
--
-- The script is idempotent where practical, so it can be re-run safely.

-- =====================================================================================================
-- Helpers
-- =====================================================================================================
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Stable, URL/SQL-friendly ids (mirrors idSchema in src/lib/data/schemas.ts).
create or replace function public.is_stable_id(value text)
returns boolean
language sql
immutable
set search_path = public
as $$
  select value ~ '^[A-Za-z0-9][A-Za-z0-9_-]{1,79}$';
$$;

-- =====================================================================================================
-- Tables
-- =====================================================================================================

-- profiles: links an auth user to a staff role. Created manually by an admin (see docs/deployment-guide.md).
create table if not exists public.profiles (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null unique references auth.users (id) on delete cascade,
  full_name   text not null default '' check (char_length(full_name) <= 120),
  role        text not null check (role in ('admin', 'editor')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Role helpers. SECURITY DEFINER so they can read profiles regardless of the caller's own policies;
-- search_path is pinned to avoid search-path hijacking. They only ever look at auth.uid().
create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.user_id = (select auth.uid()) and p.role in ('admin', 'editor')
  );
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.user_id = (select auth.uid()) and p.role = 'admin'
  );
$$;

revoke all on function public.is_staff() from public, anon;
revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_staff() to authenticated;
grant execute on function public.is_admin() to authenticated;

create table if not exists public.buildings (
  id           text primary key check (public.is_stable_id(id)),
  name         text not null check (char_length(name) between 1 and 200),
  slug         text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  description  text,
  -- optional reference to a real GLB (same-origin path or https URL); NULL = use the procedural/manifest model
  model_url    text check (model_url is null or (model_url ~ '^(/|https://)' and model_url not like '%..%')),
  is_active    boolean not null default true,
  is_demo      boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists public.floors (
  id            text primary key check (public.is_stable_id(id)),
  building_id   text not null references public.buildings (id) on delete cascade,
  floor_number  integer not null check (floor_number between -10 and 200),
  display_name  text not null check (char_length(display_name) between 1 and 60),
  -- Y of the walking surface in meters (shared coordinate system, docs/3d-model-guide.md)
  elevation     numeric(8, 3) not null check (elevation between -10000 and 10000),
  model_url     text check (model_url is null or (model_url ~ '^(/|https://)' and model_url not like '%..%')),
  is_demo       boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (building_id, floor_number)
);

create table if not exists public.navigation_nodes (
  id          text primary key check (public.is_stable_id(id)),
  floor_id    text not null references public.floors (id) on delete cascade,
  node_type   text not null check (node_type in ('entrance', 'corridor', 'junction', 'room-door', 'stair', 'elevator')),
  position_x  numeric(9, 3) not null,
  position_y  numeric(9, 3) not null,
  position_z  numeric(9, 3) not null,
  label       text check (label is null or char_length(label) <= 120),
  is_demo     boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.rooms (
  id               text primary key check (public.is_stable_id(id)),
  floor_id         text not null references public.floors (id) on delete cascade,
  room_number      text not null check (char_length(room_number) between 1 and 20),
  name             text not null check (char_length(name) between 1 and 200),
  room_type        text not null default 'other'
                   check (room_type in ('office', 'classroom', 'lab', 'meeting', 'study', 'library', 'lobby', 'restroom', 'hall', 'other')),
  -- name of the mesh/object in the 3D model that represents this room (stable link model <-> record)
  model_object_id  text not null unique check (char_length(model_object_id) between 1 and 80),
  position_x       numeric(9, 3) not null,
  position_y       numeric(9, 3) not null,
  position_z       numeric(9, 3) not null,
  -- navigation node (type room-door) that gives access to the room
  door_node_id     text references public.navigation_nodes (id) on delete set null,
  is_demo          boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (floor_id, room_number)
);

-- A room may host SEVERAL departments (no unique constraint on room_id).
create table if not exists public.departments (
  id             text primary key check (public.is_stable_id(id)),
  room_id        text not null references public.rooms (id) on delete restrict,
  name           text not null check (char_length(name) between 1 and 200),
  slug           text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  description    text,
  phone          text check (phone is null or char_length(phone) <= 40),
  working_hours  text check (working_hours is null or char_length(working_hours) <= 200),
  keywords       text[] not null default '{}',
  is_active      boolean not null default true,
  is_demo        boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table if not exists public.department_services (
  id             text primary key check (public.is_stable_id(id)),
  department_id  text not null references public.departments (id) on delete cascade,
  service_name   text not null check (char_length(service_name) between 1 and 200),
  keywords       text[] not null default '{}',
  is_demo        boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table if not exists public.entrances (
  id           text primary key check (public.is_stable_id(id)),
  building_id  text not null references public.buildings (id) on delete cascade,
  floor_id     text not null references public.floors (id) on delete cascade,
  name         text not null check (char_length(name) between 1 and 200),
  position_x   numeric(9, 3) not null,
  position_y   numeric(9, 3) not null,
  position_z   numeric(9, 3) not null,
  node_id      text references public.navigation_nodes (id) on delete set null,
  is_demo      boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists public.navigation_edges (
  id             text primary key check (public.is_stable_id(id)),
  from_node_id   text not null references public.navigation_nodes (id) on delete cascade,
  to_node_id     text not null references public.navigation_nodes (id) on delete cascade,
  distance       numeric(9, 3) not null check (distance > 0 and distance <= 10000),
  edge_type      text not null check (edge_type in ('corridor', 'door', 'stairs', 'elevator', 'bridge')),
  -- true ONLY when the connection is explicitly verified as step-free; the router never assumes it
  accessible     boolean not null default false,
  bidirectional  boolean not null default true,
  is_demo        boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  check (from_node_id <> to_node_id)
);

create table if not exists public.facilities (
  id             text primary key check (public.is_stable_id(id)),
  floor_id       text not null references public.floors (id) on delete cascade,
  facility_type  text not null check (facility_type in ('restroom', 'stairs', 'elevator', 'info-desk', 'other')),
  name           text not null check (char_length(name) between 1 and 200),
  position_x     numeric(9, 3) not null,
  position_y     numeric(9, 3) not null,
  position_z     numeric(9, 3) not null,
  is_demo        boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- =====================================================================================================
-- Indexes (foreign keys and the columns the public pages filter by)
-- =====================================================================================================
create index if not exists floors_building_idx             on public.floors (building_id);
create index if not exists navigation_nodes_floor_idx      on public.navigation_nodes (floor_id);
create index if not exists navigation_nodes_type_idx       on public.navigation_nodes (node_type);
create index if not exists rooms_floor_idx                 on public.rooms (floor_id);
create index if not exists rooms_door_node_idx             on public.rooms (door_node_id);
create index if not exists departments_room_idx            on public.departments (room_id);
create index if not exists departments_active_idx          on public.departments (is_active) where is_active;
create index if not exists departments_keywords_gin        on public.departments using gin (keywords);
create index if not exists department_services_dept_idx    on public.department_services (department_id);
create index if not exists department_services_kw_gin      on public.department_services using gin (keywords);
create index if not exists entrances_building_idx          on public.entrances (building_id);
create index if not exists entrances_floor_idx             on public.entrances (floor_id);
create index if not exists entrances_node_idx              on public.entrances (node_id);
create index if not exists navigation_edges_from_idx       on public.navigation_edges (from_node_id);
create index if not exists navigation_edges_to_idx         on public.navigation_edges (to_node_id);
create index if not exists facilities_floor_idx            on public.facilities (floor_id);

-- =====================================================================================================
-- updated_at triggers
-- =====================================================================================================
do $$
declare t text;
begin
  foreach t in array array[
    'profiles', 'buildings', 'floors', 'navigation_nodes', 'rooms', 'departments',
    'department_services', 'entrances', 'navigation_edges', 'facilities'
  ] loop
    execute format('drop trigger if exists set_updated_at on public.%I', t);
    execute format('create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()', t);
  end loop;
end
$$;

-- =====================================================================================================
-- Privileges (defence in depth on top of RLS)
-- =====================================================================================================
revoke all on all tables in schema public from anon, authenticated;
grant select on
  public.buildings, public.floors, public.navigation_nodes, public.rooms, public.departments,
  public.department_services, public.entrances, public.navigation_edges, public.facilities
to anon, authenticated;
grant insert, update, delete on
  public.buildings, public.floors, public.navigation_nodes, public.rooms, public.departments,
  public.department_services, public.entrances, public.navigation_edges, public.facilities
to authenticated;
-- profiles are never visible to anonymous visitors
grant select, insert, update, delete on public.profiles to authenticated;

-- =====================================================================================================
-- Row Level Security
-- =====================================================================================================
alter table public.profiles             enable row level security;
alter table public.buildings            enable row level security;
alter table public.floors               enable row level security;
alter table public.navigation_nodes     enable row level security;
alter table public.rooms                enable row level security;
alter table public.departments          enable row level security;
alter table public.department_services  enable row level security;
alter table public.entrances            enable row level security;
alter table public.navigation_edges     enable row level security;
alter table public.facilities           enable row level security;

-- ---- profiles: a user reads only their own profile; only admins manage profiles -----------------------
drop policy if exists profiles_select_own   on public.profiles;
drop policy if exists profiles_select_admin on public.profiles;
drop policy if exists profiles_admin_insert on public.profiles;
drop policy if exists profiles_admin_update on public.profiles;
drop policy if exists profiles_admin_delete on public.profiles;

create policy profiles_select_own   on public.profiles for select to authenticated using (user_id = (select auth.uid()));
create policy profiles_select_admin on public.profiles for select to authenticated using (public.is_admin());
create policy profiles_admin_insert on public.profiles for insert to authenticated with check (public.is_admin());
create policy profiles_admin_update on public.profiles for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy profiles_admin_delete on public.profiles for delete to authenticated using (public.is_admin());

-- ---- public (anonymous + signed-in) read access: only published / active data ---------------------------
drop policy if exists buildings_public_read           on public.buildings;
drop policy if exists floors_public_read              on public.floors;
drop policy if exists navigation_nodes_public_read    on public.navigation_nodes;
drop policy if exists rooms_public_read               on public.rooms;
drop policy if exists departments_public_read         on public.departments;
drop policy if exists department_services_public_read on public.department_services;
drop policy if exists entrances_public_read           on public.entrances;
drop policy if exists navigation_edges_public_read    on public.navigation_edges;
drop policy if exists facilities_public_read          on public.facilities;

create policy buildings_public_read on public.buildings
  for select to anon, authenticated using (is_active);

create policy floors_public_read on public.floors
  for select to anon, authenticated
  using (exists (select 1 from public.buildings b where b.id = floors.building_id and b.is_active));

create policy navigation_nodes_public_read on public.navigation_nodes
  for select to anon, authenticated
  using (exists (select 1 from public.floors f where f.id = navigation_nodes.floor_id));

create policy rooms_public_read on public.rooms
  for select to anon, authenticated
  using (exists (select 1 from public.floors f where f.id = rooms.floor_id));

create policy departments_public_read on public.departments
  for select to anon, authenticated
  using (is_active and exists (select 1 from public.rooms r where r.id = departments.room_id));

create policy department_services_public_read on public.department_services
  for select to anon, authenticated
  using (exists (select 1 from public.departments d where d.id = department_services.department_id));

create policy entrances_public_read on public.entrances
  for select to anon, authenticated
  using (exists (select 1 from public.floors f where f.id = entrances.floor_id));

create policy navigation_edges_public_read on public.navigation_edges
  for select to anon, authenticated
  using (
    exists (select 1 from public.navigation_nodes n where n.id = navigation_edges.from_node_id)
    and exists (select 1 from public.navigation_nodes n where n.id = navigation_edges.to_node_id)
  );

create policy facilities_public_read on public.facilities
  for select to anon, authenticated
  using (exists (select 1 from public.floors f where f.id = facilities.floor_id));

-- ---- staff read access: staff also see inactive / unpublished rows (for the admin panel) ----------------
drop policy if exists buildings_staff_read           on public.buildings;
drop policy if exists floors_staff_read              on public.floors;
drop policy if exists navigation_nodes_staff_read    on public.navigation_nodes;
drop policy if exists rooms_staff_read               on public.rooms;
drop policy if exists departments_staff_read         on public.departments;
drop policy if exists department_services_staff_read on public.department_services;
drop policy if exists entrances_staff_read           on public.entrances;
drop policy if exists navigation_edges_staff_read    on public.navigation_edges;
drop policy if exists facilities_staff_read          on public.facilities;

create policy buildings_staff_read           on public.buildings           for select to authenticated using (public.is_staff());
create policy floors_staff_read              on public.floors              for select to authenticated using (public.is_staff());
create policy navigation_nodes_staff_read    on public.navigation_nodes    for select to authenticated using (public.is_staff());
create policy rooms_staff_read               on public.rooms               for select to authenticated using (public.is_staff());
create policy departments_staff_read         on public.departments         for select to authenticated using (public.is_staff());
create policy department_services_staff_read on public.department_services for select to authenticated using (public.is_staff());
create policy entrances_staff_read           on public.entrances           for select to authenticated using (public.is_staff());
create policy navigation_edges_staff_read    on public.navigation_edges    for select to authenticated using (public.is_staff());
create policy facilities_staff_read          on public.facilities          for select to authenticated using (public.is_staff());

-- ---- admin-only writes: buildings, floors, entrances, facilities, navigation graph ----------------------
do $$
declare t text;
begin
  foreach t in array array['buildings', 'floors', 'entrances', 'facilities', 'navigation_nodes', 'navigation_edges'] loop
    execute format('drop policy if exists %I on public.%I', t || '_admin_insert', t);
    execute format('drop policy if exists %I on public.%I', t || '_admin_update', t);
    execute format('drop policy if exists %I on public.%I', t || '_admin_delete', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.is_admin())', t || '_admin_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using (public.is_admin()) with check (public.is_admin())', t || '_admin_update', t);
    execute format('create policy %I on public.%I for delete to authenticated using (public.is_admin())', t || '_admin_delete', t);
  end loop;
end
$$;

-- ---- staff writes: departments, department_services, rooms (editors and admins) ------------------------
drop policy if exists departments_staff_insert         on public.departments;
drop policy if exists departments_staff_update         on public.departments;
drop policy if exists departments_admin_delete         on public.departments;
drop policy if exists department_services_staff_insert on public.department_services;
drop policy if exists department_services_staff_update on public.department_services;
drop policy if exists department_services_staff_delete on public.department_services;
drop policy if exists rooms_staff_insert               on public.rooms;
drop policy if exists rooms_staff_update               on public.rooms;
drop policy if exists rooms_admin_delete               on public.rooms;

create policy departments_staff_insert on public.departments for insert to authenticated with check (public.is_staff());
create policy departments_staff_update on public.departments for update to authenticated using (public.is_staff()) with check (public.is_staff());
create policy departments_admin_delete on public.departments for delete to authenticated using (public.is_admin());

create policy department_services_staff_insert on public.department_services for insert to authenticated with check (public.is_staff());
create policy department_services_staff_update on public.department_services for update to authenticated using (public.is_staff()) with check (public.is_staff());
create policy department_services_staff_delete on public.department_services for delete to authenticated using (public.is_staff());

create policy rooms_staff_insert on public.rooms for insert to authenticated with check (public.is_staff());
create policy rooms_staff_update on public.rooms for update to authenticated using (public.is_staff()) with check (public.is_staff());
create policy rooms_admin_delete on public.rooms for delete to authenticated using (public.is_admin());
