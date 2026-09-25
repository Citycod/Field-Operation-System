import { FormSchemaV1 } from '../schema/form-schema';
import { FieldDefinition } from '../schema/fields';
import { FormTabUnion, DetailsTabDefinition, NotesTabDefinition, DocumentsTabDefinition } from '../schema/tabs';
import { ValidationResult, ValidationError, ValidationWarning } from './types';

const VALID_FIELD_TYPES = ['text', 'textarea', 'number', 'currency', 'date', 'dropdown', 'checkbox', 'lookup', 'file', 'calculated'] as const;
const VALID_TAB_TYPES = ['form', 'details', 'notes', 'documents'] as const;

export function validateDraftSchema(schema: unknown): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];
  const passedChecks: string[] = [];

  if (!schema || typeof schema !== 'object') {
    return {
      valid: false,
      errors: [{ path: '', message: 'Schema must be a valid JSON object', code: 'INVALID_OBJECT' }],
      warnings: [],
      passedChecks: [],
    };
  }

  const s = schema as Record<string, unknown>;

  // --- Schema version ---
  if (s.schemaVersion !== 1) {
    errors.push({
      path: 'schemaVersion',
      message: `Unsupported schema version: ${s.schemaVersion}. Expected 1.`,
      code: 'UNSUPPORTED_SCHEMA_VERSION',
    });
  } else {
    passedChecks.push('schemaVersion');
  }

  // --- Form metadata ---
  if (!s.form || typeof s.form !== 'object') {
    errors.push({ path: 'form', message: 'Missing or invalid form metadata', code: 'MISSING_FORM_METADATA' });
  } else {
    const f = s.form as Record<string, unknown>;
    if (!f.id || typeof f.id !== 'string') {
      errors.push({ path: 'form.id', message: 'Form metadata missing id', code: 'MISSING_FORM_ID' });
    }
    if (!f.key || typeof f.key !== 'string') {
      errors.push({ path: 'form.key', message: 'Form metadata missing key', code: 'MISSING_FORM_KEY' });
    }
    if (!f.title || typeof f.title !== 'string') {
      errors.push({ path: 'form.title', message: 'Form metadata missing title', code: 'MISSING_FORM_TITLE' });
    }
  }

  // --- Duplicate detection sets ---
  const fieldIds = new Set<string>();
  const fieldKeys = new Set<string>();

  function validateField(field: unknown, path: string) {
    if (!field || typeof field !== 'object') {
      errors.push({ path, message: 'Invalid field definition', code: 'INVALID_FIELD' });
      return;
    }
    const f = field as Partial<FieldDefinition>;
    if (!f.id) {
      errors.push({ path: `${path}.id`, message: 'Field missing id', code: 'MISSING_FIELD_ID' });
    } else if (fieldIds.has(f.id)) {
      errors.push({ path: `${path}.id`, message: `Duplicate field ID: ${f.id}`, code: 'DUPLICATE_FIELD_ID' });
    } else {
      fieldIds.add(f.id);
    }

    if (!f.key) {
      errors.push({ path: `${path}.key`, message: 'Field missing key', code: 'MISSING_FIELD_KEY' });
    } else if (fieldKeys.has(f.key)) {
      errors.push({ path: `${path}.key`, message: `Duplicate field Key: ${f.key}`, code: 'DUPLICATE_FIELD_KEY' });
    } else {
      fieldKeys.add(f.key);
    }

    if (!f.type || !(VALID_FIELD_TYPES as readonly string[]).includes(f.type)) {
      errors.push({ path: `${path}.type`, message: `Unsupported field type: ${f.type}`, code: 'UNSUPPORTED_FIELD_TYPE' });
    }

    // Lookup config structural validation
    if (f.type === 'lookup') {
      const l = (f as Record<string, unknown>).lookupConfig as Record<string, unknown> | undefined;
      if (!l || typeof l !== 'object') {
        errors.push({ path: `${path}.lookupConfig`, message: 'Lookup field missing lookupConfig', code: 'INVALID_LOOKUP_CONFIG' });
      } else {
        if (!l.targetEntity) errors.push({ path: `${path}.lookupConfig.targetEntity`, message: 'Missing targetEntity', code: 'INVALID_LOOKUP_CONFIG' });
        if (!l.displayField) errors.push({ path: `${path}.lookupConfig.displayField`, message: 'Missing displayField', code: 'INVALID_LOOKUP_CONFIG' });
        if (!l.valueField) errors.push({ path: `${path}.lookupConfig.valueField`, message: 'Missing valueField', code: 'INVALID_LOOKUP_CONFIG' });
      }
    }

    // Calculated field config structural validation
    if (f.type === 'calculated') {
      const c = (f as Record<string, unknown>).calculationConfig as Record<string, unknown> | undefined;
      if (!c || typeof c !== 'object') {
        errors.push({ path: `${path}.calculationConfig`, message: 'Calculated field missing calculationConfig', code: 'INVALID_CALCULATION_CONFIG' });
      } else {
        const validOps = ['add', 'subtract', 'multiply', 'divide', 'sum', 'min', 'max', 'count'];
        if (!c.operation || !validOps.includes(c.operation as string)) {
          errors.push({ path: `${path}.calculationConfig.operation`, message: `Invalid calculation operation: ${c.operation}`, code: 'INVALID_CALCULATION_CONFIG' });
        }
      }
    }
  }

  // --- Validate Header ---
  if (s.header && typeof s.header === 'object') {
    const h = s.header as Record<string, unknown>;
    if (h.columns !== undefined) {
      const cols = h.columns as number;
      if (typeof cols !== 'number' || cols < 1 || cols > 4) {
        errors.push({ path: 'header.columns', message: `Invalid header columns: ${cols}. Must be 1-4.`, code: 'INVALID_HEADER_LAYOUT' });
      }
    }
    if (Array.isArray(h.sections)) {
      h.sections.forEach((sec: Record<string, unknown>, idx: number) => {
        if (!sec || typeof sec !== 'object') {
          errors.push({ path: `header.sections[${idx}]`, message: 'Invalid header section', code: 'INVALID_SECTION_LAYOUT' });
          return;
        }
        if (!sec.id || !sec.key) {
          errors.push({ path: `header.sections[${idx}]`, message: 'Header section missing id or key', code: 'INVALID_SECTION_LAYOUT' });
        }
        if (Array.isArray(sec.fields)) {
          sec.fields.forEach((f: unknown, fIdx: number) => {
            validateField(f, `header.sections[${idx}].fields[${fIdx}]`);
          });
        }
      });
    }
  }

  // --- Validate Tabs ---
  const tabIds = new Set<string>();
  const tabKeys = new Set<string>();

  if (Array.isArray(s.tabs)) {
    s.tabs.forEach((tab: unknown, idx: number) => {
      if (!tab || typeof tab !== 'object') {
        errors.push({ path: `tabs[${idx}]`, message: 'Invalid tab definition', code: 'INVALID_TAB' });
        return;
      }
      const t = tab as Partial<FormTabUnion>;
      if (!t.id) {
        errors.push({ path: `tabs[${idx}].id`, message: 'Tab missing id', code: 'MISSING_TAB_ID' });
      } else if (tabIds.has(t.id)) {
        errors.push({ path: `tabs[${idx}].id`, message: `Duplicate tab ID: ${t.id}`, code: 'DUPLICATE_TAB_ID' });
      } else {
        tabIds.add(t.id);
      }

      if (!t.key) {
        errors.push({ path: `tabs[${idx}].key`, message: 'Tab missing key', code: 'MISSING_TAB_KEY' });
      } else if (tabKeys.has(t.key)) {
        errors.push({ path: `tabs[${idx}].key`, message: `Duplicate tab Key: ${t.key}`, code: 'DUPLICATE_TAB_KEY' });
      } else {
        tabKeys.add(t.key);
      }

      if (!t.type || !(VALID_TAB_TYPES as readonly string[]).includes(t.type)) {
        errors.push({ path: `tabs[${idx}].type`, message: `Unsupported tab type: ${t.type}`, code: 'UNSUPPORTED_TAB_TYPE' });
      }

      // Form tab sections validation
      if (t.type === 'form') {
        const formTab = t as Record<string, unknown>;
        if (Array.isArray(formTab.sections)) {
          formTab.sections.forEach((sec: Record<string, unknown>, sIdx: number) => {
            if (!sec || typeof sec !== 'object') {
              errors.push({ path: `tabs[${idx}].sections[${sIdx}]`, message: 'Invalid form tab section', code: 'INVALID_SECTION_LAYOUT' });
              return;
            }
            if (sec && Array.isArray(sec.fields)) {
              sec.fields.forEach((f: unknown, fIdx: number) => {
                validateField(f, `tabs[${idx}].sections[${sIdx}].fields[${fIdx}]`);
              });
            }
          });
        }
      }

      // Details tab configuration validation
      if (t.type === 'details') {
        const dt = t as Partial<DetailsTabDefinition>;
        if (!dt.configuration || typeof dt.configuration !== 'object') {
          errors.push({ path: `tabs[${idx}].configuration`, message: 'Details tab missing configuration', code: 'INVALID_DETAILS_CONFIG' });
        } else {
          if (!Array.isArray(dt.configuration.columns)) {
            errors.push({ path: `tabs[${idx}].configuration.columns`, message: 'Details tab configuration missing columns array', code: 'INVALID_DETAILS_CONFIG' });
          }
        }
      }

      // Notes tab configuration validation
      if (t.type === 'notes') {
        const nt = t as Partial<NotesTabDefinition>;
        const validVisibilities = ['internal', 'requester_and_approvers', 'all_authorized_users'];
        if (nt.defaultVisibility !== undefined && !validVisibilities.includes(nt.defaultVisibility)) {
          errors.push({ path: `tabs[${idx}].defaultVisibility`, message: `Invalid notes visibility: ${nt.defaultVisibility}`, code: 'INVALID_NOTES_CONFIG' });
        }
      }

      // Documents tab configuration validation
      if (t.type === 'documents') {
        const dt = t as Partial<DocumentsTabDefinition>;
        if (dt.maxFileSizeMb !== undefined && (typeof dt.maxFileSizeMb !== 'number' || dt.maxFileSizeMb <= 0)) {
          errors.push({ path: `tabs[${idx}].maxFileSizeMb`, message: 'maxFileSizeMb must be a positive number', code: 'INVALID_DOCUMENTS_CONFIG' });
        }
        if (dt.maxFiles !== undefined && (typeof dt.maxFiles !== 'number' || dt.maxFiles < 1)) {
          errors.push({ path: `tabs[${idx}].maxFiles`, message: 'maxFiles must be a positive integer', code: 'INVALID_DOCUMENTS_CONFIG' });
        }
      }
    });
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    passedChecks,
  };
}
