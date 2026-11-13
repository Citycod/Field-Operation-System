import { describe, it, expect, beforeEach } from 'vitest';
import {
  OrganizationService,
  SlugAlreadyExistsError,
  InvalidOrganizationInputError,
  UnauthorizedOrganizationAccessError,
  generateSlug,
} from '../organization-service';
import { OrganizationRepository } from '../../repositories/organization-repository';
import { MembershipRepository } from '../../repositories/membership-repository';
import {
  Organization,
  OrganizationMembership,
  OrganizationProfile,
  CreateWorkspaceInput,
  WorkspaceProvisioningResult,
  UpdateOrganizationProfileInput,
  PlatformRole,
} from '@field/types';

class MockOrganizationRepository implements OrganizationRepository {
  public orgs = new Map<string, Organization>();
  public profiles = new Map<string, OrganizationProfile>();

  async createWorkspace(input: CreateWorkspaceInput): Promise<WorkspaceProvisioningResult> {
    const slug = input.slug || generateSlug(input.name);
    for (const org of this.orgs.values()) {
      if (org.slug === slug) {
        const error: any = new Error(`Business identifier "${slug}" is already in use`);
        error.code = '23505';
        throw error;
      }
    }

    const orgId = `org_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const now = new Date().toISOString();
    const organization: Organization = {
      id: orgId,
      name: input.name,
      slug,
      status: 'active',
      created_at: now,
      updated_at: now,
    };
    this.orgs.set(orgId, organization);

    const membership: OrganizationMembership = {
      id: `mem_${orgId}`,
      organization_id: orgId,
      user_id: '',
      role_key: 'business_admin',
      status: 'active',
      created_at: now,
      updated_at: now,
    };

    const profile: OrganizationProfile = {
      organization_id: orgId,
      business_email: input.profile?.business_email || null,
      business_phone: input.profile?.business_phone || null,
      industry: input.profile?.industry || null,
      address_line_1: input.profile?.address_line_1 || null,
      address_line_2: input.profile?.address_line_2 || null,
      city: input.profile?.city || null,
      state_region: input.profile?.state_region || null,
      postal_code: input.profile?.postal_code || null,
      country_code: input.profile?.country_code || null,
      website: input.profile?.website || null,
      logo_path: input.profile?.logo_path || null,
      timezone: input.profile?.timezone || 'UTC',
      currency_code: input.profile?.currency_code || 'USD',
      date_format: input.profile?.date_format || 'YYYY-MM-DD',
      settings: input.profile?.settings || {},
      requires_onboarding: true,
      onboarding_completed: false,
      onboarding_step: 'profile',
      onboarding_status: 'not_started',
      onboarding_completed_at: null,
      created_at: now,
      updated_at: now,
    };
    this.profiles.set(orgId, profile);

    return { organization, membership, profile };
  }

  async findById(id: string): Promise<Organization | null> {
    return this.orgs.get(id) || null;
  }

  async getById(id: string): Promise<Organization | null> {
    return this.findById(id);
  }

  async findManyByIds(ids: string[]): Promise<Organization[]> {
    return ids.map((id) => this.orgs.get(id)).filter(Boolean) as Organization[];
  }

  async findBySlug(slug: string): Promise<Organization | null> {
    for (const org of this.orgs.values()) {
      if (org.slug === slug) return org;
    }
    return null;
  }

  async getBySlug(slug: string): Promise<Organization | null> {
    return this.findBySlug(slug);
  }

  async listForUser(userId: string): Promise<Organization[]> {
    return Array.from(this.orgs.values());
  }

  async getProfile(organizationId: string): Promise<OrganizationProfile | null> {
    return this.profiles.get(organizationId) || null;
  }

  async updateProfile(
    organizationId: string,
    updates: UpdateOrganizationProfileInput,
  ): Promise<OrganizationProfile> {
    const existing = this.profiles.get(organizationId);
    if (!existing) throw new Error('Profile not found');
    const updated: OrganizationProfile = {
      ...existing,
      ...updates,
      updated_at: new Date().toISOString(),
    };
    this.profiles.set(organizationId, updated);
    return updated;
  }

  async completeOnboarding(organizationId: string) {
    const existing = this.profiles.get(organizationId);
    if (existing) {
      existing.onboarding_completed = true;
      existing.onboarding_status = 'completed';
      existing.onboarding_step = 'completed';
      existing.onboarding_completed_at = new Date().toISOString();
    }
    return {
      success: true,
      organization_id: organizationId,
      onboarding_completed: true,
      onboarding_step: 'completed',
      onboarding_status: 'completed',
      onboarding_completed_at: new Date().toISOString(),
    };
  }

  async resolveLegacyProfile(organizationId: string) {
    const existing = this.profiles.get(organizationId);
    if (existing) {
      existing.onboarding_status = 'completed';
    }
    return {
      success: true,
      organization_id: organizationId,
      onboarding_status: 'completed',
      resolved_at: new Date().toISOString(),
    };
  }

  async manageLifecycle(organizationId: string, input: any): Promise<any> {
    return { success: true, organization_id: organizationId, new_status: input.new_status };
  }

  async reactivateVoluntarySuspension(organizationId: string): Promise<any> {
    return { success: true, organization_id: organizationId, status: 'active' };
  }
}

class MockMembershipRepository implements MembershipRepository {
  public memberships: OrganizationMembership[] = [];

  async findByUserId(userId: string): Promise<OrganizationMembership[]> {
    return this.memberships.filter((m) => m.user_id === userId && m.status === 'active');
  }

  async findUserMembershipInOrg(
    userId: string,
    organizationId: string,
  ): Promise<OrganizationMembership | null> {
    return (
      this.memberships.find(
        (m) =>
          m.user_id === userId &&
          m.organization_id === organizationId &&
          m.status === 'active',
      ) || null
    );
  }

  async getRoster(): Promise<any> {
    return [];
  }

  async manageMembership(): Promise<any> {
    return { success: true };
  }
}

describe('OrganizationService', () => {
  let orgRepo: MockOrganizationRepository;
  let memRepo: MockMembershipRepository;
  let service: OrganizationService;

  beforeEach(() => {
    orgRepo = new MockOrganizationRepository();
    memRepo = new MockMembershipRepository();
    service = new OrganizationService(orgRepo, memRepo);
  });

  describe('Workspace Provisioning', () => {
    it('requires an authenticated user ID', async () => {
      await expect(
        service.createWorkspace('', { name: 'Acme Corp' }),
      ).rejects.toThrowError(UnauthorizedOrganizationAccessError);
    });

    it('validates business name length', async () => {
      await expect(
        service.createWorkspace('usr_1', { name: 'A' }),
      ).rejects.toThrowError(InvalidOrganizationInputError);

      await expect(
        service.createWorkspace('usr_1', { name: 'A'.repeat(101) }),
      ).rejects.toThrowError(InvalidOrganizationInputError);
    });

    it('rejects invalid or reserved slugs', async () => {
      await expect(
        service.createWorkspace('usr_1', { name: 'Acme', slug: 'admin' }),
      ).rejects.toThrowError(/reserved/);

      await expect(
        service.createWorkspace('usr_1', { name: 'Acme', slug: 'Acme_Invalid!' }),
      ).rejects.toThrowError(/lowercase letters/);
    });

    it('successfully creates a business workspace with atomic organization, membership, and profile', async () => {
      const result = await service.createWorkspace('usr_1', {
        name: 'Apex Field Services',
        slug: 'apex-field-services',
        profile: {
          business_email: 'admin@apex.com',
          industry: 'Field Operations',
          country_code: 'US',
          timezone: 'America/New_York',
          currency_code: 'USD',
        },
      });

      expect(result.organization.name).toBe('Apex Field Services');
      expect(result.organization.slug).toBe('apex-field-services');
      expect(result.organization.status).toBe('active');

      expect(result.membership.user_id).toBe('usr_1');
      expect(result.membership.role_key).toBe('business_admin');
      expect(result.membership.status).toBe('active');

      expect(result.profile?.business_email).toBe('admin@apex.com');
      expect(result.profile?.timezone).toBe('America/New_York');
      expect(result.profile?.currency_code).toBe('USD');
    });

    it('auto-generates valid slug from business name when slug is omitted', async () => {
      const result = await service.createWorkspace('usr_1', {
        name: 'Global Oil & Gas Ltd.',
      });

      expect(result.organization.slug).toBe('global-oil-gas-ltd');
    });

    it('translates database unique constraint violations to SlugAlreadyExistsError', async () => {
      await service.createWorkspace('usr_1', {
        name: 'First Corp',
        slug: 'conflict-slug',
      });

      await expect(
        service.createWorkspace('usr_2', {
          name: 'Second Corp',
          slug: 'conflict-slug',
        }),
      ).rejects.toThrowError(SlugAlreadyExistsError);
    });
  });

  describe('Organization Access & Profile Management', () => {
    let orgId: string;

    beforeEach(async () => {
      const created = await service.createWorkspace('usr_admin', {
        name: 'Target Company',
        slug: 'target-company',
      });
      orgId = created.organization.id;

      // Seed membership for usr_admin
      memRepo.memberships.push({
        id: 'mem_1',
        organization_id: orgId,
        user_id: 'usr_admin',
        role_key: 'business_admin',
        status: 'active',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      // Seed employee membership
      memRepo.memberships.push({
        id: 'mem_2',
        organization_id: orgId,
        user_id: 'usr_employee',
        role_key: 'employee',
        status: 'active',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    });

    it('allows active members to get organization details and profile', async () => {
      const result = await service.getOrganization('usr_admin', orgId);
      expect(result.organization.name).toBe('Target Company');
      expect(result.profile?.organization_id).toBe(orgId);
    });

    it('denies access to non-members attempting to get organization details', async () => {
      await expect(
        service.getOrganization('usr_outsider', orgId),
      ).rejects.toThrowError(UnauthorizedOrganizationAccessError);
    });

    it('allows business_admin to update organization profile', async () => {
      const updated = await service.updateOrganizationProfile('usr_admin', orgId, {
        business_email: 'new-email@target.com',
        timezone: 'Europe/London',
        currency_code: 'GBP',
      });

      expect(updated.business_email).toBe('new-email@target.com');
      expect(updated.timezone).toBe('Europe/London');
      expect(updated.currency_code).toBe('GBP');
    });

    it('denies employee from updating organization profile', async () => {
      await expect(
        service.updateOrganizationProfile('usr_employee', orgId, {
          business_email: 'malicious@target.com',
        }),
      ).rejects.toThrowError(UnauthorizedOrganizationAccessError);
    });

    it('allows super_admin to reactivate voluntary suspension and rejects business_admin', async () => {
      // usr_admin is business_admin -> rejected
      await expect(
        service.reactivateVoluntarySuspension('usr_admin', orgId),
      ).rejects.toThrowError(UnauthorizedOrganizationAccessError);

      // Seed super_admin
      memRepo.memberships.push({
        id: 'mem_super',
        organization_id: orgId,
        user_id: 'usr_super',
        role_key: 'super_admin',
        status: 'active',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      const result = await service.reactivateVoluntarySuspension('usr_super', orgId);
      expect(result.success).toBe(true);
      expect(result.status).toBe('active');
    });
  });
});

