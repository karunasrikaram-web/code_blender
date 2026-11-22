import type { ChangeEvent, CSSProperties, FormEvent, ReactNode } from 'react';
import { useEffect, useState } from 'react';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import PageHeader from '../components/ui/PageHeader';
import { supabase } from '../lib/supabase';
import { formatCurrency } from '../utils/format';
import type { BusinessSettings, ProfileSettings, UserPreferences } from '../services/settingsApi';
import {
  DEFAULT_PREFERENCES,
  getAssetUrl,
  getBusinessSettings,
  getCurrentUserId,
  getPreferences,
  getProfile,
  saveBusinessSettings,
  savePreferences,
  saveProfile,
  uploadUserAsset,
} from '../services/settingsApi';

type EditableSection = 'profile' | 'business' | 'appearance' | 'notifications' | 'invoice' | 'financial';

type SectionId = EditableSection | 'security' | 'data';

interface SectionDef {
  id: SectionId;
  label: string;
}

const SECTIONS: SectionDef[] = [
  { id: 'profile', label: 'Profile' },
  { id: 'business', label: 'Business information' },
  { id: 'appearance', label: 'Appearance' },
  { id: 'notifications', label: 'Notifications' },
  { id: 'invoice', label: 'Invoice settings' },
  { id: 'financial', label: 'Financial preferences' },
  { id: 'security', label: 'Security & password' },
  { id: 'data', label: 'Data management' },
];

interface SectionStatus {
  loading: boolean;
  loaded: boolean;
  saving: boolean;
  message: string | null;
  error: string | null;
}

const INITIAL_STATUS: SectionStatus = {
  loading: true,
  loaded: false,
  saving: false,
  message: null,
  error: null,
};

const PROFILE_KEYS = ['full_name', 'phone'] as const;
const BUSINESS_KEYS = [
  'business_name',
  'business_email',
  'business_phone',
  'business_address',
  'website_url',
  'gstin',
] as const;
const APPEARANCE_KEYS = ['theme', 'density', 'sidebar_collapsed'] as const;
const NOTIFICATION_KEYS = [
  'notify_overdue',
  'notify_upcoming_payment',
  'notify_upcoming_expense',
  'notify_low_cash',
  'notify_cash_risk',
  'notify_ai',
  'reminder_days_before',
] as const;

type NotificationToggleKey =
  | 'notify_overdue'
  | 'notify_upcoming_payment'
  | 'notify_upcoming_expense'
  | 'notify_low_cash'
  | 'notify_cash_risk'
  | 'notify_ai';

const NOTIFICATION_TOGGLES: { key: NotificationToggleKey; label: string }[] = [
  { key: 'notify_overdue', label: 'Overdue invoices' },
  { key: 'notify_upcoming_payment', label: 'Upcoming payments expected' },
  { key: 'notify_upcoming_expense', label: 'Upcoming expenses due' },
  { key: 'notify_low_cash', label: 'Low cash warnings' },
  { key: 'notify_cash_risk', label: 'Cash risk alerts' },
  { key: 'notify_ai', label: 'AI insights' },
];

const REMINDER_OPTIONS: { value: UserPreferences['reminder_days_before']; label: string }[] = [
  { value: 0, label: 'On due date' },
  { value: 1, label: '1 day before' },
  { value: 3, label: '3 days before' },
  { value: 7, label: '7 days before' },
];

const INVOICE_KEYS = [
  'invoice_prefix',
  'auto_numbering',
  'default_payment_terms_days',
  'default_invoice_notes',
  'show_logo_on_invoice',
  'show_business_details_on_invoice',
  'show_gst_on_invoice',
] as const;

const FINANCIAL_KEYS = [
  'low_cash_threshold',
  'min_cash_balance',
  'default_forecast_days',
  'expected_collection_delay_days',
] as const;

const INVOICE_PREFIX_PATTERN = /^[A-Za-z0-9-]{1,10}$/;
const MAX_INVOICE_NOTES = 500;
const MAX_EXPENSE_CATEGORIES = 30;
const MIN_PASSWORD_LENGTH = 8;
const EXPORT_PAGE_SIZE = 1000;

type CountTable = 'customers' | 'invoices' | 'payments' | 'expenses';

const DATA_TABLES: { id: CountTable; label: string }[] = [
  { id: 'customers', label: 'Customers' },
  { id: 'invoices', label: 'Invoices' },
  { id: 'payments', label: 'Payments' },
  { id: 'expenses', label: 'Expenses' },
];

interface CountState {
  loading: boolean;
  count: number | null;
  error: string | null;
}

interface CountResult {
  count: number | null;
  error: { message: string } | null;
}

interface RowsPage {
  data: unknown[] | null;
  error: { message: string } | null;
}

// Every query runs through the browser client; RLS limits rows to the signed-in user.
const COUNT_QUERIES: Record<CountTable, () => PromiseLike<CountResult>> = {
  customers: () => supabase.from('customers').select('id', { count: 'exact', head: true }),
  invoices: () => supabase.from('invoices').select('id', { count: 'exact', head: true }),
  payments: () => supabase.from('payments').select('id', { count: 'exact', head: true }),
  expenses: () => supabase.from('expenses').select('id', { count: 'exact', head: true }),
};

const EXPORT_QUERIES: Record<CountTable, (from: number, to: number) => PromiseLike<RowsPage>> = {
  customers: (from, to) => supabase.from('customers').select('*').order('id').range(from, to),
  invoices: (from, to) => supabase.from('invoices').select('*').order('id').range(from, to),
  payments: (from, to) => supabase.from('payments').select('*').order('id').range(from, to),
  expenses: (from, to) => supabase.from('expenses').select('*').order('id').range(from, to),
};

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const ACCEPTED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const PHONE_PATTERN = /^[0-9+ -]+$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const GSTIN_PATTERN = /^[0-9A-Z]{15}$/;

const inputStyle: CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: 'var(--space-2) var(--space-3)',
  border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-md)',
  font: 'inherit',
};

const labelStyle: CSSProperties = {
  display: 'block',
  fontWeight: 500,
  marginBottom: 'var(--space-1)',
};

const mutedStyle: CSSProperties = {
  color: 'var(--color-muted)',
  fontSize: 'var(--font-size-sm)',
  margin: 'var(--space-1) 0 0',
};

const messageStyle: CSSProperties = {
  fontSize: 'var(--font-size-sm)',
  margin: '0 0 var(--space-3)',
};

const errorTextStyle: CSSProperties = { ...messageStyle, color: '#991b1b' };
const successTextStyle: CSSProperties = { ...messageStyle, color: '#166534' };

const formStackStyle: CSSProperties = {
  display: 'grid',
  gap: 'var(--space-4)',
};

const twoColumnStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
  gap: 'var(--space-4)',
};

const avatarBoxStyle: CSSProperties = {
  width: 72,
  height: 72,
  borderRadius: '50%',
  overflow: 'hidden',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'var(--color-border)',
  fontWeight: 600,
  flexShrink: 0,
};

const logoBoxStyle: CSSProperties = {
  width: 120,
  height: 72,
  borderRadius: 'var(--radius-md)',
  overflow: 'hidden',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'var(--color-border)',
  flexShrink: 0,
};

const fillImageStyle: CSSProperties = { width: '100%', height: '100%', objectFit: 'cover' };

const rowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--space-4)',
  flexWrap: 'wrap',
};

const actionRowStyle: CSSProperties = {
  display: 'flex',
  gap: 'var(--space-2)',
  flexWrap: 'wrap',
};

const checkboxRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: 'var(--space-2)',
};

// Layout rules that need media queries cannot be expressed as inline styles.
const SETTINGS_CSS = `
.settings-layout { display: grid; grid-template-columns: minmax(180px, 220px) minmax(0, 1fr); gap: var(--space-6); align-items: start; }
.settings-nav-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--space-1); }
.settings-nav-button { width: 100%; text-align: left; background: none; border: 1px solid transparent; border-radius: var(--radius-md); padding: var(--space-2) var(--space-3); cursor: pointer; font: inherit; color: inherit; }
.settings-nav-button:hover { background: var(--color-border); }
.settings-nav-button:focus-visible { outline: 2px solid #1e3a8a; outline-offset: 2px; }
.settings-nav-button[aria-current='true'] { border-color: #1e3a8a; color: #1e3a8a; font-weight: 600; }
@media (max-width: 767px) {
  .settings-layout { grid-template-columns: minmax(0, 1fr); gap: var(--space-4); }
  .settings-nav-list { flex-direction: row; overflow-x: auto; padding-bottom: var(--space-1); }
  .settings-nav-list > li { flex: 0 0 auto; }
  .settings-nav-button { width: auto; white-space: nowrap; }
}
`;

function isEditable(id: SectionId): id is EditableSection {
  return (
    id === 'profile' ||
    id === 'business' ||
    id === 'appearance' ||
    id === 'notifications' ||
    id === 'invoice' ||
    id === 'financial'
  );
}

function errorMessage(err: unknown): string {
  return err instanceof Error && err.message !== '' ? err.message : 'Something went wrong. Please try again.';
}

function pickKeys<T, K extends keyof T>(source: T, keys: readonly K[]): Pick<T, K> {
  const out = {} as Pick<T, K>;
  for (const key of keys) {
    out[key] = source[key];
  }
  return out;
}

function sameFields<T>(a: T, b: T, keys: readonly (keyof T)[]): boolean {
  return keys.every((key) => a[key] === b[key]);
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter((part) => part !== '');
  if (parts.length === 0) {
    return '?';
  }
  const first = parts[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1] ?? '') : '';
  return (first.charAt(0) + last.charAt(0)).toUpperCase();
}

/** Sets data-theme (resolving 'system' via matchMedia) and data-density on the document root. */
function applyAppearance(prefs: Pick<UserPreferences, 'theme' | 'density'>): void {
  const root = document.documentElement;
  const resolved =
    prefs.theme === 'system'
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'
      : prefs.theme;
  root.dataset.theme = resolved;
  root.dataset.density = prefs.density;
}

function validateProfile(d: ProfileSettings): string | null {
  const name = d.full_name.trim();
  if (name.length < 1 || name.length > 100) {
    return 'Full name is required and must be 100 characters or fewer.';
  }
  const phone = d.phone.trim();
  if (phone.length > 20 || (phone !== '' && !PHONE_PATTERN.test(phone))) {
    return 'Phone may be up to 20 characters: digits, +, spaces and hyphens only.';
  }
  return null;
}

function normalizeBusiness(d: BusinessSettings): BusinessSettings {
  return {
    ...d,
    business_name: d.business_name.trim(),
    business_email: d.business_email.trim(),
    business_phone: d.business_phone.trim(),
    business_address: d.business_address.trim(),
    website_url: d.website_url.trim(),
    gstin: d.gstin.trim().toUpperCase(),
  };
}

function validateBusiness(d: BusinessSettings): string | null {
  const n = normalizeBusiness(d);
  if (n.business_name.length > 120) {
    return 'Business name must be 120 characters or fewer.';
  }
  if (n.business_email !== '' && !EMAIL_PATTERN.test(n.business_email)) {
    return 'Business email is not a valid email address.';
  }
  if (n.website_url !== '' && !/^https?:\/\/\S+$/.test(n.website_url)) {
    return 'Website must start with http:// or https://.';
  }
  if (n.gstin !== '' && !GSTIN_PATTERN.test(n.gstin)) {
    return 'GSTIN must be exactly 15 letters or digits.';
  }
  return null;
}

function validateImage(file: File): string | null {
  if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
    return 'Image must be a PNG, JPEG or WebP file.';
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return 'Image must be 2 MB or smaller.';
  }
  return null;
}

function numberValue(n: number): number | '' {
  return Number.isNaN(n) ? '' : n;
}

function parseNumberInput(raw: string): number {
  return raw.trim() === '' ? Number.NaN : Number(raw);
}

function validateInvoice(d: UserPreferences): string | null {
  if (!INVOICE_PREFIX_PATTERN.test(d.invoice_prefix.trim())) {
    return 'Invoice prefix must be 1-10 letters, digits or hyphens.';
  }
  if (!Number.isInteger(d.default_payment_terms_days) || d.default_payment_terms_days < 0 || d.default_payment_terms_days > 365) {
    return 'Default payment terms must be a whole number of days from 0 to 365.';
  }
  if (d.default_invoice_notes.length > MAX_INVOICE_NOTES) {
    return `Default invoice notes must be ${MAX_INVOICE_NOTES} characters or fewer.`;
  }
  return null;
}

function validateFinancial(d: UserPreferences): string | null {
  if (!Number.isFinite(d.low_cash_threshold) || d.low_cash_threshold < 0) {
    return 'Low cash threshold must be a number of zero or more.';
  }
  if (!Number.isFinite(d.min_cash_balance) || d.min_cash_balance < 0) {
    return 'Minimum cash balance must be a number of zero or more.';
  }
  if (
    !Number.isInteger(d.expected_collection_delay_days) ||
    d.expected_collection_delay_days < 0 ||
    d.expected_collection_delay_days > 180
  ) {
    return 'Assumed days late must be a whole number of days from 0 to 180.';
  }
  return null;
}

/** Splits the comma-separated category input. Empty input means no categories. */
function parseCategories(text: string): { categories: string[]; error: string | null } {
  if (text.trim() === '') {
    return { categories: [], error: null };
  }
  const parts = text.split(',').map((part) => part.trim());
  if (parts.some((part) => part === '')) {
    return { categories: [], error: 'Expense categories cannot be empty. Remove any extra commas.' };
  }
  if (new Set(parts).size !== parts.length) {
    return { categories: [], error: 'Expense categories must be unique.' };
  }
  if (parts.length > MAX_EXPENSE_CATEGORIES) {
    return { categories: [], error: `At most ${MAX_EXPENSE_CATEGORIES} expense categories are allowed.` };
  }
  return { categories: parts, error: null };
}

function csvCell(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  const text = typeof value === 'object' ? JSON.stringify(value) : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function buildCsv(rows: Record<string, unknown>[]): string {
  const headers: string[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (!seen.has(key)) {
        seen.add(key);
        headers.push(key);
      }
    }
  }
  const lines = [headers.map(csvCell).join(',')];
  for (const row of rows) {
    lines.push(headers.map((h) => csvCell(row[h])).join(','));
  }
  return lines.join('\r\n');
}

function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

interface FieldProps {
  id: string;
  label: string;
  hint?: string;
  children: ReactNode;
  fullWidth?: boolean;
}

function Field({ id, label, hint, children, fullWidth }: FieldProps) {
  return (
    <div style={fullWidth ? { gridColumn: '1 / -1' } : undefined}>
      <label htmlFor={id} style={labelStyle}>
        {label}
      </label>
      {children}
      {hint && <p style={mutedStyle}>{hint}</p>}
    </div>
  );
}

interface SaveBarProps {
  saving: boolean;
  dirty: boolean;
  loaded: boolean;
  message: string | null;
  error: string | null;
  onCancel: () => void;
}

function SaveBar({ saving, dirty, loaded, message, error, onCancel }: SaveBarProps) {
  return (
    <div>
      {error && (
        <p role="alert" style={errorTextStyle}>
          {error}
        </p>
      )}
      {!error && message && (
        <p role="status" style={successTextStyle}>
          {message}
        </p>
      )}
      {dirty && !saving && <p style={mutedStyle}>You have unsaved changes.</p>}
      <div style={actionRowStyle}>
        <Button type="submit" disabled={!loaded || !dirty || saving} aria-busy={saving}>
          {saving ? 'Saving…' : 'Save'}
        </Button>
        <Button variant="secondary" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function LoadingOrError({ status }: { status: SectionStatus }) {
  if (status.loading) {
    return <p style={mutedStyle}>Loading…</p>;
  }
  if (status.error) {
    return (
      <p role="alert" style={errorTextStyle}>
        {status.error}
      </p>
    );
  }
  return null;
}

export default function SettingsPage() {
  const [active, setActive] = useState<SectionId>('profile');
  const [status, setStatus] = useState<Record<EditableSection, SectionStatus>>({
    profile: INITIAL_STATUS,
    business: INITIAL_STATUS,
    appearance: INITIAL_STATUS,
    notifications: INITIAL_STATUS,
    invoice: INITIAL_STATUS,
    financial: INITIAL_STATUS,
  });

  const [savedProfile, setSavedProfile] = useState<ProfileSettings>({
    full_name: '',
    phone: '',
    email: '',
    avatar_path: null,
  });
  const [profileDraft, setProfileDraft] = useState<ProfileSettings>(savedProfile);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);

  const [savedBusiness, setSavedBusiness] = useState<BusinessSettings>({
    business_name: '',
    business_email: '',
    business_phone: '',
    business_address: '',
    website_url: '',
    gstin: '',
    logo_path: null,
  });
  const [businessDraft, setBusinessDraft] = useState<BusinessSettings>(savedBusiness);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [logoBusy, setLogoBusy] = useState(false);
  const [logoError, setLogoError] = useState<string | null>(null);

  const [savedPrefs, setSavedPrefs] = useState<UserPreferences>(DEFAULT_PREFERENCES);
  const [prefsDraft, setPrefsDraft] = useState<UserPreferences>(DEFAULT_PREFERENCES);
  // Expense categories are edited as one comma-separated string and parsed on save.
  const [categoriesText, setCategoriesText] = useState('');

  const [account, setAccount] = useState<{ email: string; lastSignIn: string | null } | null>(null);
  const [accountError, setAccountError] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);

  const [counts, setCounts] = useState<Record<CountTable, CountState>>({
    customers: { loading: true, count: null, error: null },
    invoices: { loading: true, count: null, error: null },
    payments: { loading: true, count: null, error: null },
    expenses: { loading: true, count: null, error: null },
  });
  const [exporting, setExporting] = useState<CountTable | null>(null);
  const [exportMessage, setExportMessage] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  const savedCategoriesText = savedPrefs.expense_categories.join(', ');

  const dirty: Record<SectionId, boolean> = {
    profile: !sameFields(profileDraft, savedProfile, [...PROFILE_KEYS]),
    business: !sameFields(businessDraft, savedBusiness, [...BUSINESS_KEYS]),
    appearance: !sameFields(prefsDraft, savedPrefs, [...APPEARANCE_KEYS]),
    notifications: !sameFields(prefsDraft, savedPrefs, [...NOTIFICATION_KEYS]),
    invoice: !sameFields(prefsDraft, savedPrefs, [...INVOICE_KEYS]),
    financial:
      !sameFields(prefsDraft, savedPrefs, [...FINANCIAL_KEYS]) || categoriesText !== savedCategoriesText,
    security: false,
    data: false,
  };
  const anyDirty = Object.values(dirty).some(Boolean);

  function patchStatus(id: EditableSection, patch: Partial<SectionStatus>) {
    setStatus((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  }

  // Loaders. Each one reads from the server and replaces the section's saved and draft values.
  async function loadProfileSection() {
    patchStatus('profile', { loading: true, loaded: false, error: null, message: null });
    try {
      const p = await getProfile();
      setSavedProfile(p);
      setProfileDraft(p);
      patchStatus('profile', { loaded: true });
    } catch (err) {
      patchStatus('profile', { error: errorMessage(err) });
    } finally {
      patchStatus('profile', { loading: false });
    }
  }

  async function loadBusinessSection() {
    patchStatus('business', { loading: true, loaded: false, error: null, message: null });
    try {
      const b = await getBusinessSettings();
      setSavedBusiness(b);
      setBusinessDraft(b);
      patchStatus('business', { loaded: true });
    } catch (err) {
      patchStatus('business', { error: errorMessage(err) });
    } finally {
      patchStatus('business', { loading: false });
    }
  }

  async function loadPreferencesSections() {
    const prefSections = ['appearance', 'notifications', 'invoice', 'financial'] as const;
    for (const id of prefSections) {
      patchStatus(id, { loading: true, loaded: false, error: null, message: null });
    }
    try {
      const p = await getPreferences();
      setSavedPrefs(p);
      setPrefsDraft(p);
      setCategoriesText(p.expense_categories.join(', '));
      applyAppearance(p);
      for (const id of prefSections) {
        patchStatus(id, { loaded: true });
      }
    } catch (err) {
      for (const id of prefSections) {
        patchStatus(id, { error: errorMessage(err) });
      }
    } finally {
      for (const id of prefSections) {
        patchStatus(id, { loading: false });
      }
    }
  }

  async function loadCounts() {
    setCounts({
      customers: { loading: true, count: null, error: null },
      invoices: { loading: true, count: null, error: null },
      payments: { loading: true, count: null, error: null },
      expenses: { loading: true, count: null, error: null },
    });
    await Promise.all(
      DATA_TABLES.map(async (table) => {
        try {
          const { count, error } = await COUNT_QUERIES[table.id]();
          if (error) {
            throw new Error(error.message || 'Could not load the count.');
          }
          setCounts((prev) => ({ ...prev, [table.id]: { loading: false, count: count ?? 0, error: null } }));
        } catch (err) {
          setCounts((prev) => ({ ...prev, [table.id]: { loading: false, count: null, error: errorMessage(err) } }));
        }
      }),
    );
  }

  useEffect(() => {
    void loadProfileSection();
    void loadBusinessSection();
    void loadPreferencesSections();
    void loadCounts();
    // Loaders run once on mount; later reloads come from the Cancel buttons.
  }, []);

  // Signed-in account details for the Security section.
  useEffect(() => {
    let cancelled = false;
    async function loadAccount() {
      try {
        const { data, error } = await supabase.auth.getUser();
        if (cancelled) return;
        if (error || !data.user) {
          setAccountError(error?.message || 'Could not load your session.');
          return;
        }
        setAccount({ email: data.user.email ?? '', lastSignIn: data.user.last_sign_in_at ?? null });
      } catch (err) {
        if (!cancelled) setAccountError(errorMessage(err));
      }
    }
    void loadAccount();
    return () => {
      cancelled = true;
    };
  }, []);

  // Signed URLs for the stored avatar and logo.
  useEffect(() => {
    let cancelled = false;
    getAssetUrl(savedProfile.avatar_path)
      .then((url) => {
        if (!cancelled) setAvatarUrl(url);
      })
      .catch(() => {
        if (!cancelled) setAvatarUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [savedProfile.avatar_path]);

  useEffect(() => {
    let cancelled = false;
    getAssetUrl(savedBusiness.logo_path)
      .then((url) => {
        if (!cancelled) setLogoUrl(url);
      })
      .catch(() => {
        if (!cancelled) setLogoUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [savedBusiness.logo_path]);

  // Warn before the tab closes or reloads while edits are unsaved.
  useEffect(() => {
    if (!anyDirty) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [anyDirty]);

  function discardSection(id: SectionId) {
    if (id === 'profile') {
      setProfileDraft(savedProfile);
    } else if (id === 'business') {
      setBusinessDraft(savedBusiness);
    } else if (id === 'appearance') {
      setPrefsDraft((d) => ({ ...d, ...pickKeys(savedPrefs, [...APPEARANCE_KEYS]) }));
    } else if (id === 'notifications') {
      setPrefsDraft((d) => ({ ...d, ...pickKeys(savedPrefs, [...NOTIFICATION_KEYS]) }));
    } else if (id === 'invoice') {
      setPrefsDraft((d) => ({ ...d, ...pickKeys(savedPrefs, [...INVOICE_KEYS]) }));
    } else if (id === 'financial') {
      setPrefsDraft((d) => ({ ...d, ...pickKeys(savedPrefs, [...FINANCIAL_KEYS]) }));
      setCategoriesText(savedCategoriesText);
    }
  }

  function selectSection(next: SectionId) {
    if (next === active) return;
    if (dirty[active]) {
      const leave = window.confirm('You have unsaved changes in this section. Leave without saving?');
      if (!leave) return;
      discardSection(active);
      if (isEditable(active)) {
        patchStatus(active, { message: null, error: null });
      }
    }
    setActive(next);
  }

  // ----- Profile -----

  async function handleProfileSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const problem = validateProfile(profileDraft);
    if (problem) {
      patchStatus('profile', { error: problem, message: null });
      return;
    }
    const name = profileDraft.full_name.trim();
    const phone = profileDraft.phone.trim();
    patchStatus('profile', { saving: true, error: null, message: null });
    try {
      await saveProfile({ full_name: name, phone });
      setSavedProfile((s) => ({ ...s, full_name: name, phone }));
      setProfileDraft((d) => ({ ...d, full_name: name, phone }));
      patchStatus('profile', { message: 'Profile saved.' });
    } catch (err) {
      patchStatus('profile', { error: errorMessage(err) });
    } finally {
      patchStatus('profile', { saving: false });
    }
  }

  async function handleAvatarChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const problem = validateImage(file);
    if (problem) {
      setAvatarError(problem);
      return;
    }
    setAvatarError(null);
    setAvatarBusy(true);
    try {
      const path = await uploadUserAsset('avatar', file);
      const userId = await getCurrentUserId();
      const { error } = await supabase.from('profiles').update({ avatar_path: path }).eq('id', userId);
      if (error) {
        throw new Error(error.message || 'Could not save the avatar.');
      }
      setSavedProfile((s) => ({ ...s, avatar_path: path }));
    } catch (err) {
      setAvatarError(errorMessage(err));
    } finally {
      setAvatarBusy(false);
    }
  }

  // ----- Business -----

  async function handleBusinessSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const problem = validateBusiness(businessDraft);
    if (problem) {
      patchStatus('business', { error: problem, message: null });
      return;
    }
    const clean = normalizeBusiness(businessDraft);
    patchStatus('business', { saving: true, error: null, message: null });
    try {
      // Logo is stored separately by handleLogoChange, so logo_path is passed as null here.
      await saveBusinessSettings({ ...clean, logo_path: null });
      setSavedBusiness((s) => ({ ...clean, logo_path: s.logo_path }));
      setBusinessDraft((d) => ({ ...clean, logo_path: d.logo_path }));
      patchStatus('business', { message: 'Business information saved.' });
    } catch (err) {
      patchStatus('business', { error: errorMessage(err) });
    } finally {
      patchStatus('business', { saving: false });
    }
  }

  async function handleLogoChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const problem = validateImage(file);
    if (problem) {
      setLogoError(problem);
      return;
    }
    setLogoError(null);
    setLogoBusy(true);
    try {
      const path = await uploadUserAsset('logo', file);
      const userId = await getCurrentUserId();
      const { data, error } = await supabase
        .from('business_settings')
        .update({ logo_path: path })
        .eq('user_id', userId)
        .select('user_id');
      if (error) {
        throw new Error(error.message || 'Could not save the logo.');
      }
      if (!data || data.length === 0) {
        throw new Error('Save your business information first, then upload a logo.');
      }
      setSavedBusiness((s) => ({ ...s, logo_path: path }));
      setBusinessDraft((d) => ({ ...d, logo_path: path }));
    } catch (err) {
      setLogoError(errorMessage(err));
    } finally {
      setLogoBusy(false);
    }
  }

  // ----- Preferences (appearance and notifications share one saved object) -----

  function updatePrefs<K extends keyof UserPreferences>(key: K, value: UserPreferences[K]) {
    setPrefsDraft((d) => ({ ...d, [key]: value }));
  }

  async function savePrefsSection(
    id: 'appearance' | 'notifications',
    patch: Partial<UserPreferences>,
    successText: string,
  ) {
    patchStatus(id, { saving: true, error: null, message: null });
    try {
      await savePreferences(patch);
      setSavedPrefs((s) => ({ ...s, ...patch }));
      if (id === 'appearance') {
        applyAppearance({ theme: prefsDraft.theme, density: prefsDraft.density });
      }
      patchStatus(id, { message: successText });
    } catch (err) {
      patchStatus(id, { error: errorMessage(err) });
    } finally {
      patchStatus(id, { saving: false });
    }
  }

  function handleAppearanceSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void savePrefsSection('appearance', pickKeys(prefsDraft, [...APPEARANCE_KEYS]), 'Appearance saved.');
  }

  function handleNotificationsSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void savePrefsSection(
      'notifications',
      pickKeys(prefsDraft, [...NOTIFICATION_KEYS]),
      'Notification settings saved.',
    );
  }

  // ----- Invoice and financial (saved through savePreferences) -----

  async function savePrefsPatch(
    id: 'invoice' | 'financial',
    patch: Partial<UserPreferences>,
    successText: string,
  ) {
    patchStatus(id, { saving: true, error: null, message: null });
    try {
      await savePreferences(patch);
      setSavedPrefs((s) => ({ ...s, ...patch }));
      setPrefsDraft((d) => ({ ...d, ...patch }));
      if (patch.expense_categories) {
        setCategoriesText(patch.expense_categories.join(', '));
      }
      patchStatus(id, { message: successText });
    } catch (err) {
      patchStatus(id, { error: errorMessage(err) });
    } finally {
      patchStatus(id, { saving: false });
    }
  }

  function handleInvoiceSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const problem = validateInvoice(prefsDraft);
    if (problem) {
      patchStatus('invoice', { error: problem, message: null });
      return;
    }
    const patch: Partial<UserPreferences> = {
      ...pickKeys(prefsDraft, [...INVOICE_KEYS]),
      invoice_prefix: prefsDraft.invoice_prefix.trim(),
    };
    void savePrefsPatch('invoice', patch, 'Invoice settings saved.');
  }

  function handleFinancialSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const problem = validateFinancial(prefsDraft);
    if (problem) {
      patchStatus('financial', { error: problem, message: null });
      return;
    }
    const parsed = parseCategories(categoriesText);
    if (parsed.error) {
      patchStatus('financial', { error: parsed.error, message: null });
      return;
    }
    const patch: Partial<UserPreferences> = {
      ...pickKeys(prefsDraft, [...FINANCIAL_KEYS]),
      expense_categories: parsed.categories,
    };
    void savePrefsPatch('financial', patch, 'Financial preferences saved.');
  }

  // ----- Security -----

  async function handlePasswordSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPasswordMessage(null);
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      setPasswordError(`New password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('The two passwords do not match.');
      return;
    }
    setPasswordBusy(true);
    setPasswordError(null);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) {
        setPasswordError(error.message || 'Could not change the password.');
        return;
      }
      setNewPassword('');
      setConfirmPassword('');
      setPasswordMessage('Password changed.');
    } catch (err) {
      setPasswordError(errorMessage(err));
    } finally {
      setPasswordBusy(false);
    }
  }

  async function handleSignOut() {
    setSigningOut(true);
    setSignOutError(null);
    try {
      const { error } = await supabase.auth.signOut();
      if (error) {
        setSignOutError(error.message || 'Could not sign out.');
        return;
      }
      window.location.href = '/login';
    } catch (err) {
      setSignOutError(errorMessage(err));
    } finally {
      setSigningOut(false);
    }
  }

  // ----- Data management (CSV export only; nothing is deleted here) -----

  async function fetchAllRows(table: CountTable): Promise<Record<string, unknown>[]> {
    const rows: Record<string, unknown>[] = [];
    let from = 0;
    let more = true;
    while (more) {
      const { data, error } = await EXPORT_QUERIES[table](from, from + EXPORT_PAGE_SIZE - 1);
      if (error) {
        throw new Error(error.message || 'Could not load the rows.');
      }
      const page = (data ?? []) as Record<string, unknown>[];
      rows.push(...page);
      more = page.length === EXPORT_PAGE_SIZE;
      from += EXPORT_PAGE_SIZE;
    }
    return rows;
  }

  async function handleExport(table: CountTable, label: string) {
    setExporting(table);
    setExportError(null);
    setExportMessage(null);
    try {
      const rows = await fetchAllRows(table);
      if (rows.length === 0) {
        setExportMessage(`No ${label.toLowerCase()} to export.`);
        return;
      }
      const stamp = new Date().toISOString().slice(0, 10);
      downloadCsv(`${table}-${stamp}.csv`, buildCsv(rows));
      setExportMessage(`Exported ${rows.length} ${label.toLowerCase()}.`);
    } catch (err) {
      setExportError(errorMessage(err));
    } finally {
      setExporting(null);
    }
  }

  // ----- Render -----

  function renderProfile() {
    const status_ = status.profile;
    return (
      <Card title="Profile">
        <LoadingOrError status={status_} />
        {status_.loaded && (
          <form onSubmit={handleProfileSubmit} style={formStackStyle} noValidate>
            <div style={rowStyle}>
              <div style={avatarBoxStyle} aria-label="Current avatar">
                {avatarUrl ? (
                  <img src={avatarUrl} alt="Your avatar" style={fillImageStyle} />
                ) : (
                  <span>{initialsOf(savedProfile.full_name)}</span>
                )}
              </div>
              <div>
                <label htmlFor="avatar-input" style={labelStyle}>
                  Avatar
                </label>
                <input
                  id="avatar-input"
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={handleAvatarChange}
                  disabled={avatarBusy}
                />
                <p style={mutedStyle}>PNG, JPEG or WebP, up to 2 MB. The new image is saved as soon as it uploads.</p>
                {avatarBusy && <p style={mutedStyle}>Uploading…</p>}
                {avatarError && (
                  <p role="alert" style={errorTextStyle}>
                    {avatarError}
                  </p>
                )}
              </div>
            </div>
            <div style={twoColumnStyle}>
              <Field id="profile-name" label="Full name (required)">
                <input
                  id="profile-name"
                  type="text"
                  required
                  maxLength={100}
                  style={inputStyle}
                  value={profileDraft.full_name}
                  onChange={(e) => setProfileDraft((d) => ({ ...d, full_name: e.target.value }))}
                />
              </Field>
              <Field id="profile-phone" label="Phone (optional)">
                <input
                  id="profile-phone"
                  type="tel"
                  maxLength={20}
                  style={inputStyle}
                  value={profileDraft.phone}
                  onChange={(e) => setProfileDraft((d) => ({ ...d, phone: e.target.value }))}
                />
              </Field>
              <Field
                id="profile-email"
                label="Email"
                hint="Your sign-in email is managed through Supabase verification and cannot be changed here."
                fullWidth
              >
                <input
                  id="profile-email"
                  type="email"
                  readOnly
                  style={{ ...inputStyle, background: 'var(--color-border)' }}
                  value={savedProfile.email}
                />
              </Field>
            </div>
            <SaveBar
              saving={status_.saving}
              dirty={dirty.profile}
              loaded={status_.loaded}
              message={status_.message}
              error={status_.error}
              onCancel={() => void loadProfileSection()}
            />
          </form>
        )}
      </Card>
    );
  }

  function renderBusiness() {
    const status_ = status.business;
    return (
      <Card title="Business information">
        <LoadingOrError status={status_} />
        {status_.loaded && (
          <div style={formStackStyle}>
            <div style={rowStyle}>
              <div style={logoBoxStyle}>
                {logoUrl ? (
                  <img src={logoUrl} alt="Business logo" style={fillImageStyle} />
                ) : (
                  <span style={mutedStyle}>No logo</span>
                )}
              </div>
              <div>
                <label htmlFor="logo-input" style={labelStyle}>
                  Logo
                </label>
                <input
                  id="logo-input"
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={handleLogoChange}
                  disabled={logoBusy}
                />
                <p style={mutedStyle}>PNG, JPEG or WebP, up to 2 MB. Save business information first.</p>
                {logoBusy && <p style={mutedStyle}>Uploading…</p>}
                {logoError && (
                  <p role="alert" style={errorTextStyle}>
                    {logoError}
                  </p>
                )}
              </div>
            </div>
            <form onSubmit={handleBusinessSubmit} style={formStackStyle} noValidate>
              <div style={twoColumnStyle}>
                <Field id="biz-name" label="Business name">
                  <input
                    id="biz-name"
                    type="text"
                    maxLength={120}
                    style={inputStyle}
                    value={businessDraft.business_name}
                    onChange={(e) => setBusinessDraft((d) => ({ ...d, business_name: e.target.value }))}
                  />
                </Field>
                <Field id="biz-email" label="Business email">
                  <input
                    id="biz-email"
                    type="email"
                    style={inputStyle}
                    value={businessDraft.business_email}
                    onChange={(e) => setBusinessDraft((d) => ({ ...d, business_email: e.target.value }))}
                  />
                </Field>
                <Field id="biz-phone" label="Business phone">
                  <input
                    id="biz-phone"
                    type="tel"
                    style={inputStyle}
                    value={businessDraft.business_phone}
                    onChange={(e) => setBusinessDraft((d) => ({ ...d, business_phone: e.target.value }))}
                  />
                </Field>
                <Field id="biz-website" label="Website URL">
                  <input
                    id="biz-website"
                    type="url"
                    placeholder="https://example.com"
                    style={inputStyle}
                    value={businessDraft.website_url}
                    onChange={(e) => setBusinessDraft((d) => ({ ...d, website_url: e.target.value }))}
                  />
                </Field>
                <Field id="biz-gstin" label="GSTIN (optional)" hint="15 letters or digits.">
                  <input
                    id="biz-gstin"
                    type="text"
                    maxLength={15}
                    style={inputStyle}
                    value={businessDraft.gstin}
                    onChange={(e) => setBusinessDraft((d) => ({ ...d, gstin: e.target.value }))}
                  />
                </Field>
                <Field id="biz-address" label="Business address" fullWidth>
                  <textarea
                    id="biz-address"
                    rows={3}
                    style={inputStyle}
                    value={businessDraft.business_address}
                    onChange={(e) => setBusinessDraft((d) => ({ ...d, business_address: e.target.value }))}
                  />
                </Field>
              </div>
              <SaveBar
                saving={status_.saving}
                dirty={dirty.business}
                loaded={status_.loaded}
                message={status_.message}
                error={status_.error}
                onCancel={() => void loadBusinessSection()}
              />
            </form>
          </div>
        )}
      </Card>
    );
  }

  function renderAppearance() {
    const status_ = status.appearance;
    return (
      <Card title="Appearance">
        <LoadingOrError status={status_} />
        {status_.loaded && (
          <form onSubmit={handleAppearanceSubmit} style={formStackStyle} noValidate>
            <div style={twoColumnStyle}>
              <Field
                id="pref-theme"
                label="Theme"
                hint="The dark palette is not styled yet. The theme setting is applied to the page now; dark visual styles come in a later step."
              >
                <select
                  id="pref-theme"
                  style={inputStyle}
                  value={prefsDraft.theme}
                  onChange={(e) => updatePrefs('theme', e.target.value as UserPreferences['theme'])}
                >
                  <option value="light">Light</option>
                  <option value="dark">Dark</option>
                  <option value="system">System</option>
                </select>
              </Field>
              <Field id="pref-density" label="Density">
                <select
                  id="pref-density"
                  style={inputStyle}
                  value={prefsDraft.density}
                  onChange={(e) => updatePrefs('density', e.target.value as UserPreferences['density'])}
                >
                  <option value="comfortable">Comfortable</option>
                  <option value="compact">Compact</option>
                </select>
              </Field>
            </div>
            <div style={checkboxRowStyle}>
              <input
                id="pref-sidebar"
                type="checkbox"
                checked={prefsDraft.sidebar_collapsed}
                onChange={(e) => updatePrefs('sidebar_collapsed', e.target.checked)}
              />
              <label htmlFor="pref-sidebar">Sidebar collapsed</label>
            </div>
            <SaveBar
              saving={status_.saving}
              dirty={dirty.appearance}
              loaded={status_.loaded}
              message={status_.message}
              error={status_.error}
              onCancel={() => void loadPreferencesSections()}
            />
          </form>
        )}
      </Card>
    );
  }

  function renderNotifications() {
    const status_ = status.notifications;
    return (
      <Card title="Notifications">
        <LoadingOrError status={status_} />
        {status_.loaded && (
          <form onSubmit={handleNotificationsSubmit} style={formStackStyle} noValidate>
            <div style={formStackStyle}>
              {NOTIFICATION_TOGGLES.map((toggle) => (
                <div key={toggle.key} style={checkboxRowStyle}>
                  <input
                    id={`notify-${toggle.key}`}
                    type="checkbox"
                    checked={prefsDraft[toggle.key]}
                    onChange={(e) => updatePrefs(toggle.key, e.target.checked)}
                  />
                  <label htmlFor={`notify-${toggle.key}`}>{toggle.label}</label>
                </div>
              ))}
            </div>
            <Field id="pref-reminder" label="Reminder timing">
              <select
                id="pref-reminder"
                style={inputStyle}
                value={prefsDraft.reminder_days_before}
                onChange={(e) => {
                  const value = Number(e.target.value);
                  const option = REMINDER_OPTIONS.find((o) => o.value === value);
                  if (option) updatePrefs('reminder_days_before', option.value);
                }}
              >
                {REMINDER_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </Field>
            <p style={mutedStyle}>
              Notifications appear inside the app. Email, WhatsApp and push delivery are not set up yet.
            </p>
            <SaveBar
              saving={status_.saving}
              dirty={dirty.notifications}
              loaded={status_.loaded}
              message={status_.message}
              error={status_.error}
              onCancel={() => void loadPreferencesSections()}
            />
          </form>
        )}
      </Card>
    );
  }

  function cancelPrefsSection(id: 'invoice' | 'financial') {
    discardSection(id);
    patchStatus(id, { message: null, error: null });
  }

  function renderInvoice() {
    const status_ = status.invoice;
    return (
      <Card title="Invoice settings">
        <LoadingOrError status={status_} />
        {status_.loaded && (
          <form onSubmit={handleInvoiceSubmit} style={formStackStyle} noValidate>
            <p style={mutedStyle}>
              These settings apply to invoices created from now on. Existing invoices are never changed.
            </p>
            <div style={twoColumnStyle}>
              <Field id="inv-prefix" label="Invoice prefix" hint="1-10 letters, digits or hyphens. Example: INV">
                <input
                  id="inv-prefix"
                  type="text"
                  maxLength={10}
                  style={inputStyle}
                  value={prefsDraft.invoice_prefix}
                  onChange={(e) => updatePrefs('invoice_prefix', e.target.value)}
                />
              </Field>
              <Field id="inv-terms" label="Default payment terms (days)" hint="0 to 365 days.">
                <input
                  id="inv-terms"
                  type="number"
                  min={0}
                  max={365}
                  step={1}
                  style={inputStyle}
                  value={numberValue(prefsDraft.default_payment_terms_days)}
                  onChange={(e) => updatePrefs('default_payment_terms_days', parseNumberInput(e.target.value))}
                />
              </Field>
              <Field id="inv-currency" label="Currency" hint="Invoices are issued in Indian rupees.">
                <input
                  id="inv-currency"
                  type="text"
                  readOnly
                  style={{ ...inputStyle, background: 'var(--color-border)' }}
                  value="INR (₹)"
                />
              </Field>
              <Field
                id="inv-notes"
                label="Default invoice notes"
                hint={`${prefsDraft.default_invoice_notes.length} / ${MAX_INVOICE_NOTES} characters`}
                fullWidth
              >
                <textarea
                  id="inv-notes"
                  rows={3}
                  maxLength={MAX_INVOICE_NOTES}
                  style={inputStyle}
                  value={prefsDraft.default_invoice_notes}
                  onChange={(e) => updatePrefs('default_invoice_notes', e.target.value)}
                />
              </Field>
            </div>
            <div style={formStackStyle}>
              <div style={checkboxRowStyle}>
                <input
                  id="inv-auto-numbering"
                  type="checkbox"
                  checked={prefsDraft.auto_numbering}
                  onChange={(e) => updatePrefs('auto_numbering', e.target.checked)}
                />
                <label htmlFor="inv-auto-numbering">Number invoices automatically</label>
              </div>
              <div style={checkboxRowStyle}>
                <input
                  id="inv-show-logo"
                  type="checkbox"
                  checked={prefsDraft.show_logo_on_invoice}
                  onChange={(e) => updatePrefs('show_logo_on_invoice', e.target.checked)}
                />
                <label htmlFor="inv-show-logo">Show logo on invoice</label>
              </div>
              <div style={checkboxRowStyle}>
                <input
                  id="inv-show-business"
                  type="checkbox"
                  checked={prefsDraft.show_business_details_on_invoice}
                  onChange={(e) => updatePrefs('show_business_details_on_invoice', e.target.checked)}
                />
                <label htmlFor="inv-show-business">Show business details on invoice</label>
              </div>
              <div style={checkboxRowStyle}>
                <input
                  id="inv-show-gst"
                  type="checkbox"
                  checked={prefsDraft.show_gst_on_invoice}
                  onChange={(e) => updatePrefs('show_gst_on_invoice', e.target.checked)}
                />
                <label htmlFor="inv-show-gst">Show GST number on invoice</label>
              </div>
            </div>
            <SaveBar
              saving={status_.saving}
              dirty={dirty.invoice}
              loaded={status_.loaded}
              message={status_.message}
              error={status_.error}
              onCancel={() => cancelPrefsSection('invoice')}
            />
          </form>
        )}
      </Card>
    );
  }

  function renderFinancial() {
    const status_ = status.financial;
    return (
      <Card title="Financial preferences">
        <LoadingOrError status={status_} />
        {status_.loaded && (
          <form onSubmit={handleFinancialSubmit} style={formStackStyle} noValidate>
            <p style={mutedStyle}>
              Confirmed cash is recorded payments. Estimated cash is outstanding invoices expected on their due dates.
              These preferences do not change recorded records.
            </p>
            <div style={twoColumnStyle}>
              <Field
                id="fin-low-cash"
                label="Low cash threshold (₹)"
                hint={`Currently ${formatCurrency(prefsDraft.low_cash_threshold)}`}
              >
                <input
                  id="fin-low-cash"
                  type="number"
                  min={0}
                  step="any"
                  style={inputStyle}
                  value={numberValue(prefsDraft.low_cash_threshold)}
                  onChange={(e) => updatePrefs('low_cash_threshold', parseNumberInput(e.target.value))}
                />
              </Field>
              <Field
                id="fin-min-cash"
                label="Minimum cash balance (₹)"
                hint={`Currently ${formatCurrency(prefsDraft.min_cash_balance)}`}
              >
                <input
                  id="fin-min-cash"
                  type="number"
                  min={0}
                  step="any"
                  style={inputStyle}
                  value={numberValue(prefsDraft.min_cash_balance)}
                  onChange={(e) => updatePrefs('min_cash_balance', parseNumberInput(e.target.value))}
                />
              </Field>
              <Field id="fin-forecast" label="Default forecast period">
                <select
                  id="fin-forecast"
                  style={inputStyle}
                  value={prefsDraft.default_forecast_days}
                  onChange={(e) => {
                    const value = Number(e.target.value);
                    if (value === 30 || value === 60 || value === 90) updatePrefs('default_forecast_days', value);
                  }}
                >
                  <option value={30}>30 days</option>
                  <option value={60}>60 days</option>
                  <option value={90}>90 days</option>
                </select>
              </Field>
              <Field
                id="fin-delay"
                label="Assumed days late for customer payments; used by the forecast only when you apply it"
              >
                <input
                  id="fin-delay"
                  type="number"
                  min={0}
                  max={180}
                  step={1}
                  style={inputStyle}
                  value={numberValue(prefsDraft.expected_collection_delay_days)}
                  onChange={(e) => updatePrefs('expected_collection_delay_days', parseNumberInput(e.target.value))}
                />
              </Field>
              <Field
                id="fin-categories"
                label="Expense categories"
                hint={`Comma-separated. Unique, non-empty, up to ${MAX_EXPENSE_CATEGORIES} categories.`}
                fullWidth
              >
                <input
                  id="fin-categories"
                  type="text"
                  style={inputStyle}
                  value={categoriesText}
                  onChange={(e) => setCategoriesText(e.target.value)}
                />
              </Field>
            </div>
            <SaveBar
              saving={status_.saving}
              dirty={dirty.financial}
              loaded={status_.loaded}
              message={status_.message}
              error={status_.error}
              onCancel={() => cancelPrefsSection('financial')}
            />
          </form>
        )}
      </Card>
    );
  }

  function renderSecurity() {
    return (
      <div style={formStackStyle}>
        <Card title="Security & password">
          <div style={formStackStyle}>
            <div>
              <h3 style={{ ...labelStyle, margin: '0 0 var(--space-1)' }}>Session</h3>
              {accountError && (
                <p role="alert" style={errorTextStyle}>
                  {accountError}
                </p>
              )}
              {!accountError && !account && <p style={mutedStyle}>Loading…</p>}
              {account && (
                <>
                  <p style={{ margin: 0 }}>Signed in as {account.email || 'unknown email'}</p>
                  <p style={mutedStyle}>
                    Last sign-in:{' '}
                    {account.lastSignIn ? new Date(account.lastSignIn).toLocaleString('en-IN') : 'Not available'}
                  </p>
                </>
              )}
            </div>

            <form onSubmit={handlePasswordSubmit} style={formStackStyle} noValidate>
              <h3 style={{ ...labelStyle, margin: 0 }}>Change password</h3>
              <div style={twoColumnStyle}>
                <Field id="pw-new" label={`New password (at least ${MIN_PASSWORD_LENGTH} characters)`}>
                  <input
                    id="pw-new"
                    type="password"
                    autoComplete="new-password"
                    style={inputStyle}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                  />
                </Field>
                <Field id="pw-confirm" label="Confirm new password">
                  <input
                    id="pw-confirm"
                    type="password"
                    autoComplete="new-password"
                    style={inputStyle}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                  />
                </Field>
              </div>
              {passwordError && (
                <p role="alert" style={errorTextStyle}>
                  {passwordError}
                </p>
              )}
              {!passwordError && passwordMessage && (
                <p role="status" style={successTextStyle}>
                  {passwordMessage}
                </p>
              )}
              <div>
                <Button type="submit" disabled={passwordBusy} aria-busy={passwordBusy}>
                  {passwordBusy ? 'Updating…' : 'Update password'}
                </Button>
              </div>
            </form>

            <div>
              <h3 style={{ ...labelStyle, margin: '0 0 var(--space-1)' }}>Sign out</h3>
              {signOutError && (
                <p role="alert" style={errorTextStyle}>
                  {signOutError}
                </p>
              )}
              <Button variant="secondary" onClick={() => void handleSignOut()} disabled={signingOut}>
                {signingOut ? 'Signing out…' : 'Sign out'}
              </Button>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  function renderData() {
    return (
      <div style={formStackStyle}>
        <Card title="Data management">
          <div style={formStackStyle}>
            <div>
              <div style={actionRowStyle}>
                <h3 style={{ ...labelStyle, margin: 0 }}>Record counts</h3>
                <Button variant="secondary" onClick={() => void loadCounts()}>
                  Refresh counts
                </Button>
              </div>
              <div style={{ ...twoColumnStyle, marginTop: 'var(--space-2)' }}>
                {DATA_TABLES.map((table) => {
                  const c = counts[table.id];
                  return (
                    <div key={table.id} style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: 'var(--space-3)' }}>
                      <div style={mutedStyle}>{table.label}</div>
                      {c.loading && <p style={{ margin: 0 }}>Loading…</p>}
                      {!c.loading && c.error && (
                        <p role="alert" style={{ ...errorTextStyle, margin: 0 }}>
                          {c.error}
                        </p>
                      )}
                      {!c.loading && !c.error && (
                        <p style={{ margin: 0, fontSize: 'var(--font-size-lg)', fontWeight: 600 }}>
                          {c.count ?? 0}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div>
              <h3 style={{ ...labelStyle, margin: '0 0 var(--space-1)' }}>Export to CSV</h3>
              <p style={mutedStyle}>Downloads every row you can see. Exporting never changes your data.</p>
              <div style={{ ...actionRowStyle, marginTop: 'var(--space-2)' }}>
                {DATA_TABLES.map((table) => (
                  <Button
                    key={table.id}
                    variant="secondary"
                    disabled={exporting !== null}
                    aria-busy={exporting === table.id}
                    onClick={() => void handleExport(table.id, table.label)}
                  >
                    {exporting === table.id ? 'Exporting…' : `Export ${table.label.toLowerCase()}`}
                  </Button>
                ))}
              </div>
              {exportError && (
                <p role="alert" style={{ ...errorTextStyle, marginTop: 'var(--space-2)' }}>
                  {exportError}
                </p>
              )}
              {!exportError && exportMessage && (
                <p role="status" style={{ ...successTextStyle, marginTop: 'var(--space-2)' }}>
                  {exportMessage}
                </p>
              )}
            </div>
          </div>
        </Card>

        <Card title="Account deletion">
          <p style={mutedStyle}>
            Deleting your account needs a secure server-side step that is not set up yet. Contact support or ask for
            this to be implemented.
          </p>
        </Card>
      </div>
    );
  }

  function renderActive() {
    switch (active) {
      case 'profile':
        return renderProfile();
      case 'business':
        return renderBusiness();
      case 'appearance':
        return renderAppearance();
      case 'notifications':
        return renderNotifications();
      case 'invoice':
        return renderInvoice();
      case 'financial':
        return renderFinancial();
      case 'security':
        return renderSecurity();
      case 'data':
        return renderData();
      default:
        return null;
    }
  }

  return (
    <div>
      <style>{SETTINGS_CSS}</style>
      <div className="ui-page-header">
        <PageHeader title="Settings" description="Manage your business profile and preferences." />
      </div>
      <div className="settings-layout">
        <nav aria-label="Settings sections">
          <ul className="settings-nav-list">
            {SECTIONS.map((section) => (
              <li key={section.id}>
                <button
                  type="button"
                  className="settings-nav-button"
                  aria-current={active === section.id ? 'true' : undefined}
                  onClick={() => selectSection(section.id)}
                >
                  {section.label}
                </button>
              </li>
            ))}
          </ul>
        </nav>
        <div>{renderActive()}</div>
      </div>
    </div>
  );
}
