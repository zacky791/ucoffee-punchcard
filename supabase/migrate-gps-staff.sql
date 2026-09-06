-- GPS fields + real U Coffee roster
-- Safe to re-run

alter table punches
  add column if not exists latitude double precision,
  add column if not exists longitude double precision,
  add column if not exists accuracy double precision,
  add column if not exists location_label text;

-- Soft-deactivate old sample staff, then insert the real team
update staff set active = false where active = true;

insert into staff (name, pin, role, active) values
  ('Haziq', '0000', 'head_chef', true),
  ('Arash Abdullah', '0000', 'assistant_chef', true),
  ('Hazim', '0000', 'assistant_chef', true),
  ('Nadhirah', '0000', 'assistant_chef', true),
  ('Faqih', '0000', 'barista', true),
  ('Zakaria', '0000', 'barista', true);
