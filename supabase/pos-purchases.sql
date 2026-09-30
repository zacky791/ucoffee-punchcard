-- U Coffee POS: daily expenses (what was bought today, e.g. restock)
-- Run once in the Supabase SQL Editor (safe to re-run).
--
-- A purchase linked to an inventory item adds `quantity` to that item's stock;
-- stock_movement_id points at the 'in' movement so deleting the purchase can undo it.

create table if not exists pos_purchases (
  id uuid primary key default gen_random_uuid(),
  purchase_date date not null default current_date,
  name text not null,
  inventory_item_id uuid references pos_inventory_items(id) on delete set null,
  quantity numeric(14,3),
  amount numeric(12,2) not null check (amount >= 0),
  note text,
  stock_movement_id uuid references pos_stock_movements(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists pos_purchases_date_idx on pos_purchases(purchase_date);

grant select, insert, update, delete on table pos_purchases to anon, authenticated;
alter table pos_purchases enable row level security;
drop policy if exists pos_purchases_all on pos_purchases;
create policy pos_purchases_all on pos_purchases
  for all to anon, authenticated using (true) with check (true);

notify pgrst, 'reload schema';
