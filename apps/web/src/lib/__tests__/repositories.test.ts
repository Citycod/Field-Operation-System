import { describe, it, expect } from 'vitest';
import { OrganizationRepository } from '../repositories/organization-repository';
import { MembershipRepository } from '../repositories/membership-repository';
import { Organization, OrganizationMembership } from '@field/types';

describe('Repository Layer Interfaces', () => {
  const mockOrg: Organization = {
    id: 'org-99',
    name: 'Offshore Energy Corp',
    slug: 'offshore-energy',
    status: 'active',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const mockMembership: OrganizationMembership = {
    id: 'mem-99',
    organization_id: 'org-99',
    user_id: 'user-77',
    role_key: 'business_admin',
    status: 'active',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  it('allows mock OrganizationRepository implementation adhering to domain interface', async () => {
    class MockOrgRepo implements OrganizationRepository {
      async createWorkspace() {
        return { organization: mockOrg, membership: mockMembership };
      }
      async findById(id: string): Promise<Organization | null> {
        return id === 'org-99' ? mockOrg : null;
      }
      async getById(id: string): Promise<Organization | null> {
        return this.findById(id);
      }
      async findManyByIds(ids: string[]): Promise<Organization[]> {
        return ids.includes('org-99') ? [mockOrg] : [];
      }
      async findBySlug(slug: string): Promise<Organization | null> {
        return slug === 'offshore-energy' ? mockOrg : null;
      }
      async getBySlug(slug: string): Promise<Organization | null> {
        return this.findBySlug(slug);
      }
      async listForUser(): Promise<Organization[]> {
        return [mockOrg];
      }
      async getProfile(): Promise<any> {
        return null;
      }
      async updateProfile(): Promise<any> {
        return null;
      }
      async completeOnboarding(orgId: string): Promise<any> {
        return { success: true, organization_id: orgId, onboarding_completed: true, onboarding_status: 'completed' };
      }
      async resolveLegacyProfile(orgId: string): Promise<any> {
        return { success: true, organization_id: orgId, onboarding_status: 'completed' };
      }
      async manageLifecycle(orgId: string, input: any): Promise<any> {
        return { success: true, organization_id: orgId, new_status: input.new_status };
      }
      async reactivateVoluntarySuspension(orgId: string): Promise<any> {
        return { success: true, organization_id: orgId, status: 'active' };
      }
    }

    const repo = new MockOrgRepo();
    const org = await repo.findById('org-99');
    expect(org?.slug).toBe('offshore-energy');
  });

  it('allows mock MembershipRepository implementation adhering to domain interface', async () => {
    class MockMembershipRepo implements MembershipRepository {
      async findByUserId(userId: string): Promise<OrganizationMembership[]> {
        return userId === 'user-77' ? [mockMembership] : [];
      }
      async findUserMembershipInOrg(userId: string, organizationId: string): Promise<OrganizationMembership | null> {
        return userId === 'user-77' && organizationId === 'org-99' ? mockMembership : null;
      }
      async getRoster(_orgId: string): Promise<any> {
        return [];
      }
      async manageMembership(_orgId: string, input: any): Promise<any> {
        return { success: true, action: input.action, membership_id: 'mem-1' };
      }
    }

    const repo = new MockMembershipRepo();
    const memberships = await repo.findByUserId('user-77');
    expect(memberships).toHaveLength(1);
    expect(memberships[0].role_key).toBe('business_admin');
  });
});
