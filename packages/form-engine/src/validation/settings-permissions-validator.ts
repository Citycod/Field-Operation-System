import { ValidationError } from './types';

export const VALID_PLATFORM_ROLES = [
  'super_admin',
  'business_admin',
  'manager',
  'employee',
] as const;

export type ValidPlatformRole = (typeof VALID_PLATFORM_ROLES)[number];

export function validateFormSettings(
  settings: unknown,
  path = 'settings',
): ValidationError[] {
  const errors: ValidationError[] = [];
  if (settings === undefined || settings === null) return errors;

  if (typeof settings !== 'object' || Array.isArray(settings)) {
    errors.push({
      path,
      code: 'INVALID_SETTINGS',
      message: 'Settings must be an object',
    });
    return errors;
  }

  const s = settings as Record<string, unknown>;

  if (s.allowDrafts !== undefined && typeof s.allowDrafts !== 'boolean') {
    errors.push({
      path: `${path}.allowDrafts`,
      code: 'INVALID_SETTINGS_ALLOW_DRAFTS',
      message: 'allowDrafts must be a boolean',
    });
  }

  if (s.referenceNumber !== undefined) {
    if (
      typeof s.referenceNumber !== 'object' ||
      s.referenceNumber === null ||
      Array.isArray(s.referenceNumber)
    ) {
      errors.push({
        path: `${path}.referenceNumber`,
        code: 'INVALID_SETTINGS_REFERENCE_NUMBER',
        message: 'referenceNumber must be an object',
      });
    } else {
      const ref = s.referenceNumber as Record<string, unknown>;
      if (ref.enabled !== undefined && typeof ref.enabled !== 'boolean') {
        errors.push({
          path: `${path}.referenceNumber.enabled`,
          code: 'INVALID_SETTINGS_REFERENCE_ENABLED',
          message: 'enabled must be a boolean',
        });
      }

      if (ref.prefix !== undefined && typeof ref.prefix !== 'string') {
        errors.push({
          path: `${path}.referenceNumber.prefix`,
          code: 'INVALID_SETTINGS_REFERENCE_PREFIX',
          message: 'prefix must be a string',
        });
      } else if (typeof ref.prefix === 'string' && ref.prefix.length > 20) {
        errors.push({
          path: `${path}.referenceNumber.prefix`,
          code: 'INVALID_SETTINGS_REFERENCE_PREFIX_LENGTH',
          message: 'prefix cannot exceed 20 characters',
        });
      }

      if (ref.suffix !== undefined && typeof ref.suffix !== 'string') {
        errors.push({
          path: `${path}.referenceNumber.suffix`,
          code: 'INVALID_SETTINGS_REFERENCE_SUFFIX',
          message: 'suffix must be a string',
        });
      } else if (typeof ref.suffix === 'string' && ref.suffix.length > 20) {
        errors.push({
          path: `${path}.referenceNumber.suffix`,
          code: 'INVALID_SETTINGS_REFERENCE_SUFFIX_LENGTH',
          message: 'suffix cannot exceed 20 characters',
        });
      }

      if (ref.sequenceLength !== undefined) {
        if (
          typeof ref.sequenceLength !== 'number' ||
          !Number.isInteger(ref.sequenceLength) ||
          ref.sequenceLength < 3 ||
          ref.sequenceLength > 12
        ) {
          errors.push({
            path: `${path}.referenceNumber.sequenceLength`,
            code: 'INVALID_SETTINGS_SEQUENCE_LENGTH',
            message: 'sequenceLength must be an integer between 3 and 12',
          });
        }
      }
    }
  }

  if (s.publicAccess !== undefined) {
    if (
      typeof s.publicAccess !== 'object' ||
      s.publicAccess === null ||
      Array.isArray(s.publicAccess)
    ) {
      errors.push({
        path: `${path}.publicAccess`,
        code: 'INVALID_SETTINGS_PUBLIC_ACCESS',
        message: 'publicAccess must be an object',
      });
    } else {
      const pa = s.publicAccess as Record<string, unknown>;
      if (pa.enabled !== undefined && typeof pa.enabled !== 'boolean') {
        errors.push({
          path: `${path}.publicAccess.enabled`,
          code: 'INVALID_SETTINGS_PUBLIC_ACCESS_ENABLED',
          message: 'enabled must be a boolean',
        });
      }
      if (pa.customSlug !== undefined) {
        if (typeof pa.customSlug !== 'string') {
          errors.push({
            path: `${path}.publicAccess.customSlug`,
            code: 'INVALID_SETTINGS_PUBLIC_SLUG',
            message: 'customSlug must be a string',
          });
        } else if (
          pa.customSlug.length > 0 &&
          !/^[a-z0-9][a-z0-9-_]{2,60}$/i.test(pa.customSlug)
        ) {
          errors.push({
            path: `${path}.publicAccess.customSlug`,
            code: 'INVALID_SETTINGS_PUBLIC_SLUG_FORMAT',
            message:
              'customSlug must be between 3 and 60 alphanumeric characters with dashes or underscores',
          });
        }
      }
      if (
        pa.allowAnonymousSubmissions !== undefined &&
        typeof pa.allowAnonymousSubmissions !== 'boolean'
      ) {
        errors.push({
          path: `${path}.publicAccess.allowAnonymousSubmissions`,
          code: 'INVALID_SETTINGS_ANONYMOUS_SUBMISSIONS',
          message: 'allowAnonymousSubmissions must be a boolean',
        });
      }
      if (
        pa.requireCaptcha !== undefined &&
        typeof pa.requireCaptcha !== 'boolean'
      ) {
        errors.push({
          path: `${path}.publicAccess.requireCaptcha`,
          code: 'INVALID_SETTINGS_CAPTCHA',
          message: 'requireCaptcha must be a boolean',
        });
      }
    }
  }

  if (s.notifications !== undefined) {
    if (
      typeof s.notifications !== 'object' ||
      s.notifications === null ||
      Array.isArray(s.notifications)
    ) {
      errors.push({
        path: `${path}.notifications`,
        code: 'INVALID_SETTINGS_NOTIFICATIONS',
        message: 'notifications must be an object',
      });
    } else {
      const notif = s.notifications as Record<string, unknown>;
      for (const key of [
        'emailOnSubmit',
        'emailOnApprove',
        'emailOnReject',
        'onSubmit',
        'onApproval',
        'onRejection',
        'onReturn',
      ]) {
        if (notif[key] !== undefined && typeof notif[key] !== 'boolean') {
          errors.push({
            path: `${path}.notifications.${key}`,
            code: 'INVALID_SETTINGS_NOTIFICATION_TOGGLE',
            message: `${key} must be a boolean`,
          });
        }
      }
    }
  }

  return errors;
}

export function validateFormPermissions(
  permissions: unknown,
  path = 'permissions',
): ValidationError[] {
  const errors: ValidationError[] = [];
  if (permissions === undefined || permissions === null) return errors;

  if (typeof permissions !== 'object' || Array.isArray(permissions)) {
    errors.push({
      path,
      code: 'INVALID_PERMISSIONS',
      message: 'Permissions must be an object',
    });
    return errors;
  }

  const p = permissions as Record<string, unknown>;
  const roleFields = [
    'createRoles',
    'readOwnRoles',
    'readAllRoles',
    'manageFormRoles',
  ] as const;

  for (const field of roleFields) {
    if (p[field] !== undefined) {
      if (!Array.isArray(p[field])) {
        errors.push({
          path: `${path}.${field}`,
          code: 'INVALID_PERMISSIONS_ROLES_ARRAY',
          message: `${field} must be an array of role keys`,
        });
      } else {
        const roles = p[field] as unknown[];
        for (let i = 0; i < roles.length; i++) {
          const role = roles[i];
          if (
            typeof role !== 'string' ||
            !VALID_PLATFORM_ROLES.includes(role as any)
          ) {
            errors.push({
              path: `${path}.${field}[${i}]`,
              code: 'INVALID_PERMISSIONS_ROLE_NAME',
              message: `Unknown role "${String(role)}". Supported roles: ${VALID_PLATFORM_ROLES.join(', ')}`,
            });
          }
        }
      }
    }
  }

  // Critical Safeguard: manageFormRoles cannot lock out all administrators
  if (Array.isArray(p.manageFormRoles) && p.manageFormRoles.length > 0) {
    const hasAdmin = p.manageFormRoles.some(
      (r) => r === 'business_admin' || r === 'super_admin',
    );
    if (!hasAdmin) {
      errors.push({
        path: `${path}.manageFormRoles`,
        code: 'ADMIN_LOCKOUT_PREVENTED',
        message:
          'manageFormRoles must include business_admin or super_admin to prevent administrative lockout',
      });
    }
  }

  return errors;
}

