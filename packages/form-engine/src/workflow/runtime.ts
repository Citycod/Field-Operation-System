import { FieldDefinition } from '../schema/fields';
import { evaluateConditionGroup } from '../rules/rule-evaluator';
import {
  ApprovalStepDefinition,
  EndStepDefinition,
  FlowWorkflowDefinition,
  WorkflowAssignee,
  WorkflowDefinition,
  WorkflowNotificationEvent,
  WorkflowStepDefinition,
  normalizeWorkflowDefinition,
} from '../schema/workflow';

export type RuntimeApprovalDecision = 'approved' | 'rejected' | 'returned';

export interface WorkflowRuntimeRecordUpdate {
  stepId: string;
  targetRef: string;
  resolvedFieldKey: string | null;
  value: string | number | boolean | null;
}

export interface WorkflowRuntimeNotification {
  stepId: string;
  event: WorkflowNotificationEvent;
  recipients: WorkflowAssignee[];
  subject: string;
  body: string;
}

export interface WorkflowRuntimeTraversalResult {
  triggered: boolean;
  pausedAtApprovalStep: ApprovalStepDefinition | null;
  completedEndStep: EndStepDefinition | null;
  resolvedSubmissionStatus: string | null;
  fieldUpdates: Record<string, string | number | boolean | null>;
  recordUpdates: WorkflowRuntimeRecordUpdate[];
  notifications: WorkflowRuntimeNotification[];
  visitedStepIds: string[];
  errors: string[];
}

/**
 * Pure safe token interpolation (`{{fieldKey}}` or `{{system.reference_number}}`)
 * without arbitrary expression evaluation.
 */
export function interpolateWorkflowTemplate(
  template: string,
  values: Record<string, unknown>,
  fields: readonly FieldDefinition[],
): string {
  const keyToVal = new Map<string, unknown>();
  for (const [k, v] of Object.entries(values)) {
    keyToVal.set(k, v);
  }
  for (const f of fields) {
    if (Object.prototype.hasOwnProperty.call(values, f.id) && !keyToVal.has(f.key)) {
      keyToVal.set(f.key, values[f.id]);
    }
  }

  return template.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_match, token: string) => {
    const val = keyToVal.get(token);
    if (val === undefined || val === null) return `[${token}]`;
    return String(val);
  });
}

function resolveFieldKey(targetRef: string, fields: readonly FieldDefinition[]): string | null {
  if (targetRef === 'system.status') return null;
  const byId = fields.find((f) => f.id === targetRef);
  if (byId) return byId.key;
  const byKey = fields.find((f) => f.key === targetRef);
  if (byKey) return byKey.key;
  return targetRef;
}

function traverseFromStep(
  normalized: FlowWorkflowDefinition,
  initialStepId: string,
  values: Record<string, unknown>,
  fields: readonly FieldDefinition[],
): WorkflowRuntimeTraversalResult {
  const result: WorkflowRuntimeTraversalResult = {
    triggered: true,
    pausedAtApprovalStep: null,
    completedEndStep: null,
    resolvedSubmissionStatus: null,
    fieldUpdates: {},
    recordUpdates: [],
    notifications: [],
    visitedStepIds: [],
    errors: [],
  };

  const stepById = new Map<string, WorkflowStepDefinition>();
  for (const step of normalized.steps) {
    stepById.set(step.id, step);
  }

  const visitedSet = new Set<string>();
  const workingValues: Record<string, unknown> = { ...values };
  let explicitSystemStatus: string | null = null;
  let currentStep: WorkflowStepDefinition | undefined = stepById.get(initialStepId);
  const maxHops = Math.max(normalized.steps.length * 2, 20);
  let hops = 0;

  while (currentStep && hops < maxHops) {
    hops += 1;

    if (visitedSet.has(currentStep.id)) {
      result.errors.push(`Circular workflow path detected at step "${currentStep.name}".`);
      return result;
    }

    visitedSet.add(currentStep.id);
    result.visitedStepIds.push(currentStep.id);

    if (currentStep.type === 'approval') {
      result.pausedAtApprovalStep = currentStep;
      result.resolvedSubmissionStatus = explicitSystemStatus ?? 'pending_approval';
      return result;
    }

    if (currentStep.type === 'end') {
      result.completedEndStep = currentStep;
      const defaultEndStatus =
        currentStep.outcome === 'rejected'
          ? 'rejected'
          : currentStep.outcome === 'approved'
            ? 'approved'
            : currentStep.outcome === 'cancelled'
              ? 'archived'
              : 'completed';
      result.resolvedSubmissionStatus =
        currentStep.finalStatus || explicitSystemStatus || defaultEndStatus;
      return result;
    }

    let nextStepId: string | undefined;

    if (currentStep.type === 'condition') {
      let matchedBranch: (typeof currentStep.branches)[number] | undefined;
      for (const branch of currentStep.branches) {
        const matched = evaluateConditionGroup(
          branch.conditions,
          branch.conditionLogic || 'AND',
          workingValues,
          fields,
          'no_match',
        );
        if (matched) {
          matchedBranch = branch;
          break;
        }
      }

      if (matchedBranch) {
        nextStepId = matchedBranch.targetStepId;
      } else if (currentStep.defaultTargetStepId) {
        nextStepId = currentStep.defaultTargetStepId;
      } else {
        result.errors.push(`Condition step "${currentStep.name}" has no fallback path.`);
        return result;
      }
    } else {
      if (currentStep.type === 'notification') {
        result.notifications.push({
          stepId: currentStep.id,
          event: currentStep.event,
          recipients: currentStep.recipients || [],
          subject: interpolateWorkflowTemplate(
            currentStep.subjectTemplate || '',
            workingValues,
            fields,
          ),
          body: interpolateWorkflowTemplate(
            currentStep.bodyTemplate || '',
            workingValues,
            fields,
          ),
        });
      } else if (currentStep.type === 'update_record') {
        for (const upd of currentStep.updates || []) {
          const fieldKey = resolveFieldKey(upd.targetRef, fields);
          if (upd.targetRef === 'system.status') {
            explicitSystemStatus = upd.value === null ? null : String(upd.value);
            workingValues['system.status'] = upd.value;
          } else if (fieldKey) {
            result.fieldUpdates[fieldKey] = upd.value;
            workingValues[fieldKey] = upd.value;
          }
          result.recordUpdates.push({
            stepId: currentStep.id,
            targetRef: upd.targetRef,
            resolvedFieldKey: fieldKey,
            value: upd.value,
          });
        }
      }

      const outgoing =
        normalized.transitions.find(
          (t) => t.fromStepId === currentStep!.id && (!t.outcome || t.outcome === 'default'),
        ) ?? normalized.transitions.find((t) => t.fromStepId === currentStep!.id);

      nextStepId = outgoing?.toStepId;
    }

    if (!nextStepId) {
      result.errors.push(`Step "${currentStep.name}" has no matching outgoing transition.`);
      return result;
    }

    const resolvedNext = stepById.get(nextStepId);
    if (!resolvedNext) {
      result.errors.push(`Target step "${nextStepId}" could not be found.`);
      return result;
    }

    currentStep = resolvedNext;
  }

  result.errors.push('Workflow runtime traversal exceeded safe step limit.');
  return result;
}

/**
 * Evaluates whether a workflow should trigger on submission and traverses
 * automatic steps (Start, Condition, Notification, Update Record) until it
 * reaches the first Approval step or an End step.
 */
export function evaluateWorkflowStart(
  workflow: WorkflowDefinition | null | undefined,
  submissionValues: Record<string, unknown> = {},
  fields: readonly FieldDefinition[] = [],
  systemContext: Record<string, unknown> = {},
): WorkflowRuntimeTraversalResult {
  const emptyResult: WorkflowRuntimeTraversalResult = {
    triggered: false,
    pausedAtApprovalStep: null,
    completedEndStep: null,
    resolvedSubmissionStatus: null,
    fieldUpdates: {},
    recordUpdates: [],
    notifications: [],
    visitedStepIds: [],
    errors: [],
  };

  const normalized = normalizeWorkflowDefinition(workflow);
  if (!normalized || !normalized.enabled) {
    return emptyResult;
  }

  const activeOnSubmitTriggers = (normalized.triggers || []).filter(
    (t) => t.enabled !== false && t.type === 'on_submit',
  );
  if (activeOnSubmitTriggers.length === 0) {
    return emptyResult;
  }

  const evaluationValues: Record<string, unknown> = {
    ...systemContext,
    ...submissionValues,
  };

  const triggerMatched = activeOnSubmitTriggers.some((trig) =>
    evaluateConditionGroup(
      trig.conditions,
      trig.conditionLogic || 'AND',
      evaluationValues,
      fields,
      'match',
    ),
  );

  if (!triggerMatched) {
    return emptyResult;
  }

  const startStep = normalized.steps.find((s) => s.type === 'start');
  if (!startStep) {
    return {
      ...emptyResult,
      triggered: true,
      errors: ['Workflow is missing a Start step.'],
    };
  }

  return traverseFromStep(normalized, startStep.id, evaluationValues, fields);
}

/**
 * Advances a workflow from an Approval step given a runtime decision
 * ('approved' | 'rejected' | 'returned'), traversing any subsequent Condition,
 * Notification, or Update Record steps until reaching the next Approval step
 * or a terminal End step.
 */
export function advanceWorkflowFromApproval(
  workflow: WorkflowDefinition | null | undefined,
  fromApprovalStepId: string,
  decision: RuntimeApprovalDecision,
  submissionValues: Record<string, unknown> = {},
  fields: readonly FieldDefinition[] = [],
  systemContext: Record<string, unknown> = {},
): WorkflowRuntimeTraversalResult {
  const normalized = normalizeWorkflowDefinition(workflow);
  if (!normalized) {
    return {
      triggered: true,
      pausedAtApprovalStep: null,
      completedEndStep: null,
      resolvedSubmissionStatus:
        decision === 'rejected'
          ? 'rejected'
          : decision === 'returned'
            ? 'returned'
            : 'approved',
      fieldUpdates: {},
      recordUpdates: [],
      notifications: [],
      visitedStepIds: [],
      errors: [],
    };
  }

  const outgoing = normalized.transitions.filter(
    (t) => t.fromStepId === fromApprovalStepId,
  );

  const matchingTransition =
    outgoing.find((t) => t.outcome === decision) ||
    (decision === 'approved'
      ? outgoing.find((t) => !t.outcome || t.outcome === 'default')
      : undefined);

  if (!matchingTransition) {
    if (decision === 'returned') {
      return {
        triggered: true,
        pausedAtApprovalStep: null,
        completedEndStep: null,
        resolvedSubmissionStatus: 'returned',
        fieldUpdates: {},
        recordUpdates: [],
        notifications: [],
        visitedStepIds: [],
        errors: [],
      };
    }

    if (decision === 'rejected') {
      return {
        triggered: true,
        pausedAtApprovalStep: null,
        completedEndStep: null,
        resolvedSubmissionStatus: 'rejected',
        fieldUpdates: {},
        recordUpdates: [],
        notifications: [],
        visitedStepIds: [],
        errors: [],
      };
    }

    return {
      triggered: true,
      pausedAtApprovalStep: null,
      completedEndStep: null,
      resolvedSubmissionStatus: 'approved',
      fieldUpdates: {},
      recordUpdates: [],
      notifications: [],
      visitedStepIds: [],
      errors: [],
    };
  }

  const evaluationValues: Record<string, unknown> = {
    ...systemContext,
    ...submissionValues,
  };

  return traverseFromStep(normalized, matchingTransition.toStepId, evaluationValues, fields);
}
