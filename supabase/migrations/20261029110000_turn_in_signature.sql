-- Turn-in with the customer's signature (spec 6.5, 6.6).
--
-- The lead shows the customer the job on the tablet, the customer signs, and the
-- lead turns the work order in. The signature is saved together with the turn-in,
-- in one step, so there is never a turned-in job with a half-saved signature.
-- If the customer isn't there to sign, the lead must give a reason instead.
-- After turn-in the lead can no longer change hours, crew, or change orders.

-- Why there's no signature, when the customer wasn't available.
alter table public.work_orders add column turn_in_note text;

-- Signature images (PNG, as a data URL). One per work order. Only written by
-- turn_in_work_order(); readable by whoever can see the work order.
create table public.work_order_signatures (
  work_order_id uuid primary key references public.work_orders (id) on delete cascade,
  signed_name text not null check (btrim(signed_name) <> '' and char_length(signed_name) <= 200),
  image_png text not null
    check (image_png like 'data:image/png;base64,%' and char_length(image_png) <= 400000),
  captured_by uuid references public.app_users (id),
  captured_at timestamptz not null default now()
);

alter table public.work_order_signatures enable row level security;
revoke all on public.work_order_signatures from anon, authenticated;
grant select on public.work_order_signatures to authenticated;
grant all on public.work_order_signatures to service_role;

create policy "view signatures of visible work orders" on public.work_order_signatures
  for select to authenticated using (private.can_view_work_order(work_order_id));

-- Replaces the Phase 1 version, which only took a typed name.
drop function public.turn_in_work_order(uuid, text);

create function public.turn_in_work_order(
  p_work_order_id uuid,
  p_signed_name text,
  p_signature_png text,
  p_no_signature_reason text
) returns public.work_orders
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := private.current_app_user_id();
  v_name text := nullif(btrim(coalesce(p_signed_name, '')), '');
  v_reason text := nullif(btrim(coalesce(p_no_signature_reason, '')), '');
  v_signed boolean := p_signature_png is not null;
  v_row public.work_orders;
begin
  if v_user is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  if not private.can_view_work_order(p_work_order_id) then
    raise exception 'Not allowed to turn in this work order' using errcode = '42501';
  end if;

  if v_signed then
    if v_name is null then
      raise exception 'Type the name of the person signing.' using errcode = '22023';
    end if;
    if p_signature_png not like 'data:image/png;base64,%' or char_length(p_signature_png) > 400000 then
      raise exception 'The signature could not be read. Clear it and sign again.' using errcode = '22023';
    end if;
    v_reason := null;
  elsif v_reason is null then
    raise exception 'Get the customer''s signature, or say why they can''t sign.' using errcode = '22023';
  elsif char_length(v_reason) > 500 then
    raise exception 'Keep the reason under 500 characters.' using errcode = '22023';
  end if;

  update public.work_orders
     set status = 'turned_in',
         turned_in_at = now(),
         turned_in_by = v_user,
         customer_signed_name = case when v_signed then v_name end,
         turn_in_note = v_reason
   where id = p_work_order_id and status = 'open'
  returning * into v_row;
  if not found then
    raise exception 'This work order has already been turned in.' using errcode = 'P0001';
  end if;

  if v_signed then
    insert into public.work_order_signatures (work_order_id, signed_name, image_png, captured_by)
    values (p_work_order_id, v_name, p_signature_png, v_user)
    on conflict (work_order_id) do update
      set signed_name = excluded.signed_name, image_png = excluded.image_png,
          captured_by = excluded.captured_by, captured_at = now();
  end if;
  return v_row;
end $$;

revoke all on function public.turn_in_work_order(uuid, text, text, text) from public, anon;
grant execute on function public.turn_in_work_order(uuid, text, text, text) to authenticated, service_role;
