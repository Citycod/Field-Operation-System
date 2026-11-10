import { Organization, OrganizationMembership, PlatformRole } from './organization';

export interface UserProfile {
  id: string;
  email: string;
  first_name?: string;
  last_name?: string;
  avatar_url?: string;
  status: string;
}

export interface AuthState {
  user: UserProfile | null;
  activeOrganization: Organization | null;
  memberships: OrganizationMembership[];
  currentRole: PlatformRole | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

export type PermissionKey =
  | 'forms.read'
  | 'forms.create'
  | 'forms.edit'
  | 'forms.publish'
  | 'data_sources.read'
  | 'data_sources.manage'
  | 'submissions.create'
  | 'submissions.read_own'
  | 'submissions.read_all'
  | 'approvals.read_assigned'
  | 'approvals.decide';
