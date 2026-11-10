import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { SupabaseDataSourceRepository } from '@/lib/repositories/supabase/supabase-data-source-repository';
import { SupabaseMembershipRepository } from '@/lib/repositories/supabase/supabase-membership-repository';
import { DataSourceService } from './data-source-service';
import type { Database } from '@field/types';
import type { SupabaseClient } from '@supabase/supabase-js';

export async function authenticatedDataSourceService() {
  const client = await createClient();
  const {
    data: { user },
    error,
  } = await client.auth.getUser();
  if (error || !user) throw new Error('AUTHENTICATION_REQUIRED');

  const repositoryClient = client as unknown as SupabaseClient<Database>;
  return {
    userId: user.id,
    service: new DataSourceService(
      new SupabaseDataSourceRepository(repositoryClient),
      new SupabaseMembershipRepository(repositoryClient),
    ),
  };
}

