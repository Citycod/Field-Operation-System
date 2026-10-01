import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { Database } from '@field/types';
import { getSupabasePublicConfig } from './config';

export async function createClient() {
  const cookieStore = await cookies();

  const { url, anonKey } = getSupabasePublicConfig();

  return createServerClient<Database>(
    url,
    anonKey,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // The `setAll` method was called from a Server Component.
          }
        },
      },
    }
  );
}
