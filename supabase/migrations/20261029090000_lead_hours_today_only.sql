-- Job leads enter hours for today only (owner's decision, 2026-10-29).
-- The bookkeeper and owner can add or change hours on any day; every change is
-- in audit_log. "Today" is the company's day (Omaha, US Central time).

alter table public.settings
  add column company_time_zone text not null default 'America/Chicago';

-- Refuse a time zone Postgres doesn't know, so "today" can always be worked out.
create function private.settings_time_zone_check() returns trigger
language plpgsql set search_path = '' as $$
begin
  perform now() at time zone new.company_time_zone;
  return new;
exception when others then
  raise exception 'Unknown time zone: %', new.company_time_zone using errcode = '22023';
end $$;

create trigger settings_time_zone_check before insert or update of company_time_zone on public.settings
  for each row execute function private.settings_time_zone_check();

create function private.company_today() returns date
language sql stable security definer set search_path = '' as $$
  select (now() at time zone s.company_time_zone)::date from public.settings s
$$;

revoke all on function private.company_today() from public;
grant execute on function private.company_today() to authenticated, service_role;

-- Leads: hours for today only, whether adding, changing, or removing.
create function private.time_entry_lead_today() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_today date;
begin
  -- The office (and the server itself) can change any day.
  if private.current_app_user_id() is null or private.is_staff() then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  v_today := private.company_today();
  if (tg_op in ('UPDATE', 'DELETE') and old.work_date <> v_today)
     or (tg_op in ('INSERT', 'UPDATE') and new.work_date <> v_today) then
    raise exception 'Job leads can only enter hours for today. Ask the office to change other days.'
      using errcode = 'P0001';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;

create trigger time_entry_lead_today before insert or update or delete on public.time_entries
  for each row execute function private.time_entry_lead_today();
