import { describe, it, expect } from 'vitest';
import { validateOrganizationMembership, UnauthorizedTenantAccessError } from '@/lib/permissions/tenant-guard';
import { OrganizationMembership } from '@field/types';

describe('Tenant Isolation & Membership Security Guard', () => {
  const mockMemberships: OrganizationMembership[] = [
    {
      id: 'mem_1',
      organization_id: 'org_nig_og',
      user_id: 'usr_1',
      role_key: 'business_admin',
      status: 'active',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: 'mem_2',
      organization_id: 'org_uk_rental',
      user_id: 'usr_1',
      role_key: 'manager',
      status: 'active',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ];

  it('allows access when user has an active membership in the target organization', () => {
    const context = validateOrganizationMembership('usr_1', 'org_nig_og', mockMemberships, 'active');
    expect(context.organizationId).toBe('org_nig_og');
    expect(context.roleKey).toBe('business_admin');
  });

  it('rejects access and throws UnauthorizedTenantAccessError when user has NO membership in target organization', () => {
    expect(() =>
      validateOrganizationMembership('usr_1', 'org_unauthorized_999', mockMemberships, 'active')
    ).toThrowError(UnauthorizedTenantAccessError);
  });

  it('rejects access if membership status is disabled or inactive', () => {
    const disabledMembership: OrganizationMembership[] = [
      {
        id: 'mem_3',
        organization_id: 'org_disabled_tenant',
        user_id: 'usr_1',
        role_key: 'employee',
        status: 'disabled',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ];

    expect(() =>
      validateOrganizationMembership('usr_1', 'org_disabled_tenant', disabledMembership, 'active')
    ).toThrowError(UnauthorizedTenantAccessError);
  });

  describe('Organization Status & Membership Status Security Matrix', () => {
    const testCases: Array<{
      orgStatus: 'active' | 'suspended' | 'archived';
      memStatus: 'active' | 'invited' | 'disabled';
      expected: 'allow' | 'deny';
      description: string;
    }> = [
      { orgStatus: 'active', memStatus: 'active', expected: 'allow', description: 'active org + active membership -> ALLOW' },
      { orgStatus: 'suspended', memStatus: 'active', expected: 'deny', description: 'suspended org + active membership -> DENY' },
      { orgStatus: 'archived', memStatus: 'active', expected: 'deny', description: 'archived org + active membership -> DENY' },
      { orgStatus: 'active', memStatus: 'invited', expected: 'deny', description: 'active org + invited membership -> DENY' },
      { orgStatus: 'active', memStatus: 'disabled', expected: 'deny', description: 'active org + disabled membership -> DENY' },
      { orgStatus: 'suspended', memStatus: 'invited', expected: 'deny', description: 'suspended org + invited membership -> DENY' },
      { orgStatus: 'archived', memStatus: 'disabled', expected: 'deny', description: 'archived org + disabled membership -> DENY' },
    ];

    testCases.forEach(({ orgStatus, memStatus, expected, description }) => {
      it(description, () => {
        const memberships: OrganizationMembership[] = [
          {
            id: 'mem_test',
            organization_id: 'org_matrix',
            user_id: 'user_matrix',
            role_key: 'business_admin',
            status: memStatus,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ];

        if (expected === 'allow') {
          const result = validateOrganizationMembership('user_matrix', 'org_matrix', memberships, orgStatus);
          expect(result.organizationId).toBe('org_matrix');
          expect(result.roleKey).toBe('business_admin');
        } else {
          expect(() =>
            validateOrganizationMembership('user_matrix', 'org_matrix', memberships, orgStatus)
          ).toThrowError(UnauthorizedTenantAccessError);
        }
      });
    });

    it('denies cross-tenant access when user is admin in Org A but requests Org B', () => {
      const userMemberships: OrganizationMembership[] = [
        {
          id: 'mem_a',
          organization_id: 'org_alpha',
          user_id: 'user_multi',
          role_key: 'business_admin',
          status: 'active',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ];

      expect(() =>
        validateOrganizationMembership('user_multi', 'org_beta', userMemberships, 'active')
      ).toThrowError(UnauthorizedTenantAccessError);
    });

    it('preserves distinct role resolution across multiple organizations for the same user', () => {
      const multiOrgMemberships: OrganizationMembership[] = [
        {
          id: 'mem_a',
          organization_id: 'org_alpha',
          user_id: 'user_multi',
          role_key: 'business_admin',
          status: 'active',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        {
          id: 'mem_b',
          organization_id: 'org_beta',
          user_id: 'user_multi',
          role_key: 'manager',
          status: 'active',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ];

      const alphaContext = validateOrganizationMembership('user_multi', 'org_alpha', multiOrgMemberships, 'active');
      expect(alphaContext.roleKey).toBe('business_admin');

      const betaContext = validateOrganizationMembership('user_multi', 'org_beta', multiOrgMemberships, 'active');
      expect(betaContext.roleKey).toBe('manager');
    });
  });
});
