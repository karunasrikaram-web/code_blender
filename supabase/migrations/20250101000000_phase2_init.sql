-- =============================================================================
-- Smart Cash Flow Manager - Phase 2 database schema
-- Run ONCE in the Supabase SQL Editor (or apply as a migration).
-- Tables: profiles, customers, invoices, invoice_items, payments, expenses.
-- Integrity: invoice totals and status are maintained by recalc_invoice().
-- =============================================================================

-- 1. PROFILES ------------------------------------------------------------------
create table if not exists public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  full_name     text,
  email         text,
  business_name text,
  created_at    timestamptz not null default now()
);

-- Create a profile row for every new auth user.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, business_name)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'business_name'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 2. CUSTOMERS -----------------------------------------------------------------
create table if not exists public.customers (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  customer_name text not null check (length(trim(customer_name)) > 0),
  email         text,
  phone         text,
  project_name  text,
  notes         text,
  created_at    timestamptz not null default now(),
  constraint customers_user_id_id_key unique (user_id, id)
);

create index if not exists customers_user_name_idx on public.customers (user_id, customer_name);

-- 3. INVOICES ------------------------------------------------------------------
-- subtotal / total_amount / paid_amount / status are written ONLY by
-- recalc_invoice(). The app must never write these columns directly.
create table if not exists public.invoices (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users(id) on delete cascade,
  customer_id    uuid not null,
  invoice_number text not null,
  invoice_date   date not null default current_date,
  due_date       date not null check (due_date >= invoice_date),
  description    text,
  subtotal       numeric(12,2) not null default 0 check (subtotal >= 0),
  total_amount   numeric(12,2) not null default 0 check (total_amount >= 0),
  paid_amount    numeric(12,2) not null default 0 check (paid_amount >= 0),
  status         text not null default 'pending'
                   check (status in ('draft','pending','partially_paid','paid')),
  created_at     timestamptz not null default now(),
  constraint invoices_paid_le_total check (paid_amount <= total_amount),
  constraint invoices_user_number_key unique (user_id, invoice_number),
  constraint invoices_user_id_id_key unique (user_id, id),
  constraint invoices_customer_fk foreign key (user_id, customer_id)
    references public.customers (user_id, id) on delete restrict
);

create index if not exists invoices_user_status_idx on public.invoices (user_id, status);
create index if not exists invoices_user_due_idx on public.invoices (user_id, due_date);
create index if not exists invoices_customer_idx on public.invoices (customer_id);

-- 4. INVOICE ITEMS -------------------------------------------------------------
create table if not exists public.invoice_items (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid(),
  invoice_id  uuid not null,
  description text not null check (length(trim(description)) > 0),
  quantity    numeric(10,2) not null check (quantity > 0),
  unit_price  numeric(12,2) not null check (unit_price >= 0),
  line_total  numeric(12,2) generated always as (quantity * unit_price) stored,
  position    int not null default 0,
  created_at  timestamptz not null default now(),
  constraint invoice_items_invoice_fk foreign key (user_id, invoice_id)
    references public.invoices (user_id, id) on delete cascade
);

create index if not exists invoice_items_invoice_idx on public.invoice_items (invoice_id);

-- 5. PAYMENTS ------------------------------------------------------------------
create table if not exists public.payments (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users(id) on delete cascade,
  invoice_id     uuid not null,
  customer_id    uuid not null,
  payment_amount numeric(12,2) not null check (payment_amount > 0),
  payment_date   date not null default current_date,
  payment_method text not null
                   check (payment_method in ('Bank transfer','Cash','Card','UPI','Cheque','Other')),
  notes          text,
  created_at     timestamptz not null default now(),
  constraint payments_invoice_fk foreign key (user_id, invoice_id)
    references public.invoices (user_id, id) on delete restrict,
  constraint payments_customer_fk foreign key (user_id, customer_id)
    references public.customers (user_id, id) on delete restrict
);

create index if not exists payments_invoice_idx on public.payments (invoice_id);
create index if not exists payments_user_date_idx on public.payments (user_id, payment_date);
create index if not exists payments_customer_idx on public.payments (customer_id);

-- 6. EXPENSES ------------------------------------------------------------------
create table if not exists public.expenses (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users(id) on delete cascade,
  expense_title  text not null check (length(trim(expense_title)) > 0),
  category       text not null check (length(trim(category)) > 0),
  amount         numeric(12,2) not null check (amount > 0),
  expense_date   date not null default current_date,
  due_date       date,
  payment_status text not null default 'pending'
                   check (payment_status in ('paid','pending')),
  notes          text,
  created_at     timestamptz not null default now()
);

create index if not exists expenses_user_date_idx on public.expenses (user_id, expense_date);
create index if not exists expenses_user_status_idx on public.expenses (user_id, payment_status);

-- 7. INTEGRITY -----------------------------------------------------------------

-- 7a. Single writer for invoice totals and stored status.
create or replace function public.recalc_invoice(p_invoice_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status   text;
  v_subtotal numeric(12,2);
  v_paid     numeric(12,2);
  v_new      text;
begin
  select i.status into v_status
  from public.invoices i
  where i.id = p_invoice_id
  for update;

  if not found then
    return;
  end if;

  select coalesce(sum(ii.line_total), 0) into v_subtotal
  from public.invoice_items ii
  where ii.invoice_id = p_invoice_id;

  select coalesce(sum(p.payment_amount), 0) into v_paid
  from public.payments p
  where p.invoice_id = p_invoice_id;

  if v_subtotal < v_paid then
    raise exception 'Payments exceed invoice total';
  end if;

  if v_paid = 0 and v_status = 'draft' then
    v_new := 'draft';
  elsif v_subtotal > 0 and v_paid >= v_subtotal then
    v_new := 'paid';
  elsif v_paid > 0 then
    v_new := 'partially_paid';
  else
    v_new := 'pending';
  end if;

  update public.invoices
     set subtotal     = v_subtotal,
         total_amount = v_subtotal,
         paid_amount  = v_paid,
         status       = v_new
   where id = p_invoice_id;
end;
$$;

-- 7b/7c. Recalculate the parent invoice when child rows change.
-- Shared by invoice_items and payments (both carry invoice_id).
create or replace function public.trg_recalc_from_child()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    perform public.recalc_invoice(old.invoice_id);
  elsif tg_op = 'INSERT' then
    perform public.recalc_invoice(new.invoice_id);
  else
    perform public.recalc_invoice(new.invoice_id);
    if new.invoice_id is distinct from old.invoice_id then
      perform public.recalc_invoice(old.invoice_id);
    end if;
  end if;
  return null;
end;
$$;

drop trigger if exists invoice_items_recalc on public.invoice_items;
create trigger invoice_items_recalc
  after insert or update or delete on public.invoice_items
  for each row execute function public.trg_recalc_from_child();

drop trigger if exists payments_recalc on public.payments;
create trigger payments_recalc
  after insert or update or delete on public.payments
  for each row execute function public.trg_recalc_from_child();

-- 7d. Validate each payment against its invoice before it is written.
create or replace function public.trg_validate_payment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status   text;
  v_total    numeric(12,2);
  v_customer uuid;
  v_others   numeric(12,2);
begin
  select i.status, i.total_amount, i.customer_id
    into v_status, v_total, v_customer
  from public.invoices i
  where i.id = new.invoice_id
  for update;

  if not found then
    raise exception 'Invoice not found';
  end if;

  if v_status = 'draft' then
    raise exception 'Invoices in draft cannot receive payments';
  end if;

  if new.customer_id <> v_customer then
    raise exception 'Payment customer does not match invoice customer';
  end if;

  select coalesce(sum(p.payment_amount), 0) into v_others
  from public.payments p
  where p.invoice_id = new.invoice_id
    and p.id <> new.id;

  if v_others + new.payment_amount > v_total then
    raise exception 'Payment exceeds remaining balance';
  end if;

  return new;
end;
$$;

drop trigger if exists payments_validate on public.payments;
create trigger payments_validate
  before insert or update on public.payments
  for each row execute function public.trg_validate_payment();

-- 7e. No trigger on invoices: recalc_invoice is the only writer of
--     subtotal / total_amount / paid_amount / status.

-- 8. VIEW ----------------------------------------------------------------------
-- Overdue is derived, not stored. Note: a past-due partially paid invoice
-- shows 'partially_paid' by design (partial payment takes precedence).
create or replace view public.invoices_with_status
with (security_invoker = true)
as
select
  i.*,
  i.total_amount - i.paid_amount as balance_due,
  case
    when i.status = 'draft' then 'draft'
    when i.status = 'paid' then 'paid'
    when i.status = 'partially_paid' then 'partially_paid'
    when i.due_date < current_date then 'overdue'
    else 'pending'
  end as display_status
from public.invoices i;

-- 9. RECORD_PAYMENT RPC --------------------------------------------------------
-- Runs as the caller, so RLS applies to the invoice lookup and the insert.
create or replace function public.record_payment(
  p_invoice_id     uuid,
  p_amount         numeric,
  p_payment_date   date,
  p_payment_method text,
  p_notes          text
)
returns public.payments
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_inv public.invoices;
  v_row public.payments;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'Payment amount must be greater than zero';
  end if;

  select * into v_inv
  from public.invoices
  where id = p_invoice_id;

  if not found then
    raise exception 'Invoice not found';
  end if;

  if v_inv.status = 'draft' then
    raise exception 'Draft invoices cannot receive payments';
  end if;

  insert into public.payments (
    invoice_id, customer_id, payment_amount, payment_date, payment_method, notes
  )
  values (
    p_invoice_id,
    v_inv.customer_id,
    p_amount,
    coalesce(p_payment_date, current_date),
    p_payment_method,
    p_notes
  )
  returning * into v_row;

  return v_row;
end;
$$;

-- 10. ROW LEVEL SECURITY AND GRANTS --------------------------------------------
alter table public.profiles      enable row level security;
alter table public.customers     enable row level security;
alter table public.invoices      enable row level security;
alter table public.invoice_items enable row level security;
alter table public.payments      enable row level security;
alter table public.expenses      enable row level security;

-- profiles: owner may read, insert and update own row; no delete.
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated using (id = auth.uid());
drop policy if exists profiles_insert on public.profiles;
create policy profiles_insert on public.profiles
  for insert to authenticated with check (id = auth.uid());
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- customers, invoices, invoice_items, payments, expenses: owner-only CRUD.
drop policy if exists customers_select on public.customers;
create policy customers_select on public.customers
  for select to authenticated using (user_id = auth.uid());
drop policy if exists customers_insert on public.customers;
create policy customers_insert on public.customers
  for insert to authenticated with check (user_id = auth.uid());
drop policy if exists customers_update on public.customers;
create policy customers_update on public.customers
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists customers_delete on public.customers;
create policy customers_delete on public.customers
  for delete to authenticated using (user_id = auth.uid());

drop policy if exists invoices_select on public.invoices;
create policy invoices_select on public.invoices
  for select to authenticated using (user_id = auth.uid());
drop policy if exists invoices_insert on public.invoices;
create policy invoices_insert on public.invoices
  for insert to authenticated with check (user_id = auth.uid());
drop policy if exists invoices_update on public.invoices;
create policy invoices_update on public.invoices
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists invoices_delete on public.invoices;
create policy invoices_delete on public.invoices
  for delete to authenticated using (user_id = auth.uid());

drop policy if exists invoice_items_select on public.invoice_items;
create policy invoice_items_select on public.invoice_items
  for select to authenticated using (user_id = auth.uid());
drop policy if exists invoice_items_insert on public.invoice_items;
create policy invoice_items_insert on public.invoice_items
  for insert to authenticated with check (user_id = auth.uid());
drop policy if exists invoice_items_update on public.invoice_items;
create policy invoice_items_update on public.invoice_items
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists invoice_items_delete on public.invoice_items;
create policy invoice_items_delete on public.invoice_items
  for delete to authenticated using (user_id = auth.uid());

drop policy if exists payments_select on public.payments;
create policy payments_select on public.payments
  for select to authenticated using (user_id = auth.uid());
drop policy if exists payments_insert on public.payments;
create policy payments_insert on public.payments
  for insert to authenticated with check (user_id = auth.uid());
drop policy if exists payments_update on public.payments;
create policy payments_update on public.payments
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists payments_delete on public.payments;
create policy payments_delete on public.payments
  for delete to authenticated using (user_id = auth.uid());

drop policy if exists expenses_select on public.expenses;
create policy expenses_select on public.expenses
  for select to authenticated using (user_id = auth.uid());
drop policy if exists expenses_insert on public.expenses;
create policy expenses_insert on public.expenses
  for insert to authenticated with check (user_id = auth.uid());
drop policy if exists expenses_update on public.expenses;
create policy expenses_update on public.expenses
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists expenses_delete on public.expenses;
create policy expenses_delete on public.expenses
  for delete to authenticated using (user_id = auth.uid());

-- Table grants: no access for anon.
revoke all on public.profiles, public.customers, public.invoices,
              public.invoice_items, public.payments, public.expenses
  from anon;
revoke all on public.invoices_with_status from anon;

grant select, insert, update on public.profiles to authenticated;
grant select, insert, update, delete on public.customers,
      public.invoices, public.invoice_items, public.payments, public.expenses
  to authenticated;
grant select on public.invoices_with_status to authenticated;

-- Function grants.
revoke execute on function public.recalc_invoice(uuid) from public, anon, authenticated;

revoke execute on function public.record_payment(uuid, numeric, date, text, text) from public, anon;
grant execute on function public.record_payment(uuid, numeric, date, text, text) to authenticated;
