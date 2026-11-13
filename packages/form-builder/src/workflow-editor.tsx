import React, { useMemo, useState } from "react";
import {
  WORKFLOW_NOTIFICATION_EVENTS,
  WORKFLOW_OUTCOMES,
  VALID_PLATFORM_ROLES,
  createDefaultFlowWorkflow,
  isLegacySequentialWorkflow,
  normalizeWorkflowDefinition,
  validateWorkflowSemantic,
  type ApprovalStepDefinition,
  type AssignmentStepDefinition,
  type ConditionBranchDefinition,
  type ConditionStepDefinition,
  type EndStepDefinition,
  type FieldDefinition,
  type FlowWorkflowDefinition,
  type FormSchemaV1,
  type NotificationStepDefinition,
  type RuleCondition,
  type RuleOperator,
  type UpdateRecordStepDefinition,
  type WorkflowApprovalMode,
  type WorkflowAssignee,
  type WorkflowAssigneeType,
  type WorkflowNotificationEvent,
  type WorkflowOutcome,
  type WorkflowSimulationResult,
  type WorkflowStepDefinition,
  type WorkflowStepType,
  type WorkflowTransitionDefinition,
  type WorkflowTransitionOutcome,
  type WorkflowTriggerType,
} from "@field/form-engine";
import { defaultId, slugify } from "./state";
import type { BuilderMemberOption } from "./types";
import { WorkflowPreview } from "./workflow-preview";

export interface WorkflowEditorProps {
  schema: FormSchemaV1;
  onChange: (nextSchema: FormSchemaV1) => void;
  disabled?: boolean;
  organizationMembers?: readonly BuilderMemberOption[];
}

const TRIGGER_OPTIONS: Array<{
  value: WorkflowTriggerType;
  label: string;
  future?: boolean;
}> = [
  { value: "on_submit", label: "On Form Submission" },
  { value: "on_record_create", label: "On Record Creation (Future Runtime)", future: true },
  { value: "on_record_update", label: "On Record Update (Future Runtime)", future: true },
  { value: "on_field_change", label: "On Field Value Change (Future Runtime)", future: true },
  { value: "manual", label: "Manual Initiation (Future Runtime)", future: true },
];

const ASSIGNEE_OPTIONS: Array<{
  value: WorkflowAssigneeType;
  label: string;
  deferred?: boolean;
}> = [
  { value: "role", label: "Tenant Role" },
  { value: "user", label: "Active Tenant User" },
  { value: "manager_of_requester", label: "Manager of Requester (Deferred Runtime)", deferred: true },
  { value: "group", label: "Configured Group (Deferred Runtime)", deferred: true },
  { value: "department_role", label: "Department Role (Deferred Runtime)", deferred: true },
];

const NOTIFICATION_EVENT_LABELS: Record<WorkflowNotificationEvent, string> = {
  task_assigned: "Task Assigned",
  approval_requested: "Approval Requested",
  approved: "Approved",
  rejected: "Rejected",
  workflow_completed: "Workflow Completed",
};

const STEP_TYPE_LABELS: Record<WorkflowStepType, string> = {
  start: "Start",
  approval: "Approval",
  assignment: "Assignment",
  condition: "Condition / Branch",
  notification: "Notification",
  update_record: "Update Record",
  end: "End",
};

const RULE_OPERATORS: Array<{ value: RuleOperator; label: string }> = [
  { value: "equals", label: "Equals" },
  { value: "notEquals", label: "Does not equal" },
  { value: "greaterThan", label: "Greater than" },
  { value: "lessThan", label: "Less than" },
  { value: "contains", label: "Contains" },
  { value: "isEmpty", label: "Is empty" },
  { value: "isNotEmpty", label: "Is not empty" },
];

function collectEditableFields(schema: FormSchemaV1): FieldDefinition[] {
  const list: FieldDefinition[] = [];
  for (const sec of schema.header?.sections || []) {
    if (sec.fields) list.push(...sec.fields);
  }
  for (const tab of schema.tabs || []) {
    if (tab.type === "form" && tab.sections) {
      for (const sec of tab.sections) {
        if (sec.fields) list.push(...sec.fields);
      }
    }
  }
  return list;
}

export function WorkflowEditor({
  schema,
  onChange,
  disabled = false,
  organizationMembers = [],
}: WorkflowEditorProps) {
  const isLegacy = isLegacySequentialWorkflow(schema.workflow);
  const workflow = useMemo(
    () => normalizeWorkflowDefinition(schema.workflow),
    [schema.workflow],
  );

  const [selectedStepId, setSelectedStepId] = useState<string | null>(
    () => workflow?.steps[1]?.id ?? workflow?.steps[0]?.id ?? null,
  );
  const [insertAfterStepId, setInsertAfterStepId] = useState<string | null>(null);
  const [showSimulator, setShowSimulator] = useState(false);
  const [showTriggerConditions, setShowTriggerConditions] = useState(false);
  const [lastSimulation, setLastSimulation] = useState<WorkflowSimulationResult | null>(null);

  const availableFields = useMemo(() => collectEditableFields(schema), [schema]);
  const writableFields = useMemo(
    () => availableFields.filter((f) => f.type !== "calculated"),
    [availableFields],
  );

  const fieldIds = useMemo(() => new Set(availableFields.map((f) => f.id)), [availableFields]);
  const fieldKeys = useMemo(() => new Set(availableFields.map((f) => f.key)), [availableFields]);

  const activeMemberIds = useMemo(() => {
    const ids = new Set<string>();
    for (const m of organizationMembers) {
      if (m.userId) ids.add(m.userId);
    }
    return ids;
  }, [organizationMembers]);

  // Publish-level diagnostic preview so designers see blocking publish errors + draft warnings live
  const diagnostics = useMemo(() => {
    if (!workflow) return { errors: [], warnings: [] };
    return validateWorkflowSemantic(
      workflow,
      availableFields,
      fieldIds,
      fieldKeys,
      true,
      activeMemberIds.size > 0 ? { activeMemberUserIds: activeMemberIds } : undefined,
    );
  }, [workflow, availableFields, fieldIds, fieldKeys, activeMemberIds]);

  const stepMap = useMemo(() => {
    const map = new Map<string, WorkflowStepDefinition>();
    if (workflow) {
      for (const s of workflow.steps) {
        map.set(s.id, s);
      }
    }
    return map;
  }, [workflow]);

  function commitWorkflow(next: FlowWorkflowDefinition | null) {
    onChange({
      ...schema,
      workflow: next,
    });
  }

  function handleCreateWorkflow() {
    const created = createDefaultFlowWorkflow(schema.form.title);
    commitWorkflow(created);
    setSelectedStepId(created.steps[1]?.id ?? created.steps[0]?.id ?? null);
  }

  function handleUpdateStep(stepId: string, updater: (step: WorkflowStepDefinition) => WorkflowStepDefinition) {
    if (!workflow) return;
    commitWorkflow({
      ...workflow,
      steps: workflow.steps.map((s) => (s.id === stepId ? updater(s) : s)),
    });
  }

  function handleSetTransition(
    fromStepId: string,
    outcome: WorkflowTransitionOutcome,
    toStepId: string,
    label?: string,
  ) {
    if (!workflow) return;
    const filtered = workflow.transitions.filter(
      (t) => !(t.fromStepId === fromStepId && (t.outcome || "default") === outcome),
    );
    if (toStepId) {
      filtered.push({
        id: defaultId("wf_tr"),
        fromStepId,
        toStepId,
        outcome,
        label,
      });
    }
    commitWorkflow({ ...workflow, transitions: filtered });
  }

  function handleAddStep(type: Exclude<WorkflowStepType, "start">, afterStepId?: string) {
    if (!workflow) return;

    const newId = defaultId(`wf_${type}`);
    const count = workflow.steps.length + 1;
    const label = `${STEP_TYPE_LABELS[type]} ${count}`;
    const key = slugify(`${type}_${count}`) || `step_${count}`;

    let newStep: WorkflowStepDefinition;
    if (type === "approval") {
      newStep = {
        id: newId,
        key,
        name: `Approval ${count}`,
        type: "approval",
        mode: "single",
        assignees: [{ type: "role", value: "manager", label: "Manager" }],
        requireCommentOnReject: true,
      };
    } else if (type === "assignment") {
      newStep = {
        id: newId,
        key,
        name: `Task Assignment ${count}`,
        type: "assignment",
        assignee: { type: "role", value: "employee", label: "Employee" },
      };
    } else if (type === "condition") {
      const firstEnd = workflow.steps.find((s) => s.type === "end");
      newStep = {
        id: newId,
        key,
        name: `Condition ${count}`,
        type: "condition",
        branches: [
          {
            id: defaultId("wf_br"),
            label: "Branch A",
            conditionLogic: "AND",
            conditions: [
              {
                id: defaultId("c"),
                fieldId: availableFields[0]?.key || "system.status",
                operator: "equals",
                value: "",
              },
            ],
            targetStepId: firstEnd?.id || "",
          },
        ],
        defaultTargetStepId: firstEnd?.id || "",
      };
    } else if (type === "notification") {
      newStep = {
        id: newId,
        key,
        name: `Notification ${count}`,
        type: "notification",
        event: "approval_requested",
        recipients: [{ type: "requester", label: "Requester" }],
        subjectTemplate: `Update on ${schema.form.title} ({{system.reference_number}})`,
        bodyTemplate: "Your submission {{system.reference_number}} has progressed.",
      };
    } else if (type === "update_record") {
      newStep = {
        id: newId,
        key,
        name: `Update Record ${count}`,
        type: "update_record",
        updates: [
          {
            id: defaultId("wf_upd"),
            targetRef: "system.status",
            value: "approved",
          },
        ],
      };
    } else {
      newStep = {
        id: newId,
        key,
        name: `End (${label})`,
        type: "end",
        outcome: "completed",
        finalStatus: "completed",
      };
    }

    const nextSteps = [...workflow.steps];
    let nextTransitions = [...workflow.transitions];

    if (afterStepId) {
      const idx = nextSteps.findIndex((s) => s.id === afterStepId);
      if (idx >= 0) {
        nextSteps.splice(idx + 1, 0, newStep);
        // Splice into linear transition if applicable and not adding an End node
        const existingOut = nextTransitions.find(
          (t) =>
            t.fromStepId === afterStepId &&
            (!t.outcome || t.outcome === "default" || t.outcome === "approved"),
        );
        if (existingOut) {
          const oldTarget = existingOut.toStepId;
          nextTransitions = nextTransitions.map((t) =>
            t.id === existingOut.id ? { ...t, toStepId: newId } : t,
          );
          if (newStep.type !== "end") {
            nextTransitions.push({
              id: defaultId("wf_tr"),
              fromStepId: newId,
              toStepId: oldTarget,
              outcome: newStep.type === "approval" ? "approved" : "default",
              label: newStep.type === "approval" ? "Approved" : undefined,
            });
          }
        } else if (newStep.type !== "end") {
          const endStep = workflow.steps.find((s) => s.type === "end");
          if (endStep) {
            nextTransitions.push({
              id: defaultId("wf_tr"),
              fromStepId: newId,
              toStepId: endStep.id,
              outcome: newStep.type === "approval" ? "approved" : "default",
            });
          }
        }
      } else {
        nextSteps.push(newStep);
      }
    } else {
      nextSteps.push(newStep);
    }

    commitWorkflow({
      ...workflow,
      steps: nextSteps,
      transitions: nextTransitions,
    });
    setSelectedStepId(newId);
    setInsertAfterStepId(null);
  }

  function handleMoveStep(stepId: string, delta: -1 | 1) {
    if (!workflow) return;
    const idx = workflow.steps.findIndex((s) => s.id === stepId);
    if (idx <= 0) return; // keep Start first
    const targetIdx = idx + delta;
    if (targetIdx <= 0 || targetIdx >= workflow.steps.length) return;

    const nextSteps = [...workflow.steps];
    const [removed] = nextSteps.splice(idx, 1);
    nextSteps.splice(targetIdx, 0, removed);
    commitWorkflow({ ...workflow, steps: nextSteps });
  }

  function handleRemoveStep(stepId: string) {
    if (!workflow) return;
    const target = stepMap.get(stepId);
    if (!target || target.type === "start") return;

    const outgoing = workflow.transitions.find(
      (t) => t.fromStepId === stepId && (!t.outcome || t.outcome === "default" || t.outcome === "approved"),
    );

    const nextSteps = workflow.steps
      .filter((s) => s.id !== stepId)
      .map((s) => {
        if (s.type !== "condition") return s;
        return {
          ...s,
          branches: s.branches.map((b) =>
            b.targetStepId === stepId ? { ...b, targetStepId: outgoing?.toStepId || "" } : b,
          ),
          defaultTargetStepId:
            s.defaultTargetStepId === stepId ? outgoing?.toStepId || "" : s.defaultTargetStepId,
        };
      });

    // Reconnect incoming transitions cleanly to removed step's next step if present, else strip
    const nextTransitions = workflow.transitions
      .filter((t) => t.fromStepId !== stepId)
      .flatMap((t) => {
        if (t.toStepId !== stepId) return [t];
        if (outgoing && outgoing.toStepId !== t.fromStepId) {
          return [{ ...t, toStepId: outgoing.toStepId }];
        }
        return [];
      });

    commitWorkflow({
      ...workflow,
      steps: nextSteps,
      transitions: nextTransitions,
    });

    if (selectedStepId === stepId) {
      setSelectedStepId(nextSteps[0]?.id ?? null);
    }
  }

  if (!workflow) {
    return (
      <div className="fb-wf-empty" data-testid="workflow-empty-state">
        <div className="fb-wf-empty-card">
          <h3>No Approval Workflow Configured</h3>
          <p>
            Configure sequential or conditional approvals, task assignments, notifications, and record outcomes for this form without custom code.
          </p>
          <button
            type="button"
            className="fb-btn-primary"
            disabled={disabled}
            onClick={handleCreateWorkflow}
          >
            + Create Workflow
          </button>
        </div>
      </div>
    );
  }

  const selectedStep = selectedStepId ? stepMap.get(selectedStepId) ?? null : null;
  const primaryTrigger = workflow.triggers[0] || {
    id: "wf_trig_submit",
    type: "on_submit" as WorkflowTriggerType,
    enabled: true,
    conditionLogic: "AND" as const,
    conditions: [] as RuleCondition[],
  };
  const visitedSet = new Set(showSimulator && lastSimulation ? lastSimulation.visitedStepIds : []);

  function stepHasIssue(step: WorkflowStepDefinition): "error" | "warning" | null {
    const nameMatch = step.name || step.id;
    const hasErr = diagnostics.errors.some(
      (e) =>
        e.path.includes(step.id) ||
        e.message.includes(`"${nameMatch}"`) ||
        (step.type === "start" && e.code.includes("START")) ||
        (step.type === "end" && e.code.includes("END")),
    );
    if (hasErr) return "error";
    const hasWarn = diagnostics.warnings.some((w) => w.message.includes(`"${nameMatch}"`));
    return hasWarn ? "warning" : null;
  }

  function formatStepTargets(step: WorkflowStepDefinition): Array<{ label: string; toName: string; tone: string }> {
    if (step.type === "condition") {
      const items = step.branches.map((b) => ({
        label: b.label || "If Match",
        toName: stepMap.get(b.targetStepId)?.name || "Select target",
        tone: "branch",
      }));
      items.push({
        label: "Else",
        toName: step.defaultTargetStepId
          ? stepMap.get(step.defaultTargetStepId)?.name || "Unknown"
          : "Select fallback",
        tone: "default",
      });
      return items;
    }

    return workflow!.transitions
      .filter((t) => t.fromStepId === step.id)
      .map((t) => ({
        label: t.label || t.outcome || "Next",
        toName: stepMap.get(t.toStepId)?.name || "Missing step",
        tone: t.outcome || "default",
      }));
  }

  const selectableTargetSteps = workflow.steps.filter((s) => s.id !== selectedStep?.id);

  function renderAssigneeList(
    assignees: WorkflowAssignee[],
    onUpdate: (next: WorkflowAssignee[]) => void,
    allowRequester = false,
  ) {
    return (
      <div className="fb-wf-sublist">
        {assignees.map((assignee, idx) => (
          <div key={idx} className="fb-wf-assignee-row">
            <select
              aria-label={`Assignee type ${idx + 1}`}
              value={assignee.type}
              disabled={disabled}
              onChange={(e) => {
                const nextType = e.target.value as WorkflowAssigneeType;
                const defaultVal =
                  nextType === "role"
                    ? "manager"
                    : nextType === "user"
                      ? organizationMembers[0]?.userId || ""
                      : undefined;
                const updated = assignees.map((a, i) =>
                  i === idx ? { type: nextType, value: defaultVal } : a,
                );
                onUpdate(updated);
              }}
            >
              {allowRequester && <option value="requester">Form Requester</option>}
              {ASSIGNEE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>

            {assignee.type === "role" && (
              <select
                aria-label={`Assignee role ${idx + 1}`}
                value={assignee.value || ""}
                disabled={disabled}
                onChange={(e) =>
                  onUpdate(
                    assignees.map((a, i) => (i === idx ? { ...a, value: e.target.value } : a)),
                  )
                }
              >
                <option value="">-- Select role --</option>
                {VALID_PLATFORM_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            )}

            {assignee.type === "user" && (
              <select
                aria-label={`Assignee user ${idx + 1}`}
                value={assignee.value || ""}
                disabled={disabled}
                onChange={(e) => {
                  const member = organizationMembers.find((m) => m.userId === e.target.value);
                  onUpdate(
                    assignees.map((a, i) =>
                      i === idx
                        ? { ...a, value: e.target.value, label: member?.displayName }
                        : a,
                    ),
                  );
                }}
              >
                <option value="">
                  {organizationMembers.length
                    ? "-- Select active member --"
                    : "No tenant members loaded"}
                </option>
                {organizationMembers.map((m) => (
                  <option key={m.userId} value={m.userId}>
                    {m.displayName} ({m.roleKey})
                  </option>
                ))}
              </select>
            )}

            {(assignee.type === "group" || assignee.type === "department_role") && (
              <input
                type="text"
                placeholder={
                  assignee.type === "group" ? "Group key (deferred)" : "Department role (deferred)"
                }
                value={assignee.value || ""}
                disabled={disabled}
                onChange={(e) =>
                  onUpdate(
                    assignees.map((a, i) => (i === idx ? { ...a, value: e.target.value } : a)),
                  )
                }
              />
            )}

            {assignees.length > 1 && (
              <button
                type="button"
                className="fb-btn-icon"
                disabled={disabled}
                title="Remove assignee"
                onClick={() => onUpdate(assignees.filter((_, i) => i !== idx))}
              >
                ✕
              </button>
            )}
          </div>
        ))}

        {(assigneeSupportsMulti(selectedStep) || allowRequester) && (
          <button
            type="button"
            className="fb-btn-secondary"
            disabled={disabled}
            onClick={() => onUpdate([...assignees, { type: "role", value: "manager" }])}
          >
            + Add {allowRequester ? "Recipient" : "Assignee"}
          </button>
        )}
      </div>
    );
  }

  function assigneeSupportsMulti(step: WorkflowStepDefinition | null): boolean {
    return step?.type === "approval" && step.mode !== "single";
  }

  function renderConditionRows(
    conditions: RuleCondition[],
    onUpdate: (next: RuleCondition[]) => void,
  ) {
    return (
      <div className="fb-wf-cond-list">
        {conditions.map((cond, cIdx) => (
          <div key={cond.id || cIdx} className="fb-wf-cond-row">
            <select
              aria-label={`Condition field ${cIdx + 1}`}
              value={cond.fieldId}
              disabled={disabled}
              onChange={(e) =>
                onUpdate(
                  conditions.map((c, i) => (i === cIdx ? { ...c, fieldId: e.target.value } : c)),
                )
              }
            >
              <option value="">-- Field --</option>
              <option value="system.status">System Status</option>
              {availableFields.map((f) => (
                <option key={f.id} value={f.key}>
                  {f.label} ({f.key})
                </option>
              ))}
            </select>

            <select
              aria-label={`Condition operator ${cIdx + 1}`}
              value={cond.operator}
              disabled={disabled}
              onChange={(e) =>
                onUpdate(
                  conditions.map((c, i) =>
                    i === cIdx ? { ...c, operator: e.target.value as RuleOperator } : c,
                  ),
                )
              }
            >
              {RULE_OPERATORS.map((op) => (
                <option key={op.value} value={op.value}>
                  {op.label}
                </option>
              ))}
            </select>

            {cond.operator !== "isEmpty" && cond.operator !== "isNotEmpty" && (
              <input
                type="text"
                aria-label={`Condition value ${cIdx + 1}`}
                value={cond.value === undefined ? "" : String(cond.value)}
                disabled={disabled}
                placeholder="Value"
                onChange={(e) =>
                  onUpdate(
                    conditions.map((c, i) => (i === cIdx ? { ...c, value: e.target.value } : c)),
                  )
                }
              />
            )}

            <button
              type="button"
              className="fb-btn-icon"
              disabled={disabled}
              title="Remove condition"
              onClick={() => onUpdate(conditions.filter((_, i) => i !== cIdx))}
            >
              ✕
            </button>
          </div>
        ))}

        <button
          type="button"
          className="fb-btn-secondary"
          disabled={disabled}
          onClick={() =>
            onUpdate([
              ...conditions,
              {
                id: defaultId("cond"),
                fieldId: availableFields[0]?.key || "system.status",
                operator: "equals",
                value: "",
              },
            ])
          }
        >
          + Add Condition
        </button>
      </div>
    );
  }

  return (
    <div className="fb-wf-root" data-testid="workflow-designer">
      {isLegacy && (
        <div className="fb-wf-legacy-banner" role="status">
          <span>
            Loaded legacy sequential approval stages in visual flow view. Editing will upgrade this draft to the structured workflow format while preserving publish compatibility.
          </span>
        </div>
      )}

      {/* A. WORKFLOW COMMAND STRIP */}
      <header className="fb-wf-commandbar">
        <div className="fb-wf-meta">
          <div className="fb-wf-meta-row">
            <label className="fb-wf-inline-label">
              <span>Workflow Name</span>
              <input
                type="text"
                aria-label="Workflow name"
                value={workflow.name}
                disabled={disabled}
                onChange={(e) => commitWorkflow({ ...workflow, name: e.target.value })}
              />
            </label>

            <label className="fb-wf-inline-label">
              <span>Trigger</span>
              <select
                aria-label="Workflow trigger"
                value={primaryTrigger.type}
                disabled={disabled}
                onChange={(e) => {
                  const nextType = e.target.value as WorkflowTriggerType;
                  commitWorkflow({
                    ...workflow,
                    triggers: [{ ...primaryTrigger, type: nextType }],
                  });
                }}
              >
                {TRIGGER_OPTIONS.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="fb-toggle-row">
              <input
                type="checkbox"
                aria-label="Enable workflow"
                checked={workflow.enabled}
                disabled={disabled}
                onChange={(e) => commitWorkflow({ ...workflow, enabled: e.target.checked })}
              />
              <span className="fb-toggle" aria-hidden="true" />
              <span>{workflow.enabled ? "Enabled" : "Disabled"}</span>
            </label>
          </div>

          <div className="fb-wf-meta-row">
            <input
              type="text"
              className="fb-wf-desc-input"
              aria-label="Workflow description"
              placeholder="Describe the approval & routing process..."
              value={workflow.description || ""}
              disabled={disabled}
              onChange={(e) => commitWorkflow({ ...workflow, description: e.target.value })}
            />
            <button
              type="button"
              className="fb-btn-secondary"
              onClick={() => setShowTriggerConditions((v) => !v)}
            >
              Trigger Conditions ({primaryTrigger.conditions?.length || 0})
            </button>
          </div>

          {showTriggerConditions && (
            <div className="fb-wf-trigger-conditions">
              <div className="fb-wf-cond-header">
                <strong>Entry Conditions</strong>
                <select
                  aria-label="Trigger condition logic"
                  value={primaryTrigger.conditionLogic || "AND"}
                  disabled={disabled}
                  onChange={(e) =>
                    commitWorkflow({
                      ...workflow,
                      triggers: [
                        {
                          ...primaryTrigger,
                          conditionLogic: e.target.value as "AND" | "OR",
                        },
                      ],
                    })
                  }
                >
                  <option value="AND">Match ALL (AND)</option>
                  <option value="OR">Match ANY (OR)</option>
                </select>
              </div>
              {renderConditionRows(primaryTrigger.conditions || [], (nextConds) =>
                commitWorkflow({
                  ...workflow,
                  triggers: [{ ...primaryTrigger, conditions: nextConds }],
                }),
              )}
            </div>
          )}
        </div>

        <div className="fb-wf-command-actions">
          <span
            className={`fb-wf-health-pill ${
              diagnostics.errors.length > 0 ? "is-invalid" : "is-valid"
            }`}
          >
            {diagnostics.errors.length > 0
              ? `${diagnostics.errors.length} publish error(s)`
              : diagnostics.warnings.length > 0
                ? `Valid · ${diagnostics.warnings.length} warning(s)`
                : "Valid for publish"}
          </span>

          <button
            type="button"
            className={showSimulator ? "fb-btn-primary" : "fb-btn-secondary"}
            onClick={() => setShowSimulator((s) => !s)}
          >
            {showSimulator ? "Hide Simulator" : "▷ Simulate Path"}
          </button>
        </div>
      </header>

      {showSimulator && (
        <WorkflowPreview
          workflow={workflow}
          availableFields={availableFields}
          onSimulationChange={setLastSimulation}
          onClose={() => setShowSimulator(false)}
        />
      )}

      {/* B + C. WORKSPACE GRID: STRUCTURED FLOW CANVAS + STEP INSPECTOR */}
      <div className="fb-wf-workspace">
        <div className="fb-wf-canvas" aria-label="Workflow flow canvas">
          <div className="fb-wf-canvas-toolbar">
            <span className="fb-wf-canvas-title">
              Structured Workflow Flow ({workflow.steps.length} steps)
            </span>
            <button
              type="button"
              className="fb-btn-secondary"
              disabled={disabled}
              onClick={() =>
                setInsertAfterStepId((cur) =>
                  cur === "__end__" ? null : "__end__",
                )
              }
            >
              + Add Step
            </button>
          </div>

          {insertAfterStepId === "__end__" && (
            <div className="fb-wf-add-palette" role="menu">
              {(["approval", "assignment", "condition", "notification", "update_record", "end"] as const).map(
                (t) => (
                  <button key={t} type="button" onClick={() => handleAddStep(t, workflow.steps[workflow.steps.length - 2]?.id || workflow.steps[0]?.id)}>
                    + {STEP_TYPE_LABELS[t]}
                  </button>
                ),
              )}
            </div>
          )}

          <div className="fb-wf-flow-spine">
            {workflow.steps.map((step, index) => {
              const issue = stepHasIssue(step);
              const isSelected = selectedStep?.id === step.id;
              const isVisited = visitedSet.has(step.id);
              const targets = formatStepTargets(step);
              const hasBranchSvg =
                step.type === "condition" ||
                (step.type === "approval" && targets.length > 1);

              return (
                <React.Fragment key={step.id}>
                  <article
                    className={`fb-wf-step-card type-${step.type} ${
                      isSelected ? "is-selected" : ""
                    } ${isVisited ? "is-simulated" : ""}`}
                    onClick={() => setSelectedStepId(step.id)}
                  >
                    <div className="fb-wf-step-top">
                      <span className="fb-wf-step-badge">{STEP_TYPE_LABELS[step.type]}</span>
                      <div className="fb-wf-step-controls" onClick={(e) => e.stopPropagation()}>
                        {issue && (
                          <span
                            className={`fb-wf-issue-dot ${issue}`}
                            title={`Step has validation ${issue}`}
                          >
                            {issue === "error" ? "!" : "•"}
                          </span>
                        )}
                        {step.type !== "start" && (
                          <>
                            <button
                              type="button"
                              aria-label={`Move ${step.name} up`}
                              disabled={disabled || index <= 1}
                              onClick={() => handleMoveStep(step.id, -1)}
                            >
                              ↑
                            </button>
                            <button
                              type="button"
                              aria-label={`Move ${step.name} down`}
                              disabled={disabled || index >= workflow.steps.length - 1}
                              onClick={() => handleMoveStep(step.id, 1)}
                            >
                              ↓
                            </button>
                            <button
                              type="button"
                              aria-label={`Delete ${step.name}`}
                              disabled={disabled}
                              onClick={() => handleRemoveStep(step.id)}
                            >
                              ✕
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="fb-wf-step-title">{step.name}</div>

                    <div className="fb-wf-step-meta">
                      {step.type === "start" && (
                        <span>Trigger: {TRIGGER_OPTIONS.find((t) => t.value === primaryTrigger.type)?.label}</span>
                      )}
                      {step.type === "approval" && (
                        <span>
                          {step.mode.toUpperCase()} · {step.assignees.length} approver(s)
                        </span>
                      )}
                      {step.type === "assignment" && (
                        <span>
                          Assign: {step.assignee.type}
                          {step.assignee.value ? ` (${step.assignee.label || step.assignee.value})` : ""}
                        </span>
                      )}
                      {step.type === "condition" && (
                        <span>{step.branches.length} branch(es) + fallback</span>
                      )}
                      {step.type === "notification" && (
                        <span>{NOTIFICATION_EVENT_LABELS[step.event]}</span>
                      )}
                      {step.type === "update_record" && (
                        <span>{step.updates.length} field update(s)</span>
                      )}
                      {step.type === "end" && (
                        <span>Terminal Outcome: {step.outcome.toUpperCase()}</span>
                      )}
                    </div>

                    {targets.length > 0 && (
                      <div className="fb-wf-step-targets">
                        {targets.map((tr, tIdx) => (
                          <span key={tIdx} className={`fb-wf-edge-pill tone-${tr.tone}`}>
                            {tr.label} → {tr.toName}
                          </span>
                        ))}
                      </div>
                    )}
                  </article>

                  {/* Connector + inline SVG branching lines + inline step inserter */}
                  {index < workflow.steps.length - 1 && (
                    <div className="fb-wf-connector-zone">
                      {hasBranchSvg ? (
                        <svg
                          className="fb-wf-svg-branch"
                          viewBox="0 0 240 34"
                          width="240"
                          height="34"
                          aria-hidden="true"
                        >
                          <path
                            d="M120 0 L120 14 M120 14 L50 14 L50 34 M120 14 L190 14 L190 34"
                            fill="none"
                            stroke="#94a3b8"
                            strokeWidth="1.5"
                          />
                        </svg>
                      ) : (
                        <svg
                          className="fb-wf-svg-line"
                          viewBox="0 0 24 28"
                          width="24"
                          height="28"
                          aria-hidden="true"
                        >
                          <line x1="12" y1="0" x2="12" y2="28" stroke="#94a3b8" strokeWidth="1.5" />
                          <polygon points="8,21 16,21 12,27" fill="#94a3b8" />
                        </svg>
                      )}

                      {step.type !== "end" && (
                        <div className="fb-wf-insert-inline">
                          <button
                            type="button"
                            className="fb-wf-insert-btn"
                            disabled={disabled}
                            title={`Insert step after ${step.name}`}
                            onClick={() =>
                              setInsertAfterStepId((cur) => (cur === step.id ? null : step.id))
                            }
                          >
                            +
                          </button>
                          {insertAfterStepId === step.id && (
                            <div className="fb-wf-add-palette" role="menu">
                              {(
                                [
                                  "approval",
                                  "assignment",
                                  "condition",
                                  "notification",
                                  "update_record",
                                  "end",
                                ] as const
                              ).map((t) => (
                                <button
                                  key={t}
                                  type="button"
                                  onClick={() => handleAddStep(t, step.id)}
                                >
                                  + {STEP_TYPE_LABELS[t]}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </React.Fragment>
              );
            })}
          </div>
        </div>

        {/* C. RIGHT-HAND CONFIGURATION PANEL */}
        <aside className="fb-wf-inspector" aria-label="Step configuration panel">
          {!selectedStep ? (
            <div className="fb-wf-inspector-section">
              <h3>Workflow Overview</h3>
              <p>Select any step on the flow canvas to configure properties, assignees, conditions, and transitions.</p>

              {diagnostics.errors.length > 0 && (
                <div className="fb-wf-diag-box is-error">
                  <strong>Publish Blockers ({diagnostics.errors.length})</strong>
                  <ul>
                    {diagnostics.errors.map((err, i) => (
                      <li key={i}>{err.message}</li>
                    ))}
                  </ul>
                </div>
              )}

              <button
                type="button"
                className="fb-btn-danger"
                disabled={disabled}
                onClick={() => commitWorkflow(null)}
              >
                Remove Workflow Configuration
              </button>
            </div>
          ) : (
            <div className="fb-wf-inspector-section">
              <div className="fb-wf-inspector-header">
                <div>
                  <span className="fb-wf-step-badge">{STEP_TYPE_LABELS[selectedStep.type]}</span>
                  <h3>{selectedStep.name || "Untitled Step"}</h3>
                </div>
                <button
                  type="button"
                  className="fb-btn-secondary"
                  onClick={() => setSelectedStepId(null)}
                >
                  Overview
                </button>
              </div>

              <label className="fb-field-control">
                <span>Step Name</span>
                <input
                  type="text"
                  value={selectedStep.name}
                  disabled={disabled}
                  onChange={(e) =>
                    handleUpdateStep(selectedStep.id, (s) => ({ ...s, name: e.target.value }))
                  }
                />
              </label>

              <label className="fb-field-control">
                <span>Step Key</span>
                <input
                  type="text"
                  value={selectedStep.key}
                  disabled={disabled}
                  onChange={(e) =>
                    handleUpdateStep(selectedStep.id, (s) => ({
                      ...s,
                      key: slugify(e.target.value) || s.key,
                    }))
                  }
                />
              </label>

              {/* START */}
              {selectedStep.type === "start" && (
                <div className="fb-wf-subsection">
                  <p className="fb-wf-hint">
                    Every workflow begins here when a configured trigger fires.
                  </p>
                  <label className="fb-field-control">
                    <span>First Step</span>
                    <select
                      value={
                        workflow.transitions.find((t) => t.fromStepId === selectedStep.id)?.toStepId || ""
                      }
                      disabled={disabled}
                      onChange={(e) =>
                        handleSetTransition(selectedStep.id, "default", e.target.value)
                      }
                    >
                      <option value="">-- Select first step --</option>
                      {selectableTargetSteps.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} ({STEP_TYPE_LABELS[s.type]})
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              )}

              {/* APPROVAL */}
              {selectedStep.type === "approval" && (
                <div className="fb-wf-subsection">
                  <label className="fb-field-control">
                    <span>Approval Mode</span>
                    <select
                      aria-label="Approval mode"
                      value={selectedStep.mode}
                      disabled={disabled}
                      onChange={(e) => {
                        const mode = e.target.value as WorkflowApprovalMode;
                        handleUpdateStep(selectedStep.id, (s) => ({
                          ...(s as ApprovalStepDefinition),
                          mode,
                        }));
                      }}
                    >
                      <option value="single">Single Approver</option>
                      <option value="sequential">Sequential Approvers</option>
                      <option value="parallel">Parallel Approval (Config Only — Future Runtime)</option>
                    </select>
                  </label>

                  {selectedStep.mode === "parallel" && (
                    <label className="fb-field-control">
                      <span>Parallel Completion Policy (Future Runtime)</span>
                      <select
                        value={selectedStep.completionPolicy || "all"}
                        disabled={disabled}
                        onChange={(e) =>
                          handleUpdateStep(selectedStep.id, (s) => ({
                            ...(s as ApprovalStepDefinition),
                            completionPolicy: e.target.value as "all" | "any",
                          }))
                        }
                      >
                        <option value="all">All approvers must approve</option>
                        <option value="any">Any single approval advances</option>
                      </select>
                    </label>
                  )}

                  <div className="fb-wf-field-group">
                    <span>Approvers</span>
                    {renderAssigneeList(selectedStep.assignees, (nextAssignees) =>
                      handleUpdateStep(selectedStep.id, (s) => ({
                        ...(s as ApprovalStepDefinition),
                        assignees: nextAssignees,
                      })),
                    )}
                  </div>

                  <div className="fb-wf-checkbox-stack">
                    <label>
                      <input
                        type="checkbox"
                        checked={Boolean(selectedStep.allowReassignment)}
                        disabled={disabled}
                        onChange={(e) =>
                          handleUpdateStep(selectedStep.id, (s) => ({
                            ...(s as ApprovalStepDefinition),
                            allowReassignment: e.target.checked,
                          }))
                        }
                      />
                      Allow approver reassignment (runtime policy)
                    </label>
                    <label>
                      <input
                        type="checkbox"
                        checked={Boolean(selectedStep.requireCommentOnApprove)}
                        disabled={disabled}
                        onChange={(e) =>
                          handleUpdateStep(selectedStep.id, (s) => ({
                            ...(s as ApprovalStepDefinition),
                            requireCommentOnApprove: e.target.checked,
                          }))
                        }
                      />
                      Require comment on Approve
                    </label>
                    <label>
                      <input
                        type="checkbox"
                        checked={Boolean(selectedStep.requireCommentOnReject)}
                        disabled={disabled}
                        onChange={(e) =>
                          handleUpdateStep(selectedStep.id, (s) => ({
                            ...(s as ApprovalStepDefinition),
                            requireCommentOnReject: e.target.checked,
                          }))
                        }
                      />
                      Require comment on Reject
                    </label>
                    <label>
                      <input
                        type="checkbox"
                        checked={Boolean(selectedStep.requireCommentOnReturn)}
                        disabled={disabled}
                        onChange={(e) =>
                          handleUpdateStep(selectedStep.id, (s) => ({
                            ...(s as ApprovalStepDefinition),
                            requireCommentOnReturn: e.target.checked,
                          }))
                        }
                      />
                      Require comment on Return
                    </label>
                  </div>

                  <h4>Outcome Transitions</h4>
                  {(["approved", "rejected", "returned"] as const).map((outcome) => (
                    <label key={outcome} className="fb-field-control">
                      <span>On {outcome.charAt(0).toUpperCase() + outcome.slice(1)} →</span>
                      <select
                        aria-label={`On ${outcome} transition`}
                        value={
                          workflow.transitions.find(
                            (t) => t.fromStepId === selectedStep.id && t.outcome === outcome,
                          )?.toStepId || ""
                        }
                        disabled={disabled}
                        onChange={(e) =>
                          handleSetTransition(
                            selectedStep.id,
                            outcome,
                            e.target.value,
                            outcome.charAt(0).toUpperCase() + outcome.slice(1),
                          )
                        }
                      >
                        <option value="">-- None --</option>
                        {selectableTargetSteps.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>
              )}

              {/* ASSIGNMENT */}
              {selectedStep.type === "assignment" && (
                <div className="fb-wf-subsection">
                  <div className="fb-wf-field-group">
                    <span>Assignee</span>
                    {renderAssigneeList([selectedStep.assignee], (next) =>
                      handleUpdateStep(selectedStep.id, (s) => ({
                        ...(s as AssignmentStepDefinition),
                        assignee: next[0] || { type: "role", value: "employee" },
                      })),
                    )}
                  </div>

                  <label className="fb-field-control">
                    <span>Due In Hours (Optional SLA target)</span>
                    <input
                      type="number"
                      min={1}
                      value={selectedStep.dueInHours ?? ""}
                      disabled={disabled}
                      onChange={(e) =>
                        handleUpdateStep(selectedStep.id, (s) => ({
                          ...(s as AssignmentStepDefinition),
                          dueInHours: e.target.value ? Number(e.target.value) : undefined,
                        }))
                      }
                    />
                  </label>

                  <label className="fb-field-control">
                    <span>Instructions</span>
                    <textarea
                      rows={2}
                      value={selectedStep.instructions || ""}
                      disabled={disabled}
                      onChange={(e) =>
                        handleUpdateStep(selectedStep.id, (s) => ({
                          ...(s as AssignmentStepDefinition),
                          instructions: e.target.value,
                        }))
                      }
                    />
                  </label>

                  <label className="fb-field-control">
                    <span>Next Step →</span>
                    <select
                      value={
                        workflow.transitions.find((t) => t.fromStepId === selectedStep.id)?.toStepId || ""
                      }
                      disabled={disabled}
                      onChange={(e) =>
                        handleSetTransition(selectedStep.id, "default", e.target.value)
                      }
                    >
                      <option value="">-- Select next step --</option>
                      {selectableTargetSteps.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              )}

              {/* CONDITION */}
              {selectedStep.type === "condition" && (
                <div className="fb-wf-subsection">
                  {selectedStep.branches.map((branch, bIdx) => (
                    <div key={branch.id} className="fb-wf-branch-box">
                      <div className="fb-wf-branch-head">
                        <input
                          type="text"
                          aria-label={`Branch ${bIdx + 1} label`}
                          value={branch.label}
                          disabled={disabled}
                          onChange={(e) =>
                            handleUpdateStep(selectedStep.id, (s) => ({
                              ...(s as ConditionStepDefinition),
                              branches: (s as ConditionStepDefinition).branches.map((b) =>
                                b.id === branch.id ? { ...b, label: e.target.value } : b,
                              ),
                            }))
                          }
                        />
                        <select
                          aria-label={`Branch ${bIdx + 1} logic`}
                          value={branch.conditionLogic}
                          disabled={disabled}
                          onChange={(e) =>
                            handleUpdateStep(selectedStep.id, (s) => ({
                              ...(s as ConditionStepDefinition),
                              branches: (s as ConditionStepDefinition).branches.map((b) =>
                                b.id === branch.id
                                  ? { ...b, conditionLogic: e.target.value as "AND" | "OR" }
                                  : b,
                              ),
                            }))
                          }
                        >
                          <option value="AND">AND</option>
                          <option value="OR">OR</option>
                        </select>
                        {selectedStep.branches.length > 1 && (
                          <button
                            type="button"
                            className="fb-btn-icon"
                            disabled={disabled}
                            onClick={() =>
                              handleUpdateStep(selectedStep.id, (s) => ({
                                ...(s as ConditionStepDefinition),
                                branches: (s as ConditionStepDefinition).branches.filter(
                                  (b) => b.id !== branch.id,
                                ),
                              }))
                            }
                          >
                            ✕
                          </button>
                        )}
                      </div>

                      {renderConditionRows(branch.conditions, (nextConds) =>
                        handleUpdateStep(selectedStep.id, (s) => ({
                          ...(s as ConditionStepDefinition),
                          branches: (s as ConditionStepDefinition).branches.map((b) =>
                            b.id === branch.id ? { ...b, conditions: nextConds } : b,
                          ),
                        })),
                      )}

                      <label className="fb-field-control">
                        <span>Go To Step →</span>
                        <select
                          aria-label={`Branch ${bIdx + 1} target step`}
                          value={branch.targetStepId}
                          disabled={disabled}
                          onChange={(e) =>
                            handleUpdateStep(selectedStep.id, (s) => ({
                              ...(s as ConditionStepDefinition),
                              branches: (s as ConditionStepDefinition).branches.map((b) =>
                                b.id === branch.id ? { ...b, targetStepId: e.target.value } : b,
                              ),
                            }))
                          }
                        >
                          <option value="">-- Select target step --</option>
                          {selectableTargetSteps.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                  ))}

                  <button
                    type="button"
                    className="fb-btn-secondary"
                    disabled={disabled}
                    onClick={() => {
                      const newBranch: ConditionBranchDefinition = {
                        id: defaultId("wf_br"),
                        label: `Branch ${selectedStep.branches.length + 1}`,
                        conditionLogic: "AND",
                        conditions: [
                          {
                            id: defaultId("cond"),
                            fieldId: availableFields[0]?.key || "system.status",
                            operator: "equals",
                            value: "",
                          },
                        ],
                        targetStepId: selectableTargetSteps[0]?.id || "",
                      };
                      handleUpdateStep(selectedStep.id, (s) => ({
                        ...(s as ConditionStepDefinition),
                        branches: [...(s as ConditionStepDefinition).branches, newBranch],
                      }));
                    }}
                  >
                    + Add Branch
                  </button>

                  <label className="fb-field-control">
                    <span>Fallback / Else Target Step →</span>
                    <select
                      aria-label="Fallback target step"
                      value={selectedStep.defaultTargetStepId || ""}
                      disabled={disabled}
                      onChange={(e) =>
                        handleUpdateStep(selectedStep.id, (s) => ({
                          ...(s as ConditionStepDefinition),
                          defaultTargetStepId: e.target.value,
                        }))
                      }
                    >
                      <option value="">-- Select fallback step --</option>
                      {selectableTargetSteps.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              )}

              {/* NOTIFICATION */}
              {selectedStep.type === "notification" && (
                <div className="fb-wf-subsection">
                  <p className="fb-wf-hint">
                    Uses safe `&#123;&#123;token&#125;&#125;` interpolation only. Live email/in-app delivery belongs to Phase E3.
                  </p>
                  <label className="fb-field-control">
                    <span>Notification Event</span>
                    <select
                      value={selectedStep.event}
                      disabled={disabled}
                      onChange={(e) =>
                        handleUpdateStep(selectedStep.id, (s) => ({
                          ...(s as NotificationStepDefinition),
                          event: e.target.value as WorkflowNotificationEvent,
                        }))
                      }
                    >
                      {WORKFLOW_NOTIFICATION_EVENTS.map((ev) => (
                        <option key={ev} value={ev}>
                          {NOTIFICATION_EVENT_LABELS[ev]}
                        </option>
                      ))}
                    </select>
                  </label>

                  <div className="fb-wf-field-group">
                    <span>Recipients</span>
                    {renderAssigneeList(
                      selectedStep.recipients,
                      (nextRecipients) =>
                        handleUpdateStep(selectedStep.id, (s) => ({
                          ...(s as NotificationStepDefinition),
                          recipients: nextRecipients,
                        })),
                      true,
                    )}
                  </div>

                  <label className="fb-field-control">
                    <span>Subject Template</span>
                    <input
                      type="text"
                      value={selectedStep.subjectTemplate}
                      disabled={disabled}
                      onChange={(e) =>
                        handleUpdateStep(selectedStep.id, (s) => ({
                          ...(s as NotificationStepDefinition),
                          subjectTemplate: e.target.value,
                        }))
                      }
                    />
                  </label>

                  <label className="fb-field-control">
                    <span>Message Body Template</span>
                    <textarea
                      rows={3}
                      value={selectedStep.bodyTemplate}
                      disabled={disabled}
                      onChange={(e) =>
                        handleUpdateStep(selectedStep.id, (s) => ({
                          ...(s as NotificationStepDefinition),
                          bodyTemplate: e.target.value,
                        }))
                      }
                    />
                  </label>

                  <label className="fb-field-control">
                    <span>Next Step →</span>
                    <select
                      value={
                        workflow.transitions.find((t) => t.fromStepId === selectedStep.id)?.toStepId || ""
                      }
                      disabled={disabled}
                      onChange={(e) =>
                        handleSetTransition(selectedStep.id, "default", e.target.value)
                      }
                    >
                      <option value="">-- Select next step --</option>
                      {selectableTargetSteps.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              )}

              {/* UPDATE RECORD */}
              {selectedStep.type === "update_record" && (
                <div className="fb-wf-subsection">
                  <p className="fb-wf-hint">
                    Declarative field update targets (executed on server runtime in Phase E3).
                  </p>
                  {selectedStep.updates.map((upd, uIdx) => (
                    <div key={upd.id} className="fb-wf-cond-row">
                      <select
                        aria-label={`Update field ${uIdx + 1}`}
                        value={upd.targetRef}
                        disabled={disabled}
                        onChange={(e) =>
                          handleUpdateStep(selectedStep.id, (s) => ({
                            ...(s as UpdateRecordStepDefinition),
                            updates: (s as UpdateRecordStepDefinition).updates.map((u) =>
                              u.id === upd.id ? { ...u, targetRef: e.target.value } : u,
                            ),
                          }))
                        }
                      >
                        <option value="system.status">System Status</option>
                        {writableFields.map((f) => (
                          <option key={f.id} value={f.key}>
                            {f.label} ({f.key})
                          </option>
                        ))}
                      </select>
                      <input
                        type="text"
                        aria-label={`Update value ${uIdx + 1}`}
                        value={upd.value === null ? "" : String(upd.value)}
                        disabled={disabled}
                        onChange={(e) =>
                          handleUpdateStep(selectedStep.id, (s) => ({
                            ...(s as UpdateRecordStepDefinition),
                            updates: (s as UpdateRecordStepDefinition).updates.map((u) =>
                              u.id === upd.id ? { ...u, value: e.target.value } : u,
                            ),
                          }))
                        }
                      />
                      {selectedStep.updates.length > 1 && (
                        <button
                          type="button"
                          className="fb-btn-icon"
                          disabled={disabled}
                          onClick={() =>
                            handleUpdateStep(selectedStep.id, (s) => ({
                              ...(s as UpdateRecordStepDefinition),
                              updates: (s as UpdateRecordStepDefinition).updates.filter(
                                (u) => u.id !== upd.id,
                              ),
                            }))
                          }
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  ))}
                  <button
                    type="button"
                    className="fb-btn-secondary"
                    disabled={disabled}
                    onClick={() =>
                      handleUpdateStep(selectedStep.id, (s) => ({
                        ...(s as UpdateRecordStepDefinition),
                        updates: [
                          ...(s as UpdateRecordStepDefinition).updates,
                          {
                            id: defaultId("wf_upd"),
                            targetRef: writableFields[0]?.key || "system.status",
                            value: "",
                          },
                        ],
                      }))
                    }
                  >
                    + Add Field Update
                  </button>

                  <label className="fb-field-control">
                    <span>Next Step →</span>
                    <select
                      value={
                        workflow.transitions.find((t) => t.fromStepId === selectedStep.id)?.toStepId || ""
                      }
                      disabled={disabled}
                      onChange={(e) =>
                        handleSetTransition(selectedStep.id, "default", e.target.value)
                      }
                    >
                      <option value="">-- Select next step --</option>
                      {selectableTargetSteps.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              )}

              {/* END */}
              {selectedStep.type === "end" && (
                <div className="fb-wf-subsection">
                  <label className="fb-field-control">
                    <span>Terminal Outcome</span>
                    <select
                      aria-label="Terminal outcome"
                      value={selectedStep.outcome}
                      disabled={disabled}
                      onChange={(e) =>
                        handleUpdateStep(selectedStep.id, (s) => ({
                          ...(s as EndStepDefinition),
                          outcome: e.target.value as WorkflowOutcome,
                        }))
                      }
                    >
                      {WORKFLOW_OUTCOMES.map((out) => (
                        <option key={out} value={out}>
                          {out.charAt(0).toUpperCase() + out.slice(1)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="fb-field-control">
                    <span>Final Status Tag (Optional)</span>
                    <input
                      type="text"
                      value={selectedStep.finalStatus || ""}
                      disabled={disabled}
                      placeholder={selectedStep.outcome}
                      onChange={(e) =>
                        handleUpdateStep(selectedStep.id, (s) => ({
                          ...(s as EndStepDefinition),
                          finalStatus: e.target.value,
                        }))
                      }
                    />
                  </label>
                </div>
              )}

              {/* Validation summary for workflow */}
              {diagnostics.errors.length > 0 && (
                <div className="fb-wf-diag-box is-error">
                  <strong>Publish Blockers</strong>
                  <ul>
                    {diagnostics.errors.map((err, i) => (
                      <li key={i}>{err.message}</li>
                    ))}
                  </ul>
                </div>
              )}
              {diagnostics.warnings.length > 0 && (
                <div className="fb-wf-diag-box is-warning">
                  <strong>Warnings</strong>
                  <ul>
                    {diagnostics.warnings.map((w, i) => (
                      <li key={i}>{w.message}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
