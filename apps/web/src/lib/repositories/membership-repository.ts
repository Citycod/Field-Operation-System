import {
  OrganizationMembership,
  OrganizationMemberRosterItem,
  ManageMembershipInput,
  ManageMembershipResult,
} from '@field/types';

export interface MembershipQueryOptions {
  /**
   * If true, allows lookup even if the parent organization is suspended or archived.
   * Reserved strictly for authorized platform-level administrative operations.
   * Defaults to false (ordinary tenant operations require active organization status).
   */
  allowInactiveOrg?: boolean;
}

export interface MembershipRepository {
  /**
   * Finds all active organization memberships for a user.
   */
  findByUserId(userId: string): Promise<OrganizationMembership[]>;

  /**
   * Finds a specific membership for a user in a target organization.
   * For ordinary tenant operations, requires both membership AND organization to be active.
   */
  findUserMembershipInOrg(
    userId: string,
    organizationId: string,
    options?: MembershipQueryOptions,
  ): Promise<OrganizationMembership | null>;

  /**
   * Returns the roster of members in an organization joined with user profile metadata.
   */
  getRoster(organizationId: string): Promise<OrganizationMemberRosterItem[]>;

  /**
   * Manages a member's role or status via the serialized manage_organization_membership RPC.
   */
  manageMembership(
    organizationId: string,
    input: ManageMembershipInput,
  ): Promise<ManageMembershipResult>;
}


