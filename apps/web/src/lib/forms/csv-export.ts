import type { FormSchemaV1, FieldDefinition } from '@field/form-engine';
import type { FormEntity } from '@/lib/repositories/form-repository';
import type { FormSubmissionEntity } from '@/lib/repositories/submission-repository';

const FORMULA_INJECTION_PREFIX = /^[=+\-@\t\r]/;

/**
 * Escapes a single CSV cell per RFC 4180 while neutralizing spreadsheet formula
 * injection (`=`, `+`, `-`, `@`, `\t`, `\r` prefixes) per 05-AUTH-TENANCY-PERMISSIONS.md § 15.
 */
export function escapeCsvCell(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }

  let text: string;
  if (typeof value === 'string') {
    text = value;
    if (FORMULA_INJECTION_PREFIX.test(text)) {
      text = `'${text}`;
    }
  } else if (typeof value === 'number' || typeof value === 'boolean') {
    text = String(value);
    if (FORMULA_INJECTION_PREFIX.test(text)) {
      text = `'${text}`;
    }
  } else if (Array.isArray(value)) {
    text = value.map((v) => (v === null || v === undefined ? '' : String(v))).join('; ');
    if (FORMULA_INJECTION_PREFIX.test(text)) {
      text = `'${text}`;
    }
  } else {
    text = JSON.stringify(value);
    if (FORMULA_INJECTION_PREFIX.test(text)) {
      text = `'${text}`;
    }
  }

  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

interface ResolvedCsvColumn {
  header: string;
  extract: (submission: FormSubmissionEntity) => unknown;
}

function collectSafeFormFields(schema?: FormSchemaV1 | null): FieldDefinition[] {
  if (!schema) return [];
  const headerFields = schema.header?.sections?.flatMap((s) => s.fields || []) ?? [];
  const tabFields =
    schema.tabs?.flatMap((t) =>
      t.type === 'form' ? t.sections?.flatMap((s) => s.fields || []) ?? [] : [],
    ) ?? [];

  return [...headerFields, ...tabFields].filter((f) => f.type !== 'file');
}

function resolveCsvColumns(schema?: FormSchemaV1 | null): ResolvedCsvColumn[] {
  const fields = collectSafeFormFields(schema);
  const byId = new Map<string, FieldDefinition>();
  const byKey = new Map<string, FieldDefinition>();
  for (const f of fields) {
    byId.set(f.id, f);
    byKey.set(f.key, f);
  }

  const configuredCols = [...(schema?.listView?.columns ?? [])].sort(
    (a, b) => a.order - b.order,
  );
  const resolved: ResolvedCsvColumn[] = [];
  const seenKeys = new Set<string>();

  if (configuredCols.length > 0) {
    for (const col of configuredCols) {
      if (col.visible === false) continue;
      const ref = col.sourceRef;
      if (ref === 'system.id') {
        if (!seenKeys.has('system.id')) {
          seenKeys.add('system.id');
          resolved.push({
            header: col.label || 'Submission ID',
            extract: (s) => s.id,
          });
        }
        continue;
      }
      if (ref === 'system.reference_number') {
        if (!seenKeys.has('system.reference_number')) {
          seenKeys.add('system.reference_number');
          resolved.push({
            header: col.label || 'Reference #',
            extract: (s) => s.reference_number ?? '',
          });
        }
        continue;
      }
      if (ref === 'system.status') {
        if (!seenKeys.has('system.status')) {
          seenKeys.add('system.status');
          resolved.push({
            header: col.label || 'Status',
            extract: (s) => s.status,
          });
        }
        continue;
      }
      if (ref === 'system.submitted_at') {
        if (!seenKeys.has('system.submitted_at')) {
          seenKeys.add('system.submitted_at');
          resolved.push({
            header: col.label || 'Submitted At',
            extract: (s) => s.submitted_at || s.created_at,
          });
        }
        continue;
      }
      if (ref === 'system.created_at') {
        if (!seenKeys.has('system.created_at')) {
          seenKeys.add('system.created_at');
          resolved.push({
            header: col.label || 'Created At',
            extract: (s) => s.created_at,
          });
        }
        continue;
      }
      if (ref === 'system.updated_at') {
        if (!seenKeys.has('system.updated_at')) {
          seenKeys.add('system.updated_at');
          resolved.push({
            header: col.label || 'Updated At',
            extract: (s) => s.updated_at,
          });
        }
        continue;
      }
      if (ref === 'system.created_by') {
        if (!seenKeys.has('system.created_by')) {
          seenKeys.add('system.created_by');
          resolved.push({
            header: col.label || 'Submitted By',
            extract: (s) => s.submitted_by || s.created_by || 'Guest',
          });
        }
        continue;
      }

      const matched = byId.get(ref) || byKey.get(ref);
      if (matched && !seenKeys.has(matched.key)) {
        seenKeys.add(matched.key);
        resolved.push({
          header: col.label || matched.label || matched.key,
          extract: (s) => {
            const fieldsObj = (s.data_jsonb?.fields as Record<string, unknown>) ?? {};
            return Object.prototype.hasOwnProperty.call(fieldsObj, matched.key)
              ? fieldsObj[matched.key]
              : '';
          },
        });
      }
    }
  }

  // Ensure essential submission metadata columns are present
  const metadataDefaults: Array<{
    key: string;
    header: string;
    extract: (s: FormSubmissionEntity) => unknown;
  }> = [
    { key: 'system.reference_number', header: 'Reference #', extract: (s) => s.reference_number ?? '' },
    { key: 'system.status', header: 'Status', extract: (s) => s.status },
    { key: 'system.submitted_at', header: 'Submitted At', extract: (s) => s.submitted_at || s.created_at },
    { key: 'system.created_by', header: 'Submitted By', extract: (s) => s.submitted_by || s.created_by || 'Guest' },
  ];

  const prefixMeta: ResolvedCsvColumn[] = [];
  for (const meta of metadataDefaults) {
    if (!seenKeys.has(meta.key)) {
      seenKeys.add(meta.key);
      prefixMeta.push({ header: meta.header, extract: meta.extract });
    }
  }

  // If no listView columns were configured, export all safe schema fields
  if (configuredCols.length === 0) {
    for (const field of fields) {
      if (!seenKeys.has(field.key)) {
        seenKeys.add(field.key);
        resolved.push({
          header: field.label || field.key,
          extract: (s) => {
            const fieldsObj = (s.data_jsonb?.fields as Record<string, unknown>) ?? {};
            return Object.prototype.hasOwnProperty.call(fieldsObj, field.key)
              ? fieldsObj[field.key]
              : '';
          },
        });
      }
    }
  }

  return [...prefixMeta, ...resolved];
}

export function buildSubmissionsCsv(params: {
  form: Pick<FormEntity, 'id' | 'key' | 'title'>;
  schema?: FormSchemaV1 | null;
  submissions: FormSubmissionEntity[];
}): { csv: string; fileName: string; rowCount: number } {
  const columns = resolveCsvColumns(params.schema);
  const headerRow = columns.map((c) => escapeCsvCell(c.header)).join(',');

  const dataRows = params.submissions.map((sub) =>
    columns.map((c) => escapeCsvCell(c.extract(sub))).join(','),
  );

  const safeFileKey =
    (params.form.key || 'submissions').replace(/[^a-zA-Z0-9_-]+/g, '_') || 'submissions';

  return {
    csv: [headerRow, ...dataRows].join('\r\n'),
    fileName: `${safeFileKey}_submissions.csv`,
    rowCount: params.submissions.length,
  };
}
