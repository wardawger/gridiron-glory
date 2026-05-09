import { createClient } from '@supabase/supabase-js';

const url  = import.meta.env.VITE_SUPABASE_URL  as string;
const key  = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!url || !key) {
  console.error('Missing Supabase env vars. Copy .env.example → .env.local and fill in your keys.');
}

export const supabase = createClient(url, key);
