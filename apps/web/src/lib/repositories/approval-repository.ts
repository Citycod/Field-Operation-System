import type { FormSubmissionEntity } from './submission-repository';

export type ApprovalInstanceStatus =
  | 'active'
  | 'approved'
  | 'rejected'
  | 'returned'
  | 'cancelled';

export type ApprovalStageStatus =
  | 'pending'
  | 'active'
  | 'approved'
  | 'rejected'
  | 'returned'
  | 'skipped'
  | 'cancelled';

export type ApprovalDecisionValue = 'approved' | 'rejected' | 'returned';

export interface ApprovalInstanceEntity {
  id: string;
  organization_id: string;
  submission_id: string;
  form_version_id: string;
  workflow_id: string | null;
  status: ApprovalInstanceStatus;
  current_stage_order: number | null;
  current_step_id: string | null;
  cycle_number: number;
  started_at: string;
  completed_at: string | null;
  created_at: string;
}

export interface ApprovalStageInstanceEntity {
  id: string;
  organization_id: string;
  approval_instance_id: string;
  stage_definition_id: string;
  stage_order: number;
  assignee_index: number;
  stage_name: string;
  status: ApprovalStageStatus;
  assigned_approver_id: string | null;
  assigned_role_id: string | null;
  assigned_role_key: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

export interface ApprovalDecisionEntity {
  id: string;
  organization_id: string;
  stage_instance_id: string;
  approver_id: string;
  decision: ApprovalDecisionValue;
  comment: string | null;
  created_at: string;
}

export interface SubmissionApprovalHistory {
  instances: ApprovalInstanceEntity[];
  stages: ApprovalStageInstanceEntity[];
  decisions: ApprovalDecisionEntity[];
}

export interface PendingApprovalTask {
  stage: ApprovalStageInstanceEntity;
  instance: ApprovalInstanceEntity;
  submission: {
    id: string;
    form_id: string;
    form_version_id: string;
    reference_number: string | null;
    status: string;
    submitted_by: string | null;
    submitted_at: string | null;
    created_at: string;
  };
  formTitle: string;
  formKey: string;
}

export interface ApprovalStageContext {
  stage: ApprovalStageInstanceEntity;
  instance: ApprovalInstanceEntity;
  submission: FormSubmissionEntity;
}

export interface DecideApprovalStageParams {
  organizationId: string;
  stageInstanceId: string;
  actorUserId: string;
  actorRoleKey: string;
  decision: ApprovalDecisionValue;
  comment?: string | null;
  nextStage: {
    stepId: string;
    stageName: string;
    assigneeIndex: number;
    assignedApproverId: string | null;
    assignedRoleKey: string | null;
  } | null;
  terminalSubmissionStatus: string | null;
  updatedFields?: Record<string, unknown> | null;
}

export interface DecideApprovalStageResult {
  decisionId: string;
  stageInstanceId: string;
  approvalInstanceId: string;
  submissionId: string;
  submissionStatus: string;
  instanceStatus: string;
  nextStageInstanceId: string | null;
}

export interface ApprovalRepository {
  createApprovalInstanceWithInitialStage(params: {
    organizationId: string;
    submissionId: string;
    formVersionId: string;
    workflowId: string | null;
    cycleNumber: number;
    firstStage: {
      stepId: string;
      stageName: string;
      assigneeIndex: number;
      assignedApproverId: string | null;
      assignedRoleKey: string | null;
    };
  }): Promise<{
    instance: ApprovalInstanceEntity;
    stage: ApprovalStageInstanceEntity;
  }>;

  getSubmissionApprovalHistory(
    submissionId: string,
    organizationId: string,
  ): Promise<SubmissionApprovalHistory>;

  getStageInstanceContext(
    stageInstanceId: string,
    organizationId: string,
  ): Promise<ApprovalStageContext | null>;

  listPendingTasksForUser(params: {
    organizationId: string;
    userId: string;
    roleKey: string;
  }): Promise<PendingApprovalTask[]>;

  hasAssignedStageForSubmission(params: {
    submissionId: string;
    organizationId: string;
    userId: string;
    roleKey: string;
  }): Promise<boolean>;

  decideApprovalStage(
    params: DecideApprovalStageParams,
  ): Promise<DecideApprovalStageResult>;
}
