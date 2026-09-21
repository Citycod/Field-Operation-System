export const env = {
  appName: process.env.NEXT_PUBLIC_APP_NAME || 'Field Workforce Platform',
  appUrl: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
  directusUrl: process.env.NEXT_PUBLIC_DIRECTUS_URL || 'http://localhost:8055',
  isProduction: process.env.NODE_ENV === 'production',
};
