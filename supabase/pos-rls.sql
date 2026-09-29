-- POS RLS for publishable / anon key (run after pos-schema.sql)

grant select, insert, update, delete on table pos_categories to anon, authenticated;
grant select, insert, update, delete on table pos_products to anon, authenticated;
grant select, insert, update, delete on table pos_modifier_groups to anon, authenticated;
grant select, insert, update, delete on table pos_modifiers to anon, authenticated;
grant select, insert, update, delete on table pos_settings to anon, authenticated;
grant select, insert, update, delete on table pos_tables to anon, authenticated;
grant select, insert, update, delete on table pos_orders to anon, authenticated;
grant select, insert, update, delete on table pos_order_items to anon, authenticated;
grant select, insert, update, delete on table pos_payments to anon, authenticated;
grant select, insert, update, delete on table pos_receipts to anon, authenticated;
grant select, insert, update, delete on table pos_inventory_items to anon, authenticated;
grant select, insert, update, delete on table pos_product_ingredients to anon, authenticated;
grant select, insert, update, delete on table pos_stock_movements to anon, authenticated;
grant select, insert, update, delete on table pos_integration_logs to anon, authenticated;

alter table pos_categories enable row level security;
alter table pos_products enable row level security;
alter table pos_modifier_groups enable row level security;
alter table pos_modifiers enable row level security;
alter table pos_settings enable row level security;
alter table pos_tables enable row level security;
alter table pos_orders enable row level security;
alter table pos_order_items enable row level security;
alter table pos_payments enable row level security;
alter table pos_receipts enable row level security;
alter table pos_inventory_items enable row level security;
alter table pos_product_ingredients enable row level security;
alter table pos_stock_movements enable row level security;
alter table pos_integration_logs enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array[
    'pos_categories','pos_products','pos_modifier_groups','pos_modifiers',
    'pos_settings','pos_tables','pos_orders','pos_order_items','pos_payments',
    'pos_receipts','pos_inventory_items','pos_product_ingredients',
    'pos_stock_movements','pos_integration_logs'
  ]
  loop
    execute format('drop policy if exists %I_all on %I', t, t);
    execute format(
      'create policy %I_all on %I for all to anon, authenticated using (true) with check (true)',
      t, t
    );
  end loop;
end $$;
