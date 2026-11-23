-- Station + image + aliases for inventory (needed on Netlify; JSON sidecar is not reliable there)
alter table pos_inventory_items
  add column if not exists use_per_serving numeric(14,3) not null default 0;

alter table pos_inventory_items
  add column if not exists serving_note text;

alter table pos_inventory_items
  add column if not exists station text not null default 'barista';

alter table pos_inventory_items
  add column if not exists image_url text;

alter table pos_inventory_items
  add column if not exists aliases text;

-- Keep stations in a small known set
do $$
begin
  update pos_inventory_items
  set station = 'barista'
  where station is null
     or station not in ('barista', 'kitchen', 'bakery');
end $$;
