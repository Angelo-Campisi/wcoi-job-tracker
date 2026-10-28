-- Hours entry (spec 6.3).
--
-- 1. Hours can only be entered for someone on the job's crew, and a crew member
--    who has hours on the job can't be removed (remove their hours first).
-- 2. Only active employees can be added to a crew.
-- 3. employee_hours_between: each employee's hours per day across ALL jobs for a
--    date range, for the daily flag and weekly totals. Hours only, never wages or
--    which job, so leads can use it for crew who also worked another lead's job.

create function private.time_entry_crew_check() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (
    select 1 from public.job_crew c
    where c.work_order_id = new.work_order_id and c.employee_id = new.employee_id
  ) then
    raise exception 'Add this person to the crew before entering their hours'
      using errcode = '23503';
  end if;
  return new;
end $$;

create trigger time_entry_crew_check
  before insert or update of work_order_id, employee_id on public.time_entries
  for each row execute function private.time_entry_crew_check();

create function private.job_crew_rules() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if not exists (select 1 from public.employees e where e.id = new.employee_id and e.active) then
      raise exception 'Only active employees can be added to a crew' using errcode = '23514';
    end if;
    return new;
  end if;
  if exists (
    select 1 from public.time_entries t
    where t.work_order_id = old.work_order_id and t.employee_id = old.employee_id
  ) then
    raise exception 'This person has hours on this job. Remove their hours first.'
      using errcode = '23503';
  end if;
  return old;
end $$;

create trigger job_crew_rules before insert or delete on public.job_crew
  for each row execute function private.job_crew_rules();

create function public.employee_hours_between(p_employee_ids uuid[], p_from date, p_to date)
returns table (employee_id uuid, work_date date, hours numeric)
language plpgsql stable security definer set search_path = '' as $$
begin
  if private.current_app_user_id() is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  if p_to < p_from or p_to - p_from > 62 then
    raise exception 'Date range must be 0 to 62 days' using errcode = '22023';
  end if;
  return query
    select t.employee_id, t.work_date, sum(t.hours)
    from public.time_entries t
    where t.employee_id = any (p_employee_ids) and t.work_date between p_from and p_to
    group by t.employee_id, t.work_date;
end $$;

revoke all on function public.employee_hours_between(uuid[], date, date) from public, anon;
grant execute on function public.employee_hours_between(uuid[], date, date) to authenticated, service_role;
