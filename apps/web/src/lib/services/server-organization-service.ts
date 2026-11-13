import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { SupabaseOrganizationRepository } from '@/lib/repositories/supabase/supabase-organization-repository';
import { SupabaseMembershipRepository } from '@/lib/repositories/supabase/supabase-membership-repository';
import { SupabaseInvitationRepository } from '@/lib/repositories/supabase/supabase-invitation-repository';
import { OrganizationService } from './organization-service';
import { OrganizationInvitationService } from './organization-invitation-service';
import { AuditLogService } from './audit-log-service';
import { SupabaseAuditLogRepository } from '@/lib/repositories/supabase/supabase-audit-log-repository';
import type { Database } from '@field/types';
import type { SupabaseClient } from '@supabase/supabase-js';

export async function authenticatedOrganizationService() {
  const client = await createClient();
  const {
    data: { user },
    error,
  } = await client.auth.getUser();
  if (error || !user) throw new Error('AUTHENTICATION_REQUIRED');

  const repositoryClient = client as unknown as SupabaseClient<Database>;
  return {
    userId: user.id,
    service: new OrganizationService(
      new SupabaseOrganizationRepository(repositoryClient),
      new SupabaseMembershipRepository(repositoryClient),
    ),
  };
}

export async function authenticatedInvitationService() {
  const client = await createClient();
  const {
    data: { user },
    error,
  } = await client.auth.getUser();
  if (error || !user) throw new Error('AUTHENTICATION_REQUIRED');

  const repositoryClient = client as unknown as SupabaseClient<Database>;
  return {
    userId: user.id,
    service: new OrganizationInvitationService(
      new SupabaseInvitationRepository(repositoryClient),
      new SupabaseMembershipRepository(repositoryClient),
    ),
  };
}

export async function publicInvitationService() {
  const client = await createClient();
  const repositoryClient = client as unknown as SupabaseClient<Database>;
  return new OrganizationInvitationService(
    new SupabaseInvitationRepository(repositoryClient),
    new SupabaseMembershipRepository(repositoryClient),
  );
}

export async function authenticatedAuditLogService() {
  const client = await createClient();
  const {
    data: { user },
    error,
  } = await client.auth.getUser();
  if (error || !user) throw new Error('AUTHENTICATION_REQUIRED');

  const repositoryClient = client as unknown as SupabaseClient<Database>;
  return {
    userId: user.id,
    service: new AuditLogService(
      new SupabaseAuditLogRepository(repositoryClient),
      new SupabaseMembershipRepository(repositoryClient),
    ),
  };
}


