import { supabase } from '../lib/supabase';

// ---------------------------------------------------------------------------
// Settings data layer. Source of truth: supabase/migrations/20250103000000_phase4_settings.sql.
// Every query runs as the signed-in user; RLS limits rows to that user.
// ---------------------------------------------------------------------------

export interface ProfileSettings {
  full_name: string;
  phone: string;
  email: string;
  avatar_path: string | null;
}

export interface BusinessSettings {
  business_name: string;
  business_email: string;
  business_phone: string;
  business_address: string;
  website_url: string;
  gstin: string;
  logo_path: string | null;
}

export interface UserPreferences {
  theme: 'light' | 'dark' | 'system';
  density: 'comfortable' | 'compact';
  sidebar_collapsed: boolean;
  notify_overdue: boolean;
  notify_upcoming_payment: boolean;
  notify_upcoming_expense: boolean;
  notify_low_cash: boolean;
  notify_cash_risk: boolean;
  notify_ai: boolean;
  reminder_days_before: 0 | 1 | 3 | 7;
  invoice_prefix: string;
  auto_numbering: boolean;
  default_payment_terms_days: number;
  default_invoice_notes: string;
  show_logo_on_invoice: boolean;
  show_business_details_on_invoice: boolean;
  show_gst_on_invoice: boolean;
  currency: 'INR';
  low_cash_threshold: number;
  min_cash_balance: number;
  default_forecast_days: 30 | 60 | 90;
  expected_collection_delay_days: number;
  expense_categories: string[];
}

export const DEFAULT_PREFERENCES: UserPreferences = {
  theme: 'system',
  density: 'comfortable',
  sidebar_collapsed: false,
  notify_overdue: true,
  notify_upcoming_payment: true,
  notify_upcoming_expense: true,
  notify_low_cash: true,
  notify_cash_risk: true,
  notify_ai: false,
  reminder_days_before: 1,
  invoice_prefix: 'INV',
  auto_numbering: true,
  default_payment_terms_days: 30,
  default_invoice_notes: '',
  show_logo_on_invoice: true,
  show_business_details_on_invoice: true,
  show_gst_on_invoice: false,
  currency: 'INR',
  low_cash_threshold: 0,
  min_cash_balance: 0,
  default_forecast_days: 30,
  expected_collection_delay_days: 0,
  expense_categories: ['Software', 'Hosting', 'Domains', 'Marketing', 'Travel', 'Office', 'Other'],
};

// ---------------------------------------------------------------------------
// Row shapes and constants
// ---------------------------------------------------------------------------

interface ProfileRow {
  full_name: string | null;
  phone: string | null;
  email: string | null;
  avatar_path: string | null;
}

interface BusinessRow {
  business_name: string | null;
  business_email: string | null;
  business_phone: string | null;
  business_address: string | null;
  website_url: string | null;
  gstin: string | null;
  logo_path: string | null;
}

const PREFERENCE_COLUMNS =
  'theme, density, sidebar_collapsed, notify_overdue, notify_upcoming_payment, notify_upcoming_expense, ' +
  'notify_low_cash, notify_cash_risk, notify_ai, reminder_days_before, invoice_prefix, auto_numbering, ' +
  'default_payment_terms_days, default_invoice_notes, show_logo_on_invoice, show_business_details_on_invoice, ' +
  'show_gst_on_invoice, currency, low_cash_threshold, min_cash_balance, default_forecast_days, ' +
  'expected_collection_delay_days, expense_categories';

const PHONE_PATTERN = /^[0-9+ -]+$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const GSTIN_PATTERN = /^[0-9A-Z]{15}$/;
const INVOICE_PREFIX_PATTERN = /^[A-Za-z0-9-]{1,10}$/;
const THEMES: readonly UserPreferences['theme'][] = ['light', 'dark', 'system'];
const DENSITIES: readonly UserPreferences['density'][] = ['comfortable', 'compact'];
const REMINDER_DAYS: readonly number[] = [0, 1, 3, 7];
const FORECAST_DAYS: readonly number[] = [30, 60, 90];
const ASSET_EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};
const MAX_ASSET_BYTES = 2 * 1024 * 1024;
const ASSET_BUCKET = 'user-assets';
const SIGNED_URL_SECONDS = 3600;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface ErrorLike {
  message: string;
}

/** Converts a Supabase error into a readable Error; never exposes the raw error object. */
function throwIfError(error: ErrorLike | null): void {
  if (error) {
    const message = (error.message ?? '').trim();
    throw new Error(message !== '' ? message : 'Unexpected database error.');
  }
}

function emptyToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

export async function getCurrentUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    throw new Error('Not signed in');
  }
  return data.user.id;
}

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

export async function getProfile(): Promise<ProfileSettings> {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from('profiles')
    .select('full_name, phone, email, avatar_path')
    .eq('id', userId)
    .maybeSingle();
  throwIfError(error);
  const row = data as ProfileRow | null;
  return {
    full_name: row?.full_name ?? '',
    phone: row?.phone ?? '',
    email: row?.email ?? '',
    avatar_path: row?.avatar_path ?? null,
  };
}

/** Saves name and phone only. Email is never written from this module. */
export async function saveProfile(input: { full_name: string; phone: string }): Promise<void> {
  const userId = await getCurrentUserId();
  const fullName = input.full_name.trim();
  const phone = input.phone.trim();
  if (fullName === '' || fullName.length > 100) {
    throw new Error('Full name must be between 1 and 100 characters');
  }
  if (phone.length > 20 || (phone !== '' && !PHONE_PATTERN.test(phone))) {
    throw new Error('Phone may be up to 20 characters: digits, +, spaces and hyphens only');
  }
  const { error } = await supabase
    .from('profiles')
    .upsert({ id: userId, full_name: fullName, phone }, { onConflict: 'id' });
  throwIfError(error);
}

// ---------------------------------------------------------------------------
// Business
// ---------------------------------------------------------------------------

export async function getBusinessSettings(): Promise<BusinessSettings> {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from('business_settings')
    .select('business_name, business_email, business_phone, business_address, website_url, gstin, logo_path')
    .eq('user_id', userId)
    .maybeSingle();
  throwIfError(error);
  const row = data as BusinessRow | null;
  return {
    business_name: row?.business_name ?? '',
    business_email: row?.business_email ?? '',
    business_phone: row?.business_phone ?? '',
    business_address: row?.business_address ?? '',
    website_url: row?.website_url ?? '',
    gstin: row?.gstin ?? '',
    logo_path: row?.logo_path ?? null,
  };
}

/** Saves business details. logo_path is written only when the input provides a non-null value. */
export async function saveBusinessSettings(input: BusinessSettings): Promise<void> {
  const userId = await getCurrentUserId();
  const businessName = input.business_name.trim();
  const businessEmail = input.business_email.trim();
  const websiteUrl = input.website_url.trim();
  const gstin = input.gstin.trim().toUpperCase();
  if (businessName.length > 120) {
    throw new Error('Business name must be at most 120 characters');
  }
  if (businessEmail !== '' && !EMAIL_PATTERN.test(businessEmail)) {
    throw new Error('Business email is not a valid email address');
  }
  if (websiteUrl !== '' && !/^https?:\/\//.test(websiteUrl)) {
    throw new Error('Website must start with http:// or https://');
  }
  if (gstin !== '' && !GSTIN_PATTERN.test(gstin)) {
    throw new Error('GSTIN must be exactly 15 letters or digits');
  }
  const { error } = await supabase.from('business_settings').upsert(
    {
      user_id: userId,
      business_name: businessName,
      business_email: emptyToNull(businessEmail),
      business_phone: emptyToNull(input.business_phone),
      business_address: emptyToNull(input.business_address),
      website_url: emptyToNull(websiteUrl),
      gstin: emptyToNull(gstin),
      ...(input.logo_path !== null ? { logo_path: input.logo_path } : {}),
    },
    { onConflict: 'user_id' },
  );
  throwIfError(error);
}

// ---------------------------------------------------------------------------
// Preferences
// ---------------------------------------------------------------------------

export async function getPreferences(): Promise<UserPreferences> {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from('user_preferences')
    .select(PREFERENCE_COLUMNS)
    .eq('user_id', userId)
    .maybeSingle();
  throwIfError(error);
  const merged: UserPreferences = { ...DEFAULT_PREFERENCES, ...(data as Partial<UserPreferences> | null) };
  return { ...merged, expense_categories: [...merged.expense_categories] };
}

function validatePreferences(p: UserPreferences): UserPreferences {
  if (!THEMES.includes(p.theme)) {
    throw new Error('Theme must be light, dark or system');
  }
  if (!DENSITIES.includes(p.density)) {
    throw new Error('Density must be comfortable or compact');
  }
  if (!REMINDER_DAYS.includes(p.reminder_days_before)) {
    throw new Error('Reminder days must be 0, 1, 3 or 7');
  }
  if (!FORECAST_DAYS.includes(p.default_forecast_days)) {
    throw new Error('Forecast days must be 30, 60 or 90');
  }
  const invoicePrefix = p.invoice_prefix.trim();
  if (!INVOICE_PREFIX_PATTERN.test(invoicePrefix)) {
    throw new Error('Invoice prefix must be 1-10 letters, digits or hyphens');
  }
  if (!Number.isInteger(p.default_payment_terms_days) || p.default_payment_terms_days < 0 || p.default_payment_terms_days > 365) {
    throw new Error('Default payment terms must be a whole number of days from 0 to 365');
  }
  if (p.currency !== 'INR') {
    throw new Error('Currency must be INR');
  }
  if (!Number.isFinite(p.low_cash_threshold) || p.low_cash_threshold < 0) {
    throw new Error('Low cash threshold must be zero or more');
  }
  if (!Number.isFinite(p.min_cash_balance) || p.min_cash_balance < 0) {
    throw new Error('Minimum cash balance must be zero or more');
  }
  if (
    !Number.isInteger(p.expected_collection_delay_days) ||
    p.expected_collection_delay_days < 0 ||
    p.expected_collection_delay_days > 180
  ) {
    throw new Error('Expected collection delay must be a whole number of days from 0 to 180');
  }
  const categories = p.expense_categories.map((c) => c.trim());
  if (categories.some((c) => c === '')) {
    throw new Error('Expense categories cannot be empty');
  }
  if (new Set(categories).size !== categories.length) {
    throw new Error('Expense categories must be unique');
  }
  if (categories.length > 30) {
    throw new Error('At most 30 expense categories are allowed');
  }
  return { ...p, invoice_prefix: invoicePrefix, expense_categories: categories };
}

/** Merges patch into the current preferences, validates the result, and saves it. */
export async function savePreferences(patch: Partial<UserPreferences>): Promise<void> {
  const userId = await getCurrentUserId();
  const current = await getPreferences();
  const clean = validatePreferences({ ...current, ...patch });
  const { error } = await supabase
    .from('user_preferences')
    .upsert({ user_id: userId, ...clean }, { onConflict: 'user_id' });
  throwIfError(error);
}

// ---------------------------------------------------------------------------
// Assets (avatar and logo files in the private user-assets bucket)
// ---------------------------------------------------------------------------

/** Uploads a file under the user's folder and returns its storage path. The caller saves the path. */
export async function uploadUserAsset(kind: 'avatar' | 'logo', file: File): Promise<string> {
  const userId = await getCurrentUserId();
  const extension = ASSET_EXTENSIONS[file.type];
  if (!extension) {
    throw new Error('Image must be a PNG, JPEG or WebP file');
  }
  if (file.size > MAX_ASSET_BYTES) {
    throw new Error('Image must be 2 MB or smaller');
  }
  const path = `${userId}/${kind}-${Date.now()}.${extension}`;
  const { error } = await supabase.storage
    .from(ASSET_BUCKET)
    .upload(path, file, { upsert: false, contentType: file.type });
  throwIfError(error);
  return path;
}

/** Returns a signed URL valid for one hour, or null if there is no path or signing fails. */
export async function getAssetUrl(path: string | null): Promise<string | null> {
  if (!path) {
    return null;
  }
  const { data, error } = await supabase.storage
    .from(ASSET_BUCKET)
    .createSignedUrl(path, SIGNED_URL_SECONDS);
  if (error || !data) {
    return null;
  }
  return data.signedUrl;
}
