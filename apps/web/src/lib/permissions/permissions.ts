import { PermissionKey, PlatformRole } from '@field/types';

const ROLE_PERMISSIONS: Record<PlatformRole, PermissionKey[]> = {
  super_admin: [
    'forms.read',
    'forms.create',
    'forms.edit',
    'forms.publish',
    'submissions.create',
    'submissions.read_own',
    'submissions.read_all',
    'approvals.read_assigned',
    'approvals.decide',
  ],
  business_admin: [
    'forms.read',
    'forms.create',
    'forms.edit',
    'forms.publish',
    'submissions.create',
    'submissions.read_own',
    'submissions.read_all',
    'approvals.read_assigned',
    'approvals.decide',
  ],
  manager: [
    'forms.read',
    'submissions.create',
    'submissions.read_own',
    'submissions.read_all',
    'approvals.read_assigned',
    'approvals.decide',
  ],
  employee: [
    'forms.read',
    'submissions.create',
    'submissions.read_own',
  ],
};

export function hasPermission(role: PlatformRole | null, permission: PermissionKey): boolean {
  if (!role) return false;
  const permissions = ROLE_PERMISSIONS[role] || [];
  return permissions.includes(permission);
}
