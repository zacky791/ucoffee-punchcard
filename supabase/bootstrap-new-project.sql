-- U Coffee — full bootstrap for a NEW empty Supabase project
-- Dashboard → SQL Editor → New query → Paste all → Run

-- Staff
create table if not exists staff (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  pin text not null default '0000' check (char_length(pin) = 4),
  role text not null default 'barista',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Punches + GPS
create table if not exists punches (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references staff(id) on delete cascade,
  type text not null check (type in ('in', 'out')),
  punched_at timestamptz not null default now(),
  note text,
  latitude double precision,
  longitude double precision,
  accuracy double precision,
  location_label text
);

create index if not exists punches_staff_id_idx on punches(staff_id);
create index if not exists punches_punched_at_idx on punches(punched_at desc);

create or replace view staff_status as
select
  s.id as staff_id,
  s.name,
  s.role,
  s.active,
  p.type as last_punch_type,
  p.punched_at as last_punched_at,
  case
    when p.type = 'in' then true
    else false
  end as is_clocked_in
from staff s
left join lateral (
  select type, punched_at
  from punches
  where staff_id = s.id
  order by punched_at desc
  limit 1
) p on true;

-- Seed team (skip if names already exist)
insert into staff (name, pin, role)
select v.name, v.pin, v.role
from (values
  ('Haziq', '0000', 'head_chef'),
  ('Arash Abdullah', '0000', 'manager'),
  ('Azim', '0000', 'assistant_manager'),
  ('Nadhirah', '0000', 'assistant_chef'),
  ('Faqih', '0000', 'barista'),
  ('Zakaria', '0000', 'barista')
) as v(name, pin, role)
where not exists (
  select 1 from staff s where s.name = v.name
);

-- Cafe hours
create table if not exists cafe_hours (
  day_of_week smallint primary key check (day_of_week between 0 and 6),
  is_closed boolean not null default false,
  open_time time,
  close_time time
);

-- Roster (week-specific)
create table if not exists roster_assignments (
  id uuid primary key default gen_random_uuid(),
  week_start date not null,
  day_of_week smallint not null check (day_of_week between 0 and 6),
  staff_id uuid not null references staff(id) on delete cascade,
  section text not null check (section in ('kitchen', 'barista')),
  unique (week_start, day_of_week, staff_id)
);

create index if not exists roster_day_idx on roster_assignments(day_of_week);
create index if not exists roster_week_idx on roster_assignments(week_start);

insert into cafe_hours (day_of_week, is_closed, open_time, close_time) values
  (0, false, '12:00', '13:00'),
  (1, true, null, null),
  (2, false, '06:00', '12:00'),
  (3, false, '06:00', '12:00'),
  (4, false, '06:00', '12:00'),
  (5, false, '06:00', '12:00'),
  (6, false, '12:00', '13:00')
on conflict (day_of_week) do update set
  is_closed = excluded.is_closed,
  open_time = excluded.open_time,
  close_time = excluded.close_time;

-- RLS + grants for publishable/anon key
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on table staff to anon, authenticated;
grant select, insert, update, delete on table punches to anon, authenticated;
grant select on staff_status to anon, authenticated;
grant select, insert, update, delete on table cafe_hours to anon, authenticated;
grant select, insert, update, delete on table roster_assignments to anon, authenticated;

alter table staff enable row level security;
alter table punches enable row level security;
alter table cafe_hours enable row level security;
alter table roster_assignments enable row level security;

drop policy if exists staff_select on staff;
drop policy if exists staff_insert on staff;
drop policy if exists staff_update on staff;
drop policy if exists staff_delete on staff;
drop policy if exists punches_select on punches;
drop policy if exists punches_insert on punches;
drop policy if exists punches_update on punches;
drop policy if exists punches_delete on punches;
drop policy if exists cafe_hours_all on cafe_hours;
drop policy if exists roster_all on roster_assignments;

create policy staff_select on staff for select to anon, authenticated using (true);
create policy staff_insert on staff for insert to anon, authenticated with check (true);
create policy staff_update on staff for update to anon, authenticated using (true) with check (true);
create policy staff_delete on staff for delete to anon, authenticated using (true);

create policy punches_select on punches for select to anon, authenticated using (true);
create policy punches_insert on punches for insert to anon, authenticated with check (true);
create policy punches_update on punches for update to anon, authenticated using (true) with check (true);
create policy punches_delete on punches for delete to anon, authenticated using (true);

create policy cafe_hours_all on cafe_hours for all to anon, authenticated using (true) with check (true);
create policy roster_all on roster_assignments for all to anon, authenticated using (true) with check (true);
