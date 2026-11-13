import type { RuleCondition } from './rules';

export type ApproverType = 'user' | 'role' | 'departmentRole' | 'managerOfRequester';

export interface WorkflowStageDefinition {
  id: string;
  key: string;
  name: string;
  order: number;
  approverType: ApproverType;
  approverValue?: string;
  requireCommentOnApprove?: boolean;
  requireCommentOnReject?: boolean;
  requireCommentOnReturn?: boolean;
}

export interface LegacySequentialWorkflowDefinition {
  type: 'sequential';
  stages: WorkflowStageDefinition[];
}

export const WORKFLOW_TRIGGER_TYPES = [
  'on_submit',
  'on_record_create',
  'on_record_update',
  'on_field_change',
  'manual',
] as const;

export type WorkflowTriggerType = (typeof WORKFLOW_TRIGGER_TYPES)[number];

export const RUNTIME_SUPPORTED_TRIGGER_TYPES = new Set<WorkflowTriggerType>(['on_submit']);

export interface WorkflowTriggerDefinition {
  id: string;
  type: WorkflowTriggerType;
  enabled?: boolean;
  watchedFieldRefs?: string[];
  conditionLogic?: 'AND' | 'OR';
  conditions?: RuleCondition[];
}

export const WORKFLOW_ASSIGNEE_TYPES = [
  'user',
  'role',
  'manager_of_requester',
  'group',
  'department_role',
  'requester',
] as const;

export type WorkflowAssigneeType = (typeof WORKFLOW_ASSIGNEE_TYPES)[number];

export const RUNTIME_SUPPORTED_ASSIGNEE_TYPES = new Set<WorkflowAssigneeType>([
  'user',
  'role',
  'requester',
]);

export interface WorkflowAssignee {
  type: WorkflowAssigneeType;
  value?: string;
  label?: string;
}

export const WORKFLOW_STEP_TYPES = [
  'start',
  'approval',
  'assignment',
  'condition',
  'notification',
  'update_record',
  'end',
] as const;

export type WorkflowStepType = (typeof WORKFLOW_STEP_TYPES)[number];

export type WorkflowApprovalMode = 'single' | 'sequential' | 'parallel';

export type WorkflowNotificationEvent =
  | 'task_assigned'
  | 'approval_requested'
  | 'approved'
  | 'rejected'
  | 'workflow_completed';

export const WORKFLOW_NOTIFICATION_EVENTS: readonly WorkflowNotificationEvent[] = [
  'task_assigned',
  'approval_requested',
  'approved',
  'rejected',
  'workflow_completed',
];

export type WorkflowOutcome = 'approved' | 'rejected' | 'completed' | 'cancelled';

export const WORKFLOW_OUTCOMES: readonly WorkflowOutcome[] = [
  'approved',
  'rejected',
  'completed',
  'cancelled',
];

export interface BaseWorkflowStep {
  id: string;
  key: string;
  name: string;
  type: WorkflowStepType;
  description?: string;
}

export interface StartStepDefinition extends BaseWorkflowStep {
  type: 'start';
}

export interface ApprovalStepDefinition extends BaseWorkflowStep {
  type: 'approval';
  mode: WorkflowApprovalMode;
  assignees: WorkflowAssignee[];
  completionPolicy?: 'all' | 'any';
  allowReassignment?: boolean;
  requireCommentOnApprove?: boolean;
  requireCommentOnReject?: boolean;
  requireCommentOnReturn?: boolean;
  approveLabel?: string;
  rejectLabel?: string;
  returnLabel?: string;
}

export interface AssignmentStepDefinition extends BaseWorkflowStep {
  type: 'assignment';
  assignee: WorkflowAssignee;
  dueInHours?: number;
  instructions?: string;
}

export interface ConditionBranchDefinition {
  id: string;
  label: string;
  conditionLogic: 'AND' | 'OR';
  conditions: RuleCondition[];
  targetStepId: string;
}

export interface ConditionStepDefinition extends BaseWorkflowStep {
  type: 'condition';
  branches: ConditionBranchDefinition[];
  defaultTargetStepId?: string;
}

export interface NotificationStepDefinition extends BaseWorkflowStep {
  type: 'notification';
  event: WorkflowNotificationEvent;
  recipients: WorkflowAssignee[];
  subjectTemplate: string;
  bodyTemplate: string;
}

export interface UpdateRecordMutation {
  id: string;
  targetRef: string;
  value: string | number | boolean | null;
}

export interface UpdateRecordStepDefinition extends BaseWorkflowStep {
  type: 'update_record';
  updates: UpdateRecordMutation[];
}

export interface EndStepDefinition extends BaseWorkflowStep {
  type: 'end';
  outcome: WorkflowOutcome;
  finalStatus?: string;
}

export type WorkflowStepDefinition =
  | StartStepDefinition
  | ApprovalStepDefinition
  | AssignmentStepDefinition
  | ConditionStepDefinition
  | NotificationStepDefinition
  | UpdateRecordStepDefinition
  | EndStepDefinition;

export type WorkflowTransitionOutcome =
  | 'default'
  | 'approved'
  | 'rejected'
  | 'returned'
  | 'branch';

export interface WorkflowTransitionDefinition {
  id: string;
  fromStepId: string;
  toStepId: string;
  outcome?: WorkflowTransitionOutcome;
  branchId?: string;
  label?: string;
}

export interface FlowWorkflowDefinition {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
  mode?: 'flow' | 'sequential';
  triggers: WorkflowTriggerDefinition[];
  steps: WorkflowStepDefinition[];
  transitions: WorkflowTransitionDefinition[];
}

export type WorkflowDefinition = LegacySequentialWorkflowDefinition | FlowWorkflowDefinition;

export function isLegacySequentialWorkflow(
  workflow: unknown,
): workflow is LegacySequentialWorkflowDefinition {
  return (
    workflow !== null &&
    typeof workflow === 'object' &&
    !Array.isArray(workflow) &&
    'stages' in workflow &&
    !('steps' in workflow)
  );
}

export function isFlowWorkflow(workflow: unknown): workflow is FlowWorkflowDefinition {
  return (
    workflow !== null &&
    typeof workflow === 'object' &&
    !Array.isArray(workflow) &&
    'steps' in workflow
  );
}

function mapLegacyApproverType(approverType: ApproverType): WorkflowAssigneeType {
  switch (approverType) {
    case 'user':
      return 'user';
    case 'role':
      return 'role';
    case 'departmentRole':
      return 'department_role';
    case 'managerOfRequester':
      return 'manager_of_requester';
  }
}

/**
 * Creates a clean, publish-valid starter workflow (Start -> Manager Approval -> Approved/Rejected End).
 */
export function createDefaultFlowWorkflow(formTitle?: string): FlowWorkflowDefinition {
  const startId = 'wf_step_start';
  const approvalId = 'wf_step_approval_1';
  const endApprovedId = 'wf_step_end_approved';
  const endRejectedId = 'wf_step_end_rejected';

  return {
    id: 'wf_main',
    name: formTitle ? `${formTitle} Approval Workflow` : 'Standard Approval Workflow',
    description: 'Configured process triggered when a form submission is received.',
    enabled: true,
    mode: 'flow',
    triggers: [
      {
        id: 'wf_trig_submit',
        type: 'on_submit',
        enabled: true,
        conditionLogic: 'AND',
        conditions: [],
      },
    ],
    steps: [
      {
        id: startId,
        key: 'start',
        name: 'Submission Received',
        type: 'start',
      },
      {
        id: approvalId,
        key: 'manager_review',
        name: 'Manager Review',
        type: 'approval',
        mode: 'single',
        assignees: [{ type: 'role', value: 'manager', label: 'Manager' }],
        requireCommentOnReject: true,
      },
      {
        id: endApprovedId,
        key: 'end_approved',
        name: 'Approved',
        type: 'end',
        outcome: 'approved',
        finalStatus: 'approved',
      },
      {
        id: endRejectedId,
        key: 'end_rejected',
        name: 'Rejected',
        type: 'end',
        outcome: 'rejected',
        finalStatus: 'rejected',
      },
    ],
    transitions: [
      {
        id: 'wf_tr_start_review',
        fromStepId: startId,
        toStepId: approvalId,
        outcome: 'default',
      },
      {
        id: 'wf_tr_review_approved',
        fromStepId: approvalId,
        toStepId: endApprovedId,
        outcome: 'approved',
        label: 'Approved',
      },
      {
        id: 'wf_tr_review_rejected',
        fromStepId: approvalId,
        toStepId: endRejectedId,
        outcome: 'rejected',
        label: 'Rejected',
      },
    ],
  };
}

/**
 * Pure normalization helper converting legacy `{ type: 'sequential', stages }`
 * workflows into canonical `FlowWorkflowDefinition` without mutating inputs.
 */
export function normalizeWorkflowDefinition(
  workflow: WorkflowDefinition | null | undefined,
): FlowWorkflowDefinition | null {
  if (!workflow || typeof workflow !== 'object') return null;

  if (isFlowWorkflow(workflow)) {
    return {
      ...workflow,
      triggers: Array.isArray(workflow.triggers) ? workflow.triggers : [],
      steps: Array.isArray(workflow.steps) ? workflow.steps : [],
      transitions: Array.isArray(workflow.transitions) ? workflow.transitions : [],
    };
  }

  if (isLegacySequentialWorkflow(workflow)) {
    const sortedStages = [...(workflow.stages || [])].sort((a, b) => a.order - b.order);
    const startId = 'wf_step_start';
    const endApprovedId = 'wf_step_end_approved';
    const endRejectedId = 'wf_step_end_rejected';

    const steps: WorkflowStepDefinition[] = [
      {
        id: startId,
        key: 'start',
        name: 'Submission Received',
        type: 'start',
      },
    ];

    const transitions: WorkflowTransitionDefinition[] = [];
    let previousId = startId;

    sortedStages.forEach((stage, idx) => {
      const stepId = stage.id || `wf_stage_${idx}`;
      steps.push({
        id: stepId,
        key: stage.key || `stage_${idx}`,
        name: stage.name || `Approval Stage ${idx + 1}`,
        type: 'approval',
        mode: 'single',
        assignees: [
          {
            type: mapLegacyApproverType(stage.approverType),
            value: stage.approverValue,
          },
        ],
        requireCommentOnApprove: stage.requireCommentOnApprove,
        requireCommentOnReject: stage.requireCommentOnReject,
        requireCommentOnReturn: stage.requireCommentOnReturn,
      });

      transitions.push({
        id: `wf_tr_legacy_${idx}`,
        fromStepId: previousId,
        toStepId: stepId,
        outcome: idx === 0 ? 'default' : 'approved',
        label: idx === 0 ? undefined : 'Approved',
      });
      transitions.push({
        id: `wf_tr_legacy_rej_${idx}`,
        fromStepId: stepId,
        toStepId: endRejectedId,
        outcome: 'rejected',
        label: 'Rejected',
      });
      previousId = stepId;
    });

    steps.push(
      {
        id: endApprovedId,
        key: 'end_approved',
        name: 'Approved',
        type: 'end',
        outcome: 'approved',
        finalStatus: 'approved',
      },
      {
        id: endRejectedId,
        key: 'end_rejected',
        name: 'Rejected',
        type: 'end',
        outcome: 'rejected',
        finalStatus: 'rejected',
      },
    );

    transitions.push({
      id: 'wf_tr_legacy_final',
      fromStepId: previousId,
      toStepId: endApprovedId,
      outcome: sortedStages.length > 0 ? 'approved' : 'default',
      label: sortedStages.length > 0 ? 'Approved' : undefined,
    });

    return {
      id: 'wf_legacy_sequential',
      name: 'Sequential Approval Workflow',
      description: 'Converted from sequential approval stages.',
      enabled: true,
      mode: 'sequential',
      triggers: [
        {
          id: 'wf_trig_submit',
          type: 'on_submit',
          enabled: true,
          conditionLogic: 'AND',
          conditions: [],
        },
      ],
      steps,
      transitions,
    };
  }

  return null;
}
