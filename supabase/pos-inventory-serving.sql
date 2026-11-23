-- Per-serving usage for inventory items (recipe / cost estimates)
alter table pos_inventory_items
  add column if not exists use_per_serving numeric(14,3) not null default 0;

alter table pos_inventory_items
  add column if not exists serving_note text;
