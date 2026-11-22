-- =============================================================================
-- Smart Cash Flow Manager - Phase 2 migration 2
-- Invoice numbering, invoice save/delete rules, customer delete rule,
-- payment correction path, and overdue view fix.
-- Depends on: 20250101000000_phase2_init.sql
-- =============================================================================

-- 1. OVERDUE VIEW --------------------------------------------------------------
-- An unpaid or partly paid invoice past its due date is 'overdue' (its balance
-- is still owed). Paid and draft invoices never show as overdue.
-- Adds customer_name (left join) after the existing columns, so the column
-- order of the earlier view is preserved and create or replace is valid.
create or replace view public.invoices_with_status
with (security_invoker = true)
as
select
  i.*,
  i.total_amount - i.paid_amount as balance_due,
  case
    when i.status = 'draft' then 'draft'
    when i.status = 'paid' then 'paid'
    when i.due_date < current_date then 'overdue'
    when i.status = 'partially_paid' then 'partially_paid'
    else 'pending'
  end as display_status,
  c.customer_name
from public.invoices i
left join public.customers c
  on c.id = i.customer_id
 and c.user_id = i.user_id;

revoke all on public.invoices_with_status from anon;
grant select on public.invoices_with_status to authenticated;

-- 2. NEXT INVOICE NUMBER -------------------------------------------------------
-- Returns 'INV-<year>-<3-digit sequence>' for the caller's invoices this year.
-- Numbers of 1000 or more are returned in full (lpad would truncate them).
create or replace function public.next_invoice_number()
returns text
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_next   integer;
  v_prefix text := 'INV-' || to_char(current_date, 'YYYY') || '-';
begin
  select coalesce(max(substring(invoice_number from '(\d+)$')::int), 0) + 1
    into v_next
  from public.invoices
  where user_id = auth.uid()
    and invoice_number like v_prefix || '%';

  return v_prefix || case
           when v_next < 1000 then lpad(v_next::text, 3, '0')
           else v_next::text
         end;
end;
$$;

revoke execute on function public.next_invoice_number() from public, anon;
grant execute on function public.next_invoice_number() to authenticated;

-- 3. SAVE INVOICE --------------------------------------------------------------
-- Creates (p_id is null) or edits an invoice and replaces its line items in
-- one transaction. Totals, paid amount and status are NOT written here: the
-- recalc trigger on invoice_items sets them. Paid / partially_paid come only
-- from payments, so only 'draft' and 'pending' are accepted here.
-- Invoices with payments are locked; use delete_payment for a correction.
create or replace function public.save_invoice(
  p_id             uuid,
  p_customer_id    uuid,
  p_invoice_number text,
  p_invoice_date   date,
  p_due_date       date,
  p_description    text,
  p_status         text,
  p_items          jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id uuid;
begin
  -- Validate input before touching any rows.
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'Add at least one line item';
  end if;

  if p_status is null or p_status not in ('draft', 'pending') then
    raise exception 'Invalid status for a new or edited invoice';
  end if;

  if p_due_date < p_invoice_date then
    raise exception 'Due date must be on or after the invoice date';
  end if;

  -- Header: insert a new invoice, or lock and update an existing one.
  if p_id is null then
    begin
      insert into public.invoices (
        customer_id, invoice_number, invoice_date, due_date, description, status
      )
      values (
        p_customer_id, p_invoice_number, p_invoice_date, p_due_date, p_description, p_status
      )
      returning id into v_id;
    exception when unique_violation then
      raise exception 'Invoice number already exists';
    end;
  else
    select i.id into v_id
    from public.invoices i
    where i.id = p_id
    for update;

    if not found then
      raise exception 'Invoice not found';
    end if;

    if exists (select 1 from public.payments pm where pm.invoice_id = v_id) then
      raise exception 'Invoices with recorded payments cannot be edited; record a correction instead';
    end if;

    begin
      update public.invoices
         set customer_id    = p_customer_id,
             invoice_number = p_invoice_number,
             invoice_date   = p_invoice_date,
             due_date       = p_due_date,
             description    = p_description,
             status         = p_status
       where id = v_id;
    exception when unique_violation then
      raise exception 'Invoice number already exists';
    end;
  end if;

  -- Line items: replace the full set. Position is the 0-based array index.
  delete from public.invoice_items where invoice_id = v_id;

  insert into public.invoice_items (
    user_id, invoice_id, description, quantity, unit_price, position
  )
  select
    auth.uid(),
    v_id,
    item->>'description',
    (item->>'quantity')::numeric,
    (item->>'unit_price')::numeric,
    (ord - 1)::int
  from jsonb_array_elements(p_items) with ordinality as t(item, ord);

  return v_id;
end;
$$;

revoke execute on function public.save_invoice(uuid, uuid, text, date, date, text, text, jsonb) from public, anon;
grant execute on function public.save_invoice(uuid, uuid, text, date, date, text, text, jsonb) to authenticated;

-- 4. DELETE INVOICE ------------------------------------------------------------
-- Refuses invoices that have payments. Line items are removed by cascade.
create or replace function public.delete_invoice(p_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id uuid;
begin
  select i.id into v_id
  from public.invoices i
  where i.id = p_id;

  if not found then
    raise exception 'Invoice not found';
  end if;

  if exists (select 1 from public.payments pm where pm.invoice_id = v_id) then
    raise exception 'Invoices with recorded payments cannot be deleted';
  end if;

  delete from public.invoices where id = v_id;
end;
$$;

revoke execute on function public.delete_invoice(uuid) from public, anon;
grant execute on function public.delete_invoice(uuid) to authenticated;

-- 5. DELETE CUSTOMER -----------------------------------------------------------
-- Refuses customers that still have invoices or payments.
create or replace function public.delete_customer(p_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id uuid;
begin
  select c.id into v_id
  from public.customers c
  where c.id = p_id;

  if not found then
    raise exception 'Customer not found';
  end if;

  if exists (select 1 from public.invoices i where i.customer_id = v_id)
     or exists (select 1 from public.payments pm where pm.customer_id = v_id) then
    raise exception 'This customer has invoices or payments. Delete or reassign them first, or keep the customer.';
  end if;

  delete from public.customers where id = v_id;
end;
$$;

revoke execute on function public.delete_customer(uuid) from public, anon;
grant execute on function public.delete_customer(uuid) to authenticated;

-- 6. DELETE PAYMENT (correction path) ------------------------------------------
-- This is the explicit correction path for a recorded payment. The recalc
-- trigger on payments updates the parent invoice's paid amount and status.
create or replace function public.delete_payment(p_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id uuid;
begin
  select pm.id into v_id
  from public.payments pm
  where pm.id = p_id;

  if not found then
    raise exception 'Payment not found';
  end if;

  delete from public.payments where id = v_id;
end;
$$;

revoke execute on function public.delete_payment(uuid) from public, anon;
grant execute on function public.delete_payment(uuid) to authenticated;
