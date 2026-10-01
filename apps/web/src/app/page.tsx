import { redirect } from 'next/navigation';

export default function RootPage() {
  // Middleware sends authenticated users to /dashboard. This is the safe
  // fallback if middleware is unavailable or authentication is unconfigured.
  redirect('/login');
}
