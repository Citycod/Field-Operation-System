import { describe, it, expect, beforeEach, vi } from "vitest";
import type { FormSchemaV1, FlowWorkflowDefinition } from "@field/form-engine";
import type { OrganizationMembership, PlatformRole } from "@field/types";
import { FormService } from "@/lib/services/form-service";
import type {
  FormEntity,
  FormRepository,
  FormVersionEntity,
} from "@/lib/repositories/form-repository";
import type { MembershipRepository } from "@/lib/repositories/membership-repository";

class InMemoryMembershipRepository implements MembershipRepository {
  private members = new Map<
    string,
    {
      userId: string;
      orgId: string;
      roleKey: PlatformRole;
      status: "active" | "invited" | "disabled";
      name: string;
      email: string;
    }
  >();

  addMember(params: {
    userId: string;
    orgId: string;
    roleKey: PlatformRole;
    status?: "active" | "invited" | "disabled";
    name?: string;
    email?: string;
  }) {
    this.members.set(`${params.userId}:${params.orgId}`, {
      userId: params.userId,
      orgId: params.orgId,
      roleKey: params.roleKey,
      status: params.status ?? "active",
      name: params.name ?? params.userId,
      email: params.email ?? `${params.userId}@synthetic.test`,
    });
  }

  async findByUserId(userId: string): Promise<OrganizationMembership[]> {
    return [...this.members.values()]
      .filter((m) => m.userId === userId)
      .map((m) => ({
        id: `mem_${m.userId}_${m.orgId}`,
        organization_id: m.orgId,
        user_id: m.userId,
        role_key: m.roleKey,
        status: m.status,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }));
  }

  async findUserMembershipInOrg(
    userId: string,
    organizationId: string,
  ): Promise<OrganizationMembership | null> {
    const found = this.members.get(`${userId}:${organizationId}`);
    if (!found) return null;
    return {
      id: `mem_${found.userId}_${found.orgId}`,
      organization_id: found.orgId,
      user_id: found.userId,
      role_key: found.roleKey,
      status: found.status,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  }

  async getRoster(organizationId: string): Promise<any[]> {
    return [...this.members.values()]
      .filter((m) => m.orgId === organizationId)
      .map((m) => ({
        id: `mem_${m.userId}_${m.orgId}`,
        organization_id: m.orgId,
        user_id: m.userId,
        role_key: m.roleKey,
        status: m.status,
        full_name: m.name,
        email: m.email,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }));
  }

  async manageMembership(): Promise<any> {
    return { success: true };
  }
}

class InMemoryFormRepository implements FormRepository {
  public forms = new Map<string, FormEntity>();
  public versions = new Map<string, FormVersionEntity>();
  private seq = 0;

  async listForms(organizationId: string) {
    return [...this.forms.values()]
      .filter((f) => f.organization_id === organizationId && !f.archived_at)
      .map((f) => {
        const versions = [...this.versions.values()].filter(
          (v) => v.form_id === f.id,
        );
        const latest = (status: string) =>
          versions
            .filter((v) => v.status === status)
            .reduce<number | null>(
              (max, v) =>
                max === null || v.version_number > max ? v.version_number : max,
              null,
            );
        return {
          ...f,
          draft_version_number: latest("draft"),
          published_version_number: latest("published"),
        };
      });
  }

  async createForm(params: {
    organizationId: string;
    key: string;
    title: string;
    description?: string;
    createdBy: string;
    initialSchema: any;
  }) {
    this.seq += 1;
    const formId = `form_${this.seq}`;
    const versionId = `ver_${this.seq}`;

    const version: FormVersionEntity = {
      id: versionId,
      organization_id: params.organizationId,
      form_id: formId,
      version_number: 1,
      status: "draft",
      schema_version: 1,
      schema_jsonb: params.initialSchema,
      change_note: null,
      created_by: params.createdBy,
      created_at: new Date().toISOString(),
      published_by: null,
      published_at: null,
    };

    const form: FormEntity = {
      id: formId,
      organization_id: params.organizationId,
      key: params.key,
      title: params.title,
      description: params.description || null,
      status: "active",
      current_draft_version_id: versionId,
      current_published_version_id: null,
      created_by: params.createdBy,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      archived_at: null,
    };

    this.forms.set(formId, form);
    this.versions.set(versionId, version);
    return { form, version };
  }

  async getFormById(id: string, organizationId: string) {
    const f = this.forms.get(id);
    return f && f.organization_id === organizationId ? f : null;
  }

  async getFormByKey(key: string, organizationId: string) {
    for (const f of this.forms.values()) {
      if (f.key === key && f.organization_id === organizationId) return f;
    }
    return null;
  }

  async getDraftVersion(formId: string, organizationId: string) {
    for (const v of this.versions.values()) {
      if (
        v.form_id === formId &&
        v.organization_id === organizationId &&
        v.status === "draft"
      ) {
        return v;
      }
    }
    return null;
  }

  async getPublishedVersion(formId: string, organizationId: string) {
    let latest: FormVersionEntity | null = null;
    for (const v of this.versions.values()) {
      if (
        v.form_id === formId &&
        v.organization_id === organizationId &&
        v.status === "published"
      ) {
        if (!latest || v.version_number > latest.version_number) {
          latest = v;
        }
      }
    }
    return latest;
  }

  async saveDraft(params: {
    versionId: string;
    formId: string;
    organizationId: string;
    schema: any;
    changeNote?: string;
  }) {
    const v = this.versions.get(params.versionId);
    if (
      !v ||
      v.status !== "draft" ||
      v.organization_id !== params.organizationId
    ) {
      throw new Error("Draft version not found");
    }
    v.schema_jsonb = JSON.parse(JSON.stringify(params.schema));
    if (params.changeNote) v.change_note = params.changeNote;
    return v;
  }

  async publishVersion(params: {
    formId: string;
    versionId: string;
    organizationId: string;
    userId: string;
    changeNote?: string;
  }) {
    const v = this.versions.get(params.versionId);
    if (
      !v ||
      v.status !== "draft" ||
      v.organization_id !== params.organizationId
    ) {
      throw new Error("Draft version not found");
    }
    v.status = "published";
    v.published_by = params.userId;
    v.published_at = new Date().toISOString();
    if (params.changeNote) v.change_note = params.changeNote;

    const f = this.forms.get(params.formId);
    if (f) {
      f.current_published_version_id = v.id;
      f.current_draft_version_id = null;
      f.updated_at = new Date().toISOString();
    }
  }

  async listVersions(formId: string, organizationId: string) {
    return [...this.versions.values()]
      .filter((v) => v.form_id === formId && v.organization_id === organizationId)
      .sort((a, b) => b.version_number - a.version_number);
  }

  async createDraftFromPublished(params: {
    formId: string;
    organizationId: string;
    userId: string;
  }) {
    const existing = await this.getDraftVersion(
      params.formId,
      params.organizationId,
    );
    if (existing) throw new Error("Active draft already exists");

    const published = await this.getPublishedVersion(
      params.formId,
      params.organizationId,
    );
    if (!published) throw new Error("No published version found");

    this.seq += 1;
    const versionId = `ver_${this.seq}`;
    const version: FormVersionEntity = {
      id: versionId,
      organization_id: params.organizationId,
      form_id: params.formId,
      version_number: published.version_number + 1,
      status: "draft",
      schema_version: 1,
      schema_jsonb: JSON.parse(JSON.stringify(published.schema_jsonb)),
      change_note: null,
      created_by: params.userId,
      created_at: new Date().toISOString(),
      published_by: null,
      published_at: null,
    };
    this.versions.set(versionId, version);
    const f = this.forms.get(params.formId);
    if (f) f.current_draft_version_id = versionId;
    return version;
  }

  async getPublicForm(_slugOrId: string) {
    return null;
  }

  async setFormPublicAccess(params: {
    formId: string;
    organizationId: string;
    isPublic: boolean;
    publicSlug?: string;
  }): Promise<FormEntity> {
    const f = await this.getFormById(params.formId, params.organizationId);
    if (!f) throw new Error("Form not found");
    return f;
  }
}

function buildEquipmentSchema(
  workflow: FormSchemaV1["workflow"] = null,
): FormSchemaV1 {
  return {
    schemaVersion: 1,
    form: {
      schemaVersion: 1,
      id: "form_equip_insp",
      key: "equipment_inspection",
      title: "Equipment Inspection Checklist",
    },
    header: {
      columns: 2,
      sections: [
        {
          id: "sec_insp",
          key: "inspection_info",
          title: "Inspection Information",
          order: 0,
          fields: [
            {
              id: "fld_cost",
              key: "estimated_repair_cost",
              type: "currency",
              label: "Estimated Repair Cost",
              order: 0,
            },
            {
              id: "fld_status",
              key: "review_status",
              type: "text",
              label: "Review Status",
              order: 1,
            },
          ],
        },
      ],
    },
    tabs: [
      {
        id: "tab_main",
        key: "details",
        title: "Details",
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

function createValidFlowWorkflow(
  assigneeUserId: string,
): FlowWorkflowDefinition {
  return {
    id: "wf_equip_escalation",
    name: "Equipment Repair Escalation",
    description: "Validates repair cost escalation and manager approval.",
    enabled: true,
    mode: "flow",
    triggers: [{ id: "trg_submit", type: "on_submit", enabled: true }],
    steps: [
      {
        id: "step_start",
        key: "start",
        type: "start",
        name: "On Submit",
      },
      {
        id: "step_cond",
        key: "check_repair_cost",
        type: "condition",
        name: "Check Repair Cost",
        branches: [
          {
            id: "br_high",
            label: "High Repair Cost",
            conditionLogic: "AND",
            conditions: [
              {
                id: "cond_1",
                fieldId: "estimated_repair_cost",
                operator: "greaterThan",
                value: 1000,
              },
            ],
            targetStepId: "step_approve",
          },
        ],
        defaultTargetStepId: "step_notify_ok",
      },
      {
        id: "step_approve",
        key: "ops_manager_signoff",
        type: "approval",
        name: "Operations Manager Sign-off",
        mode: "single",
        assignees: [{ type: "user", value: assigneeUserId }],
      },
      {
        id: "step_update_ok",
        key: "mark_approved",
        type: "update_record",
        name: "Mark Approved",
        updates: [
          { id: "upd_1", targetRef: "review_status", value: "approved" },
        ],
      },
      {
        id: "step_notify_ok",
        key: "notify_submitter",
        type: "notification",
        name: "Notify Submitter",
        event: "approved",
        recipients: [{ type: "requester" }],
        subjectTemplate: "Inspection {{form.title}} Processed",
        bodyTemplate: "Inspection status updated.",
      },
      {
        id: "step_end_approved",
        key: "end_approved",
        type: "end",
        name: "Completed",
        outcome: "approved",
      },
      {
        id: "step_end_rejected",
        key: "end_rejected",
        type: "end",
        name: "Rejected",
        outcome: "rejected",
      },
    ],
    transitions: [
      {
        id: "tr_start",
        fromStepId: "step_start",
        toStepId: "step_cond",
        outcome: "default",
      },
      {
        id: "tr_app_ok",
        fromStepId: "step_approve",
        toStepId: "step_update_ok",
        outcome: "approved",
      },
      {
        id: "tr_app_rej",
        fromStepId: "step_approve",
        toStepId: "step_end_rejected",
        outcome: "rejected",
      },
      {
        id: "tr_upd",
        fromStepId: "step_update_ok",
        toStepId: "step_notify_ok",
        outcome: "default",
      },
      {
        id: "tr_notify",
        fromStepId: "step_notify_ok",
        toStepId: "step_end_approved",
        outcome: "default",
      },
    ],
  };
}

describe("Workflow Builder Integration (FormService draft, publish, tenancy, public sanitization)", () => {
  const orgA = "org_alpha";
  const orgB = "org_beta";
  const adminA = "user_admin_alpha";
  const managerA = "user_mgr_alpha";
  const employeeA = "user_emp_alpha";
  const adminB = "user_admin_beta";

  let membershipRepo: InMemoryMembershipRepository;
  let formRepo: InMemoryFormRepository;
  let formService: FormService;

  beforeEach(() => {
    membershipRepo = new InMemoryMembershipRepository();
    formRepo = new InMemoryFormRepository();
    formService = new FormService(formRepo, membershipRepo);

    membershipRepo.addMember({
      userId: adminA,
      orgId: orgA,
      roleKey: "business_admin",
    });
    membershipRepo.addMember({
      userId: managerA,
      orgId: orgA,
      roleKey: "manager",
    });
    membershipRepo.addMember({
      userId: employeeA,
      orgId: orgA,
      roleKey: "employee",
    });
    membershipRepo.addMember({
      userId: adminB,
      orgId: orgB,
      roleKey: "business_admin",
    });
  });

  it("saves and reloads extended FlowWorkflowDefinition drafts and publishes valid tenant workflows", async () => {
    const created = await formService.createForm({
      userId: adminA,
      organizationId: orgA,
      key: "equipment_inspection",
      title: "Equipment Inspection Checklist",
    });

    const validWorkflow = createValidFlowWorkflow(managerA);
    const schemaWithWorkflow = buildEquipmentSchema(validWorkflow);

    const savedDraft = await formService.saveDraft({
      userId: adminA,
      organizationId: orgA,
      formId: created.form.id,
      versionId: created.version.id,
      schema: schemaWithWorkflow,
      changeNote: "Add Phase E1 escalation workflow",
    });

    expect((savedDraft.schema_jsonb as FormSchemaV1).workflow).toEqual(
      validWorkflow,
    );

    await formService.publishForm({
      userId: adminA,
      organizationId: orgA,
      formId: created.form.id,
      versionId: savedDraft.id,
      changeNote: "Publish equipment inspection workflow v1",
    });

    const previewPublished = await formService.getPublishedForm({
      userId: adminA,
      organizationId: orgA,
      formId: created.form.id,
      action: "read_all_submissions",
    });
    expect(previewPublished.publishedVersion.status).toBe("published");
    expect(
      (previewPublished.publishedVersion.schema_jsonb as FormSchemaV1).workflow,
    ).toEqual(validWorkflow);

    // Creating a new draft copies the snapshot without mutating the published snapshot
    const v2Draft = await formService.createDraftFromPublished({
      userId: adminA,
      organizationId: orgA,
      formId: created.form.id,
    });
    const modifiedSchema: FormSchemaV1 = {
      ...(v2Draft.schema_jsonb as FormSchemaV1),
      workflow: {
        ...validWorkflow,
        name: "Modified Draft v2 Workflow",
      },
    };
    await formService.saveDraft({
      userId: adminA,
      organizationId: orgA,
      formId: created.form.id,
      versionId: v2Draft.id,
      schema: modifiedSchema,
    });

    const publishedAfterV2Edit = await formService.getPublishedForm({
      userId: adminA,
      organizationId: orgA,
      formId: created.form.id,
      action: "read_all_submissions",
    });
    const pubWf = (
      publishedAfterV2Edit.publishedVersion.schema_jsonb as FormSchemaV1
    ).workflow;
    expect(pubWf && "name" in pubWf ? pubWf.name : null).toBe(
      "Equipment Repair Escalation",
    );
  });

  it("supports legacy sequential workflows cleanly", async () => {
    const created = await formService.createForm({
      userId: adminA,
      organizationId: orgA,
      key: "equipment_inspection_legacy",
      title: "Equipment Legacy Checklist",
    });

    const legacySchema = buildEquipmentSchema({
      type: "sequential",
      stages: [
        {
          id: "stg_1",
          key: "supervisor_signoff",
          name: "Supervisor Sign-off",
          order: 0,
          approverType: "role",
          approverValue: "manager",
        },
      ],
    });

    const saved = await formService.saveDraft({
      userId: adminA,
      organizationId: orgA,
      formId: created.form.id,
      versionId: created.version.id,
      schema: legacySchema,
    });

    await expect(
      formService.publishForm({
        userId: adminA,
        organizationId: orgA,
        formId: created.form.id,
        versionId: saved.id,
      }),
    ).resolves.not.toThrow();
  });

  it("rejects publishing invalid workflows (broken transitions, cycles, missing End, cross-tenant userId)", async () => {
    const created = await formService.createForm({
      userId: adminA,
      organizationId: orgA,
      key: "equipment_inspection_invalid",
      title: "Equipment Invalid Flow Test",
    });

    // 1. Cross-tenant user assignee (adminB belongs to orgB, not orgA)
    const crossTenantFlow = createValidFlowWorkflow(adminB);
    await formService.saveDraft({
      userId: adminA,
      organizationId: orgA,
      formId: created.form.id,
      versionId: created.version.id,
      schema: buildEquipmentSchema(crossTenantFlow),
    });

    await expect(
      formService.publishForm({
        userId: adminA,
        organizationId: orgA,
        formId: created.form.id,
        versionId: created.version.id,
      }),
    ).rejects.toThrow();

    // 2. Incomplete workflow (missing End step) saves as WIP draft, but fails on publish
    const incompleteFlow: FlowWorkflowDefinition = {
      id: "wf_incomplete",
      name: "Incomplete WIP Flow",
      enabled: true,
      mode: "flow",
      triggers: [{ id: "trg_1", type: "on_submit", enabled: true }],
      steps: [
        { id: "s1", key: "start", type: "start", name: "Start" },
        {
          id: "s2",
          key: "notify_only",
          type: "notification",
          name: "Notify Only",
          event: "task_assigned",
          recipients: [{ type: "role", value: "manager" }],
          subjectTemplate: "Reminder",
          bodyTemplate: "Pending inspection.",
        },
      ],
      transitions: [
        { id: "tr1", fromStepId: "s1", toStepId: "s2", outcome: "default" },
      ],
    };

    await formService.saveDraft({
      userId: adminA,
      organizationId: orgA,
      formId: created.form.id,
      versionId: created.version.id,
      schema: buildEquipmentSchema(incompleteFlow),
    });

    await expect(
      formService.publishForm({
        userId: adminA,
        organizationId: orgA,
        formId: created.form.id,
        versionId: created.version.id,
      }),
    ).rejects.toThrow();

    // 3. Circular workflow fails immediately even at draft save time
    const cyclicFlow: FlowWorkflowDefinition = {
      ...incompleteFlow,
      steps: [
        ...incompleteFlow.steps,
        {
          id: "s3",
          key: "loop_step_two",
          type: "notification",
          name: "Loop Step Two",
          event: "task_assigned",
          recipients: [{ type: "role", value: "manager" }],
          subjectTemplate: "Second Reminder",
          bodyTemplate: "Pending inspection.",
        },
      ],
      transitions: [
        { id: "tr1", fromStepId: "s1", toStepId: "s2", outcome: "default" },
        { id: "tr2", fromStepId: "s2", toStepId: "s3", outcome: "default" },
        { id: "tr3", fromStepId: "s3", toStepId: "s2", outcome: "default" },
      ],
    };
    await expect(
      formService.saveDraft({
        userId: adminA,
        organizationId: orgA,
        formId: created.form.id,
        versionId: created.version.id,
        schema: buildEquipmentSchema(cyclicFlow),
      }),
    ).rejects.toThrow(/WORKFLOW_CYCLE_DETECTED/i);
  });

  it("enforces RBAC and cross-tenant isolation across draft save and publishing", async () => {
    const created = await formService.createForm({
      userId: adminA,
      organizationId: orgA,
      key: "equipment_rbac_check",
      title: "Equipment RBAC Checklist",
    });

    const validSchema = buildEquipmentSchema(createValidFlowWorkflow(managerA));

    // Employee role cannot save draft
    await expect(
      formService.saveDraft({
        userId: employeeA,
        organizationId: orgA,
        formId: created.form.id,
        versionId: created.version.id,
        schema: validSchema,
      }),
    ).rejects.toThrow();

    // Cross-tenant admin cannot save orgA form
    await expect(
      formService.saveDraft({
        userId: adminB,
        organizationId: orgA,
        formId: created.form.id,
        versionId: created.version.id,
        schema: validSchema,
      }),
    ).rejects.toThrow();

    await formService.saveDraft({
      userId: adminA,
      organizationId: orgA,
      formId: created.form.id,
      versionId: created.version.id,
      schema: validSchema,
    });
    await formService.publishForm({
      userId: adminA,
      organizationId: orgA,
      formId: created.form.id,
      versionId: created.version.id,
    });

    // Cross-tenant admin cannot read orgA published form
    await expect(
      formService.getPublishedForm({
        userId: adminB,
        organizationId: orgB,
        formId: created.form.id,
        action: "read_all_submissions",
      }),
    ).rejects.toThrow();

    const publishedResult = await formService.getPublishedForm({
      userId: adminA,
      organizationId: orgA,
      formId: created.form.id,
      action: "read_all_submissions",
    });
    expect(publishedResult.publishedVersion.schema_jsonb.workflow).toEqual(
      validSchema.workflow,
    );
  });

  it("rejects inactive or nonexistent users, empty rosters, and roster lookup failures on publish", async () => {
    membershipRepo.addMember({
      userId: "user_invited_alpha",
      orgId: orgA,
      roleKey: "manager",
      status: "invited",
    });

    const created = await formService.createForm({
      userId: adminA,
      organizationId: orgA,
      key: "equipment_roster_guard",
      title: "Equipment Roster Guard Checklist",
    });

    // 1. Invited member cannot be assigned as a published user approver
    await formService.saveDraft({
      userId: adminA,
      organizationId: orgA,
      formId: created.form.id,
      versionId: created.version.id,
      schema: buildEquipmentSchema(createValidFlowWorkflow("user_invited_alpha")),
    });
    await expect(
      formService.publishForm({
        userId: adminA,
        organizationId: orgA,
        formId: created.form.id,
        versionId: created.version.id,
      }),
    ).rejects.toThrow(/INVALID_WORKFLOW_ASSIGNEE/);

    // 2. Nonexistent user ID is rejected
    await formService.saveDraft({
      userId: adminA,
      organizationId: orgA,
      formId: created.form.id,
      versionId: created.version.id,
      schema: buildEquipmentSchema(createValidFlowWorkflow("user_does_not_exist")),
    });
    await expect(
      formService.publishForm({
        userId: adminA,
        organizationId: orgA,
        formId: created.form.id,
        versionId: created.version.id,
      }),
    ).rejects.toThrow(/INVALID_WORKFLOW_ASSIGNEE/);

    // 3. Empty roster still rejects user-specific assignments
    const rosterSpy = vi
      .spyOn(membershipRepo, "getRoster")
      .mockResolvedValueOnce([]);
    await formService.saveDraft({
      userId: adminA,
      organizationId: orgA,
      formId: created.form.id,
      versionId: created.version.id,
      schema: buildEquipmentSchema(createValidFlowWorkflow(managerA)),
    });
    await expect(
      formService.publishForm({
        userId: adminA,
        organizationId: orgA,
        formId: created.form.id,
        versionId: created.version.id,
      }),
    ).rejects.toThrow(/INVALID_WORKFLOW_ASSIGNEE/);

    // 4. Roster exception fails closed without publishing
    rosterSpy.mockRejectedValueOnce(new Error("Roster service unavailable"));
    await expect(
      formService.publishForm({
        userId: adminA,
        organizationId: orgA,
        formId: created.form.id,
        versionId: created.version.id,
      }),
    ).rejects.toThrow(/Failed to verify active organization members/);
  });
});
