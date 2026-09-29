-- U Coffee POS: costing + profit margin
-- Run once in the Supabase SQL Editor (safe to re-run).

-- What you pay for one pack of an ingredient, e.g. RM 60 for a 1000 g bag of beans.
alter table pos_inventory_items
  add column if not exists pack_price numeric(12,2) not null default 0 check (pack_price >= 0);
alter table pos_inventory_items
  add column if not exists pack_size numeric(14,3) not null default 1 check (pack_size > 0);

-- Per-product cost not tracked as stock (cup, lid, straw, packaging, gas...).
alter table pos_products
  add column if not exists extra_cost numeric(12,2) not null default 0 check (extra_cost >= 0);

-- Cost of one unit at the time of sale, so past profit doesn't change when prices change.
alter table pos_order_items
  add column if not exists unit_cost numeric(12,4);

create index if not exists pos_stock_movements_order_idx on pos_stock_movements(order_id);

notify pgrst, 'reload schema';
