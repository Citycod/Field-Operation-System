import { PlatformLayout } from '@/components/layout/platform-layout';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

export default async function PlatformRouteLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) redirect('/login');

  return <PlatformLayout>{children}</PlatformLayout>;
}
