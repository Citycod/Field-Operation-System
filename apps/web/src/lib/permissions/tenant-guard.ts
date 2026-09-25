import { OrganizationMembership } from '@field/types';
import { getCurrentUser, getUserMemberships } from '@/lib/supabase/auth';

export class UnauthorizedTenantAccessError extends Error {
  constructor(userId: string, organizationId: string) {
    super(`User '${userId}' is not a valid active member of organization '${organizationId}'`);
    this.name = 'UnauthorizedTenantAccessError';
  }
}

export class UnauthenticatedSessionError extends Error {
  constructor() {
    super('Unauthenticated operation rejected: valid session required');
    this.name = 'UnauthenticatedSessionError';
  }
}

export interface TenantContext {
  userId: string;
  organizationId: string;
  roleKey: string;
}

/**
 * Pure validation helper for verifying user membership in target organization.
 */
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

/**
 * Server-side authorization check enforcing user identity from the authenticated session context.
 * NEVER trust client-supplied userId strings for server-side access control.
 */
export async function assertTenantAccessFromSession(targetOrganizationId: string): Promise<TenantContext> {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    throw new UnauthenticatedSessionError();
  }

  const memberships = await getUserMemberships(currentUser.id);
  return validateOrganizationMembership(currentUser.id, targetOrganizationId, memberships);
}
