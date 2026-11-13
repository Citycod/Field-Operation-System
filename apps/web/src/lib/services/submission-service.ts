import { FormRepository } from '../repositories/form-repository';
import { SubmissionRepository, FormSubmissionEntity } from '../repositories/submission-repository';
import {
  FormSchemaV1,
  evaluateRules,
  evaluateCalculations,
  FieldDefinition,
  DetailsTabDefinition,
} from '@field/form-engine';

export interface SubmitPublicFormResult {
  submissionId: string;
  referenceNumber: string | null;
  status: string;
  successTitle: string;
  successMessage: string;
}

export class SubmissionService {
  constructor(
    private readonly formRepository: FormRepository,
    private readonly submissionRepository: SubmissionRepository,
  ) {}

  private generateReferenceNumber(schema: FormSchemaV1): string | null {
    const refConfig = schema.settings?.referenceNumber;
    if (refConfig && refConfig.enabled !== false) {
      const prefix = refConfig.prefix ?? 'REF-';
      const suffix = refConfig.suffix ?? '';
      const seqLen = refConfig.sequenceLength ?? 5;
      const randomSeq = Math.floor(Math.random() * Math.pow(10, seqLen))
        .toString()
        .padStart(seqLen, '0');
      return `${prefix}${randomSeq}${suffix}`;
    }
    return null;
  }

  private collectAllFields(schema: FormSchemaV1): FieldDefinition[] {
    const headerFields = schema.header?.sections?.flatMap((s) => s.fields) ?? [];
    const tabFields =
      schema.tabs?.flatMap((t) => (t.type === 'form' ? t.sections.flatMap((s) => s.fields) : [])) ??
      [];
    return [...headerFields, ...tabFields];
  }

  private sanitizeFields(
    allFields: FieldDefinition[],
    rawFields: Record<string, unknown>,
  ): Record<string, unknown> {
    const sanitized: Record<string, unknown> = {};
    for (const field of allFields) {
      if (field.type === 'calculated') continue;
      if (
        Object.prototype.hasOwnProperty.call(rawFields, field.key) &&
        field.key !== '__proto__' &&
        field.key !== 'constructor' &&
        field.key !== 'prototype'
      ) {
        sanitized[field.key] = rawFields[field.key];
      }
    }
    return sanitized;
  }

  private validateFieldValue(
    label: string,
    type: FieldDefinition['type'],
    val: unknown,
    options?: {
      options?: Array<{ value: string }>;
      validation?: {
        min?: number;
        max?: number;
        minLength?: number;
        maxLength?: number;
      };
    },
  ): string | null {
    if (val === undefined || val === null || val === '') return null;

    if (type === 'number' || type === 'currency') {
      const num = typeof val === 'number' ? val : Number(val);
      if (typeof val === 'boolean' || !Number.isFinite(num)) {
        return `"${label}" must be a valid number.`;
      }
      if (options?.validation?.min !== undefined && num < options.validation.min) {
        return `"${label}" must be at least ${options.validation.min}.`;
      }
      if (options?.validation?.max !== undefined && num > options.validation.max) {
        return `"${label}" must be at most ${options.validation.max}.`;
      }
    } else if (type === 'checkbox') {
      if (typeof val !== 'boolean') {
        return `"${label}" must be a boolean.`;
      }
    } else if (type === 'date') {
      if (typeof val !== 'string' || Number.isNaN(Date.parse(val))) {
        return `"${label}" must be a valid date.`;
      }
    } else if (type === 'dropdown') {
      if (typeof val !== 'string') {
        return `"${label}" must be a valid option.`;
      }
      const allowedValues = options?.options?.map((o) => o.value) ?? [];
      if (allowedValues.length > 0 && !allowedValues.includes(val)) {
        return `"${label}" contains an invalid option.`;
      }
    } else if (type === 'text' || type === 'textarea') {
      if (typeof val !== 'string') {
        return `"${label}" must be a text string.`;
      }
      if (options?.validation?.minLength !== undefined && val.length < options.validation.minLength) {
        return `"${label}" must be at least ${options.validation.minLength} characters.`;
      }
      if (options?.validation?.maxLength !== undefined && val.length > options.validation.maxLength) {
        return `"${label}" must be at most ${options.validation.maxLength} characters.`;
      }
    } else if (type === 'lookup') {
      if (typeof val !== 'string') {
        return `"${label}" must be a valid selection string.`;
      }
    }
    return null;
  }

  private validateSubmissionData(schema: FormSchemaV1, data: Record<string, unknown>): string[] {
    const errors: string[] = [];
    const allFields = this.collectAllFields(schema);

    // Evaluate dynamic rules to account for conditional visibility and requirements
    const ruleEvaluation = evaluateRules(schema.rules || [], data, allFields);

    for (const field of allFields) {
      if (field.type === 'calculated') continue;

      const state = ruleEvaluation.fieldStates[field.key] || ruleEvaluation.fieldStates[field.id] || {};
      const isHidden = state.hidden === true;
      if (isHidden) continue; // Hidden fields are not required

      const isRequired = state.required ?? field.required;
      const val = data[field.key];
      const label = field.label || field.key;

      if (isRequired) {
        if (val === undefined || val === null || val === '') {
          errors.push(`"${label}" is required.`);
          continue;
        }
      }

      const typeError = this.validateFieldValue(label, field.type, val, {
        options: field.type === 'dropdown' ? field.options : undefined,
        validation: 'validation' in field ? (field.validation as any) : undefined,
      });
      if (typeError) {
        errors.push(typeError);
      }
    }

    return errors;
  }

  private validateAndSanitizeDetails(
    schema: FormSchemaV1,
    rawDetails?: Record<string, Array<{ id?: string; values?: Record<string, unknown> }>>,
  ): {
    errors: string[];
    detailRows: Array<{ tabId: string; rowOrder: number; dataJsonb: Record<string, unknown> }>;
    detailsForCalc: Record<string, Array<Record<string, unknown>>>;
  } {
    const errors: string[] = [];
    const detailRows: Array<{ tabId: string; rowOrder: number; dataJsonb: Record<string, unknown> }> = [];
    const detailsForCalc: Record<string, Array<Record<string, unknown>>> = {};

    const detailsTabs = (schema.tabs ?? []).filter(
      (t): t is DetailsTabDefinition => t.type === 'details',
    );

    for (const tab of detailsTabs) {
      const rawRows = rawDetails?.[tab.id];
      const rows = Array.isArray(rawRows) ? rawRows : [];

      if (tab.configuration.minRows !== undefined && rows.length < tab.configuration.minRows) {
        errors.push(
          `"${tab.title || tab.key}" requires at least ${tab.configuration.minRows} row(s).`,
        );
      }
      const effectiveMaxRows = tab.configuration.maxRows ?? 500;
      if (rows.length > effectiveMaxRows) {
        errors.push(
          `"${tab.title || tab.key}" allows at most ${effectiveMaxRows} row(s).`,
        );
      }

      const calcRows: Array<Record<string, unknown>> = [];

      rows.forEach((row, index) => {
        const rawValues = row?.values && typeof row.values === 'object' ? row.values : {};
        const sanitizedRow: Record<string, unknown> = {};

        for (const col of tab.configuration.columns) {
          if (
            col.key === '__proto__' ||
            col.key === 'constructor' ||
            col.key === 'prototype'
          ) {
            continue;
          }
          const val = Object.prototype.hasOwnProperty.call(rawValues, col.key)
            ? rawValues[col.key]
            : undefined;
          if (val !== undefined) {
            sanitizedRow[col.key] = val;
          }
          if (col.required && (val === undefined || val === null || val === '')) {
            errors.push(`"${col.label || col.key}" is required on row ${index + 1}.`);
            continue;
          }
          const colError = this.validateFieldValue(col.label || col.key, col.type, val, {
            options: col.options,
          });
          if (colError) {
            errors.push(`${colError} (row ${index + 1})`);
          }
        }

        calcRows.push(sanitizedRow);
        detailRows.push({
          tabId: tab.id,
          rowOrder: index,
          dataJsonb: sanitizedRow,
        });
      });

      detailsForCalc[tab.id] = calcRows;
      if (tab.key && tab.key !== tab.id) {
        detailsForCalc[tab.key] = calcRows;
      }
    }

    return { errors, detailRows, detailsForCalc };
  }

  async submitPublicForm(
    slugOrId: string,
    payload: {
      fields: Record<string, unknown>;
      details?: Record<string, Array<{ id: string; values: Record<string, unknown> }>>;
      notes?: unknown[];
      documents?: unknown[];
    },
  ): Promise<SubmitPublicFormResult> {
    const publicResult = await this.formRepository.getPublicForm(slugOrId);
    if (!publicResult) {
      throw new Error('Form not found or unavailable.');
    }

    const { form, publishedVersion } = publicResult;
    const schema = publishedVersion.schema_jsonb;

    if (form.is_public !== true) {
      throw new Error('This form is private and does not accept public submissions.');
    }

    if (schema?.settings?.publicAccess?.allowAnonymousSubmissions === false) {
      throw new Error('This form does not accept anonymous submissions.');
    }

    const expiryDate = schema?.settings?.publicAccess?.expiryDate;
    if (expiryDate) {
      const expiresAt = Date.parse(expiryDate);
      if (Number.isFinite(expiresAt) && expiresAt < Date.now()) {
        throw new Error('This public form link has expired.');
      }
    }

    const allFields = this.collectAllFields(schema);
    const sanitizedFields = this.sanitizeFields(
      allFields,
      payload.fields && typeof payload.fields === 'object' ? payload.fields : {},
    );

    const {
      errors: detailErrors,
      detailRows,
      detailsForCalc,
    } = this.validateAndSanitizeDetails(schema, payload.details);

    // Server-side validation of allowed fields & rules
    const fieldErrors = this.validateSubmissionData(schema, sanitizedFields);
    const allErrors = [...fieldErrors, ...detailErrors];
    if (allErrors.length > 0) {
      throw new Error(`Submission validation failed: ${allErrors.join(', ')}`);
    }

    // Recompute calculated fields strictly server-side from validated values
    const calcResult = evaluateCalculations(allFields, sanitizedFields, detailsForCalc);
    for (const [calcKey, calcVal] of Object.entries(calcResult.values)) {
      if (calcVal !== undefined) {
        sanitizedFields[calcKey] = calcVal;
      }
    }

    const referenceNumber = this.generateReferenceNumber(schema);
    const hasNotesTab = (schema.tabs ?? []).some((t) => t.type === 'notes');
    const sanitizedNotes =
      hasNotesTab && Array.isArray(payload.notes)
        ? payload.notes
            .slice(0, 50)
            .filter((n): n is Record<string, unknown> => Boolean(n && typeof n === 'object'))
            .map((n) => ({
              text: typeof n.text === 'string' ? n.text.slice(0, 2000) : '',
            }))
            .filter((n) => n.text.trim().length > 0)
        : [];

    const submission = await this.submissionRepository.createSubmission({
      organizationId: form.organization_id,
      formId: form.id,
      formVersionId: publishedVersion.id,
      referenceNumber,
      status: 'submitted',
      dataJsonb: {
        fields: sanitizedFields,
        notes: sanitizedNotes,
        documents: [],
      },
      createdBy: null,
      submittedBy: null,
      detailRows,
    });

    const successTitle =
      schema.settings?.publicAccess?.successTitle || 'Thank You';
    const successMessage =
      schema.settings?.publicAccess?.successMessage ||
      'Your form has been successfully submitted and recorded.';

    return {
      submissionId: submission.id,
      referenceNumber,
      status: submission.status,
      successTitle,
      successMessage,
    };
  }

  async getSubmission(id: string, organizationId: string): Promise<FormSubmissionEntity | null> {
    return this.submissionRepository.getSubmissionById(id, organizationId);
  }

  async listSubmissions(params: {
    organizationId: string;
    formId: string;
    limit?: number;
    offset?: number;
  }): Promise<FormSubmissionEntity[]> {
    return this.submissionRepository.listSubmissions(params);
  }
}

