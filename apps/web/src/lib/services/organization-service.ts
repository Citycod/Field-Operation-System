import { OrganizationRepository } from '../repositories/organization-repository';
import { MembershipRepository } from '../repositories/membership-repository';
import {
  Organization,
  OrganizationProfile,
  CreateWorkspaceInput,
  WorkspaceProvisioningResult,
  UpdateOrganizationProfileInput,
  PlatformRole,
  OnboardingCompletionResult,
  LegacyProfileResolutionResult,
  OrganizationMemberRosterItem,
  ManageMembershipInput,
  ManageMembershipResult,
  ManageLifecycleInput,
  ManageLifecycleResult,
} from '@field/types';
import { generateSlug, RESERVED_SLUGS, SLUG_PATTERN } from '../organizations/slug';
export { generateSlug };

export class SlugAlreadyExistsError extends Error {
  readonly code = 'SLUG_ALREADY_EXISTS';
  constructor(slug: string) {
    super(`Business identifier "${slug}" is already in use. Please choose another.`);
    this.name = 'SlugAlreadyExistsError';
  }
}

export class InvalidOrganizationInputError extends Error {
  readonly code = 'INVALID_INPUT';
  constructor(message: string) {
    super(message);
    this.name = 'InvalidOrganizationInputError';
  }
}

export class UnauthorizedOrganizationAccessError extends Error {
  readonly code = 'UNAUTHORIZED';
  constructor(message: string) {
    super(message);
    this.name = 'UnauthorizedOrganizationAccessError';
  }
}

export class OrganizationService {
  constructor(
    private readonly organizationRepository: OrganizationRepository,
    private readonly membershipRepository: MembershipRepository,
  ) {}

  async createWorkspace(
    userId: string,
    input: CreateWorkspaceInput,
  ): Promise<WorkspaceProvisioningResult> {
    if (!userId || !userId.trim()) {
      throw new UnauthorizedOrganizationAccessError('Authentication required to create a workspace.');
    }

    const name = input.name?.trim();
    if (!name || name.length < 2) {
      throw new InvalidOrganizationInputError('Business name must be at least 2 characters.');
    }
    if (name.length > 100) {
      throw new InvalidOrganizationInputError('Business name must not exceed 100 characters.');
    }

    const rawSlug = input.slug?.trim() || generateSlug(name);
    const slug = rawSlug.toLowerCase();

    if (!SLUG_PATTERN.test(slug)) {
      throw new InvalidOrganizationInputError(
        'Business identifier (slug) must be 2-50 characters using only lowercase letters, numbers, and hyphens.',
      );
    }

    if (RESERVED_SLUGS.has(slug)) {
      throw new InvalidOrganizationInputError(`The business identifier "${slug}" is reserved.`);
    }

    try {
      const result = await this.organizationRepository.createWorkspace({
        name,
        slug,
        profile: input.profile,
      });

      result.membership.user_id = userId;
      return result;
    } catch (error: any) {
      const message = error?.message || '';
      const code = error?.code || '';
      if (code === '23505' || message.includes('already in use') || message.includes('unique constraint')) {
        throw new SlugAlreadyExistsError(slug);
      }
      throw error;
    }
  }

  async getOrganization(
    userId: string,
    organizationId: string,
  ): Promise<{ organization: Organization; profile: OrganizationProfile | null }> {
    const membership = await this.membershipRepository.findUserMembershipInOrg(userId, organizationId);
    if (!membership || membership.status !== 'active') {
      throw new UnauthorizedOrganizationAccessError(
        `User ${userId} does not have active access to organization ${organizationId}`,
      );
    }

    const organization = await this.organizationRepository.findById(organizationId);
    if (!organization) {
      throw new Error(`Organization ${organizationId} not found or inactive.`);
    }

    const profile = await this.organizationRepository.getProfile(organizationId);
    return { organization, profile };
  }

  async updateOrganizationProfile(
    userId: string,
    organizationId: string,
    updates: UpdateOrganizationProfileInput,
  ): Promise<OrganizationProfile> {
    const membership = await this.membershipRepository.findUserMembershipInOrg(userId, organizationId);
    if (!membership || membership.status !== 'active') {
      throw new UnauthorizedOrganizationAccessError(
        `User ${userId} does not have active access to organization ${organizationId}`,
      );
    }

    const allowedRoles: PlatformRole[] = ['business_admin', 'super_admin'];
    if (!allowedRoles.includes(membership.role_key)) {
      throw new UnauthorizedOrganizationAccessError(
        `Only business administrators can update organization settings.`,
      );
    }

    return this.organizationRepository.updateProfile(organizationId, updates);
  }

  async listUserOrganizations(userId: string): Promise<Organization[]> {
    if (!userId) return [];
    return this.organizationRepository.listForUser(userId);
  }

  async completeOnboarding(
    userId: string,
    organizationId: string,
  ): Promise<OnboardingCompletionResult> {
    const membership = await this.membershipRepository.findUserMembershipInOrg(userId, organizationId);
    if (!membership || membership.status !== 'active') {
      throw new UnauthorizedOrganizationAccessError(
        `User ${userId} does not have active access to organization ${organizationId}`,
      );
    }

    const allowedRoles: PlatformRole[] = ['business_admin', 'super_admin'];
    if (!allowedRoles.includes(membership.role_key)) {
      throw new UnauthorizedOrganizationAccessError(
        `Only business administrators can complete organization onboarding.`,
      );
    }

    return this.organizationRepository.completeOnboarding(organizationId);
  }

  async resolveLegacyProfile(
    userId: string,
    organizationId: string,
  ): Promise<LegacyProfileResolutionResult> {
    const membership = await this.membershipRepository.findUserMembershipInOrg(userId, organizationId);
    if (!membership || membership.status !== 'active') {
      throw new UnauthorizedOrganizationAccessError(
        `User ${userId} does not have active access to organization ${organizationId}`,
      );
    }

    const allowedRoles: PlatformRole[] = ['business_admin', 'super_admin'];
    if (!allowedRoles.includes(membership.role_key)) {
      throw new UnauthorizedOrganizationAccessError(
        `Only business administrators can resolve legacy organization settings.`,
      );
    }

    return this.organizationRepository.resolveLegacyProfile(organizationId);
  }

  async getMembersRoster(
    userId: string,
    organizationId: string,
  ): Promise<OrganizationMemberRosterItem[]> {
    const membership = await this.membershipRepository.findUserMembershipInOrg(userId, organizationId);
    if (!membership || membership.status !== 'active') {
      throw new UnauthorizedOrganizationAccessError(
        `User ${userId} does not have active access to organization ${organizationId}`,
      );
    }

    return this.membershipRepository.getRoster(organizationId);
  }

  async manageMembership(
    userId: string,
    organizationId: string,
    input: ManageMembershipInput,
  ): Promise<ManageMembershipResult> {
    const membership = await this.membershipRepository.findUserMembershipInOrg(userId, organizationId);
    if (!membership || membership.status !== 'active') {
      throw new UnauthorizedOrganizationAccessError(
        `User ${userId} does not have active access to organization ${organizationId}`,
      );
    }

    // Self-leave allowed; all other mutations require business_admin or super_admin
    const isSelfAction = userId === input.target_user_id && input.action === 'remove';
    const isAdmin = ['business_admin', 'super_admin'].includes(membership.role_key);

    if (!isSelfAction && !isAdmin) {
      throw new UnauthorizedOrganizationAccessError(
        `Administrator privileges required to manage team members.`,
      );
    }

    return this.membershipRepository.manageMembership(organizationId, input);
  }

  async manageLifecycle(
    userId: string,
    organizationId: string,
    input: ManageLifecycleInput,
  ): Promise<ManageLifecycleResult> {
    const membership = await this.membershipRepository.findUserMembershipInOrg(userId, organizationId);
    if (!membership || membership.status !== 'active') {
      throw new UnauthorizedOrganizationAccessError(
        `User ${userId} does not have active access to organization ${organizationId}`,
      );
    }

    if (membership.role_key !== 'super_admin') {
      throw new UnauthorizedOrganizationAccessError(
        `Only tenant super administrators can modify organization lifecycle states.`,
      );
    }

    return this.organizationRepository.manageLifecycle(organizationId, input);
  }

  async reactivateVoluntarySuspension(
    userId: string,
    organizationId: string,
  ): Promise<ManageLifecycleResult> {
    const membership = await this.membershipRepository.findUserMembershipInOrg(
      userId,
      organizationId,
      { allowInactiveOrg: true },
    );

    if (!membership || membership.status !== 'active') {
      throw new UnauthorizedOrganizationAccessError(
        `Active organization membership required to reactivate organization.`,
      );
    }

    if (membership.role_key !== 'super_admin') {
      throw new UnauthorizedOrganizationAccessError(
        `Only tenant super administrators can reactivate a voluntarily suspended workspace.`,
      );
    }

    return this.organizationRepository.reactivateVoluntarySuspension(organizationId);
  }
}

