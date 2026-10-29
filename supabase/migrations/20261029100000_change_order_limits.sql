-- Change orders (spec 6.7): same hour rules as hours entry, plus sensible limits.
-- Half-hour steps, at most 500 hours, and a description under 1,000 characters.
alter table public.change_orders
  add constraint change_orders_hours_steps
    check (hours_added * 2 = trunc(hours_added * 2) and hours_added <= 500),
  add constraint change_orders_description_length
    check (char_length(description) <= 1000);
