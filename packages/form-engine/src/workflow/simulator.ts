import { FieldDefinition } from '../schema/fields';
import {
  WorkflowDefinition,
  WorkflowNotificationEvent,
  WorkflowOutcome,
  WorkflowStepDefinition,
  WorkflowStepType,
  normalizeWorkflowDefinition,
} from '../schema/workflow';
import { evaluateConditionGroup } from '../rules/rule-evaluator';

export type SimulatedApprovalDecision = 'approved' | 'rejected' | 'returned';

export interface WorkflowSimulationStepTrace {
  stepId: string;
  stepKey: string;
  stepName: string;
  stepType: WorkflowStepType;
  status: 'visited' | 'simulated_decision' | 'halted';
  note?: string;
}

export interface WorkflowSimulationBranchDecision {
  stepId: string;
  stepName: string;
  selectedBranchLabel: string;
  targetStepId: string;
  matched: boolean;
}

export interface WorkflowSimulationNotificationPreview {
  stepId: string;
  event: WorkflowNotificationEvent;
  subject: string;
  body: string;
}

export interface WorkflowSimulationRecordUpdatePreview {
  stepId: string;
  targetRef: string;
  value: unknown;
}

export interface WorkflowSimulationResult {
  synthetic: true;
  completed: boolean;
  triggered: boolean;
  terminalOutcome?: WorkflowOutcome;
  terminalStepId?: string;
  visitedStepIds: string[];
  trace: WorkflowSimulationStepTrace[];
  branchDecisions: WorkflowSimulationBranchDecision[];
  notificationsPreview: WorkflowSimulationNotificationPreview[];
  recordUpdatesPreview: WorkflowSimulationRecordUpdatePreview[];
  errors: string[];
}

/**
 * Pure safe token interpolation (`{{fieldKey}}`) without expression evaluation.
 */
function interpolateTemplate(
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

/**
 * Pure deterministic Workflow Simulator.
 * Evaluates triggers, condition branches, and transitions using synthetic form values.
 * Never persists data, triggers live approvals, sends emails, or mutates records.
 */
export function simulateWorkflow(
  workflow: WorkflowDefinition | null | undefined,
  syntheticValues: Record<string, unknown> = {},
  fields: readonly FieldDefinition[] = [],
  simulatedApprovalDecisions: Record<string, SimulatedApprovalDecision> = {},
): WorkflowSimulationResult {
  const result: WorkflowSimulationResult = {
    synthetic: true,
    completed: false,
    triggered: false,
    visitedStepIds: [],
    trace: [],
    branchDecisions: [],
    notificationsPreview: [],
    recordUpdatesPreview: [],
    errors: [],
  };

  const normalized = normalizeWorkflowDefinition(workflow);
  if (!normalized) {
    result.errors.push('No workflow is configured for this form.');
    return result;
  }

  if (!normalized.enabled) {
    result.errors.push('Workflow is currently disabled.');
    return result;
  }

  // Evaluate triggers (match any enabled trigger whose entry conditions evaluate true)
  const activeTriggers = (normalized.triggers || []).filter((t) => t.enabled !== false);
  if (activeTriggers.length === 0) {
    result.errors.push('Workflow has no enabled triggers.');
    return result;
  }

  const triggerMatched = activeTriggers.some((trig) =>
    evaluateConditionGroup(
      trig.conditions,
      trig.conditionLogic || 'AND',
      syntheticValues,
      fields,
      'match',
    ),
  );

  if (!triggerMatched) {
    result.trace.push({
      stepId: 'trigger',
      stepKey: 'trigger',
      stepName: 'Trigger Gate',
      stepType: 'start',
      status: 'halted',
      note: 'Synthetic values did not match trigger entry conditions.',
    });
    return result;
  }

  result.triggered = true;

  const stepById = new Map<string, WorkflowStepDefinition>();
  for (const step of normalized.steps) {
    stepById.set(step.id, step);
  }

  const startStep = normalized.steps.find((s) => s.type === 'start');
  if (!startStep) {
    result.errors.push('Cannot simulate: workflow is missing a Start step.');
    return result;
  }

  const visitedSet = new Set<string>();
  const workingValues: Record<string, unknown> = { ...syntheticValues };
  let currentStep: WorkflowStepDefinition | undefined = startStep;
  const maxHops = Math.max(normalized.steps.length * 2, 20);
  let hops = 0;

  while (currentStep && hops < maxHops) {
    hops += 1;

    if (visitedSet.has(currentStep.id)) {
      result.trace.push({
        stepId: currentStep.id,
        stepKey: currentStep.key,
        stepName: currentStep.name,
        stepType: currentStep.type,
        status: 'halted',
        note: 'Simulation halted to prevent a circular loop.',
      });
      result.errors.push(`Circular path detected at step "${currentStep.name}".`);
      return result;
    }

    visitedSet.add(currentStep.id);
    result.visitedStepIds.push(currentStep.id);

    if (currentStep.type === 'end') {
      result.completed = true;
      result.terminalOutcome = currentStep.outcome;
      result.terminalStepId = currentStep.id;
      result.trace.push({
        stepId: currentStep.id,
        stepKey: currentStep.key,
        stepName: currentStep.name,
        stepType: 'end',
        status: 'visited',
        note: `Completed with outcome: ${currentStep.outcome}`,
      });
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
        result.branchDecisions.push({
          stepId: currentStep.id,
          stepName: currentStep.name,
          selectedBranchLabel: matchedBranch.label,
          targetStepId: matchedBranch.targetStepId,
          matched: true,
        });
        result.trace.push({
          stepId: currentStep.id,
          stepKey: currentStep.key,
          stepName: currentStep.name,
          stepType: 'condition',
          status: 'visited',
          note: `Matched branch "${matchedBranch.label}"`,
        });
      } else if (currentStep.defaultTargetStepId) {
        nextStepId = currentStep.defaultTargetStepId;
        result.branchDecisions.push({
          stepId: currentStep.id,
          stepName: currentStep.name,
          selectedBranchLabel: 'Default / Else',
          targetStepId: currentStep.defaultTargetStepId,
          matched: false,
        });
        result.trace.push({
          stepId: currentStep.id,
          stepKey: currentStep.key,
          stepName: currentStep.name,
          stepType: 'condition',
          status: 'visited',
          note: 'No condition matched; followed Default / Else path',
        });
      } else {
        result.trace.push({
          stepId: currentStep.id,
          stepKey: currentStep.key,
          stepName: currentStep.name,
          stepType: 'condition',
          status: 'halted',
          note: 'No branch matched and no fallback target is configured.',
        });
        result.errors.push(`Condition step "${currentStep.name}" has no fallback path.`);
        return result;
      }
    } else if (currentStep.type === 'approval') {
      const chosenDecision: SimulatedApprovalDecision =
        simulatedApprovalDecisions[currentStep.id] ?? 'approved';

      const outgoing = normalized.transitions.filter((t) => t.fromStepId === currentStep!.id);
      const matchingTr =
        outgoing.find((t) => t.outcome === chosenDecision) ||
        (chosenDecision === 'approved'
          ? outgoing.find((t) => !t.outcome || t.outcome === 'default')
          : undefined);

      nextStepId = matchingTr?.toStepId;
      result.trace.push({
        stepId: currentStep.id,
        stepKey: currentStep.key,
        stepName: currentStep.name,
        stepType: 'approval',
        status: 'simulated_decision',
        note: `Simulated ${chosenDecision} (${currentStep.mode})`,
      });
    } else {
      if (currentStep.type === 'notification') {
        const subject = interpolateTemplate(currentStep.subjectTemplate || '', workingValues, fields);
        const body = interpolateTemplate(currentStep.bodyTemplate || '', workingValues, fields);
        result.notificationsPreview.push({
          stepId: currentStep.id,
          event: currentStep.event,
          subject,
          body,
        });
        result.trace.push({
          stepId: currentStep.id,
          stepKey: currentStep.key,
          stepName: currentStep.name,
          stepType: 'notification',
          status: 'visited',
          note: `Synthetic notification queued (${currentStep.event}): "${subject}"`,
        });
      } else if (currentStep.type === 'update_record') {
        for (const upd of currentStep.updates || []) {
          workingValues[upd.targetRef] = upd.value;
          result.recordUpdatesPreview.push({
            stepId: currentStep.id,
            targetRef: upd.targetRef,
            value: upd.value,
          });
        }
        result.trace.push({
          stepId: currentStep.id,
          stepKey: currentStep.key,
          stepName: currentStep.name,
          stepType: 'update_record',
          status: 'visited',
          note: `Simulated ${currentStep.updates?.length ?? 0} field update(s) in memory`,
        });
      } else {
        result.trace.push({
          stepId: currentStep.id,
          stepKey: currentStep.key,
          stepName: currentStep.name,
          stepType: currentStep.type,
          status: 'visited',
        });
      }

      const outgoing = normalized.transitions.find(
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

  result.errors.push('Workflow simulation exceeded safe step limit.');
  return result;
}
