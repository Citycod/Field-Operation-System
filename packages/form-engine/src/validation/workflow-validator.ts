import { FieldDefinition } from '../schema/fields';
import { DetailsColumnDefinition } from '../schema/tabs';
import {
  ApprovalStepDefinition,
  AssignmentStepDefinition,
  ConditionStepDefinition,
  EndStepDefinition,
  FlowWorkflowDefinition,
  NotificationStepDefinition,
  UpdateRecordStepDefinition,
  WORKFLOW_ASSIGNEE_TYPES,
  WORKFLOW_NOTIFICATION_EVENTS,
  WORKFLOW_OUTCOMES,
  WORKFLOW_STEP_TYPES,
  WORKFLOW_TRIGGER_TYPES,
  WorkflowAssignee,
  WorkflowStepDefinition,
  isFlowWorkflow,
  isLegacySequentialWorkflow,
} from '../schema/workflow';
import { SYSTEM_FIELD_REFS } from './list-view-validator';
import { VALID_PLATFORM_ROLES } from './settings-permissions-validator';
import { ValidationError, ValidationWarning } from './types';

export interface WorkflowValidationContext {
  activeMemberUserIds?: Set<string>;
}

export interface WorkflowValidationReport {
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

const VALID_RULE_OPERATORS = new Set([
  'equals',
  'notEquals',
  'greaterThan',
  'lessThan',
  'contains',
  'isEmpty',
  'isNotEmpty',
]);

const VALID_STEP_TYPE_SET = new Set<string>(WORKFLOW_STEP_TYPES);
const VALID_TRIGGER_TYPE_SET = new Set<string>(WORKFLOW_TRIGGER_TYPES);
const VALID_ASSIGNEE_TYPE_SET = new Set<string>(WORKFLOW_ASSIGNEE_TYPES);
const VALID_NOTIFICATION_EVENT_SET = new Set<string>(WORKFLOW_NOTIFICATION_EVENTS);
const VALID_OUTCOME_SET = new Set<string>(WORKFLOW_OUTCOMES);
const VALID_ROLE_SET = new Set<string>(VALID_PLATFORM_ROLES);
const WRITABLE_SYSTEM_REFS = new Set<string>(['system.status']);

const isRecord = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v);
const isNonEmptyText = (v: unknown): v is string =>
  typeof v === 'string' && v.trim().length > 0;

function hasUnsafeTemplatePattern(text: string): boolean {
  return /<script|javascript:|onerror=|onload=|\$\{/i.test(text);
}

/**
 * Structural check for workflow containers before semantic validation.
 * Supports null, legacy sequential stages, and FlowWorkflowDefinition.
 */
export function validateWorkflowStructure(value: unknown): ValidationError[] {
  const errors: ValidationError[] = [];
  const fail = (path: string, code: string, message: string) =>
    errors.push({ path, code, message });

  if (value === null || value === undefined) return errors;

  if (!isRecord(value)) {
    fail('workflow', 'INVALID_WORKFLOW_STAGE', 'Workflow must be an object or null');
    return errors;
  }

  if (isFlowWorkflow(value)) {
    if (!Array.isArray(value.steps)) {
      fail('workflow.steps', 'INVALID_WORKFLOW_STEP', 'workflow.steps must be an array');
    } else {
      value.steps.forEach((step, idx) => {
        if (!isRecord(step)) {
          fail(`workflow.steps[${idx}]`, 'INVALID_WORKFLOW_STEP', 'Workflow step must be an object');
        }
      });
    }

    if (value.transitions !== undefined && !Array.isArray(value.transitions)) {
      fail('workflow.transitions', 'INVALID_WORKFLOW_TRANSITION', 'workflow.transitions must be an array');
    } else if (Array.isArray(value.transitions)) {
      value.transitions.forEach((tr, idx) => {
        if (!isRecord(tr)) {
          fail(
            `workflow.transitions[${idx}]`,
            'INVALID_WORKFLOW_TRANSITION',
            'Workflow transition must be an object',
          );
        }
      });
    }

    if (value.triggers !== undefined && !Array.isArray(value.triggers)) {
      fail('workflow.triggers', 'INVALID_WORKFLOW_TRIGGER', 'workflow.triggers must be an array');
    }

    if (value.enabled !== undefined && typeof value.enabled !== 'boolean') {
      fail('workflow.enabled', 'INVALID_WORKFLOW_CONFIG', 'workflow.enabled must be a boolean');
    }

    return errors;
  }

  // Legacy sequential workflow structure check (preserve exact existing behavior)
  if (!Array.isArray(value.stages)) {
    fail('workflow.stages', 'INVALID_WORKFLOW_STAGE', 'workflow.stages must be an array');
  } else {
    value.stages.forEach((stage, i) => {
      if (!isRecord(stage)) {
        fail(`workflow.stages[${i}]`, 'INVALID_WORKFLOW_STAGE', 'Invalid workflow stage');
      }
    });
  }

  return errors;
}

/**
 * Returns true if the workflow definition contains any user-specific assignee,
 * approver, or notification recipient that requires active tenant roster checks.
 */
export function workflowHasUserAssignees(workflow: unknown): boolean {
  if (!isRecord(workflow)) return false;

  if (isFlowWorkflow(workflow)) {
    if (!Array.isArray(workflow.steps)) return false;
    return workflow.steps.some((rawStep) => {
      if (!isRecord(rawStep)) return false;
      if (rawStep.type === 'approval' && Array.isArray(rawStep.assignees)) {
        return rawStep.assignees.some((a) => isRecord(a) && a.type === 'user');
      }
      if (rawStep.type === 'assignment' && isRecord(rawStep.assignee)) {
        return rawStep.assignee.type === 'user';
      }
      if (rawStep.type === 'notification' && Array.isArray(rawStep.recipients)) {
        return rawStep.recipients.some((r) => isRecord(r) && r.type === 'user');
      }
      return false;
    });
  }

  if (isLegacySequentialWorkflow(workflow)) {
    if (!Array.isArray(workflow.stages)) return false;
    return workflow.stages.some(
      (stage) => isRecord(stage) && stage.approverType === 'user',
    );
  }

  return false;
}

function validateLegacyWorkflow(
  workflow: Record<string, unknown>,
  strictRefs: boolean,
  context?: WorkflowValidationContext,
): WorkflowValidationReport {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];
  const fail = (path: string, code: string, message: string) =>
    errors.push({ path, code, message });

  if (!strictRefs) {
    return { errors, warnings };
  }

  if (workflow.type !== 'sequential') {
    fail('workflow.type', 'INVALID_WORKFLOW_TYPE', 'Only sequential approval is supported');
    return { errors, warnings };
  }

  const stages = Array.isArray(workflow.stages) ? workflow.stages : [];
  if (!stages.length) {
    fail('workflow.stages', 'INVALID_WORKFLOW_STAGE', 'A configured workflow needs at least one stage');
    return { errors, warnings };
  }

  const orders = new Set<number>();
  const stageIds = new Set<string>();
  const stageKeys = new Set<string>();

  stages.forEach((rawStage, i) => {
    const path = `workflow.stages[${i}]`;
    const stage = rawStage as Record<string, unknown>;
    if (
      typeof stage.name !== 'string' ||
      !stage.name.trim() ||
      !stage.id ||
      !stage.key ||
      stageIds.has(String(stage.id)) ||
      stageKeys.has(String(stage.key))
    ) {
      fail(path, 'INVALID_WORKFLOW_STAGE', 'Stage needs a name and unique identity');
    }
    stageIds.add(String(stage.id));
    stageKeys.add(String(stage.key));

    const order = stage.order as number;
    if (!Number.isInteger(order) || order < 0 || order >= stages.length || orders.has(order)) {
      fail(
        `${path}.order`,
        'INVALID_WORKFLOW_ORDER',
        'Stage orders must be unique consecutive integers starting at zero',
      );
    }
    orders.add(order);

    const approverType = String(stage.approverType);
    const approverValue = stage.approverValue;
    if (
      !['user', 'role', 'departmentRole', 'managerOfRequester'].includes(approverType) ||
      (approverType !== 'managerOfRequester' &&
        (typeof approverValue !== 'string' || !approverValue.trim()))
    ) {
      fail(
        `${path}.approverType`,
        'INVALID_WORKFLOW_APPROVER',
        'Select a supported approver type and its user/role value',
      );
    } else if (
      strictRefs &&
      approverType === 'user' &&
      typeof approverValue === 'string' &&
      context?.activeMemberUserIds !== undefined &&
      !context.activeMemberUserIds.has(approverValue.trim())
    ) {
      fail(
        `${path}.approverValue`,
        'INVALID_WORKFLOW_ASSIGNEE',
        `Assigned user "${approverValue.trim()}" is not an active member of this organization`,
      );
    }
  });

  return { errors, warnings };
}

function validateAssigneeEntry(
  assignee: unknown,
  path: string,
  strictRefs: boolean,
  reportIssue: (path: string, code: string, message: string, isHardError: boolean) => void,
  context?: WorkflowValidationContext,
  options?: { allowRequester?: boolean },
) {
  if (!isRecord(assignee)) {
    reportIssue(path, 'INVALID_WORKFLOW_ASSIGNEE', 'Assignee configuration must be an object', true);
    return;
  }

  const a = assignee as Partial<WorkflowAssignee>;
  if (!a.type || !VALID_ASSIGNEE_TYPE_SET.has(a.type)) {
    reportIssue(
      `${path}.type`,
      'INVALID_WORKFLOW_ASSIGNEE',
      `Unsupported assignee type "${String(a.type)}"`,
      true,
    );
    return;
  }

  if (a.type === 'requester' && !options?.allowRequester) {
    reportIssue(
      `${path}.type`,
      'INVALID_WORKFLOW_ASSIGNEE',
      'Requester cannot be assigned as an approval/task actor',
      strictRefs,
    );
    return;
  }

  const needsValue = ['user', 'role', 'group', 'department_role'].includes(a.type);
  if (needsValue && !isNonEmptyText(a.value)) {
    reportIssue(
      `${path}.value`,
      'MISSING_WORKFLOW_ASSIGNEE',
      `Assignee type "${a.type}" requires a selected target value`,
      strictRefs,
    );
    return;
  }

  if (a.type === 'role' && a.value && !VALID_ROLE_SET.has(a.value)) {
    reportIssue(
      `${path}.value`,
      'INVALID_WORKFLOW_ASSIGNEE',
      `Invalid platform role "${a.value}"`,
      true,
    );
  }

  if (
    strictRefs &&
    a.type === 'user' &&
    a.value &&
    context?.activeMemberUserIds !== undefined &&
    !context.activeMemberUserIds.has(a.value)
  ) {
    reportIssue(
      `${path}.value`,
      'INVALID_WORKFLOW_ASSIGNEE',
      `Assigned user "${a.value}" is not an active member of this organization`,
      true,
    );
  }
}

function validateConditionsList(
  conditions: unknown,
  path: string,
  availableFieldIds: Set<string>,
  availableFieldKeys: Set<string>,
  strictRefs: boolean,
  reportIssue: (path: string, code: string, message: string, isHardError: boolean) => void,
) {
  if (!Array.isArray(conditions)) {
    reportIssue(path, 'INVALID_WORKFLOW_CONDITION', 'Conditions must be an array', true);
    return;
  }

  conditions.forEach((rawCond, idx) => {
    const condPath = `${path}[${idx}]`;
    if (!isRecord(rawCond)) {
      reportIssue(condPath, 'INVALID_WORKFLOW_CONDITION', 'Condition entry must be an object', true);
      return;
    }

    if (!isNonEmptyText(rawCond.fieldId)) {
      reportIssue(
        `${condPath}.fieldId`,
        'INVALID_WORKFLOW_CONDITION',
        'Condition is missing a source field reference',
        strictRefs,
      );
    } else if (
      strictRefs &&
      !availableFieldIds.has(rawCond.fieldId) &&
      !availableFieldKeys.has(rawCond.fieldId) &&
      !SYSTEM_FIELD_REFS.has(rawCond.fieldId)
    ) {
      reportIssue(
        `${condPath}.fieldId`,
        'BROKEN_WORKFLOW_FIELD_REF',
        `Workflow condition references unknown field "${rawCond.fieldId}"`,
        true,
      );
    }

    if (!isNonEmptyText(rawCond.operator) || !VALID_RULE_OPERATORS.has(rawCond.operator)) {
      reportIssue(
        `${condPath}.operator`,
        'INVALID_WORKFLOW_CONDITION',
        `Unsupported condition operator "${String(rawCond.operator)}"`,
        true,
      );
    }
  });
}

/**
 * Validates `WorkflowDefinition` in either Draft (`strictRefs = false`) or Publish (`strictRefs = true`) mode.
 *
 * - In Draft mode: structurally corrupt data (duplicate IDs/keys, unknown step types, invalid operators)
 *   are reported as `errors`; incomplete authoring work (missing start/end, missing assignees,
 *   unresolved field references, unreachable WIP steps) are returned as `warnings` so WIP drafts save.
 * - In Publish mode: all incomplete/broken graph/reference issues become blocking `errors`.
 */
export function validateWorkflowSemantic(
  workflow: unknown,
  fields: readonly (FieldDefinition | DetailsColumnDefinition)[],
  availableFieldIds: Set<string>,
  availableFieldKeys: Set<string>,
  strictRefs: boolean,
  context?: WorkflowValidationContext,
): WorkflowValidationReport {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  if (workflow === null || workflow === undefined) {
    return { errors, warnings };
  }

  if (!isRecord(workflow)) {
    errors.push({
      path: 'workflow',
      code: 'INVALID_WORKFLOW_CONFIG',
      message: 'Workflow definition must be an object',
    });
    return { errors, warnings };
  }

  if (isLegacySequentialWorkflow(workflow) || !isFlowWorkflow(workflow)) {
    return validateLegacyWorkflow(workflow, strictRefs, context);
  }

  const reportIssue = (path: string, code: string, message: string, isHardError: boolean) => {
    if (isHardError || strictRefs) {
      errors.push({ path, code, message });
    } else {
      warnings.push({ path, code, message });
    }
  };

  const wf = workflow as Partial<FlowWorkflowDefinition>;

  // Metadata
  if (!isNonEmptyText(wf.id)) {
    reportIssue('workflow.id', 'MISSING_WORKFLOW_ID', 'Workflow is missing an identifier', strictRefs);
  }
  if (!isNonEmptyText(wf.name)) {
    reportIssue('workflow.name', 'MISSING_WORKFLOW_NAME', 'Workflow name is required', strictRefs);
  }
  if (typeof wf.enabled !== 'boolean') {
    reportIssue('workflow.enabled', 'INVALID_WORKFLOW_CONFIG', 'Workflow enabled flag must be a boolean', strictRefs);
  }

  // Triggers
  const triggers = Array.isArray(wf.triggers) ? wf.triggers : [];
  if (wf.enabled && triggers.length === 0) {
    reportIssue(
      'workflow.triggers',
      'WORKFLOW_MISSING_TRIGGER',
      'Enabled workflow requires at least one trigger',
      strictRefs,
    );
  }
  const triggerIds = new Set<string>();
  triggers.forEach((rawTrig, idx) => {
    const tPath = `workflow.triggers[${idx}]`;
    if (!isRecord(rawTrig)) {
      reportIssue(tPath, 'INVALID_WORKFLOW_TRIGGER', 'Trigger must be an object', true);
      return;
    }
    if (!isNonEmptyText(rawTrig.id)) {
      reportIssue(`${tPath}.id`, 'INVALID_WORKFLOW_TRIGGER', 'Trigger missing id', true);
    } else if (triggerIds.has(rawTrig.id)) {
      reportIssue(`${tPath}.id`, 'DUPLICATE_WORKFLOW_TRIGGER_ID', `Duplicate trigger ID "${rawTrig.id}"`, true);
    } else {
      triggerIds.add(rawTrig.id);
    }

    if (!isNonEmptyText(rawTrig.type) || !VALID_TRIGGER_TYPE_SET.has(rawTrig.type)) {
      reportIssue(
        `${tPath}.type`,
        'INVALID_WORKFLOW_TRIGGER',
        `Unsupported trigger type "${String(rawTrig.type)}"`,
        true,
      );
    } else if (rawTrig.type === 'on_field_change') {
      const refs = rawTrig.watchedFieldRefs;
      if (!Array.isArray(refs) || refs.length === 0) {
        reportIssue(
          `${tPath}.watchedFieldRefs`,
          'INVALID_WORKFLOW_TRIGGER',
          'Field-change trigger requires at least one watched field',
          strictRefs,
        );
      } else if (strictRefs) {
        refs.forEach((ref, rIdx) => {
          if (typeof ref !== 'string' || (!availableFieldIds.has(ref) && !availableFieldKeys.has(ref))) {
            reportIssue(
              `${tPath}.watchedFieldRefs[${rIdx}]`,
              'BROKEN_WORKFLOW_FIELD_REF',
              `Trigger watches unknown field "${String(ref)}"`,
              true,
            );
          }
        });
      }
    }

    if (rawTrig.conditionLogic !== undefined && !['AND', 'OR'].includes(String(rawTrig.conditionLogic))) {
      reportIssue(`${tPath}.conditionLogic`, 'INVALID_WORKFLOW_CONDITION', 'conditionLogic must be AND or OR', true);
    }
    if (rawTrig.conditions !== undefined) {
      validateConditionsList(
        rawTrig.conditions,
        `${tPath}.conditions`,
        availableFieldIds,
        availableFieldKeys,
        strictRefs,
        reportIssue,
      );
    }
  });

  // Steps
  const steps = Array.isArray(wf.steps) ? wf.steps : [];
  const stepById = new Map<string, WorkflowStepDefinition>();
  const stepIds = new Set<string>();
  const stepKeys = new Set<string>();
  const startSteps: WorkflowStepDefinition[] = [];
  const endSteps: WorkflowStepDefinition[] = [];

  const nonCalculatedFieldKeys = new Set<string>();
  const nonCalculatedFieldIds = new Set<string>();
  for (const f of fields) {
    if (f.type !== 'calculated') {
      nonCalculatedFieldKeys.add(f.key);
      nonCalculatedFieldIds.add(f.id);
    }
  }

  steps.forEach((rawStep, idx) => {
    const sPath = `workflow.steps[${idx}]`;
    if (!isRecord(rawStep)) {
      reportIssue(sPath, 'INVALID_WORKFLOW_STEP', 'Step must be an object', true);
      return;
    }

    const s = rawStep as Partial<WorkflowStepDefinition>;
    if (!isNonEmptyText(s.id)) {
      reportIssue(`${sPath}.id`, 'MISSING_WORKFLOW_STEP_ID', 'Step missing id', true);
    } else if (stepIds.has(s.id)) {
      reportIssue(`${sPath}.id`, 'DUPLICATE_WORKFLOW_STEP_ID', `Duplicate step ID "${s.id}"`, true);
    } else {
      stepIds.add(s.id);
    }

    if (!isNonEmptyText(s.key)) {
      reportIssue(`${sPath}.key`, 'MISSING_WORKFLOW_STEP_KEY', 'Step missing key', true);
    } else if (stepKeys.has(s.key)) {
      reportIssue(`${sPath}.key`, 'DUPLICATE_WORKFLOW_STEP_KEY', `Duplicate step key "${s.key}"`, true);
    } else {
      stepKeys.add(s.key);
    }

    if (!isNonEmptyText(s.name)) {
      reportIssue(`${sPath}.name`, 'MISSING_WORKFLOW_STEP_NAME', 'Step name is required', strictRefs);
    }

    if (!s.type || !VALID_STEP_TYPE_SET.has(s.type)) {
      reportIssue(
        `${sPath}.type`,
        'INVALID_WORKFLOW_STEP',
        `Unsupported workflow step type "${String(s.type)}"`,
        true,
      );
      return;
    }

    if (s.id) {
      stepById.set(s.id, s as WorkflowStepDefinition);
    }

    if (s.type === 'start') {
      startSteps.push(s as WorkflowStepDefinition);
    } else if (s.type === 'end') {
      endSteps.push(s as EndStepDefinition);
      const end = s as Partial<EndStepDefinition>;
      if (!end.outcome || !VALID_OUTCOME_SET.has(end.outcome)) {
        reportIssue(
          `${sPath}.outcome`,
          'INVALID_WORKFLOW_OUTCOME',
          `End step "${s.name || s.id}" requires a valid outcome`,
          strictRefs,
        );
      }
    } else if (s.type === 'approval') {
      const appr = s as Partial<ApprovalStepDefinition>;
      if (!appr.mode || !['single', 'sequential', 'parallel'].includes(appr.mode)) {
        reportIssue(`${sPath}.mode`, 'INVALID_WORKFLOW_STEP', 'Approval mode must be single, sequential, or parallel', true);
      }
      if (!Array.isArray(appr.assignees) || appr.assignees.length === 0) {
        reportIssue(
          `${sPath}.assignees`,
          'MISSING_WORKFLOW_ASSIGNEE',
          `Approval step "${s.name || s.id}" requires at least one approver`,
          strictRefs,
        );
      } else {
        if (appr.mode === 'single' && appr.assignees.length > 1) {
          warnings.push({
            path: `${sPath}.assignees`,
            code: 'SINGLE_APPROVAL_MULTIPLE_ASSIGNEES',
            message: `Approval step "${s.name || s.id}" is set to Single mode; only the first assignee applies unless changed to Sequential or Parallel.`,
          });
        }
        appr.assignees.forEach((a, aIdx) => {
          validateAssigneeEntry(a, `${sPath}.assignees[${aIdx}]`, strictRefs, reportIssue, context);
        });
      }
    } else if (s.type === 'assignment') {
      const assign = s as Partial<AssignmentStepDefinition>;
      validateAssigneeEntry(assign.assignee, `${sPath}.assignee`, strictRefs, reportIssue, context);
      if (
        assign.dueInHours !== undefined &&
        (typeof assign.dueInHours !== 'number' || !Number.isFinite(assign.dueInHours) || assign.dueInHours <= 0)
      ) {
        reportIssue(`${sPath}.dueInHours`, 'INVALID_WORKFLOW_STEP', 'Due hours must be a positive number', true);
      }
    } else if (s.type === 'condition') {
      const condStep = s as Partial<ConditionStepDefinition>;
      const branches = Array.isArray(condStep.branches) ? condStep.branches : [];
      if (!branches.length) {
        reportIssue(
          `${sPath}.branches`,
          'INVALID_WORKFLOW_BRANCH',
          `Condition step "${s.name || s.id}" requires at least one conditional branch`,
          strictRefs,
        );
      }
      const branchIds = new Set<string>();
      branches.forEach((branch, bIdx) => {
        const bPath = `${sPath}.branches[${bIdx}]`;
        if (!isRecord(branch)) {
          reportIssue(bPath, 'INVALID_WORKFLOW_BRANCH', 'Branch must be an object', true);
          return;
        }
        if (!isNonEmptyText(branch.id) || branchIds.has(branch.id)) {
          reportIssue(`${bPath}.id`, 'INVALID_WORKFLOW_BRANCH', 'Branch requires a unique ID', true);
        } else {
          branchIds.add(branch.id);
        }
        if (!isNonEmptyText(branch.label)) {
          reportIssue(`${bPath}.label`, 'INVALID_WORKFLOW_BRANCH', 'Branch label is required', strictRefs);
        }
        if (!['AND', 'OR'].includes(String(branch.conditionLogic || 'AND'))) {
          reportIssue(`${bPath}.conditionLogic`, 'INVALID_WORKFLOW_CONDITION', 'conditionLogic must be AND or OR', true);
        }
        if (!Array.isArray(branch.conditions) || branch.conditions.length === 0) {
          reportIssue(
            `${bPath}.conditions`,
            'INVALID_WORKFLOW_BRANCH',
            `Branch "${branch.label || bIdx + 1}" requires at least one condition`,
            strictRefs,
          );
        } else {
          validateConditionsList(
            branch.conditions,
            `${bPath}.conditions`,
            availableFieldIds,
            availableFieldKeys,
            strictRefs,
            reportIssue,
          );
        }
        if (!isNonEmptyText(branch.targetStepId)) {
          reportIssue(
            `${bPath}.targetStepId`,
            'INVALID_WORKFLOW_TRANSITION',
            `Branch "${branch.label || bIdx + 1}" must select a target step`,
            strictRefs,
          );
        }
      });
      if (!isNonEmptyText(condStep.defaultTargetStepId)) {
        reportIssue(
          `${sPath}.defaultTargetStepId`,
          'WORKFLOW_MISSING_FALLBACK',
          `Condition step "${s.name || s.id}" requires a default/else fallback target step`,
          strictRefs,
        );
      }
    } else if (s.type === 'notification') {
      const notif = s as Partial<NotificationStepDefinition>;
      if (!notif.event || !VALID_NOTIFICATION_EVENT_SET.has(notif.event)) {
        reportIssue(
          `${sPath}.event`,
          'INVALID_WORKFLOW_NOTIFICATION',
          `Unsupported notification event "${String(notif.event)}"`,
          true,
        );
      }
      if (!Array.isArray(notif.recipients) || notif.recipients.length === 0) {
        reportIssue(
          `${sPath}.recipients`,
          'INVALID_WORKFLOW_NOTIFICATION',
          `Notification step "${s.name || s.id}" requires at least one recipient`,
          strictRefs,
        );
      } else {
        notif.recipients.forEach((rec, rIdx) => {
          validateAssigneeEntry(rec, `${sPath}.recipients[${rIdx}]`, strictRefs, reportIssue, context, {
            allowRequester: true,
          });
        });
      }
      if (!isNonEmptyText(notif.subjectTemplate)) {
        reportIssue(
          `${sPath}.subjectTemplate`,
          'INVALID_WORKFLOW_NOTIFICATION',
          `Notification step "${s.name || s.id}" requires a subject template`,
          strictRefs,
        );
      } else if (hasUnsafeTemplatePattern(notif.subjectTemplate)) {
        reportIssue(
          `${sPath}.subjectTemplate`,
          'UNSAFE_WORKFLOW_TEMPLATE',
          'Notification subject contains disallowed script or expression syntax',
          true,
        );
      }
      if (!isNonEmptyText(notif.bodyTemplate)) {
        reportIssue(
          `${sPath}.bodyTemplate`,
          'INVALID_WORKFLOW_NOTIFICATION',
          `Notification step "${s.name || s.id}" requires a message body template`,
          strictRefs,
        );
      } else if (hasUnsafeTemplatePattern(notif.bodyTemplate)) {
        reportIssue(
          `${sPath}.bodyTemplate`,
          'UNSAFE_WORKFLOW_TEMPLATE',
          'Notification body contains disallowed script or expression syntax',
          true,
        );
      }
    } else if (s.type === 'update_record') {
      const upd = s as Partial<UpdateRecordStepDefinition>;
      if (!Array.isArray(upd.updates) || upd.updates.length === 0) {
        reportIssue(
          `${sPath}.updates`,
          'INVALID_WORKFLOW_UPDATE',
          `Update Record step "${s.name || s.id}" requires at least one field update`,
          strictRefs,
        );
      } else {
        upd.updates.forEach((u, uIdx) => {
          const uPath = `${sPath}.updates[${uIdx}]`;
          if (!isRecord(u) || !isNonEmptyText(u.targetRef)) {
            reportIssue(
              `${uPath}.targetRef`,
              'INVALID_WORKFLOW_UPDATE',
              'Update target field is required',
              strictRefs,
            );
          } else if (
            strictRefs &&
            !nonCalculatedFieldKeys.has(u.targetRef) &&
            !nonCalculatedFieldIds.has(u.targetRef) &&
            !WRITABLE_SYSTEM_REFS.has(u.targetRef)
          ) {
            reportIssue(
              `${uPath}.targetRef`,
              'BROKEN_WORKFLOW_FIELD_REF',
              `Update target "${u.targetRef}" is not a writable form field or system.status`,
              true,
            );
          }
        });
      }
    }
  });

  // Start / End cardinality checks
  if (startSteps.length === 0) {
    reportIssue('workflow.steps', 'WORKFLOW_MISSING_START', 'Workflow requires exactly one Start step', strictRefs);
  } else if (startSteps.length > 1) {
    reportIssue('workflow.steps', 'WORKFLOW_MULTIPLE_START', 'Workflow cannot have more than one Start step', true);
  }
  if (endSteps.length === 0) {
    reportIssue('workflow.steps', 'WORKFLOW_MISSING_END', 'Workflow requires at least one End step', strictRefs);
  }

  // Condition step target references validation (using stepById)
  steps.forEach((rawStep, idx) => {
    if (!isRecord(rawStep) || rawStep.type !== 'condition') return;
    const cond = rawStep as Partial<ConditionStepDefinition>;
    (cond.branches || []).forEach((b, bIdx) => {
      if (b?.targetStepId && !stepById.has(b.targetStepId)) {
        errors.push({
          path: `workflow.steps[${idx}].branches[${bIdx}].targetStepId`,
          code: 'INVALID_WORKFLOW_TRANSITION',
          message: `Branch target step "${b.targetStepId}" does not exist`,
        });
      }
    });
    if (cond.defaultTargetStepId && !stepById.has(cond.defaultTargetStepId)) {
      errors.push({
        path: `workflow.steps[${idx}].defaultTargetStepId`,
        code: 'INVALID_WORKFLOW_TRANSITION',
        message: `Fallback target step "${cond.defaultTargetStepId}" does not exist`,
      });
    }
  });

  // Transitions & graph adjacency
  const transitions = Array.isArray(wf.transitions) ? wf.transitions : [];
  const transitionIds = new Set<string>();
  const adj = new Map<string, string[]>();
  const outgoingTransitionsByStep = new Map<string, Array<{ toStepId: string; outcome?: string }>>();

  for (const stepId of stepById.keys()) {
    adj.set(stepId, []);
    outgoingTransitionsByStep.set(stepId, []);
  }

  transitions.forEach((rawTr, idx) => {
    const trPath = `workflow.transitions[${idx}]`;
    if (!isRecord(rawTr)) {
      errors.push({ path: trPath, code: 'INVALID_WORKFLOW_TRANSITION', message: 'Transition must be an object' });
      return;
    }

    if (!isNonEmptyText(rawTr.id)) {
      errors.push({ path: `${trPath}.id`, code: 'INVALID_WORKFLOW_TRANSITION', message: 'Transition missing id' });
    } else if (transitionIds.has(rawTr.id)) {
      errors.push({
        path: `${trPath}.id`,
        code: 'DUPLICATE_WORKFLOW_TRANSITION_ID',
        message: `Duplicate transition ID "${rawTr.id}"`,
      });
    } else {
      transitionIds.add(rawTr.id);
    }

    const fromId = typeof rawTr.fromStepId === 'string' ? rawTr.fromStepId : '';
    const toId = typeof rawTr.toStepId === 'string' ? rawTr.toStepId : '';

    if (!fromId || !stepById.has(fromId)) {
      errors.push({
        path: `${trPath}.fromStepId`,
        code: 'INVALID_WORKFLOW_TRANSITION',
        message: `Transition source step "${fromId}" does not exist`,
      });
      return;
    }
    if (!toId || !stepById.has(toId)) {
      errors.push({
        path: `${trPath}.toStepId`,
        code: 'INVALID_WORKFLOW_TRANSITION',
        message: `Transition target step "${toId}" does not exist`,
      });
      return;
    }
    if (fromId === toId) {
      errors.push({
        path: trPath,
        code: 'WORKFLOW_CYCLE_DETECTED',
        message: 'Self-referencing step transition is not allowed',
      });
      return;
    }

    const fromStep = stepById.get(fromId);
    if (fromStep?.type === 'end') {
      errors.push({
        path: trPath,
        code: 'INVALID_WORKFLOW_TRANSITION',
        message: `End step "${fromStep.name}" cannot have outgoing transitions`,
      });
      return;
    }

    adj.get(fromId)!.push(toId);
    outgoingTransitionsByStep.get(fromId)!.push({
      toStepId: toId,
      outcome: typeof rawTr.outcome === 'string' ? rawTr.outcome : undefined,
    });
  });

  // Condition branch targets also count as graph edges even before transition sync
  for (const step of stepById.values()) {
    if (step.type === 'condition') {
      const targets = new Set<string>(adj.get(step.id) ?? []);
      for (const b of step.branches || []) {
        if (b.targetStepId && stepById.has(b.targetStepId)) {
          targets.add(b.targetStepId);
        }
      }
      if (step.defaultTargetStepId && stepById.has(step.defaultTargetStepId)) {
        targets.add(step.defaultTargetStepId);
      }
      adj.set(step.id, Array.from(targets));
    }
  }

  // Outgoing transition completeness per step type
  for (const step of stepById.values()) {
    if (step.type === 'end' || step.type === 'condition') continue;
    const outgoing = outgoingTransitionsByStep.get(step.id) ?? [];
    if (outgoing.length === 0) {
      reportIssue(
        `workflow.steps`,
        'WORKFLOW_DANGLING_STEP',
        `Step "${step.name || step.id}" has no outgoing transition to a next or End step`,
        strictRefs,
      );
    } else if (step.type === 'approval') {
      const hasApprovedPath = outgoing.some((t) => !t.outcome || t.outcome === 'approved' || t.outcome === 'default');
      if (!hasApprovedPath) {
        reportIssue(
          `workflow.steps`,
          'WORKFLOW_DANGLING_STEP',
          `Approval step "${step.name || step.id}" requires an "Approved" outgoing path`,
          strictRefs,
        );
      }
    }
  }

  // Reachability from Start (BFS)
  if (startSteps.length === 1 && startSteps[0].id && stepById.has(startSteps[0].id)) {
    const startId = startSteps[0].id;
    const reachable = new Set<string>([startId]);
    const queue: string[] = [startId];

    while (queue.length > 0) {
      const current = queue.shift()!;
      for (const next of adj.get(current) ?? []) {
        if (!reachable.has(next)) {
          reachable.add(next);
          queue.push(next);
        }
      }
    }

    for (const step of stepById.values()) {
      if (!reachable.has(step.id)) {
        reportIssue(
          `workflow.steps`,
          'WORKFLOW_UNREACHABLE_STEP',
          `Step "${step.name || step.id}" is unreachable from the Start step`,
          strictRefs,
        );
      }
    }

    // Reverse BFS from End steps to detect dead-ends that cannot reach any terminal End
    const revAdj = new Map<string, string[]>();
    for (const id of stepById.keys()) revAdj.set(id, []);
    for (const [fromId, tos] of adj.entries()) {
      for (const toId of tos) {
        revAdj.get(toId)?.push(fromId);
      }
    }

    const canReachEnd = new Set<string>(endSteps.map((e) => e.id).filter(Boolean));
    const endQueue = Array.from(canReachEnd);
    while (endQueue.length > 0) {
      const curr = endQueue.shift()!;
      for (const prev of revAdj.get(curr) ?? []) {
        if (!canReachEnd.has(prev)) {
          canReachEnd.add(prev);
          endQueue.push(prev);
        }
      }
    }

    for (const stepId of reachable) {
      if (!canReachEnd.has(stepId) && endSteps.length > 0) {
        const step = stepById.get(stepId);
        reportIssue(
          `workflow.steps`,
          'WORKFLOW_NO_PATH_TO_END',
          `Step "${step?.name || stepId}" does not lead to any End step`,
          strictRefs,
        );
      }
    }
  }

  // Cycle detection (DFS 3-color: 0 unvisited, 1 visiting, 2 visited)
  const color = new Map<string, number>();
  let cycleReported = false;
  function dfsCycle(nodeId: string) {
    if (cycleReported) return;
    color.set(nodeId, 1);
    for (const nextId of adj.get(nodeId) ?? []) {
      const nextColor = color.get(nextId) ?? 0;
      if (nextColor === 1) {
        cycleReported = true;
        reportIssue(
          'workflow.transitions',
          'WORKFLOW_CYCLE_DETECTED',
          `Circular workflow path detected involving step "${stepById.get(nextId)?.name || nextId}"`,
          true,
        );
        return;
      }
      if (nextColor === 0) {
        dfsCycle(nextId);
      }
    }
    color.set(nodeId, 2);
  }

  for (const stepId of stepById.keys()) {
    if ((color.get(stepId) ?? 0) === 0) {
      dfsCycle(stepId);
    }
  }

  return { errors, warnings };
}
