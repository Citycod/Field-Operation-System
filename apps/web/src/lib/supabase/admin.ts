import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { Database } from '@field/types';

/**
 * Server-only admin client with service_role privileges.
 * 
 * Rules:
 * - Server side only
 * - NEVER import in Client Components
 * - NEVER expose SUPABASE_SERVICE_ROLE_KEY to NEXT_PUBLIC_*
 */
export function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_URL environment variables');
  }

  return createSupabaseClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
