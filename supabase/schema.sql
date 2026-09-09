-- U Coffee Punch Card System
-- Run this in Supabase SQL Editor (Dashboard → SQL → New query)

create table if not exists staff (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  pin text not null default '0000' check (char_length(pin) = 4),
  role text not null default 'barista',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

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

insert into staff (name, pin, role) values
  ('Haziq', '0000', 'head_chef'),
  ('Arash Abdullah', '0000', 'manager'),
  ('Azim', '0000', 'assistant_manager'),
  ('Nadhirah', '0000', 'assistant_chef'),
  ('Faqih', '0000', 'barista'),
  ('Zakaria', '0000', 'barista');

alter table staff enable row level security;
alter table punches enable row level security;

-- If you use the publishable/anon key, also run rls-publishable.sql
