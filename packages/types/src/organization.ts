export type OrganizationStatus = 'active' | 'suspended' | 'archived';

export interface Organization {
  id: string;
  name: string;
  slug: string;
  status: OrganizationStatus;
  created_at: string;
  updated_at: string;
}

export type OnboardingStep = 'profile' | 'team_invites' | 'completed';
export type OnboardingStatus = 'not_started' | 'in_progress' | 'completed' | 'legacy_unresolved';

export interface OrganizationProfile {
  organization_id: string;
  business_email?: string | null;
  business_phone?: string | null;
  industry?: string | null;
  address_line_1?: string | null;
  address_line_2?: string | null;
  city?: string | null;
  state_region?: string | null;
  postal_code?: string | null;
  country_code?: string | null;
  website?: string | null;
  logo_path?: string | null;
  timezone: string;
  currency_code: string;
  date_format: string;
  settings?: Record<string, unknown>;
  requires_onboarding: boolean;
  onboarding_completed: boolean;
  onboarding_step: OnboardingStep;
  onboarding_status: OnboardingStatus;
  onboarding_completed_at?: string | null;
  created_at: string;
  updated_at: string;
}

export type PlatformRole = 'super_admin' | 'business_admin' | 'manager' | 'employee';

export type InvitationRole = 'manager' | 'employee';
export type InvitationStatus = 'pending' | 'accepted' | 'revoked' | 'expired';

export interface OrganizationInvitation {
  id: string;
  organization_id: string;
  email: string;
  role: InvitationRole;
  status: InvitationStatus;
  invited_by: string;
  expires_at: string;
  accepted_at?: string | null;
  revoked_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface InvitationPreview {
  organization_id: string;
  organization_name: string;
  email: string;
  role: InvitationRole;
  expires_at: string;
}

export interface CreateInvitationInput {
  email: string;
  role: InvitationRole;
  expires_at?: string;
}

export interface AcceptInvitationResult {
  organization_id: string;
  membership_id: string;
  role_key: InvitationRole;
  status: string;
  message?: string;
}

export interface OnboardingCompletionResult {
  success: boolean;
  organization_id: string;
  onboarding_completed: boolean;
  onboarding_step?: string;
  onboarding_status: string;
  onboarding_completed_at?: string;
  already_completed?: boolean;
}

export interface LegacyProfileResolutionResult {
  success: boolean;
  organization_id: string;
  onboarding_status: string;
  already_resolved?: boolean;
  resolved_at?: string;
}

export interface OrganizationMembership {
  id: string;
  organization_id: string;
  user_id: string;
  role_key: PlatformRole;
  status: 'active' | 'invited' | 'disabled';
  created_at: string;
  updated_at: string;
}

export interface CreateWorkspaceInput {
  name: string;
  slug?: string;
  profile?: {
    business_email?: string;
    business_phone?: string;
    industry?: string;
    address_line_1?: string;
    address_line_2?: string;
    city?: string;
    state_region?: string;
    postal_code?: string;
    country_code?: string;
    website?: string;
    logo_path?: string;
    timezone?: string;
    currency_code?: string;
    date_format?: string;
    settings?: Record<string, unknown>;
  };
}

export interface WorkspaceProvisioningResult {
  organization: Organization;
  membership: OrganizationMembership;
  profile?: OrganizationProfile;
}

export interface UpdateOrganizationProfileInput {
  business_email?: string | null;
  business_phone?: string | null;
  industry?: string | null;
  address_line_1?: string | null;
  address_line_2?: string | null;
  city?: string | null;
  state_region?: string | null;
  postal_code?: string | null;
  country_code?: string | null;
  website?: string | null;
  logo_path?: string | null;
  timezone?: string;
  currency_code?: string;
  date_format?: string;
  settings?: Record<string, unknown>;
}

export interface OrganizationMemberRosterItem {
  membership_id: string;
  organization_id: string;
  user_id: string;
  role_key: PlatformRole;
  status: 'active' | 'invited' | 'disabled';
  email?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  display_name?: string | null;
  avatar_url?: string | null;
  created_at: string;
  updated_at: string;
}

export type ManageMembershipAction = 'update_role' | 'remove';

export interface ManageMembershipInput {
  target_user_id: string;
  action: ManageMembershipAction;
  new_role?: PlatformRole;
}

export interface ManageMembershipResult {
  success: boolean;
  action: ManageMembershipAction;
  membership_id: string;
  organization_id: string;
  user_id: string;
  role_key?: PlatformRole;
  status: string;
  updated_at: string;
}

export interface ManageLifecycleInput {
  new_status: OrganizationStatus;
  reason?: string;
}

export interface ManageLifecycleResult {
  success: boolean;
  organization_id: string;
  old_status?: OrganizationStatus;
  new_status?: OrganizationStatus;
  status?: OrganizationStatus;
  suspension_type?: string | null;
  already_in_state?: boolean;
  updated_at?: string;
  reactivated_at?: string;
}

export interface AuditLogEntry {
  id: string;
  organization_id?: string | null;
  actor_id?: string | null;
  actor_email: string;
  actor_role: string;
  actor_display_name?: string | null;
  event_type: string;
  entity_type: string;
  entity_id: string;
  action: string;
  metadata: Record<string, unknown>;
  ip_address?: string | null;
  user_agent?: string | null;
  created_at: string;
}

export type PlatformAdministratorRole = 'platform_super_admin' | 'platform_support' | 'platform_auditor';

export interface PlatformAdministrator {
  user_id: string;
  role: PlatformAdministratorRole;
  is_active?: boolean;
  created_at: string;
  created_by?: string | null;
  updated_at?: string;
}


