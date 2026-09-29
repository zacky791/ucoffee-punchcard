-- U Coffee POS: recipe tab (drink / food + preparation steps)
-- Run once in the Supabase SQL Editor (safe to re-run).

alter table pos_categories
  add column if not exists kind text not null default 'food' check (kind in ('drink', 'food'));

update pos_categories
set kind = 'drink'
where kind = 'food'
  and name ~* '(coffee|matcha|tea|drink|juice|smoothie|latte|beverage|soda)';

alter table pos_products
  add column if not exists recipe_notes text;

notify pgrst, 'reload schema';
