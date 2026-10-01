import { MembershipRepository } from '../membership-repository';
import { OrganizationMembership, PlatformRole } from '@field/types';
import { createClient } from '@/lib/supabase/client';
import type { Database } from '@field/types';
import type { SupabaseClient } from '@supabase/supabase-js';

export class SupabaseMembershipRepository implements MembershipRepository {
  constructor(private readonly injectedClient?: SupabaseClient<Database>) {}

  private client(): SupabaseClient<Database> {
    return this.injectedClient ?? createClient();
  }

  async findByUserId(userId: string): Promise<OrganizationMembership[]> {
    const supabase = this.client();
    const { data, error } = await supabase
      .from('organization_memberships')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'active');

    if (error) throw new Error('Unable to load organization memberships.');
    if (!data) return [];

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

  async findUserMembershipInOrg(userId: string, organizationId: string): Promise<OrganizationMembership | null> {
    const supabase = this.client();
    const { data, error } = await supabase
      .from('organization_memberships')
      .select('*')
      .eq('user_id', userId)
      .eq('organization_id', organizationId)
      .eq('status', 'active')
      .single();

    if (error || !data) return null;

    const m = data as {
      id: string;
      organization_id: string;
      user_id: string;
      role_key: string;
      status: string;
      created_at: string;
      updated_at: string;
    };

    return {
      id: m.id,
      organization_id: m.organization_id,
      user_id: m.user_id,
      role_key: m.role_key as PlatformRole,
      status: m.status as 'active' | 'invited' | 'disabled',
      created_at: m.created_at,
      updated_at: m.updated_at,
    };
  }
}
