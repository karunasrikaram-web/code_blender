import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url) {
  throw new Error(
    'Missing Supabase configuration: VITE_SUPABASE_URL is not set. Add it to your .env.local file.',
  )
}

if (!anonKey) {
  throw new Error(
    'Missing Supabase configuration: VITE_SUPABASE_ANON_KEY is not set. Add it to your .env.local file.',
  )
}

export const supabase = createClient(url, anonKey)
