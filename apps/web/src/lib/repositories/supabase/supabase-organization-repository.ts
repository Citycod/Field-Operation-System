import { OrganizationRepository } from '../organization-repository';
import {
  Organization,
  OrganizationProfile,
  CreateWorkspaceInput,
  WorkspaceProvisioningResult,
  UpdateOrganizationProfileInput,
  PlatformRole,
  OnboardingCompletionResult,
  LegacyProfileResolutionResult,
  ManageLifecycleInput,
  ManageLifecycleResult,
} from '@field/types';
import { createClient } from '@/lib/supabase/client';
import type { Database, Json } from '@field/types';
import type { SupabaseClient } from '@supabase/supabase-js';

export class SupabaseOrganizationRepository implements OrganizationRepository {
  constructor(private readonly injectedClient?: SupabaseClient<Database>) {}

  private client(): SupabaseClient<Database> {
    return this.injectedClient ?? createClient();
  }

  async createWorkspace(input: CreateWorkspaceInput): Promise<WorkspaceProvisioningResult> {
    const supabase = this.client();
    const { data, error } = await supabase.rpc('create_business_workspace', {
      p_name: input.name,
      p_slug: input.slug ?? '',
      p_profile: (input.profile ?? {}) as unknown as Json,
    });

    if (error) {
      throw error;
    }

    const payload = data as {
      organization_id: string;
      name: string;
      slug: string;
      status: string;
      membership_id: string;
      role_key: string;
      created_at: string;
    };

    const organization: Organization = {
      id: payload.organization_id,
      name: payload.name,
      slug: payload.slug,
      status: payload.status as 'active' | 'suspended' | 'archived',
      created_at: payload.created_at,
      updated_at: payload.created_at,
    };

    const membership = {
      id: payload.membership_id,
      organization_id: payload.organization_id,
      user_id: '',
      role_key: payload.role_key as PlatformRole,
      status: 'active' as const,
      created_at: payload.created_at,
      updated_at: payload.created_at,
    };

    return { organization, membership };
  }

  async findById(id: string): Promise<Organization | null> {
    const supabase = this.client();
    const { data, error } = await supabase
      .from('organizations')
      .select('*')
      .eq('id', id)
      .eq('status', 'active')
      .single();

    if (error || !data) return null;

    const org = data as { id: string; name: string; slug: string; status: string; created_at: string; updated_at: string };
    return {
      id: org.id,
      name: org.name,
      slug: org.slug,
      status: org.status as 'active' | 'suspended' | 'archived',
      created_at: org.created_at,
      updated_at: org.updated_at,
    };
  }

  async getById(id: string): Promise<Organization | null> {
    return this.findById(id);
  }

  async findManyByIds(ids: string[]): Promise<Organization[]> {
    if (ids.length === 0) return [];

    const supabase = this.client();
    const { data, error } = await supabase
      .from('organizations')
      .select('*')
      .in('id', ids)
      .eq('status', 'active');

    if (error) throw new Error('Unable to load organizations.');
    if (!data) return [];

    const orgs = data as Array<{ id: string; name: string; slug: string; status: string; created_at: string; updated_at: string }>;
    return orgs.map((org) => ({
      id: org.id,
      name: org.name,
      slug: org.slug,
      status: org.status as 'active' | 'suspended' | 'archived',
      created_at: org.created_at,
      updated_at: org.updated_at,
    }));
  }

  async findBySlug(slug: string): Promise<Organization | null> {
    const supabase = this.client();
    const { data, error } = await supabase
      .from('organizations')
      .select('*')
      .eq('slug', slug)
      .eq('status', 'active')
      .single();

    if (error || !data) return null;

    const org = data as { id: string; name: string; slug: string; status: string; created_at: string; updated_at: string };
    return {
      id: org.id,
      name: org.name,
      slug: org.slug,
      status: org.status as 'active' | 'suspended' | 'archived',
      created_at: org.created_at,
      updated_at: org.updated_at,
    };
  }

  async getBySlug(slug: string): Promise<Organization | null> {
    return this.findBySlug(slug);
  }

  async listForUser(userId: string): Promise<Organization[]> {
    const supabase = this.client();
    const { data: memberships, error: memError } = await supabase
      .from('organization_memberships')
      .select('organization_id')
      .eq('user_id', userId)
      .eq('status', 'active');

    if (memError || !memberships || memberships.length === 0) return [];

    const orgIds = memberships.map((m) => m.organization_id);
    return this.findManyByIds(orgIds);
  }

  async getProfile(organizationId: string): Promise<OrganizationProfile | null> {
    const supabase = this.client();
    const { data, error } = await supabase
      .from('organization_profiles')
      .select('*')
      .eq('organization_id', organizationId)
      .single();

    if (error || !data) return null;

    return {
      organization_id: data.organization_id,
      business_email: data.business_email,
      business_phone: data.business_phone,
      industry: data.industry,
      address_line_1: data.address_line_1,
      address_line_2: data.address_line_2,
      city: data.city,
      state_region: data.state_region,
      postal_code: data.postal_code,
      country_code: data.country_code,
      website: data.website,
      logo_path: data.logo_path,
      timezone: data.timezone,
      currency_code: data.currency_code,
      date_format: data.date_format,
      settings: (data.settings_jsonb ?? {}) as Record<string, unknown>,
      requires_onboarding: data.requires_onboarding,
      onboarding_completed: data.onboarding_completed,
      onboarding_step: data.onboarding_step as any,
      onboarding_status: data.onboarding_status as any,
      onboarding_completed_at: data.onboarding_completed_at,
      created_at: data.created_at,
      updated_at: data.updated_at,
    };
  }

  async updateProfile(
    organizationId: string,
    updates: UpdateOrganizationProfileInput,
  ): Promise<OrganizationProfile> {
    const supabase = this.client();
    const patch: Database['public']['Tables']['organization_profiles']['Update'] = {
      updated_at: new Date().toISOString(),
    };

    if (updates.business_email !== undefined) patch.business_email = updates.business_email;
    if (updates.business_phone !== undefined) patch.business_phone = updates.business_phone;
    if (updates.industry !== undefined) patch.industry = updates.industry;
    if (updates.address_line_1 !== undefined) patch.address_line_1 = updates.address_line_1;
    if (updates.address_line_2 !== undefined) patch.address_line_2 = updates.address_line_2;
    if (updates.city !== undefined) patch.city = updates.city;
    if (updates.state_region !== undefined) patch.state_region = updates.state_region;
    if (updates.postal_code !== undefined) patch.postal_code = updates.postal_code;
    if (updates.country_code !== undefined) patch.country_code = updates.country_code;
    if (updates.website !== undefined) patch.website = updates.website;
    if (updates.logo_path !== undefined) patch.logo_path = updates.logo_path;
    if (updates.timezone !== undefined) patch.timezone = updates.timezone;
    if (updates.currency_code !== undefined) patch.currency_code = updates.currency_code;
    if (updates.date_format !== undefined) patch.date_format = updates.date_format;
    if (updates.settings !== undefined) patch.settings_jsonb = updates.settings as unknown as Json;

    const { data, error } = await supabase
      .from('organization_profiles')
      .update(patch)
      .eq('organization_id', organizationId)
      .select('*')
      .single();

    if (error || !data) {
      throw new Error(`Failed to update organization profile: ${error?.message || 'Profile not found'}`);
    }

    return {
      organization_id: data.organization_id,
      business_email: data.business_email,
      business_phone: data.business_phone,
      industry: data.industry,
      address_line_1: data.address_line_1,
      address_line_2: data.address_line_2,
      city: data.city,
      state_region: data.state_region,
      postal_code: data.postal_code,
      country_code: data.country_code,
      website: data.website,
      logo_path: data.logo_path,
      timezone: data.timezone,
      currency_code: data.currency_code,
      date_format: data.date_format,
      settings: (data.settings_jsonb ?? {}) as Record<string, unknown>,
      requires_onboarding: data.requires_onboarding,
      onboarding_completed: data.onboarding_completed,
      onboarding_step: data.onboarding_step as any,
      onboarding_status: data.onboarding_status as any,
      onboarding_completed_at: data.onboarding_completed_at,
      created_at: data.created_at,
      updated_at: data.updated_at,
    };
  }

  async completeOnboarding(organizationId: string): Promise<OnboardingCompletionResult> {
    const supabase = this.client();
    const { data, error } = await supabase.rpc('complete_organization_onboarding', {
      p_organization_id: organizationId,
    });

    if (error) {
      throw error;
    }

    return data as unknown as OnboardingCompletionResult;
  }

  async resolveLegacyProfile(organizationId: string): Promise<LegacyProfileResolutionResult> {
    const supabase = this.client();
    const { data, error } = await supabase.rpc('resolve_legacy_organization_profile', {
      p_organization_id: organizationId,
    });

    if (error) {
      throw error;
    }

    return data as unknown as LegacyProfileResolutionResult;
  }

  async manageLifecycle(
    organizationId: string,
    input: ManageLifecycleInput,
  ): Promise<ManageLifecycleResult> {
    const supabase = this.client();
    const { data, error } = await supabase.rpc('manage_organization_lifecycle', {
      p_organization_id: organizationId,
      p_new_status: input.new_status,
      p_reason: input.reason ?? null,
    });

    if (error) {
      throw error;
    }

    return data as unknown as ManageLifecycleResult;
  }

  async reactivateVoluntarySuspension(organizationId: string): Promise<ManageLifecycleResult> {
    const supabase = this.client();
    const { data, error } = await supabase.rpc('reactivate_voluntary_suspension', {
      p_organization_id: organizationId,
    });

    if (error) {
      throw error;
    }

    return data as unknown as ManageLifecycleResult;
  }
}
