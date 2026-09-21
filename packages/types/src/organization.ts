export type OrganizationStatus = 'active' | 'suspended' | 'archived';

export interface Organization {
  id: string;
  name: string;
  slug: string;
  status: OrganizationStatus;
  created_at: string;
  updated_at: string;
}

export type PlatformRole = 'super_admin' | 'business_admin' | 'manager' | 'employee';

export interface OrganizationMembership {
  id: string;
  organization_id: string;
  user_id: string;
  role_key: PlatformRole;
  status: 'active' | 'invited' | 'disabled';
  created_at: string;
  updated_at: string;
}
