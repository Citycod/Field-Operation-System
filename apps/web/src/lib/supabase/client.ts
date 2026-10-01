import { createBrowserClient } from '@supabase/ssr';
import { Database } from '@field/types';
import type { SupabaseClient } from '@supabase/supabase-js';

export function createClient(): SupabaseClient<Database> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key';

  // @supabase/ssr 0.5 uses the pre-2.116 SupabaseClient generic order in its
  // declaration. The runtime client is the same; normalize the public type.
  return createBrowserClient<Database>(supabaseUrl, supabaseAnonKey) as unknown as SupabaseClient<Database>;
}
