-- U Coffee POS demo data: one product with an image + one paid order today.
-- Run in Supabase SQL Editor after pos-schema.sql and pos-rls.sql. Safe to re-run.

do $$
declare
  coffee_id uuid;
  product_id uuid;
  order_id uuid;
  grp uuid;
begin
  select id into coffee_id from pos_categories where name = 'Coffee';

  select id into product_id from pos_products where sku = 'CF-SPANISH';
  if product_id is null then
    insert into pos_products (category_id, name, sku, description, base_price, image_url, sort_order)
    values (
      coffee_id,
      'Spanish Latte',
      'CF-SPANISH',
      'Espresso with condensed milk and fresh milk',
      14.00,
      'https://images.unsplash.com/photo-1541167760496-1628856ab772?w=400&q=80',
      0
    )
    returning id into product_id;

    insert into pos_modifier_groups (product_id, name, required, min_select, max_select, sort_order)
    values (product_id, 'Temperature', true, 1, 1, 1) returning id into grp;
    insert into pos_modifiers (group_id, name, price_delta, sort_order) values
      (grp, 'Hot', 0, 1), (grp, 'Iced', 1.00, 2);
  end if;

  if not exists (select 1 from pos_orders where order_number = 'UC-DEMO-0001') then
    insert into pos_orders (
      order_number, status, order_type, cashier_name, notes,
      subtotal, grand_total, paid_at, created_at, updated_at
    )
    values (
      'UC-DEMO-0001', 'paid', 'takeaway', 'Demo Cashier', 'Demo order',
      30.00, 30.00, now(), now(), now()
    )
    returning id into order_id;

    insert into pos_order_items (
      order_id, product_id, product_name, sku, quantity, unit_price, line_total, modifiers
    )
    values (
      order_id, product_id, 'Spanish Latte', 'CF-SPANISH', 2, 15.00, 30.00,
      '[{"group":"Temperature","name":"Iced","price_delta":1}]'::jsonb
    );

    insert into pos_payments (order_id, method, amount, amount_received, change_due)
    values (order_id, 'cash', 30.00, 50.00, 20.00);

    insert into pos_receipts (order_id, receipt_number, print_status, printed_at)
    values (order_id, 'R-UC-DEMO-0001', 'printed', now());
  end if;
end $$;

notify pgrst, 'reload schema';
