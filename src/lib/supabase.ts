import { createClient } from '@supabase/supabase-js';

// @ts-ignore
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isConfigured = supabaseUrl && 
                   supabaseAnonKey && 
                   supabaseUrl !== 'your-supabase-url' && 
                   supabaseAnonKey !== 'your-supabase-anon-key';

if (!isConfigured) {
  console.warn('CRITICAL WARNING: Supabase is not properly configured. Data operations will fail with "Failed to fetch". Please provide valid VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY secrets.');
}

// Initialize the Supabase client
export const supabase = createClient(
  isConfigured ? supabaseUrl : 'https://placeholder-project.supabase.co',
  isConfigured ? supabaseAnonKey : 'placeholder-key',
  {
    auth: {
      persistSession: false,
      autoRefreshToken: true,
    }
  }
);
