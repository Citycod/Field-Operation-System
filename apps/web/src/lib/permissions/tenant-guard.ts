import { OrganizationMembership } from '@field/types';

export class UnauthorizedTenantAccessError extends Error {
  constructor(userId: string, organizationId: string) {
    super(`User '${userId}' is not a valid active member of organization '${organizationId}'`);
    this.name = 'UnauthorizedTenantAccessError';
  }
}

export interface TenantContext {
  userId: string;
  organizationId: string;
  roleKey: string;
}

export function validateOrganizationMembership(
  userId: string,
  targetOrganizationId: string,
  memberships: OrganizationMembership[]
): TenantContext {
  const matchingMembership = memberships.find(
    (m) =>
      m.user_id === userId &&
      m.organization_id === targetOrganizationId &&
      m.status === 'active'
  );

  if (!matchingMembership) {
    throw new UnauthorizedTenantAccessError(userId, targetOrganizationId);
  }

  return {
    userId: matchingMembership.user_id,
    organizationId: matchingMembership.organization_id,
    roleKey: matchingMembership.role_key,
  };
}
