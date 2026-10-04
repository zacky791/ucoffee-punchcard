-- U Coffee POS: "How did you hear about us?" answers collected after each payment
-- Run once in the Supabase SQL Editor (safe to re-run).

create table if not exists pos_survey_responses (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references pos_orders(id) on delete set null,
  source text not null,
  other_text text,
  created_at timestamptz not null default now()
);

alter table pos_survey_responses drop constraint if exists pos_survey_responses_source_check;
alter table pos_survey_responses add constraint pos_survey_responses_source_check
  check (source in ('banner', 'tiktok', 'instagram', 'friends', 'google', 'other'));

create index if not exists pos_survey_responses_created_idx on pos_survey_responses(created_at);

grant select, insert, update, delete on table pos_survey_responses to anon, authenticated;
alter table pos_survey_responses enable row level security;
drop policy if exists pos_survey_responses_all on pos_survey_responses;
create policy pos_survey_responses_all on pos_survey_responses
  for all to anon, authenticated using (true) with check (true);

notify pgrst, 'reload schema';
