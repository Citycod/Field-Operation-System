import { MembershipRepository } from '../membership-repository';
import {
  OrganizationMembership,
  PlatformRole,
  OrganizationMemberRosterItem,
  ManageMembershipInput,
  ManageMembershipResult,
} from '@field/types';
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

  async findUserMembershipInOrg(
    userId: string,
    organizationId: string,
    options?: { allowInactiveOrg?: boolean },
  ): Promise<OrganizationMembership | null> {
    const supabase = this.client();

    if (!options?.allowInactiveOrg) {
      const { data: orgData, error: orgError } = await supabase
        .from('organizations')
        .select('id, status')
        .eq('id', organizationId)
        .eq('status', 'active')
        .single();

      if (orgError || !orgData) return null;
    }

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

  async getRoster(organizationId: string): Promise<OrganizationMemberRosterItem[]> {
    const supabase = this.client();
    const { data, error } = await supabase.rpc('get_organization_members_roster', {
      p_organization_id: organizationId,
    });

    if (error) {
      throw new Error(`Failed to load members roster: ${error.message}`);
    }

    if (!data) return [];

    return data.map((item) => ({
      membership_id: item.membership_id,
      organization_id: item.organization_id,
      user_id: item.user_id,
      role_key: item.role_key as PlatformRole,
      status: item.status as 'active' | 'invited' | 'disabled',
      email: item.email,
      first_name: item.first_name,
      last_name: item.last_name,
      display_name: item.display_name,
      avatar_url: item.avatar_url,
      created_at: item.created_at,
      updated_at: item.updated_at,
    }));
  }

  async manageMembership(
    organizationId: string,
    input: ManageMembershipInput,
  ): Promise<ManageMembershipResult> {
    const supabase = this.client();
    const { data, error } = await supabase.rpc('manage_organization_membership', {
      p_organization_id: organizationId,
      p_target_user_id: input.target_user_id,
      p_action: input.action,
      p_new_role: input.new_role ?? null,
    });

    if (error) {
      throw new Error(error.message);
    }

    const res = data as unknown as ManageMembershipResult;
    return {
      success: res.success,
      action: res.action,
      membership_id: res.membership_id,
      organization_id: res.organization_id,
      user_id: res.user_id,
      role_key: res.role_key,
      status: res.status,
      updated_at: res.updated_at,
    };
  }
}
