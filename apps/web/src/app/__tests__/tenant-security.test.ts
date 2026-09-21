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
    const context = validateOrganizationMembership('usr_1', 'org_nig_og', mockMemberships);
    expect(context.organizationId).toBe('org_nig_og');
    expect(context.roleKey).toBe('business_admin');
  });

  it('rejects access and throws UnauthorizedTenantAccessError when user has NO membership in target organization', () => {
    expect(() =>
      validateOrganizationMembership('usr_1', 'org_unauthorized_999', mockMemberships)
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
      validateOrganizationMembership('usr_1', 'org_disabled_tenant', disabledMembership)
    ).toThrowError(UnauthorizedTenantAccessError);
  });
});
