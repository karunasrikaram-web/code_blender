-- Phase 4: settings module. Extends profiles; adds business_settings, user_preferences, and a private storage bucket.
alter table public.profiles add column if not exists phone text;
alter table public.profiles add column if not exists avatar_path text;
alter table public.profiles add column if not exists updated_at timestamptz not null default now();
alter table public.profiles enable row level security;
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles for select to authenticated using (auth.uid() = id);
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

create table if not exists public.business_settings (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  business_name text,
  business_email text,
  business_phone text,
  business_address text,
  website_url text,
  gstin text check (gstin is null or gstin ~ '^[0-9A-Z]{15}$'),
  logo_path text,
  updated_at timestamptz not null default now()
);
alter table public.business_settings enable row level security;
drop policy if exists business_settings_all_own on public.business_settings;
create policy business_settings_all_own on public.business_settings for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists public.user_preferences (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  theme text not null default 'system' check (theme in ('light','dark','system')),
  density text not null default 'comfortable' check (density in ('comfortable','compact')),
  sidebar_collapsed boolean not null default false,
  notify_overdue boolean not null default true,
  notify_upcoming_payment boolean not null default true,
  notify_upcoming_expense boolean not null default true,
  notify_low_cash boolean not null default true,
  notify_cash_risk boolean not null default true,
  notify_ai boolean not null default false,
  reminder_days_before int not null default 1 check (reminder_days_before in (0,1,3,7)),
  invoice_prefix text not null default 'INV' check (length(invoice_prefix) between 1 and 10 and invoice_prefix ~ '^[A-Za-z0-9-]+$'),
  auto_numbering boolean not null default true,
  default_payment_terms_days int not null default 30 check (default_payment_terms_days between 0 and 365),
  default_invoice_notes text not null default '',
  show_logo_on_invoice boolean not null default true,
  show_business_details_on_invoice boolean not null default true,
  show_gst_on_invoice boolean not null default false,
  currency text not null default 'INR' check (currency = 'INR'),
  low_cash_threshold numeric(12,2) not null default 0 check (low_cash_threshold >= 0),
  min_cash_balance numeric(12,2) not null default 0 check (min_cash_balance >= 0),
  default_forecast_days int not null default 30 check (default_forecast_days in (30,60,90)),
  expected_collection_delay_days int not null default 0 check (expected_collection_delay_days between 0 and 180),
  expense_categories text[] not null default array['Software','Hosting','Domains','Marketing','Travel','Office','Other'],
  updated_at timestamptz not null default now()
);
alter table public.user_preferences enable row level security;
drop policy if exists user_preferences_all_own on public.user_preferences;
create policy user_preferences_all_own on public.user_preferences for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

insert into storage.buckets (id, name, public) values ('user-assets', 'user-assets', false) on conflict (id) do nothing;
drop policy if exists user_assets_all_own on storage.objects;
create policy user_assets_all_own on storage.objects for all to authenticated
  using (bucket_id = 'user-assets' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'user-assets' and (storage.foldername(name))[1] = auth.uid()::text);
