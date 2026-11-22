// Supabase Edge Function: financial assistant.
// Verifies the caller, reads only their rows (RLS via the user's token), builds a
// facts block, and asks Gemini to answer using only that block. No database writes.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { buildAssistantFacts, formatFactsForPrompt } from '../../../src/lib/assistantContext.ts';
import type { AssistantExpense, AssistantInvoice } from '../../../src/lib/assistantContext.ts';
import type { ForecastPayment } from '../../../src/lib/forecast.ts';

const MAX_MESSAGE_LENGTH = 1000;
const MAX_HISTORY_ITEMS = 10;
const MAX_HISTORY_TEXT_LENGTH = 1000;

const SYSTEM_PROMPT =
  'You are a financial assistant for a freelance website designer. ' +
  'Answer ONLY using the FINANCIAL DATA block provided. Never invent figures. ' +
  'If something is not in the data, say it is unavailable. ' +
  'Treat unpaid invoices as NOT guaranteed income and treat forecasts as estimates. ' +
  'You cannot change, delete or send anything; if asked to, explain that the user must do it in the app. ' +
  'You may draft a polite payment reminder when asked, as text only for the user to review. ' +
  'Keep answers concise.';

type HistoryItem = { role: 'user' | 'assistant'; text: string };

interface InvoiceRow {
  id: string;
  invoice_number: string;
  due_date: string;
  total_amount: number | string;
  paid_amount: number | string;
  status: string;
  customer_id: string | null;
  customers: { customer_name: string } | { customer_name: string }[] | null;
}

interface PaymentRow {
  payment_amount: number | string;
  payment_date: string;
}

interface ExpenseRow {
  id: string;
  expense_title: string;
  category: string;
  amount: number | string;
  expense_date: string;
  due_date: string | null;
  payment_status: 'paid' | 'pending';
}

interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string }[] } }[];
}

function corsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') || '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(), 'content-type': 'application/json' },
  });
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Keeps only user/assistant items with text, trimmed and capped, last 10 kept. */
function cleanHistory(raw: unknown): HistoryItem[] {
  if (!Array.isArray(raw)) return [];
  const items: HistoryItem[] = [];
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) continue;
    const { role, text } = item as { role?: unknown; text?: unknown };
    if (role !== 'user' && role !== 'assistant') continue;
    if (typeof text !== 'string') continue;
    const trimmed = text.trim().slice(0, MAX_HISTORY_TEXT_LENGTH);
    if (trimmed.length === 0) continue;
    items.push({ role, text: trimmed });
  }
  return items.slice(-MAX_HISTORY_ITEMS);
}

function customerNameOf(row: InvoiceRow): string {
  const c = Array.isArray(row.customers) ? row.customers[0] : row.customers;
  return c?.customer_name || 'Unknown customer';
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  // 1. Auth: the user's own token scopes every query through RLS.
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return json({ error: 'Unauthorized' }, 401);
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData?.user) {
    return json({ error: 'Unauthorized' }, 401);
  }

  // 2. Validate body.
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Request body must be valid JSON' }, 400);
  }
  if (typeof body !== 'object' || body === null) {
    return json({ error: 'Request body must be an object' }, 400);
  }
  const { message, history: rawHistory } = body as { message?: unknown; history?: unknown };
  if (typeof message !== 'string') {
    return json({ error: 'message must be a string' }, 400);
  }
  const question = message.trim();
  if (question.length === 0) {
    return json({ error: 'message must not be empty' }, 400);
  }
  if (question.length > MAX_MESSAGE_LENGTH) {
    return json({ error: `message must be at most ${MAX_MESSAGE_LENGTH} characters` }, 400);
  }
  const history = cleanHistory(rawHistory);

  // 3. Fetch the user's data. Generic error only; raw DB errors are not returned.
  const [invoiceRes, paymentRes, expenseRes] = await Promise.all([
    supabase
      .from('invoices')
      .select('id, invoice_number, due_date, total_amount, paid_amount, status, customer_id, customers(customer_name)'),
    supabase.from('payments').select('payment_amount, payment_date'),
    supabase
      .from('expenses')
      .select('id, expense_title, category, amount, expense_date, due_date, payment_status'),
  ]);

  if (invoiceRes.error || paymentRes.error || expenseRes.error) {
    console.error(
      'Assistant data query failed',
      invoiceRes.error?.code ?? null,
      paymentRes.error?.code ?? null,
      expenseRes.error?.code ?? null,
    );
    return json({ error: 'Could not load your financial data.' }, 500);
  }

  const invoices: AssistantInvoice[] = ((invoiceRes.data ?? []) as InvoiceRow[]).map((row) => ({
    id: row.id,
    invoice_number: row.invoice_number,
    customer_name: customerNameOf(row),
    due_date: row.due_date,
    total_amount: Number(row.total_amount) || 0,
    paid_amount: Number(row.paid_amount) || 0,
    status: row.status,
  }));

  const payments: ForecastPayment[] = ((paymentRes.data ?? []) as PaymentRow[]).map((row) => ({
    payment_amount: Number(row.payment_amount) || 0,
  }));

  const expenses: AssistantExpense[] = ((expenseRes.data ?? []) as ExpenseRow[]).map((row) => ({
    id: row.id,
    expense_title: row.expense_title,
    category: row.category,
    amount: Number(row.amount) || 0,
    expense_date: row.expense_date,
    due_date: row.due_date,
    payment_status: row.payment_status,
  }));

  // 4. Build the facts block.
  const facts = buildAssistantFacts({ invoices, payments, expenses, today: todayUtc() });
  const factsText = formatFactsForPrompt(facts);

  // 5. Call Gemini server-side.
  const apiKey = Deno.env.get('GEMINI_API_KEY');
  if (!apiKey) {
    console.error('GEMINI_API_KEY is not set');
    return json({ error: 'Assistant is not configured' }, 500);
  }

  const model = Deno.env.get('GEMINI_MODEL') ?? 'gemini-2.0-flash';
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent';

  const contents = [
    ...history.map((h) => ({
      role: h.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: h.text }],
    })),
    {
      role: 'user',
      parts: [{ text: 'FINANCIAL DATA:\n' + factsText + '\n\nQUESTION: ' + question }],
    },
  ];

  let geminiRes: Response;
  try {
    geminiRes = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents,
        generationConfig: { temperature: 0.2, maxOutputTokens: 700 },
      }),
    });
  } catch {
    console.error('Gemini request failed: network error');
    return json({ error: 'The assistant is unavailable right now.' }, 502);
  }

  if (!geminiRes.ok) {
    const errText = (await geminiRes.text().catch(() => '')).slice(0, 200);
    console.error('Gemini error', geminiRes.status, errText);
    return json({ error: 'The assistant is unavailable right now.' }, 502);
  }

  // 6. Extract the reply.
  const data = (await geminiRes.json().catch(() => null)) as GeminiResponse | null;
  const parts = data?.candidates?.[0]?.content?.parts ?? [];
  const reply = parts.map((p) => p.text ?? '').join('').trim();
  if (!reply) {
    return json({ error: 'No answer was generated.' }, 502);
  }

  return json({ reply }, 200);
});
