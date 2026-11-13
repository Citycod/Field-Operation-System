import React, { useEffect, useMemo, useState } from "react";
import {
  simulateWorkflow,
  type FieldDefinition,
  type FlowWorkflowDefinition,
  type SimulatedApprovalDecision,
  type WorkflowSimulationResult,
} from "@field/form-engine";

export interface WorkflowPreviewProps {
  workflow: FlowWorkflowDefinition;
  availableFields: readonly FieldDefinition[];
  onSimulationChange?: (result: WorkflowSimulationResult) => void;
  onClose?: () => void;
}

export function WorkflowPreview({
  workflow,
  availableFields,
  onSimulationChange,
  onClose,
}: WorkflowPreviewProps) {
  const [sampleValues, setSampleValues] = useState<Record<string, unknown>>({
    "system.status": "submitted",
  });
  const [simulatedDecisions, setSimulatedDecisions] = useState<
    Record<string, SimulatedApprovalDecision>
  >({});

  const approvalSteps = useMemo(
    () => workflow.steps.filter((s) => s.type === "approval"),
    [workflow.steps],
  );

  // Collect fields referenced in workflow conditions + first few form fields for convenient simulation
  const testFields = useMemo(() => {
    const referencedRefs = new Set<string>();
    for (const trig of workflow.triggers || []) {
      for (const c of trig.conditions || []) {
        if (c.fieldId) referencedRefs.add(c.fieldId);
      }
    }
    for (const step of workflow.steps) {
      if (step.type === "condition") {
        for (const b of step.branches || []) {
          for (const c of b.conditions || []) {
            if (c.fieldId) referencedRefs.add(c.fieldId);
          }
        }
      }
    }

    const prioritized = availableFields.filter(
      (f) => f.type !== "calculated" && (referencedRefs.has(f.id) || referencedRefs.has(f.key)),
    );
    if (prioritized.length > 0) return prioritized;
    return availableFields.filter((f) => f.type !== "calculated").slice(0, 4);
  }, [availableFields, workflow.steps, workflow.triggers]);

  const simulation = useMemo(
    () => simulateWorkflow(workflow, sampleValues, availableFields, simulatedDecisions),
    [workflow, sampleValues, availableFields, simulatedDecisions],
  );

  useEffect(() => {
    onSimulationChange?.(simulation);
  }, [onSimulationChange, simulation]);

  function handleFieldValueChange(field: FieldDefinition, rawValue: unknown) {
    setSampleValues((prev) => ({
      ...prev,
      [field.key]: rawValue,
    }));
  }

  return (
    <section className="fb-wf-preview" aria-label="Synthetic workflow simulation">
      <div className="fb-wf-preview-header">
        <div>
          <span className="fb-wf-sim-badge">SYNTHETIC PREVIEW</span>
          <h3>Workflow Path Simulator</h3>
          <p>
            Simulates condition routing and approval transitions locally. No database records, tasks, or notifications are created.
          </p>
        </div>
        {onClose && (
          <button type="button" className="fb-btn-secondary" onClick={onClose}>
            Close Simulator
          </button>
        )}
      </div>

      <div className="fb-wf-preview-grid">
        <div className="fb-wf-preview-inputs">
          <h4>Synthetic Inputs</h4>
          <div className="fb-wf-sim-fields">
            <label className="fb-field-control">
              <span>System Status (`system.status`)</span>
              <select
                value={String(sampleValues["system.status"] ?? "submitted")}
                onChange={(e) =>
                  setSampleValues((prev) => ({ ...prev, "system.status": e.target.value }))
                }
              >
                <option value="draft">draft</option>
                <option value="submitted">submitted</option>
                <option value="pending_approval">pending_approval</option>
                <option value="approved">approved</option>
                <option value="rejected">rejected</option>
              </select>
            </label>

            {testFields.map((field) => (
              <label key={field.id} className="fb-field-control">
                <span>
                  {field.label} (<code>{field.key}</code>)
                </span>
                {field.type === "checkbox" ? (
                  <input
                    type="checkbox"
                    checked={Boolean(sampleValues[field.key])}
                    onChange={(e) => handleFieldValueChange(field, e.target.checked)}
                  />
                ) : field.type === "dropdown" ? (
                  <select
                    value={String(sampleValues[field.key] ?? "")}
                    onChange={(e) => handleFieldValueChange(field, e.target.value)}
                  >
                    <option value="">-- empty --</option>
                    {field.options.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                ) : field.type === "number" || field.type === "currency" ? (
                  <input
                    type="number"
                    value={
                      sampleValues[field.key] === undefined
                        ? ""
                        : String(sampleValues[field.key])
                    }
                    placeholder="Enter test number..."
                    onChange={(e) =>
                      handleFieldValueChange(
                        field,
                        e.target.value === "" ? "" : Number(e.target.value),
                      )
                    }
                  />
                ) : (
                  <input
                    type={field.type === "date" ? "date" : "text"}
                    value={String(sampleValues[field.key] ?? "")}
                    placeholder="Enter test value..."
                    onChange={(e) => handleFieldValueChange(field, e.target.value)}
                  />
                )}
              </label>
            ))}

            {approvalSteps.length > 0 && (
              <div className="fb-wf-sim-decisions">
                <h5>Simulated Approver Decisions</h5>
                {approvalSteps.map((step) => (
                  <label key={step.id} className="fb-field-control">
                    <span>{step.name}</span>
                    <select
                      aria-label={`Simulated decision for ${step.name}`}
                      value={simulatedDecisions[step.id] ?? "approved"}
                      onChange={(e) =>
                        setSimulatedDecisions((prev) => ({
                          ...prev,
                          [step.id]: e.target.value as SimulatedApprovalDecision,
                        }))
                      }
                    >
                      <option value="approved">Approve</option>
                      <option value="rejected">Reject</option>
                      <option value="returned">Return</option>
                    </select>
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="fb-wf-preview-trace">
          <div className="fb-wf-trace-summary">
            <h4>Simulated Execution Path</h4>
            <span
              className={`fb-wf-outcome-pill ${
                simulation.completed
                  ? `outcome-${simulation.terminalOutcome || "completed"}`
                  : "outcome-blocked"
              }`}
            >
              {simulation.completed
                ? `Outcome: ${simulation.terminalOutcome}`
                : simulation.triggered
                  ? "Incomplete Path"
                  : "Trigger Not Matched"}
            </span>
          </div>

          {simulation.errors.length > 0 && (
            <div className="fb-wf-sim-alert" role="alert">
              {simulation.errors.map((err, i) => (
                <div key={i}>{err}</div>
              ))}
            </div>
          )}

          <ol className="fb-wf-trace-list">
            {simulation.trace.map((item, idx) => (
              <li key={`${item.stepId}-${idx}`} className={`trace-${item.status}`}>
                <span className="trace-index">{idx + 1}</span>
                <div className="trace-body">
                  <div className="trace-title">
                    <strong>{item.stepName}</strong>
                    <span className="trace-type">{item.stepType}</span>
                  </div>
                  {item.note && <div className="trace-note">{item.note}</div>}
                </div>
              </li>
            ))}
          </ol>

          {simulation.notificationsPreview.length > 0 && (
            <div className="fb-wf-sim-effects">
              <h5>Synthetic Notifications ({simulation.notificationsPreview.length})</h5>
              {simulation.notificationsPreview.map((n, idx) => (
                <div key={`${n.stepId}-${idx}`} className="fb-wf-effect-card">
                  <strong>[{n.event}]</strong> {n.subject}
                </div>
              ))}
            </div>
          )}

          {simulation.recordUpdatesPreview.length > 0 && (
            <div className="fb-wf-sim-effects">
              <h5>Synthetic Record Updates ({simulation.recordUpdatesPreview.length})</h5>
              {simulation.recordUpdatesPreview.map((u, idx) => (
                <div key={`${u.stepId}-${idx}`} className="fb-wf-effect-card">
                  <code>{u.targetRef}</code> = <code>{String(u.value)}</code>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

