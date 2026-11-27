import { FormRepository, FormEntity, FormVersionEntity } from '../repositories/form-repository';
import {
  SubmissionRepository,
  FormSubmissionEntity,
  SubmissionDetailRowEntity,
  SubmissionFilterParams,
  PaginatedSubmissionsResult,
  SubmissionSortField,
  SubmissionSortOrder,
} from '../repositories/submission-repository';
import { MembershipRepository } from '../repositories/membership-repository';
import type { ApprovalRepository } from '../repositories/approval-repository';
import {
  planWorkflowStart,
  summarizeSubmissionApproval,
  type SubmissionApprovalSummary,
} from './approval-service';
import { buildSubmissionsCsv } from '../forms/csv-export';
import {
  FormSchemaV1,
  evaluateRules,
  evaluateCalculations,
  FieldDefinition,
  DetailsTabDefinition,
} from '@field/form-engine';

export interface SubmitFormPayload {
  fields: Record<string, unknown>;
  details?: Record<string, Array<{ id: string; values: Record<string, unknown> }>>;
  notes?: unknown[];
  documents?: unknown[];
}

export interface SubmitPublicFormResult {
  submissionId: string;
  referenceNumber: string | null;
  status: string;
  successTitle: string;
  successMessage: string;
}

export interface SubmitAuthenticatedFormResult {
  submission: FormSubmissionEntity;
  approvalStarted: boolean;
}

export interface AuthenticatedListSubmissionsParams {
  userId: string;
  organizationId: string;
  formId?: string;
  status?: string;
  referenceNumber?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  pageSize?: number;
  sortBy?: SubmissionSortField;
  sortOrder?: SubmissionSortOrder;
}

export interface AuthenticatedSubmissionDetailParams {
  submissionId: string;
  organizationId: string;
  userId: string;
}

export interface AuthenticatedSubmissionDetailResult {
  submission: FormSubmissionEntity;
  form: FormEntity;
  formVersion: FormVersionEntity;
  detailRows: SubmissionDetailRowEntity[];
  rendererValue: {
    fields: Record<string, unknown>;
    details: Record<string, Array<{ id: string; values: Record<string, unknown> }>>;
    notes: unknown[];
    documents: unknown[];
  };
  approval?: SubmissionApprovalSummary | null;
}

export class SubmissionService {
  constructor(
    private readonly formRepository: FormRepository,
    private readonly submissionRepository: SubmissionRepository,
    private readonly membershipRepository?: MembershipRepository,
    private readonly approvalRepository?: ApprovalRepository,
  ) {}

  private async checkMembership(userId: string, organizationId: string) {
    if (!this.membershipRepository) {
      throw new Error('Membership repository is required for authenticated operations.');
    }
    const membership = await this.membershipRepository.findUserMembershipInOrg(
      userId,
      organizationId,
    );
    if (!membership || membership.status !== 'active') {
      throw new Error(
        `Unauthorized: User ${userId} is not an active member of organization ${organizationId}`,
      );
    }
    return membership;
  }

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
      options?: Array<{ value: string; key?: string; label?: string }>;
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
      // Canonical option identity: accept machine key or legacy value.
      // Do NOT accept mutable display labels as valid option values.
      // Explicit documented compatibility fallback: only if an option has neither key nor value, accept label.
      const rawOptions = (options as any)?.options;
      const optionItems: Array<{ key?: string; value?: string; label?: string }> =
        Array.isArray(rawOptions)
          ? rawOptions
          : Array.isArray(rawOptions?.options)
          ? rawOptions.options
          : Array.isArray(options)
          ? (options as any)
          : [];
      const allowedValues =
        optionItems.flatMap((o) => {
          const ids = [o.key, o.value].filter(Boolean) as string[];
          return ids.length > 0 ? ids : (o.label ? [o.label] : []);
        });
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

  private prepareAndValidateSubmission(
    schema: FormSchemaV1,
    payload: SubmitFormPayload,
  ) {
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

    return {
      sanitizedFields,
      detailRows,
      sanitizedNotes,
    };
  }

  async submitPublicForm(
    slugOrId: string,
    payload: SubmitFormPayload,
  ): Promise<SubmitPublicFormResult> {
    const publicResult = await this.formRepository.getPublicForm(slugOrId);
    if (!publicResult) {
      throw new Error('Form not found or unavailable.');
    }

    const { form, publishedVersion } = publicResult;
    const schema = publishedVersion.schema_jsonb || (publishedVersion as any).schema_json;

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

    const { sanitizedFields, detailRows, sanitizedNotes } =
      this.prepareAndValidateSubmission(schema, payload);

    const referenceNumber = this.generateReferenceNumber(schema);
    const workflowPlan = this.approvalRepository
      ? planWorkflowStart({
          schema,
          fieldValues: sanitizedFields,
          requesterUserId: null,
          referenceNumber,
        })
      : null;

    if (workflowPlan) {
      for (const [k, v] of Object.entries(workflowPlan.fieldUpdates)) {
        sanitizedFields[k] = v;
      }
    }

    const initialStatus =
      workflowPlan && workflowPlan.triggered ? workflowPlan.nextStatus : 'submitted';

    const submission = await this.submissionRepository.createSubmission({
      organizationId: form.organization_id,
      formId: form.id,
      formVersionId: publishedVersion.id,
      referenceNumber,
      status: initialStatus,
      dataJsonb: {
        fields: sanitizedFields,
        notes: sanitizedNotes,
        documents: [],
      },
      createdBy: null,
      submittedBy: null,
      detailRows,
    });

    if (this.approvalRepository && workflowPlan?.triggered && workflowPlan.firstStage) {
      await this.approvalRepository.createApprovalInstanceWithInitialStage({
        organizationId: form.organization_id,
        submissionId: submission.id,
        formVersionId: publishedVersion.id,
        workflowId: workflowPlan.workflowId,
        cycleNumber: 1,
        firstStage: workflowPlan.firstStage,
      });
    }

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

  async submitAuthenticatedForm(params: {
    userId: string;
    organizationId: string;
    formId: string;
    payload: SubmitFormPayload;
  }): Promise<SubmitAuthenticatedFormResult> {
    const membership = await this.checkMembership(params.userId, params.organizationId);
    const form = await this.formRepository.getFormById(params.formId, params.organizationId);
    if (!form || form.organization_id !== params.organizationId || form.archived_at) {
      throw new Error(`Form not found or inaccessible in organization ${params.organizationId}`);
    }

    const publishedVersion = await this.formRepository.getPublishedVersion(
      form.id,
      params.organizationId,
    );
    if (!publishedVersion) {
      throw new Error('This form has no published version available for submission.');
    }

    const schema = publishedVersion.schema_jsonb;
    const perms = schema.permissions || {};
    const createRoles = perms.createRoles ?? [
      'super_admin',
      'business_admin',
      'manager',
      'employee',
    ];
    if (!createRoles.includes(membership.role_key)) {
      throw new Error(
        `Unauthorized: Role "${membership.role_key}" is not permitted to submit this form.`,
      );
    }

    const { sanitizedFields, detailRows, sanitizedNotes } =
      this.prepareAndValidateSubmission(schema, params.payload);

    const referenceNumber = this.generateReferenceNumber(schema);
    const workflowPlan = planWorkflowStart({
      schema,
      fieldValues: sanitizedFields,
      requesterUserId: params.userId,
      referenceNumber,
    });

    for (const [k, v] of Object.entries(workflowPlan.fieldUpdates)) {
      sanitizedFields[k] = v;
    }

    const initialStatus = workflowPlan.triggered ? workflowPlan.nextStatus : 'submitted';
    const dataJsonb = {
      fields: sanitizedFields,
      notes: sanitizedNotes,
      documents: [],
    };

    const workflowStart =
      workflowPlan.triggered && workflowPlan.firstStage
        ? {
            workflowId: workflowPlan.workflowId,
            ...workflowPlan.firstStage,
          }
        : null;

    let submission: FormSubmissionEntity;
    if (typeof this.submissionRepository.createAuthenticatedSubmission === 'function') {
      submission = await this.submissionRepository.createAuthenticatedSubmission({
        organizationId: params.organizationId,
        formId: form.id,
        formVersionId: publishedVersion.id,
        referenceNumber,
        status: initialStatus,
        dataJsonb,
        detailRows,
        workflowStart,
      });
    } else {
      submission = await this.submissionRepository.createSubmission({
        organizationId: params.organizationId,
        formId: form.id,
        formVersionId: publishedVersion.id,
        referenceNumber,
        status: initialStatus,
        dataJsonb,
        createdBy: params.userId,
        submittedBy: params.userId,
        detailRows,
      });

      if (this.approvalRepository && workflowStart) {
        await this.approvalRepository.createApprovalInstanceWithInitialStage({
          organizationId: params.organizationId,
          submissionId: submission.id,
          formVersionId: publishedVersion.id,
          workflowId: workflowStart.workflowId,
          cycleNumber: 1,
          firstStage: {
            stepId: workflowStart.stepId,
            stageName: workflowStart.stageName,
            assigneeIndex: workflowStart.assigneeIndex,
            assignedApproverId: workflowStart.assignedApproverId,
            assignedRoleKey: workflowStart.assignedRoleKey,
          },
        });
      }
    }

    return {
      submission,
      approvalStarted: Boolean(workflowStart),
    };
  }

  async resubmitSubmission(params: {
    userId: string;
    organizationId: string;
    submissionId: string;
    payload: SubmitFormPayload;
  }): Promise<SubmitAuthenticatedFormResult> {
    await this.checkMembership(params.userId, params.organizationId);

    const submission = await this.submissionRepository.getSubmissionById(
      params.submissionId,
      params.organizationId,
    );
    if (!submission || submission.organization_id !== params.organizationId) {
      throw new Error(`Submission not found or inaccessible in organization ${params.organizationId}`);
    }

    if (submission.status !== 'returned') {
      throw new Error(
        `SUBMISSION_NOT_RETURNED: Only returned submissions can be resubmitted (current status: ${submission.status}).`,
      );
    }

    const requesterId = submission.submitted_by ?? submission.created_by;
    if (!requesterId || requesterId !== params.userId) {
      throw new Error(
        'Unauthorized: Only the submission requester can resubmit a returned submission.',
      );
    }

    let formVersion: FormVersionEntity | null = null;
    if (typeof (this.formRepository as any).getVersionById === 'function') {
      formVersion = await (this.formRepository as any).getVersionById(
        submission.form_version_id,
        params.organizationId,
      );
    }
    if (!formVersion) {
      const versions = await this.formRepository.listVersions(
        submission.form_id,
        params.organizationId,
      );
      formVersion = versions.find((v) => v.id === submission.form_version_id) ?? null;
    }
    if (!formVersion) {
      throw new Error(`Historical form version ${submission.form_version_id} not found.`);
    }

    const schema = formVersion.schema_jsonb;
    const { sanitizedFields, detailRows, sanitizedNotes } =
      this.prepareAndValidateSubmission(schema, params.payload);

    const workflowPlan = planWorkflowStart({
      schema,
      fieldValues: sanitizedFields,
      requesterUserId: params.userId,
      referenceNumber: submission.reference_number,
    });

    for (const [k, v] of Object.entries(workflowPlan.fieldUpdates)) {
      sanitizedFields[k] = v;
    }

    const nextStatus = workflowPlan.triggered ? workflowPlan.nextStatus : 'submitted';
    const existingDocs = Array.isArray(submission.data_jsonb?.documents)
      ? submission.data_jsonb.documents
      : [];
    const dataJsonb = {
      fields: sanitizedFields,
      notes: sanitizedNotes,
      documents: existingDocs,
    };

    const workflowStart =
      workflowPlan.triggered && workflowPlan.firstStage
        ? {
            workflowId: workflowPlan.workflowId,
            ...workflowPlan.firstStage,
          }
        : null;

    let updated: FormSubmissionEntity;
    if (typeof this.submissionRepository.resubmitReturnedSubmission === 'function') {
      updated = await this.submissionRepository.resubmitReturnedSubmission({
        organizationId: params.organizationId,
        submissionId: submission.id,
        status: nextStatus,
        dataJsonb,
        detailRows,
        workflowStart,
      });
    } else {
      // Fallback for in-memory test repositories
      const existingHistory = this.approvalRepository
        ? await this.approvalRepository.getSubmissionApprovalHistory(
            submission.id,
            params.organizationId,
          )
        : { instances: [], stages: [], decisions: [] };
      const nextCycle =
        existingHistory.instances.reduce(
          (max, inst) => Math.max(max, inst.cycle_number),
          0,
        ) + 1;

      submission.status = nextStatus;
      submission.data_jsonb = dataJsonb;
      submission.updated_at = new Date().toISOString();
      submission.submitted_at = submission.updated_at;
      updated = submission;

      if (this.approvalRepository && workflowStart) {
        await this.approvalRepository.createApprovalInstanceWithInitialStage({
          organizationId: params.organizationId,
          submissionId: submission.id,
          formVersionId: submission.form_version_id,
          workflowId: workflowStart.workflowId,
          cycleNumber: nextCycle,
          firstStage: {
            stepId: workflowStart.stepId,
            stageName: workflowStart.stageName,
            assigneeIndex: workflowStart.assigneeIndex,
            assignedApproverId: workflowStart.assignedApproverId,
            assignedRoleKey: workflowStart.assignedRoleKey,
          },
        });
      }
    }

    return {
      submission: updated,
      approvalStarted: Boolean(workflowStart),
    };
  }

  async listAuthenticatedSubmissions(
    params: AuthenticatedListSubmissionsParams,
  ): Promise<PaginatedSubmissionsResult> {
    const membership = await this.checkMembership(params.userId, params.organizationId);
    const roleKey = membership.role_key;
    const isPlatformAdmin = ['super_admin', 'business_admin'].includes(roleKey);

    // Case 1: Filtered by specific form
    if (params.formId) {
      const form = await this.formRepository.getFormById(params.formId, params.organizationId);
      if (!form || form.organization_id !== params.organizationId) {
        throw new Error(`Form not found or inaccessible in organization ${params.organizationId}`);
      }

      let createdOrSubmittedBy: string | undefined;

      if (!isPlatformAdmin) {
        const published = await this.formRepository.getPublishedVersion(
          params.formId,
          params.organizationId,
        );
        const perms = (published?.schema_jsonb as FormSchemaV1 | undefined)?.permissions || {};
        const readAllRoles = perms.readAllRoles ?? ['super_admin', 'business_admin', 'manager'];
        const readOwnRoles = perms.readOwnRoles ?? [
          'super_admin',
          'business_admin',
          'manager',
          'employee',
        ];

        const canReadAll = readAllRoles.includes(roleKey);
        const canReadOwn = readOwnRoles.includes(roleKey);

        if (!canReadAll && !canReadOwn) {
          throw new Error(
            `Unauthorized: Role "${roleKey}" is not permitted to view submissions for this form.`,
          );
        }

        if (!canReadAll && canReadOwn) {
          createdOrSubmittedBy = params.userId;
        }
      }

      return this.submissionRepository.listSubmissions({
        organizationId: params.organizationId,
        formId: params.formId,
        status: params.status,
        referenceNumber: params.referenceNumber,
        dateFrom: params.dateFrom,
        dateTo: params.dateTo,
        page: params.page,
        pageSize: params.pageSize,
        sortBy: params.sortBy,
        sortOrder: params.sortOrder,
        createdOrSubmittedBy,
      });
    }

    // Case 2: Cross-form listing across entire organization
    if (isPlatformAdmin) {
      return this.submissionRepository.listSubmissions({
        organizationId: params.organizationId,
        status: params.status,
        referenceNumber: params.referenceNumber,
        dateFrom: params.dateFrom,
        dateTo: params.dateTo,
        page: params.page,
        pageSize: params.pageSize,
        sortBy: params.sortBy,
        sortOrder: params.sortOrder,
      });
    }

    // Non-admin cross-form discovery: evaluate permissions on active published forms
    const forms = await this.formRepository.listForms(params.organizationId);
    const readAllFormIds: string[] = [];
    const readOwnFormIds: string[] = [];

    for (const f of forms) {
      const published = await this.formRepository.getPublishedVersion(f.id, params.organizationId);
      if (!published) continue;

      const perms = (published.schema_jsonb as FormSchemaV1 | undefined)?.permissions || {};
      const readAllRoles = perms.readAllRoles ?? ['super_admin', 'business_admin', 'manager'];
      const readOwnRoles = perms.readOwnRoles ?? [
        'super_admin',
        'business_admin',
        'manager',
        'employee',
      ];

      const canReadAll = readAllRoles.includes(roleKey);
      const canReadOwn = readOwnRoles.includes(roleKey);

      if (canReadAll) {
        readAllFormIds.push(f.id);
      } else if (canReadOwn) {
        readOwnFormIds.push(f.id);
      }
    }

    // If user has zero authorized forms in this tenant, fail closed immediately
    if (readAllFormIds.length === 0 && readOwnFormIds.length === 0) {
      return {
        submissions: [],
        totalCount: 0,
        page: Math.max(1, params.page ?? 1),
        pageSize: Math.min(100, Math.max(1, params.pageSize ?? 20)),
        totalPages: 0,
      };
    }

    // If user has readAll on all authorized forms (e.g. manager)
    if (readOwnFormIds.length === 0) {
      return this.submissionRepository.listSubmissions({
        organizationId: params.organizationId,
        authorizedFormIds: readAllFormIds,
        status: params.status,
        referenceNumber: params.referenceNumber,
        dateFrom: params.dateFrom,
        dateTo: params.dateTo,
        page: params.page,
        pageSize: params.pageSize,
        sortBy: params.sortBy,
        sortOrder: params.sortOrder,
      });
    }

    // If user has readOwn on all authorized forms (e.g. employee)
    if (readAllFormIds.length === 0) {
      return this.submissionRepository.listSubmissions({
        organizationId: params.organizationId,
        authorizedFormIds: readOwnFormIds,
        createdOrSubmittedBy: params.userId,
        status: params.status,
        referenceNumber: params.referenceNumber,
        dateFrom: params.dateFrom,
        dateTo: params.dateTo,
        page: params.page,
        pageSize: params.pageSize,
        sortBy: params.sortBy,
        sortOrder: params.sortOrder,
      });
    }

    // Mixed permissions across forms
    const [resAll, resOwn] = await Promise.all([
      this.submissionRepository.listSubmissions({
        organizationId: params.organizationId,
        authorizedFormIds: readAllFormIds,
        status: params.status,
        referenceNumber: params.referenceNumber,
        dateFrom: params.dateFrom,
        dateTo: params.dateTo,
        page: 1,
        pageSize: 100,
        sortBy: params.sortBy,
        sortOrder: params.sortOrder,
      }),
      this.submissionRepository.listSubmissions({
        organizationId: params.organizationId,
        authorizedFormIds: readOwnFormIds,
        createdOrSubmittedBy: params.userId,
        status: params.status,
        referenceNumber: params.referenceNumber,
        dateFrom: params.dateFrom,
        dateTo: params.dateTo,
        page: 1,
        pageSize: 100,
        sortBy: params.sortBy,
        sortOrder: params.sortOrder,
      }),
    ]);

    const combined = [...resAll.submissions, ...resOwn.submissions];
    const totalCount = resAll.totalCount + resOwn.totalCount;
    const page = Math.max(1, params.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 20));
    const totalPages = totalCount > 0 ? Math.ceil(totalCount / pageSize) : 0;
    const offset = (page - 1) * pageSize;

    return {
      submissions: combined.slice(offset, offset + pageSize),
      totalCount,
      page,
      pageSize,
      totalPages,
    };
  }

  async getAuthenticatedSubmissionDetail(
    params: AuthenticatedSubmissionDetailParams,
  ): Promise<AuthenticatedSubmissionDetailResult> {
    const membership = await this.checkMembership(params.userId, params.organizationId);
    const roleKey = membership.role_key;
    const isPlatformAdmin = ['super_admin', 'business_admin'].includes(roleKey);

    const submission = await this.submissionRepository.getSubmissionById(
      params.submissionId,
      params.organizationId,
    );
    if (!submission || submission.organization_id !== params.organizationId) {
      throw new Error(`Submission not found or inaccessible in organization ${params.organizationId}`);
    }

    const form = await this.formRepository.getFormById(
      submission.form_id,
      params.organizationId,
    );
    if (!form || form.organization_id !== params.organizationId) {
      throw new Error(`Associated form not found or inaccessible in organization ${params.organizationId}`);
    }

    // Retrieve exact historical form version tied to this submission
    let formVersion: FormVersionEntity | null = null;
    if (typeof (this.formRepository as any).getVersionById === 'function') {
      formVersion = await (this.formRepository as any).getVersionById(
        submission.form_version_id,
        params.organizationId,
      );
    }
    if (!formVersion) {
      const versions = await this.formRepository.listVersions(
        submission.form_id,
        params.organizationId,
      );
      formVersion = versions.find((v) => v.id === submission.form_version_id) ?? null;
    }
    if (!formVersion) {
      throw new Error(`Historical form version ${submission.form_version_id} not found.`);
    }

    // Evaluate permissions against the historical version
    if (!isPlatformAdmin) {
      const perms = (formVersion.schema_jsonb as FormSchemaV1 | undefined)?.permissions || {};
      const readAllRoles = perms.readAllRoles ?? ['super_admin', 'business_admin', 'manager'];
      const readOwnRoles = perms.readOwnRoles ?? [
        'super_admin',
        'business_admin',
        'manager',
        'employee',
      ];

      const canReadAll = readAllRoles.includes(roleKey);
      const canReadOwn = readOwnRoles.includes(roleKey);

      if (!canReadAll && !canReadOwn) {
        const isAssignedApprover = this.approvalRepository
          ? await this.approvalRepository.hasAssignedStageForSubmission({
              submissionId: submission.id,
              organizationId: params.organizationId,
              userId: params.userId,
              roleKey,
            })
          : false;

        if (!isAssignedApprover) {
          throw new Error(`Unauthorized: Role "${roleKey}" is not permitted to view this submission.`);
        }
      }

      if (!canReadAll && canReadOwn) {
        const isOwner =
          (typeof submission.created_by === 'string' && submission.created_by === params.userId) ||
          (typeof submission.submitted_by === 'string' && submission.submitted_by === params.userId);

        if (!isOwner) {
          const isAssignedApprover = this.approvalRepository
            ? await this.approvalRepository.hasAssignedStageForSubmission({
                submissionId: submission.id,
                organizationId: params.organizationId,
                userId: params.userId,
                roleKey,
              })
            : false;

          if (!isAssignedApprover) {
            throw new Error(
              'Unauthorized: User is not authorized to view submissions submitted by other users.',
            );
          }
        }
      }
    }

    const detailRows = await this.submissionRepository.getSubmissionDetailRows(
      submission.id,
      params.organizationId,
    );

    let approval: SubmissionApprovalSummary | null = null;
    if (this.approvalRepository) {
      const history = await this.approvalRepository.getSubmissionApprovalHistory(
        submission.id,
        params.organizationId,
      );
      approval = summarizeSubmissionApproval(
        history,
        formVersion.schema_jsonb,
        params.userId,
        roleKey,
      );
    }

    // Format renderer value for <FormRenderer mode="readOnly" />
    const rawFields = (submission.data_jsonb?.fields as Record<string, unknown>) ?? {};
    const detailsMap: Record<string, Array<{ id: string; values: Record<string, unknown> }>> = {};

    for (const row of detailRows) {
      if (!detailsMap[row.tab_id]) {
        detailsMap[row.tab_id] = [];
      }
      detailsMap[row.tab_id].push({
        id: row.id,
        values: (row.data_jsonb as Record<string, unknown>) ?? {},
      });
    }

    const rawNotes = Array.isArray(submission.data_jsonb?.notes)
      ? (submission.data_jsonb.notes as unknown[])
      : [];
    const rawDocs = Array.isArray(submission.data_jsonb?.documents)
      ? (submission.data_jsonb.documents as unknown[])
      : [];

    const rendererValue = {
      fields: rawFields,
      details: detailsMap,
      notes: rawNotes,
      documents: rawDocs,
    };

    return {
      submission,
      form,
      formVersion,
      detailRows,
      rendererValue,
      approval,
    };
  }

  async getSubmission(id: string, organizationId: string): Promise<FormSubmissionEntity | null> {
    return this.submissionRepository.getSubmissionById(id, organizationId);
  }

  async listSubmissions(params: SubmissionFilterParams): Promise<PaginatedSubmissionsResult> {
    return this.submissionRepository.listSubmissions(params);
  }

  async exportSubmissionsCsv(params: {
    userId: string;
    organizationId: string;
    formId: string;
    status?: string;
    referenceNumber?: string;
    dateFrom?: string;
    dateTo?: string;
    sortBy?: SubmissionSortField;
    sortOrder?: SubmissionSortOrder;
  }): Promise<{ csv: string; fileName: string; rowCount: number }> {
    const membership = await this.checkMembership(params.userId, params.organizationId);
    const roleKey = membership.role_key;
    const isPlatformAdmin = ['super_admin', 'business_admin'].includes(roleKey);

    const form = await this.formRepository.getFormById(
      params.formId,
      params.organizationId,
    );
    if (!form || form.organization_id !== params.organizationId) {
      throw new Error(
        `Form not found or inaccessible in organization ${params.organizationId}`,
      );
    }

    const published = await this.formRepository.getPublishedVersion(
      params.formId,
      params.organizationId,
    );
    let schemaVersion = published;
    if (!schemaVersion) {
      const versions = await this.formRepository.listVersions(
        params.formId,
        params.organizationId,
      );
      schemaVersion = versions[0] ?? null;
    }

    let createdOrSubmittedBy: string | undefined;
    if (!isPlatformAdmin) {
      const perms = (schemaVersion?.schema_jsonb as FormSchemaV1 | undefined)?.permissions || {};
      const readAllRoles = perms.readAllRoles ?? ['super_admin', 'business_admin', 'manager'];
      const readOwnRoles = perms.readOwnRoles ?? [
        'super_admin',
        'business_admin',
        'manager',
        'employee',
      ];

      const canReadAll = readAllRoles.includes(roleKey);
      const canReadOwn = readOwnRoles.includes(roleKey);

      if (!canReadAll && !canReadOwn) {
        throw new Error(
          `Unauthorized: Role "${roleKey}" is not permitted to export submissions for this form.`,
        );
      }

      if (!canReadAll && canReadOwn) {
        createdOrSubmittedBy = params.userId;
      }
    }

    const allSubmissions: FormSubmissionEntity[] = [];
    const maxPages = 50;
    for (let page = 1; page <= maxPages; page++) {
      const batch = await this.submissionRepository.listSubmissions({
        organizationId: params.organizationId,
        formId: params.formId,
        status: params.status,
        referenceNumber: params.referenceNumber,
        dateFrom: params.dateFrom,
        dateTo: params.dateTo,
        sortBy: params.sortBy ?? 'created_at',
        sortOrder: params.sortOrder ?? 'desc',
        createdOrSubmittedBy,
        page,
        pageSize: 100,
      });

      allSubmissions.push(...batch.submissions);
      if (batch.totalPages === 0 || page >= batch.totalPages) {
        break;
      }
    }

    return buildSubmissionsCsv({
      form,
      schema: schemaVersion?.schema_jsonb ?? null,
      submissions: allSubmissions,
    });
  }
}
