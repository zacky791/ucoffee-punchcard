-- Make roster week-specific
alter table roster_assignments
  add column if not exists week_start date;

-- Default existing rows to this week's Monday (ISO)
update roster_assignments
set week_start = (date_trunc('week', current_date)::date)
where week_start is null;

alter table roster_assignments
  alter column week_start set not null;

alter table roster_assignments
  drop constraint if exists roster_assignments_day_of_week_staff_id_key;

alter table roster_assignments
  drop constraint if exists roster_assignments_week_day_staff_key;

alter table roster_assignments
  add constraint roster_assignments_week_day_staff_key
  unique (week_start, day_of_week, staff_id);

create index if not exists roster_week_idx on roster_assignments(week_start);
