import { OrganizationMembership } from '@field/types';

export interface MembershipRepository {
  /**
   * Finds all active organization memberships for a user.
   */
  findByUserId(userId: string): Promise<OrganizationMembership[]>;

  /**
   * Finds a specific membership for a user in a target organization.
   */
  findUserMembershipInOrg(userId: string, organizationId: string): Promise<OrganizationMembership | null>;
}
