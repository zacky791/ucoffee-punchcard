-- Run this in Supabase SQL Editor after schema.sql
-- Needed when using the publishable / anon key (not the secret service_role key)

-- Allow the API key to use tables + status view
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on table staff to anon, authenticated;
grant select, insert, update, delete on table punches to anon, authenticated;
grant select on staff_status to anon, authenticated;

-- Policies for publishable key access (PIN is still checked in the Node API)
alter table staff enable row level security;
alter table punches enable row level security;

drop policy if exists staff_select on staff;
drop policy if exists staff_insert on staff;
drop policy if exists staff_update on staff;
drop policy if exists staff_delete on staff;
drop policy if exists punches_select on punches;
drop policy if exists punches_insert on punches;
drop policy if exists punches_update on punches;
drop policy if exists punches_delete on punches;

create policy staff_select on staff for select to anon, authenticated using (true);
create policy staff_insert on staff for insert to anon, authenticated with check (true);
create policy staff_update on staff for update to anon, authenticated using (true) with check (true);
create policy staff_delete on staff for delete to anon, authenticated using (true);

create policy punches_select on punches for select to anon, authenticated using (true);
create policy punches_insert on punches for insert to anon, authenticated with check (true);
create policy punches_update on punches for update to anon, authenticated using (true) with check (true);
create policy punches_delete on punches for delete to anon, authenticated using (true);
