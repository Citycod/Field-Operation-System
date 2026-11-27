import {
  FormSchemaV1,
  FieldDefinition,
  DetailsColumnDefinition,
  FormTabUnion,
  validateDraftSchema,
  validateRulesSemantic,
  validateCalculationsSemantic,
  validateListViewSemantic,
} from '@field/form-engine';
import { isSafeExternalApiUrl } from '@/lib/services/data-source-service';

export const MAX_FORM_IMPORT_BYTES = 1024 * 1024; // 1MB

export interface FormExportEnvelope {
  exportFormatVersion: 1;
  exportedAt: string;
  form: {
    key: string;
    title: string;
    description: string | null;
  };
  version: {
    versionNumber: number;
    schemaVersion: number;
    status: string;
  };
  schema: FormSchemaV1;
}

const DISALLOWED_OBJECT_KEYS = new Set([
  '__proto__',
  'constructor',
  'prototype',
]);

const SENSITIVE_KEY_PATTERN =
  /^(secret|secrets|credential|credentials|password|token|api_?key|authorization|auth_?header|private_?key|service_?role_?key)$/i;

const TENANT_IDENTITY_KEYS = new Set([
  'organizationId',
  'organization_id',
  'tenantId',
  'tenant_id',
]);

function deepSanitizeValue(value: unknown, depth = 0): unknown {
  if (depth > 30) {
    throw new Error('IMPORT_DEPTH_EXCEEDED: Schema nesting exceeds safe depth.');
  }
  if (value === null || value === undefined) return value;
  if (typeof value !== 'object') return value;

  if (Array.isArray(value)) {
    return value.map((item) => deepSanitizeValue(item, depth + 1));
  }

  const record = value as Record<string, unknown>;
  const cleaned: Record<string, unknown> = {};
  for (const key of Object.keys(record)) {
    if (
      DISALLOWED_OBJECT_KEYS.has(key) ||
      SENSITIVE_KEY_PATTERN.test(key) ||
      TENANT_IDENTITY_KEYS.has(key)
    ) {
      continue;
    }
    cleaned[key] = deepSanitizeValue(record[key], depth + 1);
  }
  return cleaned;
}

export function sanitizeSchemaForExport(schema: FormSchemaV1): FormSchemaV1 {
  const sanitized = deepSanitizeValue(schema) as FormSchemaV1;

  if (sanitized.settings?.publicAccess) {
    const { customSlug: _omitSlug, ...restPublic } = sanitized.settings.publicAccess;
    sanitized.settings = {
      ...sanitized.settings,
      publicAccess: restPublic,
    };
  }

  return sanitized;
}

export function buildFormExportEnvelope(params: {
  formKey: string;
  formTitle: string;
  formDescription: string | null;
  versionNumber: number;
  schemaVersion: number;
  status: string;
  schema: FormSchemaV1;
}): FormExportEnvelope {
  return {
    exportFormatVersion: 1,
    exportedAt: new Date().toISOString(),
    form: {
      key: params.formKey,
      title: params.formTitle,
      description: params.formDescription,
    },
    version: {
      versionNumber: params.versionNumber,
      schemaVersion: params.schemaVersion,
      status: params.status,
    },
    schema: sanitizeSchemaForExport(params.schema),
  };
}

function collectFieldsForValidation(
  schema: FormSchemaV1,
): Array<FieldDefinition | DetailsColumnDefinition> {
  const fields: Array<FieldDefinition | DetailsColumnDefinition> =
    schema.header?.sections?.flatMap((s) => s.fields || []) ?? [];

  for (const tab of schema.tabs || []) {
    if (tab.type === 'form') {
      fields.push(...(tab.sections?.flatMap((s) => s.fields || []) ?? []));
    } else if (tab.type === 'details') {
      fields.push(...(tab.configuration?.columns || []));
    }
  }
  return fields;
}

function assertSafeLookupEndpoints(
  fields: Array<FieldDefinition | DetailsColumnDefinition>,
) {
  for (const field of fields) {
    if (field.type !== 'lookup') continue;
    const lookupConfig = (field as FieldDefinition & {
      lookupConfig?: { apiEndpoint?: string };
    }).lookupConfig;
    if (lookupConfig?.apiEndpoint && typeof lookupConfig.apiEndpoint === 'string') {
      const check = isSafeExternalApiUrl(lookupConfig.apiEndpoint);
      if (!check.safe) {
        throw new Error(
          `UNSAFE_EXTERNAL_REFERENCE: Lookup field "${field.key || field.id}" contains an unsafe API endpoint (${check.reason || 'blocked'}).`,
        );
      }
    }
  }
}

export function parseAndValidateImportPayload(
  rawInput: unknown,
  options?: { titleOverride?: string; descriptionOverride?: string },
): {
  title: string;
  description?: string;
  schema: FormSchemaV1;
} {
  let parsed: unknown = rawInput;

  if (typeof rawInput === 'string') {
    if (Buffer.byteLength(rawInput, 'utf8') > MAX_FORM_IMPORT_BYTES) {
      throw new Error('IMPORT_TOO_LARGE: Import file exceeds the 1MB size limit.');
    }
    try {
      parsed = JSON.parse(rawInput);
    } catch {
      throw new Error('MALFORMED_JSON: Import payload is not valid JSON.');
    }
  } else if (parsed && typeof parsed === 'object') {
    const serializedBytes = Buffer.byteLength(JSON.stringify(parsed), 'utf8');
    if (serializedBytes > MAX_FORM_IMPORT_BYTES) {
      throw new Error('IMPORT_TOO_LARGE: Import payload exceeds the 1MB size limit.');
    }
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('INVALID_IMPORT_PAYLOAD: Import must be a JSON object.');
  }

  const envelope = parsed as Record<string, unknown>;
  if (
    'exportFormatVersion' in envelope &&
    envelope.exportFormatVersion !== 1
  ) {
    throw new Error(
      `UNSUPPORTED_EXPORT_FORMAT: Unsupported exportFormatVersion "${String(envelope.exportFormatVersion)}".`,
    );
  }

  const rawSchema =
    'schema' in envelope && envelope.schema && typeof envelope.schema === 'object'
      ? envelope.schema
      : parsed;

  if (!rawSchema || typeof rawSchema !== 'object' || Array.isArray(rawSchema)) {
    throw new Error('INVALID_IMPORT_PAYLOAD: Missing form schema definition.');
  }

  // Strip foreign tenant IDs, secrets, credentials, and prototype keys
  const sanitizedSchema = deepSanitizeValue(rawSchema) as Record<string, unknown>;

  if (sanitizedSchema.schemaVersion !== 1) {
    throw new Error(
      `UNSUPPORTED_SCHEMA_VERSION: Expected schemaVersion 1, got ${String(sanitizedSchema.schemaVersion)}.`,
    );
  }

  const envelopeForm =
    'form' in envelope && envelope.form && typeof envelope.form === 'object'
      ? (envelope.form as Record<string, unknown>)
      : null;

  const schemaForm =
    sanitizedSchema.form && typeof sanitizedSchema.form === 'object'
      ? (sanitizedSchema.form as Record<string, unknown>)
      : {};

  const resolvedTitle =
    options?.titleOverride?.trim() ||
    (typeof envelopeForm?.title === 'string' ? envelopeForm.title.trim() : '') ||
    (typeof schemaForm.title === 'string' ? schemaForm.title.trim() : '');

  if (!resolvedTitle) {
    throw new Error('INVALID_IMPORT_PAYLOAD: Imported form must include a title.');
  }

  const resolvedDescription =
    options?.descriptionOverride !== undefined
      ? options.descriptionOverride.trim() || undefined
      : typeof envelopeForm?.description === 'string'
        ? envelopeForm.description.trim() || undefined
        : typeof schemaForm.description === 'string'
          ? schemaForm.description.trim() || undefined
          : undefined;

  const normalizedSchema: FormSchemaV1 = {
    schemaVersion: 1,
    form: {
      id: typeof schemaForm.id === 'string' && schemaForm.id ? schemaForm.id : 'form_imported',
      key: typeof schemaForm.key === 'string' && schemaForm.key ? schemaForm.key : 'imported_form',
      title: resolvedTitle,
      description: resolvedDescription,
      schemaVersion: 1,
    },
    header: (sanitizedSchema.header as FormSchemaV1['header']) ?? {
      columns: 2,
      sections: [],
    },
    tabs: Array.isArray(sanitizedSchema.tabs)
      ? (sanitizedSchema.tabs as FormTabUnion[])
      : [],
    rules: Array.isArray(sanitizedSchema.rules)
      ? (sanitizedSchema.rules as FormSchemaV1['rules'])
      : [],
    workflow: (sanitizedSchema.workflow as FormSchemaV1['workflow']) ?? null,
    listView: (sanitizedSchema.listView as FormSchemaV1['listView']) ?? {
      columns: [],
    },
    permissions:
      (sanitizedSchema.permissions as FormSchemaV1['permissions']) ?? {},
    settings: (sanitizedSchema.settings as FormSchemaV1['settings']) ?? {},
  };

  if (normalizedSchema.settings?.publicAccess) {
    // Strip foreign public slug / public enabled flag on import into a new draft
    const { customSlug: _omitSlug, enabled: _omitEnabled, ...restPublic } =
      normalizedSchema.settings.publicAccess;
    normalizedSchema.settings = {
      ...normalizedSchema.settings,
      publicAccess: { ...restPublic, enabled: false },
    };
  }

  const draftValidation = validateDraftSchema(normalizedSchema);
  if (!draftValidation.valid) {
    throw new Error(
      `IMPORT_SCHEMA_INVALID: ${draftValidation.errors.map((e) => e.message).join('; ')}`,
    );
  }

  const allFields = collectFieldsForValidation(normalizedSchema);
  assertSafeLookupEndpoints(allFields);

  const fieldIds = new Set(allFields.map((f) => f.id));
  const fieldKeys = new Set(allFields.map((f) => f.key));

  const semanticErrors = [
    ...validateRulesSemantic(normalizedSchema.rules, fieldIds, fieldKeys, true),
    ...validateCalculationsSemantic(allFields, normalizedSchema.tabs, true),
    ...validateListViewSemantic(normalizedSchema.listView, fieldIds, fieldKeys, true),
  ];

  if (semanticErrors.length > 0) {
    throw new Error(
      `IMPORT_BROKEN_REFERENCES: ${semanticErrors.map((e) => e.message).join('; ')}`,
    );
  }

  return {
    title: resolvedTitle,
    description: resolvedDescription,
    schema: normalizedSchema,
  };
}
