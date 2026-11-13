import { describe, it, expect } from 'vitest';
import {
  validateFormSettings,
  validateFormPermissions,
} from '../validation/settings-permissions-validator';
import { validateDraftSchema } from '../validation/draft-validator';
import { validatePublishableSchema } from '../validation/publish-validator';
import { MINIMAL_VALID_SCHEMA } from '../fixtures/minimal-valid-schema';

describe('Settings & Permissions Validation', () => {
  describe('validateFormSettings', () => {
    it('accepts undefined, null, or empty settings for backwards compatibility', () => {
      expect(validateFormSettings(undefined)).toEqual([]);
      expect(validateFormSettings(null)).toEqual([]);
      expect(validateFormSettings({})).toEqual([]);
    });

    it('accepts valid full settings', () => {
      const valid = {
        allowDrafts: true,
        referenceNumber: {
          enabled: true,
          prefix: 'REQ-',
          suffix: '/2026',
          sequenceLength: 6,
        },
        notifications: {
          emailOnSubmit: true,
          emailOnApprove: true,
          emailOnReject: false,
        },
      };
      expect(validateFormSettings(valid)).toEqual([]);
    });

    it('accepts referenceNumber with enabled: false', () => {
      const disabledRef = {
        referenceNumber: {
          enabled: false,
          prefix: 'REQ-',
          sequenceLength: 5,
        },
      };
      expect(validateFormSettings(disabledRef)).toEqual([]);
    });

    it('rejects non-boolean referenceNumber.enabled', () => {
      const errors = validateFormSettings({
        referenceNumber: { enabled: 'yes' as any },
      });
      expect(errors).toHaveLength(1);
      expect(errors[0].code).toBe('INVALID_SETTINGS_REFERENCE_ENABLED');
    });

    it('accepts legacy notification settings and unknown properties for backwards compatibility', () => {
      const legacy = {
        notifications: {
          onSubmit: true,
          onApproval: false,
          onRejection: true,
          onReturn: true,
          customWebHook: 'https://example.com/webhook',
        },
      };
      expect(validateFormSettings(legacy)).toEqual([]);
    });

    it('rejects non-boolean legacy notification flags', () => {
      const errors = validateFormSettings({
        notifications: { onSubmit: 'invalid' as any },
      });
      expect(errors).toHaveLength(1);
      expect(errors[0].code).toBe('INVALID_SETTINGS_NOTIFICATION_TOGGLE');
    });

    it('rejects non-object settings', () => {
      const errors = validateFormSettings('invalid');
      expect(errors).toHaveLength(1);
      expect(errors[0].code).toBe('INVALID_SETTINGS');
    });

    it('rejects non-boolean allowDrafts', () => {
      const errors = validateFormSettings({ allowDrafts: 'yes' });
      expect(errors).toHaveLength(1);
      expect(errors[0].code).toBe('INVALID_SETTINGS_ALLOW_DRAFTS');
    });

    it('rejects non-object referenceNumber', () => {
      const errors = validateFormSettings({ referenceNumber: 'auto' });
      expect(errors).toHaveLength(1);
      expect(errors[0].code).toBe('INVALID_SETTINGS_REFERENCE_NUMBER');
    });

    it('rejects invalid sequenceLength', () => {
      expect(validateFormSettings({ referenceNumber: { sequenceLength: 1 } })[0]?.code).toBe(
        'INVALID_SETTINGS_SEQUENCE_LENGTH',
      );
      expect(validateFormSettings({ referenceNumber: { sequenceLength: 15 } })[0]?.code).toBe(
        'INVALID_SETTINGS_SEQUENCE_LENGTH',
      );
      expect(validateFormSettings({ referenceNumber: { sequenceLength: 4.5 } })[0]?.code).toBe(
        'INVALID_SETTINGS_SEQUENCE_LENGTH',
      );
    });

    it('rejects prefix or suffix that exceeds maximum length', () => {
      const longString = 'A'.repeat(25);
      const errors = validateFormSettings({
        referenceNumber: { prefix: longString, suffix: longString },
      });
      expect(errors).toHaveLength(2);
      expect(errors[0].code).toBe('INVALID_SETTINGS_REFERENCE_PREFIX_LENGTH');
      expect(errors[1].code).toBe('INVALID_SETTINGS_REFERENCE_SUFFIX_LENGTH');
    });

    it('rejects non-boolean notification flags', () => {
      const errors = validateFormSettings({
        notifications: { emailOnSubmit: 'true' as any },
      });
      expect(errors).toHaveLength(1);
      expect(errors[0].code).toBe('INVALID_SETTINGS_NOTIFICATION_TOGGLE');
    });
  });

  describe('validateFormPermissions', () => {
    it('accepts undefined, null, or empty permissions', () => {
      expect(validateFormPermissions(undefined)).toEqual([]);
      expect(validateFormPermissions(null)).toEqual([]);
      expect(validateFormPermissions({})).toEqual([]);
    });

    it('accepts valid project roles', () => {
      const valid = {
        createRoles: ['employee', 'manager', 'business_admin'],
        readOwnRoles: ['employee'],
        readAllRoles: ['manager', 'business_admin', 'super_admin'],
        manageFormRoles: ['business_admin', 'super_admin'],
      };
      expect(validateFormPermissions(valid)).toEqual([]);
    });

    it('rejects unknown or invalid role strings', () => {
      const errors = validateFormPermissions({
        createRoles: ['owner', 'admin', 'guest'],
      });
      expect(errors).toHaveLength(3);
      expect(errors[0].code).toBe('INVALID_PERMISSIONS_ROLE_NAME');
      expect(errors[0].message).toContain('Unknown role "owner"');
    });

    it('rejects non-array role specifications', () => {
      const errors = validateFormPermissions({
        manageFormRoles: 'business_admin' as any,
      });
      expect(errors).toHaveLength(1);
      expect(errors[0].code).toBe('INVALID_PERMISSIONS_ROLES_ARRAY');
    });

    it('prevents administrative lockout when manageFormRoles omits business_admin and super_admin', () => {
      const errors = validateFormPermissions({
        manageFormRoles: ['manager', 'employee'],
      });
      expect(errors).toHaveLength(1);
      expect(errors[0].code).toBe('ADMIN_LOCKOUT_PREVENTED');
      expect(errors[0].message).toContain('must include business_admin or super_admin');
    });

    it('allows manageFormRoles if at least one platform admin role is present', () => {
      expect(validateFormPermissions({ manageFormRoles: ['business_admin'] })).toEqual([]);
      expect(validateFormPermissions({ manageFormRoles: ['super_admin', 'manager'] })).toEqual([]);
    });
  });

  describe('Integration with Draft & Publish Validators', () => {
    it('rejects draft schema when settings are invalid', () => {
      const schema = {
        ...MINIMAL_VALID_SCHEMA,
        settings: {
          referenceNumber: { sequenceLength: 99 },
        },
      };
      const result = validateDraftSchema(schema);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === 'INVALID_SETTINGS_SEQUENCE_LENGTH')).toBe(true);
    });

    it('rejects publish schema when permissions cause administrative lockout', () => {
      const schema = {
        ...MINIMAL_VALID_SCHEMA,
        permissions: {
          manageFormRoles: ['manager'],
        },
      };
      const result = validatePublishableSchema(schema);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === 'ADMIN_LOCKOUT_PREVENTED')).toBe(true);
    });
  });
});

