-- U Coffee POS: overheads (rent, electricity, water, internet, ...)
-- Run once in the Supabase SQL Editor (safe to re-run).
--
-- kind:
--   recurring  same amount every month from start_date's month until end_date's month (null = ongoing)
--   month      bill for one month (start_date = any day in that month), e.g. electricity
--   one_off    single cost on start_date, e.g. repair

create table if not exists pos_expenses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null default 'other'
    check (category in ('rent','electricity','water','internet','gas','maintenance','marketing','other')),
  kind text not null default 'recurring' check (kind in ('recurring','month','one_off')),
  amount numeric(12,2) not null check (amount >= 0),
  start_date date not null default current_date,
  end_date date,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists pos_expenses_start_idx on pos_expenses(start_date);

grant select, insert, update, delete on table pos_expenses to anon, authenticated;
alter table pos_expenses enable row level security;
drop policy if exists pos_expenses_all on pos_expenses;
create policy pos_expenses_all on pos_expenses
  for all to anon, authenticated using (true) with check (true);

notify pgrst, 'reload schema';
