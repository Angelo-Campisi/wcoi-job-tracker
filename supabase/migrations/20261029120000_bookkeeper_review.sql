-- Bookkeeper review (spec 6.5, 6.6).
--
-- After turn-in, the bookkeeper (or owner) reviews the hours and approves the job.
-- Nothing goes to QuickBooks until a job is approved (Phase 4 sends approved jobs).
-- Once approved, the hours and change orders are locked for everyone, so what gets
-- sent always matches what was approved. To change anything, undo the approval first.
--
-- The office can also reopen a turned-in job so the lead can fix it; that clears the
-- turn-in and the signature, and the lead turns it in again.

-- Approve: turned in -> approved. Not while a large change order is still waiting
-- for the owner, or while any hours entry is flagged for review (sync conflicts, Phase 3).
create function public.approve_work_order(p_work_order_id uuid) returns public.work_orders
language plpgsql security definer set search_path = '' as $$
declare
  v_row public.work_orders;
begin
  if not private.is_staff() then
    raise exception 'Only the bookkeeper or owner can approve' using errcode = '42501';
  end if;
  if exists (select 1 from public.change_orders c
             where c.work_order_id = p_work_order_id and c.status = 'pending') then
    raise exception 'A change order is still waiting for the owner. Approve or deny it first.'
      using errcode = 'P0001';
  end if;
  if exists (select 1 from public.time_entries t
             where t.work_order_id = p_work_order_id and t.needs_review) then
    raise exception 'Some hours are flagged for review. Check them first.' using errcode = 'P0001';
  end if;
  update public.work_orders
     set status = 'approved', approved_at = now(), approved_by = private.current_app_user_id()
   where id = p_work_order_id and status = 'turned_in'
  returning * into v_row;
  if not found then
    raise exception 'Only a turned-in job can be approved.' using errcode = 'P0001';
  end if;
  return v_row;
end $$;

-- Undo approval: approved -> turned in (not once it has been sent to QuickBooks).
create function public.unapprove_work_order(p_work_order_id uuid) returns public.work_orders
language plpgsql security definer set search_path = '' as $$
declare
  v_row public.work_orders;
begin
  if not private.is_staff() then
    raise exception 'Only the bookkeeper or owner can undo an approval' using errcode = '42501';
  end if;
  update public.work_orders
     set status = 'turned_in', approved_at = null, approved_by = null
   where id = p_work_order_id and status = 'approved'
  returning * into v_row;
  if not found then
    raise exception 'Only an approved job that hasn''t been sent can be changed back.' using errcode = 'P0001';
  end if;
  return v_row;
end $$;

-- Reopen: turned in -> open, so the lead can fix hours and turn it in again.
-- The old signature no longer covers the job, so it is removed.
create function public.reopen_work_order(p_work_order_id uuid) returns public.work_orders
language plpgsql security definer set search_path = '' as $$
declare
  v_row public.work_orders;
begin
  if not private.is_staff() then
    raise exception 'Only the bookkeeper or owner can reopen a job' using errcode = '42501';
  end if;
  update public.work_orders
     set status = 'open', turned_in_at = null, turned_in_by = null,
         customer_signed_name = null, turn_in_note = null
   where id = p_work_order_id and status = 'turned_in'
  returning * into v_row;
  if not found then
    raise exception 'Only a turned-in job can be reopened. Undo the approval first.' using errcode = 'P0001';
  end if;
  delete from public.work_order_signatures where work_order_id = p_work_order_id;
  return v_row;
end $$;

revoke all on function public.approve_work_order(uuid) from public, anon;
revoke all on function public.unapprove_work_order(uuid) from public, anon;
revoke all on function public.reopen_work_order(uuid) from public, anon;
grant execute on function public.approve_work_order(uuid) to authenticated, service_role;
grant execute on function public.unapprove_work_order(uuid) to authenticated, service_role;
grant execute on function public.reopen_work_order(uuid) to authenticated, service_role;

-- Approved or sent jobs: hours and change orders are locked for everyone.
create function private.work_order_not_approved_check() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_ids uuid[];
begin
  v_ids := case tg_op
    when 'INSERT' then array[new.work_order_id]
    when 'DELETE' then array[old.work_order_id]
    else array[old.work_order_id, new.work_order_id]
  end;
  if exists (select 1 from public.work_orders w where w.id = any (v_ids) and w.status in ('approved', 'sent')) then
    raise exception 'This job has been approved, so it is locked. Undo the approval to change it.'
      using errcode = 'P0001';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;

create trigger time_entry_not_approved before insert or update or delete on public.time_entries
  for each row execute function private.work_order_not_approved_check();
create trigger change_order_not_approved before insert or update or delete on public.change_orders
  for each row execute function private.work_order_not_approved_check();
