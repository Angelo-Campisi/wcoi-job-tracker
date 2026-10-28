-- WCOI Job Tracker: core database (Phase 1).
--
-- Records from spec section 5, with permissions enforced in the database
-- (spec sections 4 and 10). Every table has row-level security (RLS) turned on,
-- so the app can only see and change what the signed-in person is allowed to.
--
-- Who is who:
--   auth.users      Supabase's own login records (one per person who signs in).
--   app_users       Links a login to an employee and a role (lead, bookkeeper, owner).
--   "staff"         Bookkeeper or owner.
--
-- Leads never see wages (employee_wages is staff-only) and only see work orders
-- they are assigned to. Edits to hours, approvals, wages and users are written
-- to audit_log automatically.

create extension if not exists pgcrypto with schema extensions;

-- Helper functions live in a private schema that the public API does not expose.
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

------------------------------------------------------------------------------
-- Types
------------------------------------------------------------------------------

create type public.app_role as enum ('lead', 'bookkeeper', 'owner');
create type public.job_type as enum ('quoted', 'hourly');
create type public.work_order_status as enum ('open', 'turned_in', 'approved', 'sent');
create type public.change_order_type as enum ('quick', 'large');
create type public.change_order_status as enum ('pending', 'approved', 'denied');

------------------------------------------------------------------------------
-- People
------------------------------------------------------------------------------

create table public.employees (
  id uuid primary key default gen_random_uuid(),
  name text not null check (btrim(name) <> ''),
  active boolean not null default true,
  qbo_employee_id text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Effective-dated wages, so a raise never changes past labor cost (assumption 10).
-- Bookkeeper and owner only.
create table public.employee_wages (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees (id) on delete restrict,
  hourly_wage numeric(8, 2) not null check (hourly_wage > 0),
  effective_from date not null,
  created_at timestamptz not null default now(),
  unique (employee_id, effective_from)
);

create table public.app_users (
  id uuid primary key default gen_random_uuid(),
  -- Filled in the first time this person signs in (the sign-in screen creates the login).
  auth_user_id uuid unique references auth.users (id) on delete set null,
  employee_id uuid not null unique references public.employees (id) on delete restrict,
  role public.app_role not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Hashed PINs and lockout counters. No one can read this table through the API;
-- only the functions below touch it.
create table public.user_pins (
  user_id uuid primary key references public.app_users (id) on delete cascade,
  pin_hash text not null,
  failed_attempts integer not null default 0,
  locked_until timestamptz,
  updated_at timestamptz not null default now()
);

------------------------------------------------------------------------------
-- Settings (one row)
------------------------------------------------------------------------------

create table public.settings (
  id boolean primary key default true check (id),
  -- Soft warning when one employee's hours for a day go ABOVE this.
  daily_hours_threshold numeric(4, 1) not null default 8
    check (daily_hours_threshold > 0 and daily_hours_threshold <= 24),
  -- Change orders ABOVE this many hours are "large" and need the owner's approval.
  large_change_order_threshold_hours numeric(6, 1) not null default 4
    check (large_change_order_threshold_hours >= 0),
  reminder_percents integer[] not null default '{50,80}'
    check (cardinality(reminder_percents) between 1 and 5),
  -- Who gets budget reminders and alerts (decision 3). Empty = all bookkeepers and owners.
  reminder_recipient_user_ids uuid[] not null default '{}',
  -- Any Monday that starts a two-week pay period (decision 6).
  pay_period_anchor_monday date not null default '2026-01-05'
    check (extract(isodow from pay_period_anchor_monday) = 1),
  pin_max_attempts integer not null default 5 check (pin_max_attempts between 3 and 20),
  pin_lockout_minutes integer not null default 15 check (pin_lockout_minutes between 1 and 1440),
  inactivity_lock_minutes integer not null default 5 check (inactivity_lock_minutes between 1 and 120),
  updated_at timestamptz not null default now()
);

insert into public.settings default values;

------------------------------------------------------------------------------
-- Work orders
------------------------------------------------------------------------------

create table public.work_orders (
  id uuid primary key default gen_random_uuid(),
  qbo_id text unique,
  quote_number text not null default '',
  po_number text not null default '',
  order_date date not null,
  status public.work_order_status not null default 'open',
  -- Null = detect automatically from labor lines (decision 1).
  job_type_override public.job_type,
  bill_to_company text not null default '',
  bill_to_contact text not null default '',
  bill_to_phone text not null default '',
  ship_to_company text not null default '',
  ship_to_address text not null default '',
  ship_to_contact text not null default '',
  ship_to_phone text not null default '',
  -- Owner's special instructions (assumption 15).
  notes text not null default '',
  -- Budget reminder levels already sent, e.g. {50,80,over} (decision 4).
  reminder_levels_fired text[] not null default '{}',
  turned_in_at timestamptz,
  turned_in_by uuid references public.app_users (id),
  customer_signed_name text,
  -- Path to the signature image in file storage (Phase 2).
  customer_signature_path text,
  approved_at timestamptz,
  approved_by uuid references public.app_users (id),
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index work_orders_order_date_idx on public.work_orders (order_date);

-- For labor lines, quantity = budgeted hours. Non-labor lines are stored but not budgeted.
create table public.work_order_lines (
  id uuid primary key default gen_random_uuid(),
  work_order_id uuid not null references public.work_orders (id) on delete cascade,
  line_number integer not null,
  description text not null default '',
  quantity numeric(10, 2) not null default 0 check (quantity >= 0),
  is_labor boolean not null default false,
  qbo_line_id text,
  unique (work_order_id, line_number)
);

------------------------------------------------------------------------------
-- Job assignment (replaces the whiteboard)
------------------------------------------------------------------------------

create table public.job_assignments (
  id uuid primary key default gen_random_uuid(),
  work_order_id uuid not null references public.work_orders (id) on delete cascade,
  lead_user_id uuid not null references public.app_users (id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (work_order_id, lead_user_id)
);

create index job_assignments_lead_idx on public.job_assignments (lead_user_id);

create table public.job_assignment_dates (
  assignment_id uuid not null references public.job_assignments (id) on delete cascade,
  work_date date not null,
  primary key (assignment_id, work_date)
);

create index job_assignment_dates_date_idx on public.job_assignment_dates (work_date);

-- The crew on a job. Leads can add or remove employees on their own open jobs.
create table public.job_crew (
  work_order_id uuid not null references public.work_orders (id) on delete cascade,
  employee_id uuid not null references public.employees (id) on delete restrict,
  added_at timestamptz not null default now(),
  primary key (work_order_id, employee_id)
);

------------------------------------------------------------------------------
-- Hours
------------------------------------------------------------------------------

create table public.time_entries (
  -- Created on the tablet so offline entries keep the same id after sync (spec 8).
  id uuid primary key default gen_random_uuid(),
  work_order_id uuid not null references public.work_orders (id) on delete restrict,
  employee_id uuid not null references public.employees (id) on delete restrict,
  work_date date not null,
  -- More than 0, at most 24, in half-hour steps.
  hours numeric(3, 1) not null
    check (hours > 0 and hours <= 24 and hours * 2 = trunc(hours * 2)),
  entered_by uuid references public.app_users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.app_users (id),
  -- Goes up by one on every edit; the sync code uses it to spot conflicting edits.
  version integer not null default 1,
  -- Set when an offline edit conflicts with a later office edit (spec 8).
  needs_review boolean not null default false,
  review_note text,
  -- One entry per employee, per job, per day: prevents double-counting on sync.
  unique (work_order_id, employee_id, work_date)
);

create index time_entries_employee_day_idx on public.time_entries (employee_id, work_date);

------------------------------------------------------------------------------
-- Change orders
------------------------------------------------------------------------------

create table public.change_orders (
  id uuid primary key default gen_random_uuid(),
  work_order_id uuid not null references public.work_orders (id) on delete cascade,
  -- Type and status are set by the database from the threshold; see trigger below.
  type public.change_order_type not null default 'quick',
  hours_added numeric(6, 1) not null check (hours_added > 0),
  description text not null check (btrim(description) <> ''),
  requested_by uuid references public.app_users (id),
  requested_at timestamptz not null default now(),
  status public.change_order_status not null default 'pending',
  decided_by uuid references public.app_users (id),
  decided_at timestamptz
);

create index change_orders_work_order_idx on public.change_orders (work_order_id);

------------------------------------------------------------------------------
-- Audit log (who changed what, when, old and new value)
------------------------------------------------------------------------------

create table public.audit_log (
  id bigint generated always as identity primary key,
  table_name text not null,
  record_id text,
  action text not null,
  old_data jsonb,
  new_data jsonb,
  -- The app user who made the change; null when done by the system.
  changed_by uuid,
  changed_at timestamptz not null default now()
);

create index audit_log_record_idx on public.audit_log (table_name, record_id);

------------------------------------------------------------------------------
-- Who is signed in
------------------------------------------------------------------------------

create function private.current_app_user_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select u.id from public.app_users u where u.auth_user_id = auth.uid() and u.active
$$;

create function private.current_app_role() returns public.app_role
language sql stable security definer set search_path = '' as $$
  select u.role from public.app_users u where u.auth_user_id = auth.uid() and u.active
$$;

create function private.is_staff() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(private.current_app_role() in ('bookkeeper', 'owner'), false)
$$;

create function private.is_owner() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(private.current_app_role() = 'owner', false)
$$;

create function private.is_assigned_lead(p_work_order_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.job_assignments a
    where a.work_order_id = p_work_order_id
      and a.lead_user_id = private.current_app_user_id()
  )
$$;

create function private.can_view_work_order(p_work_order_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.is_staff() or private.is_assigned_lead(p_work_order_id)
$$;

-- Leads can change hours, crew and change orders only while the job is open.
create function private.lead_can_edit_work_order(p_work_order_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.is_assigned_lead(p_work_order_id)
    and exists (
      select 1 from public.work_orders w
      where w.id = p_work_order_id and w.status = 'open'
    )
$$;

revoke all on all functions in schema private from public;
grant execute on all functions in schema private to authenticated, service_role;

------------------------------------------------------------------------------
-- Triggers
------------------------------------------------------------------------------

create function private.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger touch_updated_at before update on public.employees
  for each row execute function private.touch_updated_at();
create trigger touch_updated_at before update on public.app_users
  for each row execute function private.touch_updated_at();
create trigger touch_updated_at before update on public.settings
  for each row execute function private.touch_updated_at();
create trigger touch_updated_at before update on public.work_orders
  for each row execute function private.touch_updated_at();

-- Time entries: record who entered and who edited, and count edits.
create function private.time_entry_stamp() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := private.current_app_user_id();
begin
  if tg_op = 'INSERT' then
    new.entered_by := coalesce(v_user, new.entered_by);
    new.created_at := now();
    new.updated_at := now();
    new.updated_by := null;
    new.version := 1;
  else
    new.id := old.id;
    new.entered_by := old.entered_by;
    new.created_at := old.created_at;
    new.updated_at := now();
    new.updated_by := coalesce(v_user, new.updated_by);
    new.version := old.version + 1;
    -- Only the office can clear a review flag.
    if old.needs_review and not new.needs_review and v_user is not null and not private.is_staff() then
      new.needs_review := true;
    end if;
  end if;
  return new;
end $$;

create trigger time_entry_stamp before insert or update on public.time_entries
  for each row execute function private.time_entry_stamp();

-- Change orders: the database decides quick vs. large from the owner's threshold.
-- Quick changes are approved on submit; large ones wait for the owner (spec 6.7).
create function private.change_order_rules() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := private.current_app_user_id();
  v_threshold numeric;
begin
  if tg_op = 'INSERT' then
    select s.large_change_order_threshold_hours into v_threshold from public.settings s;
    new.requested_by := coalesce(v_user, new.requested_by);
    new.requested_at := now();
    if new.hours_added > v_threshold then
      new.type := 'large';
      new.status := 'pending';
      new.decided_by := null;
      new.decided_at := null;
    else
      new.type := 'quick';
      new.status := 'approved';
      new.decided_by := null;
      new.decided_at := now();
    end if;
  else
    -- The request itself cannot be rewritten after it is submitted.
    new.id := old.id;
    new.work_order_id := old.work_order_id;
    new.type := old.type;
    new.hours_added := old.hours_added;
    new.requested_by := old.requested_by;
    new.requested_at := old.requested_at;
    if new.status is distinct from old.status then
      if old.type = 'quick' then
        raise exception 'Quick change orders are approved automatically and cannot be changed'
          using errcode = 'P0001';
      end if;
      new.decided_by := coalesce(v_user, new.decided_by);
      new.decided_at := case when new.status = 'pending' then null else now() end;
      if new.status = 'pending' then new.decided_by := null; end if;
    else
      new.decided_by := old.decided_by;
      new.decided_at := old.decided_at;
    end if;
  end if;
  return new;
end $$;

create trigger change_order_rules before insert or update on public.change_orders
  for each row execute function private.change_order_rules();

-- Audit: one row per insert, update, or delete on the tables below.
create function private.audit_row() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_old jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  v_new jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
begin
  if tg_op = 'UPDATE' and v_old = v_new then
    return null;
  end if;
  insert into public.audit_log (table_name, record_id, action, old_data, new_data, changed_by)
  values (
    tg_table_name,
    coalesce(v_new, v_old) ->> 'id',
    tg_op,
    v_old,
    v_new,
    private.current_app_user_id()
  );
  return null;
end $$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'employees', 'employee_wages', 'app_users', 'settings', 'work_orders',
    'work_order_lines', 'job_assignments', 'job_assignment_dates', 'job_crew',
    'time_entries', 'change_orders'
  ] loop
    execute format(
      'create trigger audit after insert or update or delete on public.%I
         for each row execute function private.audit_row()', t);
  end loop;
end $$;

------------------------------------------------------------------------------
-- Permissions (row-level security)
------------------------------------------------------------------------------

-- Signed-in app users get table access, then RLS narrows it row by row.
-- Visitors who are not signed in (anon) get nothing.
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant all on all tables in schema public to service_role;
grant usage on all sequences in schema public to authenticated, service_role;
-- Tables and functions added by later migrations stay closed to anon too.
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke all on functions from anon;

-- PIN hashes: no API access at all, only through the functions below.
revoke all on public.user_pins from authenticated;
-- The audit log is written only by triggers.
revoke insert, update, delete on public.audit_log from authenticated;

alter table public.employees enable row level security;
alter table public.employee_wages enable row level security;
alter table public.app_users enable row level security;
alter table public.user_pins enable row level security;
alter table public.settings enable row level security;
alter table public.work_orders enable row level security;
alter table public.work_order_lines enable row level security;
alter table public.job_assignments enable row level security;
alter table public.job_assignment_dates enable row level security;
alter table public.job_crew enable row level security;
alter table public.time_entries enable row level security;
alter table public.change_orders enable row level security;
alter table public.audit_log enable row level security;

-- Employees: names are visible to every signed-in user (leads pick their crew).
create policy "signed-in users read employees" on public.employees
  for select to authenticated using ((select private.current_app_role()) is not null);
create policy "staff manage employees" on public.employees
  for all to authenticated
  using ((select private.is_staff())) with check ((select private.is_staff()));

-- Wages: bookkeeper and owner only.
create policy "staff manage wages" on public.employee_wages
  for all to authenticated
  using ((select private.is_staff())) with check ((select private.is_staff()));

-- App users: everyone signed in can see who is who. Staff manage users,
-- but only the owner can create, change, or remove an owner account.
create policy "signed-in users read app users" on public.app_users
  for select to authenticated using ((select private.current_app_role()) is not null);
create policy "staff manage app users" on public.app_users
  for all to authenticated
  using ((select private.is_owner()) or ((select private.is_staff()) and role <> 'owner'))
  with check ((select private.is_owner()) or ((select private.is_staff()) and role <> 'owner'));

-- user_pins: RLS on and no policies, so no API access.

-- Settings: everyone signed in reads (tablets need thresholds); staff change.
create policy "signed-in users read settings" on public.settings
  for select to authenticated using ((select private.current_app_role()) is not null);
create policy "staff update settings" on public.settings
  for update to authenticated
  using ((select private.is_staff())) with check ((select private.is_staff()));

-- Work orders: leads see only their assigned jobs. Only staff create or edit.
-- Leads turn a job in through turn_in_work_order().
create policy "view assigned or all work orders" on public.work_orders
  for select to authenticated using (private.can_view_work_order(id));
create policy "staff insert work orders" on public.work_orders
  for insert to authenticated with check ((select private.is_staff()));
create policy "staff update work orders" on public.work_orders
  for update to authenticated
  using ((select private.is_staff())) with check ((select private.is_staff()));
create policy "staff delete work orders" on public.work_orders
  for delete to authenticated using ((select private.is_staff()));

create policy "view lines of visible work orders" on public.work_order_lines
  for select to authenticated using (private.can_view_work_order(work_order_id));
create policy "staff manage lines" on public.work_order_lines
  for all to authenticated
  using ((select private.is_staff())) with check ((select private.is_staff()));

create policy "view assignments of visible work orders" on public.job_assignments
  for select to authenticated using (private.can_view_work_order(work_order_id));
create policy "staff manage assignments" on public.job_assignments
  for all to authenticated
  using ((select private.is_staff())) with check ((select private.is_staff()));

create policy "view assignment dates of visible work orders" on public.job_assignment_dates
  for select to authenticated using (
    private.can_view_work_order(
      (select a.work_order_id from public.job_assignments a where a.id = assignment_id)
    )
  );
create policy "staff manage assignment dates" on public.job_assignment_dates
  for all to authenticated
  using ((select private.is_staff())) with check ((select private.is_staff()));

create policy "view crew of visible work orders" on public.job_crew
  for select to authenticated using (private.can_view_work_order(work_order_id));
create policy "staff or lead add crew" on public.job_crew
  for insert to authenticated with check (
    (select private.is_staff()) or private.lead_can_edit_work_order(work_order_id)
  );
create policy "staff or lead remove crew" on public.job_crew
  for delete to authenticated using (
    (select private.is_staff()) or private.lead_can_edit_work_order(work_order_id)
  );

-- Hours: leads enter and edit on their own jobs until turn-in.
-- Bookkeeper and owner can always edit; every edit is in audit_log.
create policy "view hours of visible work orders" on public.time_entries
  for select to authenticated using (private.can_view_work_order(work_order_id));
create policy "staff or lead add hours" on public.time_entries
  for insert to authenticated with check (
    (select private.is_staff()) or private.lead_can_edit_work_order(work_order_id)
  );
create policy "staff or lead edit hours" on public.time_entries
  for update to authenticated
  using ((select private.is_staff()) or private.lead_can_edit_work_order(work_order_id))
  with check ((select private.is_staff()) or private.lead_can_edit_work_order(work_order_id));
create policy "staff or lead delete hours" on public.time_entries
  for delete to authenticated using (
    (select private.is_staff()) or private.lead_can_edit_work_order(work_order_id)
  );

-- Change orders: anyone on the job submits; only the owner approves or denies.
create policy "view change orders of visible work orders" on public.change_orders
  for select to authenticated using (private.can_view_work_order(work_order_id));
create policy "staff or lead submit change orders" on public.change_orders
  for insert to authenticated with check (
    (select private.is_staff()) or private.lead_can_edit_work_order(work_order_id)
  );
create policy "owner decides change orders" on public.change_orders
  for update to authenticated
  using ((select private.is_owner())) with check ((select private.is_owner()));
create policy "owner deletes change orders" on public.change_orders
  for delete to authenticated using ((select private.is_owner()));

create policy "staff read audit log" on public.audit_log
  for select to authenticated using ((select private.is_staff()));

------------------------------------------------------------------------------
-- Functions the app calls
------------------------------------------------------------------------------

-- Turn in a job (spec 6.6). After this, the lead can no longer edit hours.
create function public.turn_in_work_order(
  p_work_order_id uuid,
  p_customer_signed_name text default null
) returns public.work_orders
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := private.current_app_user_id();
  v_row public.work_orders;
begin
  if v_user is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  if not private.can_view_work_order(p_work_order_id) then
    raise exception 'Not allowed to turn in this work order' using errcode = '42501';
  end if;
  update public.work_orders
     set status = 'turned_in',
         turned_in_at = now(),
         turned_in_by = v_user,
         customer_signed_name = coalesce(p_customer_signed_name, customer_signed_name)
   where id = p_work_order_id and status = 'open'
  returning * into v_row;
  if not found then
    raise exception 'Only an open work order can be turned in' using errcode = 'P0001';
  end if;
  return v_row;
end $$;

-- Each employee's total hours for a day across ALL jobs, for the daily flag
-- (spec 6.3, decision 7). Returns hours only, never wages or job details,
-- so a lead can check crew members who also worked on another lead's job.
create function public.employee_day_hours(p_employee_ids uuid[], p_work_date date)
returns table (employee_id uuid, hours numeric)
language plpgsql stable security definer set search_path = '' as $$
begin
  if private.current_app_user_id() is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  return query
    select t.employee_id, sum(t.hours)
    from public.time_entries t
    where t.employee_id = any (p_employee_ids) and t.work_date = p_work_date
    group by t.employee_id;
end $$;

-- Set or reset a user's PIN. Staff only; only the owner can set an owner's PIN.
create function public.set_user_pin(p_user_id uuid, p_pin text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_target_role public.app_role;
begin
  if not private.is_staff() then
    raise exception 'Only the bookkeeper or owner can set PINs' using errcode = '42501';
  end if;
  select role into v_target_role from public.app_users where id = p_user_id;
  if not found then
    raise exception 'No such user' using errcode = 'P0002';
  end if;
  if v_target_role = 'owner' and not private.is_owner() then
    raise exception 'Only the owner can set an owner PIN' using errcode = '42501';
  end if;
  if p_pin is null or p_pin !~ '^[0-9]{4,8}$' then
    raise exception 'PIN must be 4 to 8 digits' using errcode = '22023';
  end if;
  insert into public.user_pins (user_id, pin_hash, failed_attempts, locked_until, updated_at)
  values (p_user_id, extensions.crypt(p_pin, extensions.gen_salt('bf', 10)), 0, null, now())
  on conflict (user_id) do update
    set pin_hash = excluded.pin_hash, failed_attempts = 0, locked_until = null, updated_at = now();
  -- Record that the PIN changed, never the PIN itself.
  insert into public.audit_log (table_name, record_id, action, changed_by)
  values ('user_pins', p_user_id::text, 'PIN_SET', private.current_app_user_id());
end $$;

-- Check a PIN at sign-in, with lockout after repeated failures (spec 4, 10).
-- Returns 'ok', 'wrong', 'locked', or 'inactive'.
-- Only the server's sign-in code (service role) may call this.
create function public.verify_user_pin(p_user_id uuid, p_pin text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_pin public.user_pins;
  v_active boolean;
  v_max integer;
  v_lock_minutes integer;
begin
  select active into v_active from public.app_users where id = p_user_id;
  if v_active is distinct from true then
    return 'inactive';
  end if;
  select * into v_pin from public.user_pins where user_id = p_user_id for update;
  if not found then
    return 'wrong';
  end if;
  if v_pin.locked_until is not null and v_pin.locked_until > now() then
    return 'locked';
  end if;
  if v_pin.pin_hash = extensions.crypt(coalesce(p_pin, ''), v_pin.pin_hash) then
    update public.user_pins
       set failed_attempts = 0, locked_until = null, updated_at = now()
     where user_id = p_user_id;
    return 'ok';
  end if;
  select pin_max_attempts, pin_lockout_minutes into v_max, v_lock_minutes from public.settings;
  if v_pin.failed_attempts + 1 >= v_max then
    update public.user_pins
       set failed_attempts = 0,
           locked_until = now() + make_interval(mins => v_lock_minutes),
           updated_at = now()
     where user_id = p_user_id;
    return 'locked';
  end if;
  update public.user_pins
     set failed_attempts = failed_attempts + 1, updated_at = now()
   where user_id = p_user_id;
  return 'wrong';
end $$;

revoke all on function public.turn_in_work_order(uuid, text) from public, anon;
revoke all on function public.employee_day_hours(uuid[], date) from public, anon;
revoke all on function public.set_user_pin(uuid, text) from public, anon;
revoke all on function public.verify_user_pin(uuid, text) from public, anon, authenticated;
grant execute on function public.turn_in_work_order(uuid, text) to authenticated, service_role;
grant execute on function public.employee_day_hours(uuid[], date) to authenticated, service_role;
grant execute on function public.set_user_pin(uuid, text) to authenticated, service_role;
grant execute on function public.verify_user_pin(uuid, text) to service_role;
