-- Office setup screens (work orders, leads and crew, people, settings).
-- Most rules already exist; these close the gaps the screens would open.

-- 1. Line items set the budget, so they lock with the job once it's approved.
create trigger work_order_line_not_approved before insert or update or delete on public.work_order_lines
  for each row execute function private.work_order_not_approved_check();

-- 2. Only an open work order with no hours can be deleted (anything else is a record).
create function private.work_order_delete_check() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.status <> 'open' then
    raise exception 'Only an open work order can be deleted.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.time_entries t where t.work_order_id = old.id) then
    raise exception 'This work order has hours, so it can''t be deleted.' using errcode = 'P0001';
  end if;
  return old;
end $$;

create trigger work_order_delete_check before delete on public.work_orders
  for each row execute function private.work_order_delete_check();

-- 3. A job lead must be an active sign-in.
create function private.job_assignment_lead_check() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.app_users u where u.id = new.lead_user_id and u.active) then
    raise exception 'The lead must be someone with an active sign-in.' using errcode = '23514';
  end if;
  return new;
end $$;

create trigger job_assignment_lead_check before insert or update of lead_user_id on public.job_assignments
  for each row execute function private.job_assignment_lead_check();

-- 4. Never leave the company without an active owner (that would lock everyone
--    out of owner-only steps like approving large change orders).
create function private.keep_an_owner() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.app_users u where u.role = 'owner' and u.active) then
    raise exception 'There must always be at least one active owner.' using errcode = '23514';
  end if;
  return null;
end $$;

create constraint trigger keep_an_owner after update or delete on public.app_users
  deferrable initially immediate
  for each row execute function private.keep_an_owner();

-- 5. Turning off an employee turns off their sign-in too, so nobody can sign in
--    as someone who no longer works here.
create function private.employee_deactivate_sign_in() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.active and not new.active then
    -- Only the owner can turn off an owner (same rule as for sign-ins).
    if exists (select 1 from public.app_users u where u.employee_id = new.id and u.role = 'owner')
       and private.current_app_user_id() is not null and not private.is_owner() then
      raise exception 'Only the owner can turn off an owner.' using errcode = '42501';
    end if;
    update public.app_users set active = false where employee_id = new.id and active;
  end if;
  return new;
end $$;

create trigger employee_deactivate_sign_in after update of active on public.employees
  for each row execute function private.employee_deactivate_sign_in();

-- 6. Replace a work order's line items in one step (all or nothing), as the
--    signed-in person, so the usual rules apply (office only; locked once approved).
create function public.replace_work_order_lines(p_work_order_id uuid, p_lines jsonb) returns void
language plpgsql security invoker set search_path = '' as $$
begin
  delete from public.work_order_lines where work_order_id = p_work_order_id;
  insert into public.work_order_lines (work_order_id, line_number, description, quantity, is_labor)
  select p_work_order_id,
         (l ->> 'line_number')::integer,
         l ->> 'description',
         (l ->> 'quantity')::numeric,
         (l ->> 'is_labor')::boolean
  from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) as l;
end $$;

revoke all on function public.replace_work_order_lines(uuid, jsonb) from public, anon;
grant execute on function public.replace_work_order_lines(uuid, jsonb) to authenticated, service_role;
