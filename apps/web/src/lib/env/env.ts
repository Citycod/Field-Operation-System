export const env = {
  appName: process.env.NEXT_PUBLIC_APP_NAME || 'Field Workforce Platform',
  appUrl: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  isProduction: process.env.NODE_ENV === 'production',
};
