-- PIN-only sign-in (owner's choice, 2026-10-28).
--
-- People sign in with their PIN alone; the PIN says who they are. To keep that
-- safe on a public web address:
--   * PINs are exactly 6 digits and no two people share one.
--   * Wrong PINs are counted per tablet and per internet address, and the whole
--     system pauses PIN sign-in if there are too many wrong PINs in an hour.
-- This replaces verify_user_pin (name + PIN, locked per person).

alter table public.settings
  -- System-wide cap on wrong PINs per hour, across all tablets. Above it, PIN
  -- sign-in pauses until the hour rolls over. Stops large-scale guessing.
  add column pin_failures_per_hour_limit integer not null default 30
    check (pin_failures_per_hour_limit between 5 and 1000);

-- Wrong PIN attempts, kept one day for throttling. Not reachable through the API.
create table private.sign_in_failures (
  id bigint generated always as identity primary key,
  device_key text not null,
  ip text not null,
  failed_at timestamptz not null default now()
);
create index sign_in_failures_device_idx on private.sign_in_failures (device_key, failed_at);
create index sign_in_failures_ip_idx on private.sign_in_failures (ip, failed_at);
create index sign_in_failures_time_idx on private.sign_in_failures (failed_at);
alter table private.sign_in_failures enable row level security;
revoke all on private.sign_in_failures from public, anon, authenticated;

drop function public.verify_user_pin(uuid, text);

-- Set or reset a user's PIN. Staff only; only the owner can set an owner's PIN.
-- PINs are exactly 6 digits and must not match anyone else's.
create or replace function public.set_user_pin(p_user_id uuid, p_pin text) returns void
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
  if p_pin is null or p_pin !~ '^[0-9]{6}$' then
    raise exception 'PIN must be exactly 6 digits' using errcode = '22023';
  end if;
  -- One PIN change at a time, so two people can't be given the same PIN at once.
  lock table public.user_pins in share row exclusive mode;
  if exists (
    select 1 from public.user_pins p
    where p.user_id <> p_user_id and p.pin_hash = extensions.crypt(p_pin, p.pin_hash)
  ) then
    raise exception 'That PIN is already taken. Pick a different one.' using errcode = '23505';
  end if;
  insert into public.user_pins (user_id, pin_hash, failed_attempts, locked_until, updated_at)
  values (p_user_id, extensions.crypt(p_pin, extensions.gen_salt('bf', 10)), 0, null, now())
  on conflict (user_id) do update
    set pin_hash = excluded.pin_hash, failed_attempts = 0, locked_until = null, updated_at = now();
  -- Record that the PIN changed, never the PIN itself.
  insert into public.audit_log (table_name, record_id, action, changed_by)
  values ('user_pins', p_user_id::text, 'PIN_SET', private.current_app_user_id());
end $$;

-- Sign in with a PIN alone. Returns the result and, on 'ok', who it is.
-- Results: 'ok', 'wrong', 'locked' (too many wrong tries from this tablet or
-- internet address), 'paused' (too many wrong tries system-wide this hour),
-- 'inactive' (that person's sign-in is turned off).
-- Only the server's sign-in code (service role) may call this; it passes a
-- random id stored on the tablet and the tablet's internet address.
create function public.sign_in_with_pin(p_pin text, p_device_key text, p_ip text)
returns table (result text, user_id uuid)
language plpgsql security definer set search_path = '' as $$
declare
  v_settings public.settings;
  v_window interval;
  v_device text := coalesce(nullif(btrim(p_device_key), ''), 'unknown');
  v_ip text := coalesce(nullif(btrim(p_ip), ''), 'unknown');
  v_device_failures integer;
  v_ip_failures integer;
  v_user_id uuid;
  v_active boolean;
begin
  select * into v_settings from public.settings;
  v_window := make_interval(mins => v_settings.pin_lockout_minutes);

  delete from private.sign_in_failures where failed_at < now() - interval '1 day';

  select count(*) into v_device_failures from private.sign_in_failures f
    where f.device_key = v_device and f.failed_at > now() - v_window;
  -- Several tablets can share one internet address (shop Wi-Fi), so allow more there.
  select count(*) into v_ip_failures from private.sign_in_failures f
    where f.ip = v_ip and f.failed_at > now() - v_window;
  if v_device_failures >= v_settings.pin_max_attempts
     or v_ip_failures >= v_settings.pin_max_attempts * 4 then
    return query select 'locked'::text, null::uuid;
    return;
  end if;

  if (select count(*) from private.sign_in_failures f where f.failed_at > now() - interval '1 hour')
     >= v_settings.pin_failures_per_hour_limit then
    return query select 'paused'::text, null::uuid;
    return;
  end if;

  if p_pin ~ '^[0-9]{6}$' then
    select p.user_id, u.active into v_user_id, v_active
    from public.user_pins p
    join public.app_users u on u.id = p.user_id
    where p.pin_hash = extensions.crypt(p_pin, p.pin_hash)
    limit 1;
  end if;

  if v_user_id is null then
    insert into private.sign_in_failures (device_key, ip) values (v_device, v_ip);
    if v_device_failures + 1 >= v_settings.pin_max_attempts then
      return query select 'locked'::text, null::uuid;
    else
      return query select 'wrong'::text, null::uuid;
    end if;
    return;
  end if;

  if not v_active then
    return query select 'inactive'::text, null::uuid;
    return;
  end if;

  return query select 'ok'::text, v_user_id;
end $$;

revoke all on function public.sign_in_with_pin(text, text, text) from public, anon, authenticated;
grant execute on function public.sign_in_with_pin(text, text, text) to service_role;
