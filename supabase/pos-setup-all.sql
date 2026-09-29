-- U Coffee POS full setup: pos-schema.sql + pos-rls.sql + pos-seed-demo.sql
-- Paste this whole file into Supabase SQL Editor and click Run. Safe to re-run.

-- U Coffee POS / Ordering System
-- Run in Supabase SQL Editor after schema.sql (and schedule migrations if needed)

-- Categories
create table if not exists pos_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Products
create table if not exists pos_products (
  id uuid primary key default gen_random_uuid(),
  category_id uuid references pos_categories(id) on delete set null,
  name text not null,
  sku text,
  description text,
  base_price numeric(12,2) not null default 0 check (base_price >= 0),
  image_url text,
  active boolean not null default true,
  track_inventory boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists pos_products_category_idx on pos_products(category_id);
create index if not exists pos_products_active_idx on pos_products(active);

-- Modifier groups (e.g. Size, Temperature, Sugar, Milk)
create table if not exists pos_modifier_groups (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references pos_products(id) on delete cascade,
  name text not null,
  required boolean not null default false,
  min_select int not null default 0,
  max_select int not null default 1,
  sort_order int not null default 0
);

create index if not exists pos_modifier_groups_product_idx on pos_modifier_groups(product_id);

create table if not exists pos_modifiers (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references pos_modifier_groups(id) on delete cascade,
  name text not null,
  price_delta numeric(12,2) not null default 0,
  active boolean not null default true,
  sort_order int not null default 0
);

create index if not exists pos_modifiers_group_idx on pos_modifiers(group_id);

-- Cafe / hardware settings (single-row config)
create table if not exists pos_settings (
  id int primary key default 1 check (id = 1),
  cafe_name text not null default 'U Coffee',
  address text default 'Persiaran Panglima Hitam, Setia Alam Impian, Shah Alam',
  phone text,
  currency text not null default 'MYR',
  tax_rate numeric(6,4) not null default 0,
  service_charge_rate numeric(6,4) not null default 0,
  receipt_footer text default 'Thank you for visiting U Coffee!',
  receipt_width_mm int not null default 80,
  order_prefix text not null default 'UC',
  next_order_seq int not null default 1,
  hardware_provider text not null default 'mock',
  printer_connection text default 'usb',
  printer_host text,
  printer_port int,
  cash_drawer_enabled boolean not null default true,
  payment_methods jsonb not null default '["cash","card","ewallet","other"]'::jsonb,
  feedback_qr_url text,
  logo_url text,
  updated_at timestamptz not null default now()
);

insert into pos_settings (id) values (1)
on conflict (id) do nothing;

-- Dining tables (optional)
create table if not exists pos_tables (
  id uuid primary key default gen_random_uuid(),
  label text not null unique,
  capacity int,
  active boolean not null default true
);

-- Orders
create table if not exists pos_orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique,
  status text not null default 'draft'
    check (status in (
      'draft','pending_payment','paid','preparing','ready','completed','cancelled'
    )),
  order_type text not null default 'dine_in'
    check (order_type in ('dine_in','takeaway','delivery')),
  table_label text,
  cashier_id uuid references staff(id) on delete set null,
  cashier_name text,
  notes text,
  subtotal numeric(12,2) not null default 0,
  discount numeric(12,2) not null default 0,
  tax_amount numeric(12,2) not null default 0,
  service_charge numeric(12,2) not null default 0,
  rounding numeric(12,2) not null default 0,
  grand_total numeric(12,2) not null default 0,
  paid_at timestamptz,
  cancelled_at timestamptz,
  cancel_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists pos_orders_status_idx on pos_orders(status);
create index if not exists pos_orders_created_idx on pos_orders(created_at desc);
create index if not exists pos_orders_number_idx on pos_orders(order_number);

create table if not exists pos_order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references pos_orders(id) on delete cascade,
  product_id uuid references pos_products(id) on delete set null,
  product_name text not null,
  sku text,
  quantity int not null default 1 check (quantity > 0),
  unit_price numeric(12,2) not null,
  line_total numeric(12,2) not null,
  modifiers jsonb not null default '[]'::jsonb,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists pos_order_items_order_idx on pos_order_items(order_id);

create table if not exists pos_payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references pos_orders(id) on delete cascade,
  method text not null,
  amount numeric(12,2) not null,
  amount_received numeric(12,2),
  change_due numeric(12,2) default 0,
  reference text,
  status text not null default 'completed'
    check (status in ('completed','refunded','failed')),
  created_at timestamptz not null default now()
);

create index if not exists pos_payments_order_idx on pos_payments(order_id);

create table if not exists pos_receipts (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references pos_orders(id) on delete cascade,
  receipt_number text not null unique,
  print_status text not null default 'pending'
    check (print_status in ('pending','printed','failed','retried')),
  print_attempts int not null default 0,
  last_error text,
  payload jsonb,
  created_at timestamptz not null default now(),
  printed_at timestamptz
);

create index if not exists pos_receipts_order_idx on pos_receipts(order_id);

-- Inventory
create table if not exists pos_inventory_items (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  unit text not null default 'pcs',
  quantity numeric(14,3) not null default 0,
  min_threshold numeric(14,3) not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists pos_product_ingredients (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references pos_products(id) on delete cascade,
  inventory_item_id uuid not null references pos_inventory_items(id) on delete cascade,
  quantity_per_unit numeric(14,3) not null default 1,
  unique (product_id, inventory_item_id)
);

create table if not exists pos_stock_movements (
  id uuid primary key default gen_random_uuid(),
  inventory_item_id uuid not null references pos_inventory_items(id) on delete cascade,
  type text not null check (type in ('in','out','adjust','order')),
  quantity numeric(14,3) not null,
  note text,
  order_id uuid references pos_orders(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists pos_stock_movements_item_idx on pos_stock_movements(inventory_item_id);

-- Hardware / integration logs
create table if not exists pos_integration_logs (
  id uuid primary key default gen_random_uuid(),
  action text not null,
  provider text not null,
  order_id uuid references pos_orders(id) on delete set null,
  success boolean not null default false,
  message text,
  meta jsonb,
  created_at timestamptz not null default now()
);

create index if not exists pos_integration_logs_created_idx on pos_integration_logs(created_at desc);

-- Seed categories
insert into pos_categories (name, sort_order) values
  ('Coffee', 1),
  ('Non-Coffee', 2),
  ('Tea', 3),
  ('Food', 4),
  ('Desserts', 5),
  ('Add-ons', 6),
  ('Other', 7)
on conflict (name) do nothing;

-- Seed sample products (idempotent by SKU)
do $$
declare
  coffee_id uuid;
  non_id uuid;
  tea_id uuid;
  food_id uuid;
  dessert_id uuid;
  addon_id uuid;
  latte_id uuid;
  americano_id uuid;
  matcha_id uuid;
  croissant_id uuid;
  grp uuid;
begin
  select id into coffee_id from pos_categories where name = 'Coffee';
  select id into non_id from pos_categories where name = 'Non-Coffee';
  select id into tea_id from pos_categories where name = 'Tea';
  select id into food_id from pos_categories where name = 'Food';
  select id into dessert_id from pos_categories where name = 'Desserts';
  select id into addon_id from pos_categories where name = 'Add-ons';

  if not exists (select 1 from pos_products where sku = 'CF-LATTE') then
    insert into pos_products (category_id, name, sku, description, base_price, image_url)
    values (coffee_id, 'Latte', 'CF-LATTE', 'Espresso with steamed milk', 12.00,
      'https://images.unsplash.com/photo-1561882468-9110e03e0f78?w=400&q=80')
    returning id into latte_id;

    insert into pos_modifier_groups (product_id, name, required, min_select, max_select, sort_order)
    values (latte_id, 'Temperature', true, 1, 1, 1) returning id into grp;
    insert into pos_modifiers (group_id, name, price_delta, sort_order) values
      (grp, 'Hot', 0, 1), (grp, 'Iced', 0, 2);

    insert into pos_modifier_groups (product_id, name, required, min_select, max_select, sort_order)
    values (latte_id, 'Size', true, 1, 1, 2) returning id into grp;
    insert into pos_modifiers (group_id, name, price_delta, sort_order) values
      (grp, 'Small', 0, 1), (grp, 'Regular', 1.50, 2), (grp, 'Large', 3.00, 3);

    insert into pos_modifier_groups (product_id, name, required, min_select, max_select, sort_order)
    values (latte_id, 'Sugar', true, 1, 1, 3) returning id into grp;
    insert into pos_modifiers (group_id, name, price_delta, sort_order) values
      (grp, 'No sugar', 0, 1), (grp, 'Less sugar', 0, 2),
      (grp, 'Normal', 0, 3), (grp, 'Extra sugar', 0, 4);

    insert into pos_modifier_groups (product_id, name, required, min_select, max_select, sort_order)
    values (latte_id, 'Milk', false, 0, 1, 4) returning id into grp;
    insert into pos_modifiers (group_id, name, price_delta, sort_order) values
      (grp, 'Oat milk', 2.00, 1), (grp, 'Soy milk', 1.50, 2), (grp, 'Almond milk', 2.00, 3);

    insert into pos_modifier_groups (product_id, name, required, min_select, max_select, sort_order)
    values (latte_id, 'Extras', false, 0, 3, 5) returning id into grp;
    insert into pos_modifiers (group_id, name, price_delta, sort_order) values
      (grp, 'Extra shot', 2.50, 1), (grp, 'Vanilla syrup', 1.50, 2), (grp, 'Caramel syrup', 1.50, 3);
  end if;

  if not exists (select 1 from pos_products where sku = 'CF-AMER') then
    insert into pos_products (category_id, name, sku, description, base_price, image_url)
    values (coffee_id, 'Americano', 'CF-AMER', 'Espresso diluted with hot water', 9.00,
      'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?w=400&q=80')
    returning id into americano_id;

    insert into pos_modifier_groups (product_id, name, required, min_select, max_select, sort_order)
    values (americano_id, 'Temperature', true, 1, 1, 1) returning id into grp;
    insert into pos_modifiers (group_id, name, price_delta, sort_order) values
      (grp, 'Hot', 0, 1), (grp, 'Iced', 0, 2);

    insert into pos_modifier_groups (product_id, name, required, min_select, max_select, sort_order)
    values (americano_id, 'Size', true, 1, 1, 2) returning id into grp;
    insert into pos_modifiers (group_id, name, price_delta, sort_order) values
      (grp, 'Regular', 0, 1), (grp, 'Large', 2.00, 2);
  end if;

  if not exists (select 1 from pos_products where sku = 'CF-CAP') then
    insert into pos_products (category_id, name, sku, description, base_price, image_url)
    values (coffee_id, 'Cappuccino', 'CF-CAP', 'Espresso, steamed milk, foam', 11.00,
      'https://images.unsplash.com/photo-1572442388796-11668a67e53d?w=400&q=80');
  end if;

  if not exists (select 1 from pos_products where sku = 'NC-MATCHA') then
    insert into pos_products (category_id, name, sku, description, base_price, image_url)
    values (non_id, 'Matcha Latte', 'NC-MATCHA', 'Ceremonial matcha with milk', 13.00,
      'https://images.unsplash.com/photo-1536256263959-770b48d82b0a?w=400&q=80')
    returning id into matcha_id;

    insert into pos_modifier_groups (product_id, name, required, min_select, max_select, sort_order)
    values (matcha_id, 'Temperature', true, 1, 1, 1) returning id into grp;
    insert into pos_modifiers (group_id, name, price_delta, sort_order) values
      (grp, 'Hot', 0, 1), (grp, 'Iced', 0, 2);

    insert into pos_modifier_groups (product_id, name, required, min_select, max_select, sort_order)
    values (matcha_id, 'Size', true, 1, 1, 2) returning id into grp;
    insert into pos_modifiers (group_id, name, price_delta, sort_order) values
      (grp, 'Regular', 0, 1), (grp, 'Large', 2.50, 2);
  end if;

  if not exists (select 1 from pos_products where sku = 'TE-ENGLISH') then
    insert into pos_products (category_id, name, sku, description, base_price, image_url)
    values (tea_id, 'English Breakfast', 'TE-ENGLISH', 'Classic black tea', 8.00,
      'https://images.unsplash.com/photo-1594631252845-29fc4cc8cde9?w=400&q=80');
  end if;

  if not exists (select 1 from pos_products where sku = 'FD-CROIS') then
    insert into pos_products (category_id, name, sku, description, base_price, image_url)
    values (food_id, 'Butter Croissant', 'FD-CROIS', 'Flaky French pastry', 7.50,
      'https://images.unsplash.com/photo-1555507036-ab1f4038808a?w=400&q=80')
    returning id into croissant_id;
  end if;

  if not exists (select 1 from pos_products where sku = 'DS-TIRAM') then
    insert into pos_products (category_id, name, sku, description, base_price, image_url)
    values (dessert_id, 'Tiramisu', 'DS-TIRAM', 'Coffee-soaked layered dessert', 14.00,
      'https://images.unsplash.com/photo-1571877227200-a0d98ea607e9?w=400&q=80');
  end if;

  if not exists (select 1 from pos_products where sku = 'AO-SHOT') then
    insert into pos_products (category_id, name, sku, description, base_price, image_url)
    values (addon_id, 'Extra Espresso Shot', 'AO-SHOT', 'Add a shot to any drink', 2.50, null);
  end if;
end $$;

-- Sample inventory
insert into pos_inventory_items (name, unit, quantity, min_threshold) values
  ('Coffee beans', 'g', 5000, 500),
  ('Whole milk', 'ml', 10000, 1000),
  ('Oat milk', 'ml', 3000, 500),
  ('Matcha powder', 'g', 800, 100),
  ('Croissant', 'pcs', 24, 5)
on conflict (name) do nothing;

insert into pos_tables (label, capacity) values
  ('T1', 2), ('T2', 2), ('T3', 4), ('T4', 4), ('T5', 6)
on conflict (label) do nothing;

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
