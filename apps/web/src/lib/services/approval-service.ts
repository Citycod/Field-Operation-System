import {
  ApprovalStepDefinition,
  FieldDefinition,
  FormSchemaV1,
  WorkflowAssignee,
  advanceWorkflowFromApproval,
  evaluateWorkflowStart,
  normalizeWorkflowDefinition,
} from '@field/form-engine';
import {
  ApprovalDecisionValue,
  ApprovalInstanceEntity,
  ApprovalRepository,
  ApprovalStageInstanceEntity,
  DecideApprovalStageResult,
  PendingApprovalTask,
  SubmissionApprovalHistory,
} from '../repositories/approval-repository';
import { FormRepository, FormVersionEntity } from '../repositories/form-repository';
import { MembershipRepository } from '../repositories/membership-repository';
import { FormSubmissionEntity } from '../repositories/submission-repository';

export interface ResolvedStagePlan {
  stepId: string;
  stageName: string;
  assigneeIndex: number;
  assignedApproverId: string | null;
  assignedRoleKey: string | null;
}

export interface WorkflowStartPlan {
  triggered: boolean;
  workflowId: string | null;
  nextStatus: string;
  fieldUpdates: Record<string, string | number | boolean | null>;
  firstStage: ResolvedStagePlan | null;
  errors: string[];
}

export interface SubmissionApprovalSummary extends SubmissionApprovalHistory {
  activeStage: ApprovalStageInstanceEntity | null;
  activeInstance: ApprovalInstanceEntity | null;
  canCurrentUserDecide: boolean;
  commentRequirements: {
    approve: boolean;
    reject: boolean;
    return: boolean;
  };
  actionLabels: {
    approve: string;
    reject: string;
    return: string;
  };
}

const TERMINAL_SUBMISSION_STATUSES = new Set([
  'approved',
  'rejected',
  'archived',
  'completed',
]);

export function collectSchemaFields(schema: FormSchemaV1): FieldDefinition[] {
  const headerFields = schema.header?.sections?.flatMap((s) => s.fields) ?? [];
  const tabFields =
    schema.tabs?.flatMap((t) =>
      t.type === 'form' ? t.sections.flatMap((s) => s.fields) : [],
    ) ?? [];
  return [...headerFields, ...tabFields];
}

export function isActorAuthorizedForStage(
  stage: ApprovalStageInstanceEntity,
  userId: string,
  roleKey: string,
): boolean {
  if (stage.assigned_approver_id) {
    return stage.assigned_approver_id === userId;
  }
  if (stage.assigned_role_key) {
    return stage.assigned_role_key === roleKey;
  }
  return false;
}

export function resolveAssigneeTarget(
  assignee: WorkflowAssignee | undefined,
  requesterUserId: string | null,
): { assignedApproverId: string | null; assignedRoleKey: string | null } {
  if (!assignee) {
    return { assignedApproverId: null, assignedRoleKey: 'manager' };
  }

  switch (assignee.type) {
    case 'user':
      return {
        assignedApproverId: assignee.value?.trim() || null,
        assignedRoleKey: null,
      };
    case 'role':
      return {
        assignedApproverId: null,
        assignedRoleKey: assignee.value?.trim() || 'manager',
      };
    case 'requester':
      return {
        assignedApproverId: requesterUserId,
        assignedRoleKey: requesterUserId ? null : 'manager',
      };
    case 'manager_of_requester':
    case 'department_role':
    case 'group':
    default:
      return {
        assignedApproverId: null,
        assignedRoleKey: 'manager',
      };
  }
}

export function buildStagePlanFromStep(
  step: ApprovalStepDefinition,
  assigneeIndex: number,
  requesterUserId: string | null,
): ResolvedStagePlan {
  const assignees = Array.isArray(step.assignees) ? step.assignees : [];
  const safeIndex = Math.max(0, Math.min(assigneeIndex, Math.max(0, assignees.length - 1)));
  const selectedAssignee = assignees[safeIndex];
  const resolved = resolveAssigneeTarget(selectedAssignee, requesterUserId);

  const stageName =
    step.mode === 'sequential' && assignees.length > 1
      ? `${step.name} (${safeIndex + 1}/${assignees.length})`
      : step.name;

  return {
    stepId: step.id,
    stageName,
    assigneeIndex: safeIndex,
    assignedApproverId: resolved.assignedApproverId,
    assignedRoleKey: resolved.assignedRoleKey,
  };
}

export function findApprovalStepInSchema(
  schema: FormSchemaV1 | undefined | null,
  stepId: string,
): ApprovalStepDefinition | null {
  const normalized = normalizeWorkflowDefinition(schema?.workflow);
  if (!normalized) return null;
  const found = normalized.steps.find(
    (s): s is ApprovalStepDefinition => s.type === 'approval' && s.id === stepId,
  );
  return found ?? null;
}

export function summarizeSubmissionApproval(
  history: SubmissionApprovalHistory,
  schema: FormSchemaV1 | undefined | null,
  userId: string,
  roleKey: string,
): SubmissionApprovalSummary {
  const activeInstance =
    [...history.instances].reverse().find((i) => i.status === 'active') ?? null;

  const activeStage = activeInstance
    ? history.stages.find(
        (s) => s.approval_instance_id === activeInstance.id && s.status === 'active',
      ) ?? null
    : null;

  const canCurrentUserDecide = activeStage
    ? isActorAuthorizedForStage(activeStage, userId, roleKey)
    : false;

  const activeStep = activeStage
    ? findApprovalStepInSchema(schema, activeStage.stage_definition_id)
    : null;

  return {
    ...history,
    activeInstance,
    activeStage,
    canCurrentUserDecide,
    commentRequirements: {
      approve: Boolean(activeStep?.requireCommentOnApprove),
      reject: Boolean(activeStep?.requireCommentOnReject),
      return: Boolean(activeStep?.requireCommentOnReturn),
    },
    actionLabels: {
      approve: activeStep?.approveLabel?.trim() || 'Approve',
      reject: activeStep?.rejectLabel?.trim() || 'Reject',
      return: activeStep?.returnLabel?.trim() || 'Return for Correction',
    },
  };
}

export function planWorkflowStart(params: {
  schema: FormSchemaV1;
  fieldValues: Record<string, unknown>;
  requesterUserId: string | null;
  referenceNumber: string | null;
}): WorkflowStartPlan {
  const normalized = normalizeWorkflowDefinition(params.schema.workflow);
  if (!normalized || !normalized.enabled) {
    return {
      triggered: false,
      workflowId: null,
      nextStatus: 'submitted',
      fieldUpdates: {},
      firstStage: null,
      errors: [],
    };
  }

  const allFields = collectSchemaFields(params.schema);
  const systemContext: Record<string, unknown> = {
    'system.status': 'submitted',
    'system.reference_number': params.referenceNumber ?? '',
  };

  const traversal = evaluateWorkflowStart(
    normalized,
    params.fieldValues,
    allFields,
    systemContext,
  );

  if (!traversal.triggered) {
    return {
      triggered: false,
      workflowId: normalized.id,
      nextStatus: 'submitted',
      fieldUpdates: {},
      firstStage: null,
      errors: traversal.errors,
    };
  }

  if (traversal.pausedAtApprovalStep) {
    return {
      triggered: true,
      workflowId: normalized.id,
      nextStatus: traversal.resolvedSubmissionStatus || 'pending_approval',
      fieldUpdates: traversal.fieldUpdates,
      firstStage: buildStagePlanFromStep(
        traversal.pausedAtApprovalStep,
        0,
        params.requesterUserId,
      ),
      errors: traversal.errors,
    };
  }

  return {
    triggered: true,
    workflowId: normalized.id,
    nextStatus: traversal.resolvedSubmissionStatus || 'submitted',
    fieldUpdates: traversal.fieldUpdates,
    firstStage: null,
    errors: traversal.errors,
  };
}

export class ApprovalService {
  constructor(
    private readonly formRepository: FormRepository,
    private readonly approvalRepository: ApprovalRepository,
    private readonly membershipRepository: MembershipRepository,
  ) {}

  private async checkMembership(userId: string, organizationId: string) {
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

  async getSubmissionApprovalSummary(params: {
    submissionId: string;
    organizationId: string;
    userId: string;
    roleKey: string;
    schema?: FormSchemaV1 | null;
  }): Promise<SubmissionApprovalSummary> {
    const history = await this.approvalRepository.getSubmissionApprovalHistory(
      params.submissionId,
      params.organizationId,
    );

    return summarizeSubmissionApproval(
      history,
      params.schema,
      params.userId,
      params.roleKey,
    );
  }

  async listMyPendingApprovals(params: {
    userId: string;
    organizationId: string;
  }): Promise<PendingApprovalTask[]> {
    const membership = await this.checkMembership(params.userId, params.organizationId);
    return this.approvalRepository.listPendingTasksForUser({
      organizationId: params.organizationId,
      userId: params.userId,
      roleKey: membership.role_key,
    });
  }

  async startWorkflowForExistingSubmission(params: {
    submission: FormSubmissionEntity;
    schema: FormSchemaV1;
    cycleNumber: number;
  }): Promise<WorkflowStartPlan> {
    const fieldValues =
      (params.submission.data_jsonb?.fields as Record<string, unknown>) ?? {};
    const requesterUserId =
      params.submission.submitted_by ?? params.submission.created_by ?? null;

    const plan = planWorkflowStart({
      schema: params.schema,
      fieldValues,
      requesterUserId,
      referenceNumber: params.submission.reference_number,
    });

    if (plan.triggered && plan.firstStage) {
      await this.approvalRepository.createApprovalInstanceWithInitialStage({
        organizationId: params.submission.organization_id,
        submissionId: params.submission.id,
        formVersionId: params.submission.form_version_id,
        workflowId: plan.workflowId,
        cycleNumber: params.cycleNumber,
        firstStage: plan.firstStage,
      });
    }

    return plan;
  }

  async decideStage(params: {
    userId: string;
    organizationId: string;
    stageInstanceId: string;
    decision: ApprovalDecisionValue;
    comment?: string | null;
  }): Promise<DecideApprovalStageResult> {
    const membership = await this.checkMembership(params.userId, params.organizationId);

    const context = await this.approvalRepository.getStageInstanceContext(
      params.stageInstanceId,
      params.organizationId,
    );

    if (!context) {
      throw new Error(
        `Approval stage not found or inaccessible in organization ${params.organizationId}`,
      );
    }

    const { stage, instance, submission } = context;

    if (
      stage.organization_id !== params.organizationId ||
      instance.organization_id !== params.organizationId ||
      submission.organization_id !== params.organizationId
    ) {
      throw new Error(
        `Unauthorized: Cross-tenant approval access denied for organization ${params.organizationId}`,
      );
    }

    if (stage.status !== 'active') {
      throw new Error(
        `APPROVAL_STAGE_ALREADY_DECIDED: This approval stage has already been decided (${stage.status}).`,
      );
    }

    if (instance.status !== 'active') {
      throw new Error(
        `APPROVAL_INSTANCE_NOT_ACTIVE: Approval workflow is no longer active (${instance.status}).`,
      );
    }

    if (TERMINAL_SUBMISSION_STATUSES.has(submission.status)) {
      throw new Error(
        `SUBMISSION_ALREADY_TERMINAL: Submission is already in terminal status (${submission.status}).`,
      );
    }

    if (!isActorAuthorizedForStage(stage, params.userId, membership.role_key)) {
      throw new Error(
        `Unauthorized: User ${params.userId} (${membership.role_key}) is not assigned to approval stage "${stage.stage_name}".`,
      );
    }

    const formVersion = await this.loadFormVersion(
      submission.form_id,
      instance.form_version_id,
      params.organizationId,
    );

    const schema = formVersion.schema_jsonb;
    const currentStep = findApprovalStepInSchema(schema, stage.stage_definition_id);
    const trimmedComment = params.comment?.trim() ?? '';

    if (params.decision === 'approved' && currentStep?.requireCommentOnApprove && !trimmedComment) {
      throw new Error('COMMENT_REQUIRED: A comment is required to approve this stage.');
    }
    if (params.decision === 'rejected' && currentStep?.requireCommentOnReject && !trimmedComment) {
      throw new Error('COMMENT_REQUIRED: A comment is required to reject this stage.');
    }
    if (params.decision === 'returned' && currentStep?.requireCommentOnReturn && !trimmedComment) {
      throw new Error('COMMENT_REQUIRED: A comment is required when returning for correction.');
    }

    const requesterUserId = submission.submitted_by ?? submission.created_by ?? null;
    let nextStage: ResolvedStagePlan | null = null;
    let terminalSubmissionStatus: string | null = null;
    let updatedFields: Record<string, unknown> | null = null;

    if (
      params.decision === 'approved' &&
      currentStep &&
      currentStep.mode === 'sequential' &&
      Array.isArray(currentStep.assignees) &&
      stage.assignee_index + 1 < currentStep.assignees.length
    ) {
      nextStage = buildStagePlanFromStep(
        currentStep,
        stage.assignee_index + 1,
        requesterUserId,
      );
    } else {
      const allFields = collectSchemaFields(schema);
      const submissionFields =
        (submission.data_jsonb?.fields as Record<string, unknown>) ?? {};
      const systemContext: Record<string, unknown> = {
        'system.status': submission.status,
        'system.reference_number': submission.reference_number ?? '',
      };

      const traversal = advanceWorkflowFromApproval(
        schema.workflow,
        stage.stage_definition_id,
        params.decision,
        submissionFields,
        allFields,
        systemContext,
      );

      if (traversal.errors.length > 0) {
        throw new Error(`Workflow execution error: ${traversal.errors.join('; ')}`);
      }

      if (Object.keys(traversal.fieldUpdates).length > 0) {
        updatedFields = traversal.fieldUpdates;
      }

      if (traversal.pausedAtApprovalStep) {
        nextStage = buildStagePlanFromStep(
          traversal.pausedAtApprovalStep,
          0,
          requesterUserId,
        );
      } else {
        terminalSubmissionStatus =
          traversal.resolvedSubmissionStatus ||
          (params.decision === 'returned'
            ? 'returned'
            : params.decision === 'rejected'
              ? 'rejected'
              : 'approved');
      }
    }

    return this.approvalRepository.decideApprovalStage({
      organizationId: params.organizationId,
      stageInstanceId: stage.id,
      actorUserId: params.userId,
      actorRoleKey: membership.role_key,
      decision: params.decision,
      comment: trimmedComment || null,
      nextStage,
      terminalSubmissionStatus,
      updatedFields,
    });
  }

  private async loadFormVersion(
    formId: string,
    versionId: string,
    organizationId: string,
  ): Promise<FormVersionEntity> {
    if (typeof (this.formRepository as any).getVersionById === 'function') {
      const found = await (this.formRepository as any).getVersionById(
        versionId,
        organizationId,
      );
      if (found) return found;
    }

    const versions = await this.formRepository.listVersions(formId, organizationId);
    const matched = versions.find((v) => v.id === versionId);
    if (!matched) {
      throw new Error(`Historical form version ${versionId} not found.`);
    }
    return matched;
  }
}
