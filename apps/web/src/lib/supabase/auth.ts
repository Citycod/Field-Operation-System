import { createClient } from './client';
import { UserProfile, Organization, OrganizationMembership, PlatformRole } from '@field/types';

export async function getCurrentUser(): Promise<UserProfile | null> {
  const supabase = createClient();
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError) throw new Error(sessionError.message);
  if (!session) return null;

  const { data: { user }, error } = await supabase.auth.getUser();

  if (error) throw new Error(error.message);
  if (!user) return null;

  // Fetch optional profile metadata
  const { data } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  const profile = data as { first_name?: string | null; last_name?: string | null; avatar_url?: string | null; status?: string } | null;

  return {
    id: user.id,
    email: user.email || '',
    first_name: profile?.first_name || (user.user_metadata?.first_name as string) || '',
    last_name: profile?.last_name || (user.user_metadata?.last_name as string) || '',
    avatar_url: profile?.avatar_url || (user.user_metadata?.avatar_url as string) || undefined,
    status: profile?.status || 'active',
  };
}

export async function getUserMemberships(userId: string): Promise<OrganizationMembership[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('organization_memberships')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'active');

  if (error || !data) {
    return [];
  }

  const memberships = data as Array<{
    id: string;
    organization_id: string;
    user_id: string;
    role_key: string;
    status: string;
    created_at: string;
    updated_at: string;
  }>;

  return memberships.map((m) => ({
    id: m.id,
    organization_id: m.organization_id,
    user_id: m.user_id,
    role_key: m.role_key as PlatformRole,
    status: m.status as 'active' | 'invited' | 'disabled',
    created_at: m.created_at,
    updated_at: m.updated_at,
  }));
}

export async function getUserOrganizations(organizationIds: string[]): Promise<Organization[]> {
  if (organizationIds.length === 0) return [];

  const supabase = createClient();
  const { data, error } = await supabase
    .from('organizations')
    .select('*')
    .in('id', organizationIds)
    .eq('status', 'active');

  if (error || !data) {
    return [];
  }

  const orgs = data as Array<{
    id: string;
    name: string;
    slug: string;
    status: string;
    created_at: string;
    updated_at: string;
  }>;

  return orgs.map((org) => ({
    id: org.id,
    name: org.name,
    slug: org.slug,
    status: org.status as 'active' | 'suspended' | 'archived',
    created_at: org.created_at,
    updated_at: org.updated_at,
  }));
}
