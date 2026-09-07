-- Cafe opening hours + weekly worker roster
-- day_of_week: 0=Sunday ... 6=Saturday (JS Date.getDay())

create table if not exists cafe_hours (
  day_of_week smallint primary key check (day_of_week between 0 and 6),
  is_closed boolean not null default false,
  open_time time,
  close_time time
);

create table if not exists roster_assignments (
  id uuid primary key default gen_random_uuid(),
  day_of_week smallint not null check (day_of_week between 0 and 6),
  staff_id uuid not null references staff(id) on delete cascade,
  section text not null check (section in ('kitchen', 'barista')),
  unique (day_of_week, staff_id)
);

create index if not exists roster_day_idx on roster_assignments(day_of_week);

alter table cafe_hours enable row level security;
alter table roster_assignments enable row level security;

drop policy if exists cafe_hours_all on cafe_hours;
drop policy if exists roster_all on roster_assignments;

create policy cafe_hours_all on cafe_hours for all to anon, authenticated using (true) with check (true);
create policy roster_all on roster_assignments for all to anon, authenticated using (true) with check (true);

grant select, insert, update, delete on table cafe_hours to anon, authenticated;
grant select, insert, update, delete on table roster_assignments to anon, authenticated;

-- Default U Coffee hours
-- Mon closed | Tue–Fri 06:00–12:00 | Sat–Sun 12:00–13:00
insert into cafe_hours (day_of_week, is_closed, open_time, close_time) values
  (0, false, '12:00', '13:00'), -- Sunday
  (1, true, null, null),        -- Monday closed
  (2, false, '06:00', '12:00'), -- Tuesday
  (3, false, '06:00', '12:00'), -- Wednesday
  (4, false, '06:00', '12:00'), -- Thursday
  (5, false, '06:00', '12:00'), -- Friday
  (6, false, '12:00', '13:00')  -- Saturday
on conflict (day_of_week) do update set
  is_closed = excluded.is_closed,
  open_time = excluded.open_time,
  close_time = excluded.close_time;
