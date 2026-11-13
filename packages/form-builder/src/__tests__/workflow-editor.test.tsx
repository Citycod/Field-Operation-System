import React, { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import {
  isFlowWorkflow,
  type FormSchemaV1,
  type WorkflowDefinition,
  type FlowWorkflowDefinition,
} from "@field/form-engine";
import { FormBuilder } from "../form-builder";
import { WorkflowEditor } from "../workflow-editor";
import { WorkflowPreview } from "../workflow-preview";
import type { BuilderMemberOption } from "../types";

afterEach(() => {
  cleanup();
});

const MEMBERS: BuilderMemberOption[] = [
  {
    userId: "user_manager_1",
    displayName: "Amina Yusuf",
    email: "amina@acme-ops.test",
    roleKey: "manager",
  },
  {
    userId: "user_admin_1",
    displayName: "Tunde Adeyemi",
    email: "tunde@acme-ops.test",
    roleKey: "business_admin",
  },
];

function createSyntheticSchema(
  workflow: WorkflowDefinition | null = null,
): FormSchemaV1 {
  return {
    schemaVersion: 1,
    form: {
      schemaVersion: 1,
      id: "form_equip_insp",
      key: "equipment_inspection_checklist",
      title: "Equipment Inspection Checklist",
    },
    header: {
      columns: 2,
      sections: [
        {
          id: "sec_header",
          key: "inspection_summary",
          title: "Inspection Summary",
          order: 0,
          fields: [
            {
              id: "fld_site_code",
              key: "site_code",
              type: "text",
              label: "Site Code",
              order: 0,
            },
            {
              id: "fld_repair_cost",
              key: "estimated_repair_cost",
              type: "currency",
              label: "Estimated Repair Cost",
              order: 1,
            },
            {
              id: "fld_risk_level",
              key: "risk_level",
              type: "dropdown",
              label: "Risk Level",
              order: 2,
              options: [
                { label: "Low", value: "low" },
                { label: "High", value: "high" },
              ],
            },
            {
              id: "fld_inspection_status",
              key: "inspection_status",
              type: "text",
              label: "Inspection Status",
              order: 3,
            },
          ],
        },
      ],
    },
    tabs: [
      {
        id: "tab_general",
        key: "general",
        title: "Checklist Details",
        type: "form",
        order: 0,
        columns: 2,
        sections: [],
      },
    ],
    rules: [],
    workflow,
    listView: { columns: [] },
    permissions: {},
    settings: {},
  };
}

function StatefulWorkflowHarness({
  initialWorkflow = null,
  members = MEMBERS,
  onChangeSpy,
}: {
  initialWorkflow?: WorkflowDefinition | null;
  members?: readonly BuilderMemberOption[];
  onChangeSpy?: (schema: FormSchemaV1) => void;
}) {
  const [schema, setSchema] = useState<FormSchemaV1>(() =>
    createSyntheticSchema(initialWorkflow),
  );

  return (
    <WorkflowEditor
      schema={schema}
      organizationMembers={members}
      onChange={(next) => {
        setSchema(next);
        onChangeSpy?.(next);
      }}
    />
  );
}

describe("WorkflowEditor and FormBuilder Workflow module", () => {
  it("unlocks the Workflow tab in FormBuilder and creates a starter flow workflow", () => {
    const onChange = vi.fn();
    render(
      <FormBuilder
        initialSchema={createSyntheticSchema(null)}
        onChange={onChange}
        organizationMembers={MEMBERS}
      />,
    );

    const workflowTab = screen.getByRole("button", { name: "Workflow" });
    fireEvent.click(workflowTab);

    const emptyState = screen.getByTestId("workflow-empty-state");
    expect(emptyState).toBeTruthy();

    fireEvent.click(
      within(emptyState).getByRole("button", { name: "+ Create Workflow" }),
    );

    expect(screen.getByTestId("workflow-designer")).toBeTruthy();
    expect(onChange).toHaveBeenCalled();

    const latestSchema = onChange.mock.calls.at(-1)?.[0] as FormSchemaV1;
    expect(latestSchema.workflow).not.toBeNull();
    expect(isFlowWorkflow(latestSchema.workflow)).toBe(true);
    if (isFlowWorkflow(latestSchema.workflow)) {
      expect(latestSchema.workflow.steps.some((s) => s.type === "start")).toBe(
        true,
      );
      expect(
        latestSchema.workflow.steps.some((s) => s.type === "approval"),
      ).toBe(true);
      expect(latestSchema.workflow.steps.some((s) => s.type === "end")).toBe(
        true,
      );
    }
  });

  it("supports adding steps, editing approval assignees from tenant members, reordering, and deleting", () => {
    const onChangeSpy = vi.fn();
    render(<StatefulWorkflowHarness onChangeSpy={onChangeSpy} />);

    fireEvent.click(screen.getByRole("button", { name: "+ Create Workflow" }));

    // Edit command strip fields
    fireEvent.change(screen.getByLabelText("Workflow name"), {
      target: { value: "Equipment Escalation Workflow" },
    });
    fireEvent.change(screen.getByLabelText("Workflow description"), {
      target: { value: "Routes high-risk inspection checklists for sign-off." },
    });

    // Add an Assignment step
    fireEvent.click(screen.getByRole("button", { name: "+ Add Step" }));
    fireEvent.click(screen.getByRole("button", { name: "+ Assignment" }));

    // Add a Condition step
    fireEvent.click(screen.getByRole("button", { name: "+ Add Step" }));
    fireEvent.click(
      screen.getByRole("button", { name: "+ Condition / Branch" }),
    );

    // Add a Notification step
    fireEvent.click(screen.getByRole("button", { name: "+ Add Step" }));
    fireEvent.click(screen.getByRole("button", { name: "+ Notification" }));

    // Add an Update Record step
    fireEvent.click(screen.getByRole("button", { name: "+ Add Step" }));
    fireEvent.click(screen.getByRole("button", { name: "+ Update Record" }));

    // Add an End step
    fireEvent.click(screen.getByRole("button", { name: "+ Add Step" }));
    fireEvent.click(screen.getByRole("button", { name: "+ End" }));

    let latest = onChangeSpy.mock.calls.at(-1)?.[0] as FormSchemaV1;
    expect(isFlowWorkflow(latest.workflow)).toBe(true);
    if (isFlowWorkflow(latest.workflow)) {
      const stepTypes = latest.workflow.steps.map((s) => s.type);
      expect(stepTypes).toContain("assignment");
      expect(stepTypes).toContain("condition");
      expect(stepTypes).toContain("notification");
      expect(stepTypes).toContain("update_record");
      expect(latest.workflow.name).toBe("Equipment Escalation Workflow");
    }

    // Select Manager Review approval step and configure user assignee from organizationMembers
    fireEvent.click(screen.getByText("Manager Review"));
    expect(screen.getByLabelText("Step Name")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Assignee type 1"), {
      target: { value: "user" },
    });
    const userSelect = screen.getByLabelText("Assignee user 1");
    fireEvent.change(userSelect, { target: { value: "user_manager_1" } });

    latest = onChangeSpy.mock.calls.at(-1)?.[0] as FormSchemaV1;
    if (isFlowWorkflow(latest.workflow)) {
      const approval = latest.workflow.steps.find(
        (s) => s.type === "approval",
      );
      expect(approval?.type).toBe("approval");
      if (approval?.type === "approval") {
        expect(approval.assignees[0]?.type).toBe("user");
        expect(approval.assignees[0]?.value).toBe("user_manager_1");
        expect(approval.assignees[0]?.label).toBe("Amina Yusuf");
      }
    }

    // Reorder a step up and delete the Notification step
    const moveUpButtons = screen.getAllByRole("button", {
      name: /Move .* up/,
    });
    expect(moveUpButtons.length).toBeGreaterThan(0);
    fireEvent.click(moveUpButtons[moveUpButtons.length - 1]!);

    const deleteNotification = screen.getByRole("button", {
      name: /Delete .*Notification/i,
    });
    fireEvent.click(deleteNotification);

    latest = onChangeSpy.mock.calls.at(-1)?.[0] as FormSchemaV1;
    if (isFlowWorkflow(latest.workflow)) {
      expect(
        latest.workflow.steps.some((s) => s.type === "notification"),
      ).toBe(false);
    }
  });

  it("configures condition branches, fallback targets, and renders inline validation indicators", () => {
    const onChangeSpy = vi.fn();
    render(<StatefulWorkflowHarness onChangeSpy={onChangeSpy} />);

    fireEvent.click(screen.getByRole("button", { name: "+ Create Workflow" }));
    fireEvent.click(screen.getByRole("button", { name: "+ Add Step" }));
    fireEvent.click(
      screen.getByRole("button", { name: "+ Condition / Branch" }),
    );

    fireEvent.change(screen.getByLabelText("Branch 1 label"), {
      target: { value: "High Repair Cost" },
    });
    fireEvent.change(screen.getByLabelText("Branch 1 logic"), {
      target: { value: "OR" },
    });
    fireEvent.click(screen.getByRole("button", { name: "+ Add Branch" }));

    const latest = onChangeSpy.mock.calls.at(-1)?.[0] as FormSchemaV1;
    if (isFlowWorkflow(latest.workflow)) {
      const condStep = latest.workflow.steps.find(
        (s) => s.type === "condition",
      );
      expect(condStep?.type).toBe("condition");
      if (condStep?.type === "condition") {
        expect(condStep.branches.length).toBe(2);
        expect(condStep.branches[0]?.label).toBe("High Repair Cost");
        expect(condStep.branches[0]?.conditionLogic).toBe("OR");
      }
    }

    // Newly added unlinked condition produces inline publish error/warning feedback
    const designer = screen.getByTestId("workflow-designer");
    expect(designer.textContent).toMatch(/warning|error/i);
  });

  it("renders legacy sequential workflows and upgrades to FlowWorkflowDefinition upon editing", () => {
    const legacyWorkflow: WorkflowDefinition = {
      type: "sequential",
      stages: [
        {
          id: "stg_1",
          key: "safety_signoff",
          name: "Safety Officer Sign-off",
          order: 0,
          approverType: "role",
          approverValue: "manager",
        },
      ],
    };
    const onChangeSpy = vi.fn();
    render(
      <StatefulWorkflowHarness
        initialWorkflow={legacyWorkflow}
        onChangeSpy={onChangeSpy}
      />,
    );

    expect(screen.getByRole("status").textContent).toMatch(
      /legacy sequential/i,
    );
    expect(screen.getAllByText("Safety Officer Sign-off").length).toBeGreaterThan(0);

    fireEvent.change(screen.getByLabelText("Workflow name"), {
      target: { value: "Upgraded Safety Flow" },
    });

    expect(onChangeSpy).toHaveBeenCalled();
    const upgraded = onChangeSpy.mock.calls.at(-1)?.[0] as FormSchemaV1;
    expect(isFlowWorkflow(upgraded.workflow)).toBe(true);
    if (isFlowWorkflow(upgraded.workflow)) {
      expect(upgraded.workflow.name).toBe("Upgraded Safety Flow");
      expect(upgraded.workflow.steps.some((s) => s.type === "approval")).toBe(
        true,
      );
    }
  });

  it("runs the synthetic WorkflowPreview simulator with Approve and Reject decisions", () => {
    render(<StatefulWorkflowHarness />);
    fireEvent.click(screen.getByRole("button", { name: "+ Create Workflow" }));

    fireEvent.click(screen.getByRole("button", { name: /Simulate Path/i }));

    const preview = screen.getByLabelText("Synthetic workflow simulation");
    expect(preview).toBeTruthy();
    expect(within(preview).getByText("SYNTHETIC PREVIEW")).toBeTruthy();
    expect(within(preview).getByText("Workflow Path Simulator")).toBeTruthy();
    expect(within(preview).getByText("Simulated Execution Path")).toBeTruthy();

    // Default decision approves -> reaches Approved End
    expect(within(preview).getByText("Outcome: approved")).toBeTruthy();

    // Change simulated decision to Reject -> reaches Rejected End
    const decisionSelect = within(preview).getByLabelText(
      "Simulated decision for Manager Review",
    );
    fireEvent.change(decisionSelect, { target: { value: "rejected" } });

    expect(within(preview).getByText("Outcome: rejected")).toBeTruthy();
  });

  it("renders WorkflowPreview standalone in synthetic mode without mutating parent state", () => {
    const schema = createSyntheticSchema(null);
    const availableFields = schema.header.sections.flatMap((s) => s.fields);
    const onSimChange = vi.fn();

    const standaloneFlow: FlowWorkflowDefinition = {
      id: "wf_standalone",
      name: "Standalone Flow",
      enabled: true,
      triggers: [{ id: "trg_1", type: "on_submit", enabled: true }],
      steps: [
        {
          id: "start_1",
          key: "start",
          type: "start",
          name: "Start",
        },
        {
          id: "end_1",
          key: "done",
          type: "end",
          name: "Done",
          outcome: "completed",
        },
      ],
      transitions: [
        {
          id: "tr_1",
          fromStepId: "start_1",
          toStepId: "end_1",
          outcome: "default",
        },
      ],
    };

    render(
      <WorkflowPreview
        workflow={standaloneFlow}
        availableFields={availableFields}
        onSimulationChange={onSimChange}
      />,
    );

    expect(screen.getByText("SYNTHETIC PREVIEW")).toBeTruthy();
    expect(onSimChange).toHaveBeenCalled();
    const simResult = onSimChange.mock.calls.at(-1)?.[0];
    expect(simResult.synthetic).toBe(true);
    expect(simResult.completed).toBe(true);
    expect(simResult.terminalOutcome).toBe("completed");
  });
});
