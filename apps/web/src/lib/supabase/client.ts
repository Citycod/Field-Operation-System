import { createBrowserClient } from '@supabase/ssr';
import { Database } from '@field/types';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabasePublicConfig } from './config';

let browserClient: SupabaseClient<Database> | undefined;

export function createClient(): SupabaseClient<Database> {
  if (browserClient) return browserClient;

  const { url, anonKey } = getSupabasePublicConfig();

  // @supabase/ssr 0.5 uses the pre-2.116 SupabaseClient generic order in its
  // declaration. The runtime client is the same; normalize the public type.
  browserClient = createBrowserClient<Database>(url, anonKey) as unknown as SupabaseClient<Database>;
  return browserClient;
}
