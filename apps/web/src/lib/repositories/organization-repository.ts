import {
  Organization,
  OrganizationProfile,
  CreateWorkspaceInput,
  WorkspaceProvisioningResult,
  UpdateOrganizationProfileInput,
  OnboardingCompletionResult,
  LegacyProfileResolutionResult,
  ManageLifecycleInput,
  ManageLifecycleResult,
} from '@field/types';

export interface OrganizationRepository {
  /**
   * Atomically creates an organization, assigns initial business_admin membership to auth.uid(),
   * and creates an initial organization profile via the trusted create_business_workspace RPC.
   */
  createWorkspace(input: CreateWorkspaceInput): Promise<WorkspaceProvisioningResult>;

  /**
   * Finds an active organization by unique ID.
   */
  findById(id: string): Promise<Organization | null>;
  getById(id: string): Promise<Organization | null>;

  /**
   * Finds multiple active organizations by array of IDs.
   */
  findManyByIds(ids: string[]): Promise<Organization[]>;

  /**
   * Finds an active organization by unique slug.
   */
  findBySlug(slug: string): Promise<Organization | null>;
  getBySlug(slug: string): Promise<Organization | null>;

  /**
   * Lists all active organizations that a user belongs to.
   */
  listForUser(userId: string): Promise<Organization[]>;

  /**
   * Retrieves the organization profile for an organization.
   */
  getProfile(organizationId: string): Promise<OrganizationProfile | null>;

  /**
   * Updates organization profile fields.
   */
  updateProfile(
    organizationId: string,
    updates: UpdateOrganizationProfileInput,
  ): Promise<OrganizationProfile>;

  /**
   * Atomically completes organization onboarding wizard.
   */
  completeOnboarding(organizationId: string): Promise<OnboardingCompletionResult>;

  /**
   * Resolves a legacy organization profile banner.
   */
  resolveLegacyProfile(organizationId: string): Promise<LegacyProfileResolutionResult>;

  /**
   * Manages organization lifecycle (suspend, reactivate, archive) via privileged RPC.
   */
  manageLifecycle(
    organizationId: string,
    input: ManageLifecycleInput,
  ): Promise<ManageLifecycleResult>;

  /**
   * Reactivates an organization that was voluntarily suspended by a tenant super administrator.
   */
  reactivateVoluntarySuspension(organizationId: string): Promise<ManageLifecycleResult>;
}

