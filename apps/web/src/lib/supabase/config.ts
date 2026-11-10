export interface SupabasePublicConfig {
  url: string;
  anonKey: string;
}

export function getSupabasePublicConfig(): SupabasePublicConfig {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey || url.includes('placeholder') || anonKey.includes('placeholder')) {
    throw new Error(
      'Supabase authentication is not configured. Set the public Supabase URL and anonymous key.',
    );
  }

  return { url, anonKey };
}
