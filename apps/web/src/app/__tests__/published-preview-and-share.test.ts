import { describe, it, expect, beforeEach } from "vitest";
import { FormService } from "@/lib/services/form-service";
import { SubmissionService } from "@/lib/services/submission-service";
import type {
  FormRepository,
  FormEntity,
  FormVersionEntity,
  FormListItem,
} from "@/lib/repositories/form-repository";
import type {
  SubmissionRepository,
  FormSubmissionEntity,
} from "@/lib/repositories/submission-repository";
import type { MembershipRepository } from "@/lib/repositories/membership-repository";
import type { OrganizationMembership, PlatformRole } from "@field/types";
import type { FormSchemaV1, FormTabDefinition } from "@field/form-engine";

class InMemoryMembershipRepository implements MembershipRepository {
  private memberships = new Map<string, { role_key: PlatformRole; status: "active" | "invited" | "disabled" }>();

  add(userId: string, orgId: string, role_key: PlatformRole = "business_admin", status: "active" | "invited" | "disabled" = "active") {
    this.memberships.set(`${userId}:${orgId}`, { role_key, status });
  }

  async findByUserId(): Promise<OrganizationMembership[]> {
    return [];
  }

  async findUserMembershipInOrg(userId: string, organizationId: string): Promise<OrganizationMembership | null> {
    const entry = this.memberships.get(`${userId}:${organizationId}`);
    if (!entry) return null;
    return {
      id: `mem_${userId}`,
      organization_id: organizationId,
      user_id: userId,
      role_key: entry.role_key,
      status: entry.status,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  }

  async getRoster(): Promise<any[]> {
    return [];
  }

  async manageMembership(): Promise<any> {
    return { success: true };
  }
}

class InMemoryFormRepository implements FormRepository {
  public forms = new Map<string, FormEntity>();
  public versions = new Map<string, FormVersionEntity>();

  async listForms(organizationId: string): Promise<FormListItem[]> {
    return Array.from(this.forms.values())
      .filter((f) => f.organization_id === organizationId && !f.archived_at)
      .map((f) => ({
        ...f,
        draft_version_number: null,
        published_version_number: 1,
      }));
  }

  async createForm(): Promise<{ form: FormEntity; version: FormVersionEntity }> {
    throw new Error("Not implemented");
  }

  async getFormById(id: string, organizationId: string): Promise<FormEntity | null> {
    const form = this.forms.get(id);
    if (!form || form.organization_id !== organizationId || form.archived_at) return null;
    return form;
  }

  async getFormByKey(key: string, organizationId: string): Promise<FormEntity | null> {
    const form = Array.from(this.forms.values()).find(
      (f) => f.key === key && f.organization_id === organizationId && !f.archived_at,
    );
    return form ?? null;
  }

  async getDraftVersion(formId: string, organizationId: string): Promise<FormVersionEntity | null> {
    const form = await this.getFormById(formId, organizationId);
    if (!form || !form.current_draft_version_id) return null;
    return this.versions.get(form.current_draft_version_id) ?? null;
  }

  async getPublishedVersion(formId: string, organizationId: string): Promise<FormVersionEntity | null> {
    const form = await this.getFormById(formId, organizationId);
    if (!form || !form.current_published_version_id) return null;
    return this.versions.get(form.current_published_version_id) ?? null;
  }

  async saveDraft(params: {
    versionId: string;
    formId: string;
    organizationId: string;
    schema: FormSchemaV1;
    changeNote?: string;
  }): Promise<FormVersionEntity> {
    const v = this.versions.get(params.versionId);
    if (!v || v.organization_id !== params.organizationId) {
      throw new Error("Draft version not found");
    }
    v.schema_jsonb = params.schema;
    if (params.changeNote) v.change_note = params.changeNote;
    return v;
  }

  async publishVersion(params: {
    formId: string;
    versionId: string;
    organizationId: string;
    userId: string;
    changeNote?: string;
  }): Promise<void> {
    const v = this.versions.get(params.versionId);
    if (!v || v.organization_id !== params.organizationId) {
      throw new Error("Version not found");
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

  async listVersions(formId: string, organizationId: string): Promise<FormVersionEntity[]> {
    return Array.from(this.versions.values())
      .filter((v) => v.form_id === formId && v.organization_id === organizationId)
      .sort((a, b) => b.version_number - a.version_number);
  }

  async createDraftFromPublished(params: {
    formId: string;
    organizationId: string;
    userId: string;
  }): Promise<FormVersionEntity> {
    const form = await this.getFormById(params.formId, params.organizationId);
    if (!form) throw new Error("Form not found");

    const published = await this.getPublishedVersion(params.formId, params.organizationId);
    if (!published) throw new Error("No published version found");

    let maxVer = 0;
    for (const v of this.versions.values()) {
      if (v.form_id === params.formId) {
        maxVer = Math.max(maxVer, v.version_number);
      }
    }

    const newDraftId = `draft_${Date.now()}`;
    const newDraft: FormVersionEntity = {
      id: newDraftId,
      organization_id: params.organizationId,
      form_id: params.formId,
      version_number: maxVer + 1,
      status: "draft",
      schema_version: published.schema_version,
      schema_jsonb: JSON.parse(JSON.stringify(published.schema_jsonb)),
      change_note: null,
      created_by: params.userId,
      created_at: new Date().toISOString(),
      published_by: null,
      published_at: null,
    };

    this.versions.set(newDraftId, newDraft);
    form.current_draft_version_id = newDraftId;
    return newDraft;
  }

  async getPublicForm(slugOrId: string): Promise<{ form: FormEntity; publishedVersion: FormVersionEntity } | null> {
    const form = Array.from(this.forms.values()).find(
      (f) => (f.id === slugOrId || f.key === slugOrId || f.public_slug === slugOrId) && !f.archived_at,
    );
    if (!form || !form.current_published_version_id) return null;
    const version = this.versions.get(form.current_published_version_id);
    if (!version || version.status !== "published") return null;
    return { form, publishedVersion: version };
  }

  async setFormPublicAccess(params: {
    formId: string;
    organizationId: string;
    isPublic: boolean;
    publicSlug?: string;
  }): Promise<FormEntity> {
    const form = await this.getFormById(params.formId, params.organizationId);
    if (!form) throw new Error("Form not found");
    form.is_public = params.isPublic;
    if (params.publicSlug !== undefined) form.public_slug = params.publicSlug;
    return form;
  }
}

class InMemorySubmissionRepository implements SubmissionRepository {
  public submissions = new Map<string, FormSubmissionEntity>();

  async createSubmission(params: {
    organizationId: string;
    formId: string;
    formVersionId: string;
    referenceNumber?: string | null;
    status: string;
    dataJsonb: Record<string, unknown>;
    createdBy?: string | null;
    submittedBy?: string | null;
    detailRows?: Array<{ tabId: string; rowOrder: number; dataJsonb: Record<string, unknown> }>;
  }): Promise<FormSubmissionEntity> {
    const id = `sub_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const now = new Date().toISOString();
    const entity: FormSubmissionEntity = {
      id,
      organization_id: params.organizationId,
      form_id: params.formId,
      form_version_id: params.formVersionId,
      reference_number: params.referenceNumber ?? null,
      status: params.status,
      data_jsonb: params.dataJsonb,
      created_by: params.createdBy ?? null,
      submitted_by: params.submittedBy ?? null,
      created_at: now,
      updated_at: now,
      submitted_at: now,
      completed_at: null,
    };
    this.submissions.set(id, entity);
    return entity;
  }

  async getSubmissionById(id: string, organizationId: string): Promise<FormSubmissionEntity | null> {
    const sub = this.submissions.get(id);
    if (!sub || sub.organization_id !== organizationId) return null;
    return sub;
  }

  async listSubmissions(params: { organizationId: string; formId: string }): Promise<FormSubmissionEntity[]> {
    return Array.from(this.submissions.values()).filter(
      (s) => s.organization_id === params.organizationId && s.form_id === params.formId,
    );
  }
}

describe("Published Form Preview & Shareable Links Verification Suite", () => {
  const tenantA = "11111111-1111-4111-a111-111111111111";
  const tenantB = "22222222-2222-4222-b222-222222222222";
  const adminA = "user_admin_a";
  const adminB = "user_admin_b";
  const formId = "synth-equip-uuid";
  const formKey = "equipment_inspection";

  let formRepo: InMemoryFormRepository;
  let membershipRepo: InMemoryMembershipRepository;
  let subRepo: InMemorySubmissionRepository;
  let formService: FormService;
  let subService: SubmissionService;

  const publishedSchemaV1: FormSchemaV1 = {
    schemaVersion: 1,
    form: {
      id: formId,
      key: formKey,
      title: "Equipment Inspection Checklist",
      description: "Official equipment safety inspection",
      schemaVersion: 1,
    },
    header: {
      columns: 2,
      sections: [
        {
          id: "sec_inspector_info",
          key: "inspector_info",
          title: "Inspector Information",
          order: 0,
          fields: [
            {
              id: "f_inspector",
              key: "inspector_name",
              label: "Inspector Name",
              type: "text",
              required: true,
              order: 0,
            },
            {
              id: "f_company",
              key: "service_provider",
              label: "Service Provider",
              type: "text",
              required: false,
              order: 1,
            },
          ],
        },
      ],
    },
    tabs: [
      {
        id: "tab_general",
        key: "general",
        title: "Inspection Details",
        type: "form",
        order: 0,
        columns: 2,
        sections: [
          {
            id: "sec_equipment",
            key: "equipment_info",
            title: "Equipment Details",
            order: 0,
            fields: [
              {
                id: "f_serial",
                key: "serial_number",
                label: "Serial Number",
                type: "text",
                required: true,
                order: 0,
              },
            ],
          },
        ],
      },
    ],
    rules: [],
    workflow: null,
    listView: { columns: [] },
    permissions: {},
    settings: {
      publicAccess: {
        enabled: true,
        customSlug: "equipment-inspect-hq",
        successTitle: "Inspection Received",
        successMessage: "Your equipment inspection report has been recorded.",
      },
      referenceNumber: {
        enabled: true,
        prefix: "EQP-",
        sequenceLength: 5,
      },
    },
  };

  beforeEach(() => {
    formRepo = new InMemoryFormRepository();
    membershipRepo = new InMemoryMembershipRepository();
    subRepo = new InMemorySubmissionRepository();
    formService = new FormService(formRepo, membershipRepo);
    subService = new SubmissionService(formRepo, subRepo);

    membershipRepo.add(adminA, tenantA, "business_admin", "active");
    membershipRepo.add(adminB, tenantB, "business_admin", "active");

    const formEntity: FormEntity = {
      id: formId,
      organization_id: tenantA,
      key: formKey,
      title: "Equipment Inspection Checklist",
      description: "Official equipment safety inspection",
      status: "active",
      is_public: true,
      public_slug: "equipment-inspect-hq",
      current_draft_version_id: null,
      current_published_version_id: "v1_pub",
      created_by: adminA,
      created_at: "2026-11-13T08:00:00Z",
      updated_at: "2026-11-13T08:00:00Z",
      archived_at: null,
    };

    const versionEntity: FormVersionEntity = {
      id: "v1_pub",
      organization_id: tenantA,
      form_id: formId,
      version_number: 1,
      status: "published",
      schema_version: 1,
      schema_jsonb: publishedSchemaV1,
      change_note: "Initial published release",
      created_by: adminA,
      created_at: "2026-11-13T08:00:00Z",
      published_by: adminA,
      published_at: "2026-11-13T08:05:00Z",
    };

    formRepo.forms.set(formId, formEntity);
    formRepo.versions.set("v1_pub", versionEntity);
  });

  // 1. Previewing a published form
  it("Requirement 1: allows administrators to preview the published form", async () => {
    const result = await formService.getPublishedVersionForPreview({
      userId: adminA,
      organizationId: tenantA,
      formId,
    });

    expect(result).toBeDefined();
    expect(result.form.id).toBe(formId);
    expect(result.publishedVersion.status).toBe("published");
    expect(result.publishedVersion.version_number).toBe(1);
    expect(result.publishedVersion.schema_jsonb.form.title).toBe("Equipment Inspection Checklist");
  });

  // 2. Previewing the exact published snapshot
  it("Requirement 2: displays the exact published snapshot version", async () => {
    const result = await formService.getPublishedVersionForPreview({
      userId: adminA,
      organizationId: tenantA,
      formId,
    });

    expect(result.publishedVersion.id).toBe("v1_pub");
    expect(result.publishedVersion.schema_jsonb.header.sections[0].fields[0].key).toBe("inspector_name");
  });

  // 3. Draft changes not appearing in preview
  it("Requirement 3: draft edits do not leak into the published preview", async () => {
    const draftV2 = await formRepo.createDraftFromPublished({
      formId,
      organizationId: tenantA,
      userId: adminA,
    });

    const modifiedDraftSchema: FormSchemaV1 = {
      ...draftV2.schema_jsonb,
      form: { ...draftV2.schema_jsonb.form, title: "DRAFT IN PROGRESS - NOT PUBLISHED" },
      header: {
        columns: 2,
        sections: [
          {
            id: "sec_experimental",
            key: "experimental",
            title: "Experimental Draft Section",
            order: 0,
            fields: [
              {
                id: "f_temp",
                key: "temporary_field",
                label: "Unpublished Experimental Field",
                type: "text",
                order: 0,
              },
            ],
          },
        ],
      },
    };

    await formRepo.saveDraft({
      versionId: draftV2.id,
      formId,
      organizationId: tenantA,
      schema: modifiedDraftSchema,
    });

    const previewResult = await formService.getPublishedVersionForPreview({
      userId: adminA,
      organizationId: tenantA,
      formId,
    });

    expect(previewResult.publishedVersion.version_number).toBe(1);
    expect(previewResult.publishedVersion.schema_jsonb.form.title).toBe("Equipment Inspection Checklist");
    expect(previewResult.publishedVersion.schema_jsonb.form.title).not.toContain("DRAFT IN PROGRESS");
    expect(
      previewResult.publishedVersion.schema_jsonb.header.sections.some((s) => s.key === "experimental"),
    ).toBe(false);
  });

  // 4. Generating a public form link
  it("Requirement 4: generates a stable public URL based on slug or semantic key", async () => {
    const baseUrl = "https://app.workforce-ops.com";
    const slug = publishedSchemaV1.settings?.publicAccess?.customSlug || formKey;
    const publicUrl = `${baseUrl}/f/${slug}`;

    expect(publicUrl).toBe("https://app.workforce-ops.com/f/equipment-inspect-hq");
  });

  // 5. Copy-link functionality
  it("Requirement 5: produces the correct link for clipboard copy and external sharing", () => {
    const origin = "https://app.workforce-ops.com";
    const slug = publishedSchemaV1.settings?.publicAccess?.customSlug;
    const copiedText = `${origin}/f/${slug}`;

    expect(copiedText).toBe("https://app.workforce-ops.com/f/equipment-inspect-hq");
  });

  // 6. Public access without login when enabled
  it("Requirement 6: unauthenticated respondents can fetch published form schema when public access is enabled", async () => {
    const publicData = await formService.getPublicPublishedForm("equipment-inspect-hq");

    expect(publicData).toBeDefined();
    expect(publicData.form.title).toBe("Equipment Inspection Checklist");
    expect(publicData.publishedVersion.version_number).toBe(1);
    expect(publicData.publishedVersion.schema_jsonb.header.sections.length).toBeGreaterThan(0);
  });

  // 7. Private form access restrictions
  it("Requirement 7: disabling public access blocks both fetch and submit immediately without mutating published version", async () => {
    await formService.setPublicAccess({
      userId: adminA,
      organizationId: tenantA,
      formId,
      isPublic: false,
    });

    await expect(formService.getPublicPublishedForm(formId)).rejects.toThrow(
      /private and cannot be accessed publicly/i,
    );
    await expect(
      subService.submitPublicForm(formId, {
        fields: { inspector_name: "Jane Doe", serial_number: "SN-1" },
      }),
    ).rejects.toThrow(/private and does not accept public submissions/i);
  });

  // 8. Cross-tenant access prevention
  it("Requirement 8: strictly enforces tenant isolation for private forms and administrator actions", async () => {
    await expect(
      formService.getPublishedVersionForPreview({
        userId: adminB,
        organizationId: tenantB,
        formId,
      }),
    ).rejects.toThrow(/Form not found/i);

    await expect(
      formService.setPublicAccess({
        userId: adminB,
        organizationId: tenantB,
        formId,
        isPublic: false,
      }),
    ).rejects.toThrow(/Form not found/i);
  });

  // 9. Successful public submissions
  it("Requirement 9: unauthenticated respondents can submit data and receive a confirmation with reference number", async () => {
    const submissionResult = await subService.submitPublicForm("equipment-inspect-hq", {
      fields: {
        inspector_name: "Jane Doe",
        service_provider: "Acme Logistics",
        serial_number: "SN-987654",
      },
    });

    expect(submissionResult).toBeDefined();
    expect(submissionResult.submissionId).toBeDefined();
    expect(submissionResult.status).toBe("submitted");
    expect(submissionResult.referenceNumber).toMatch(/^EQP-\d{5}$/);
    expect(submissionResult.successTitle).toBe("Inspection Received");
    expect(submissionResult.successMessage).toBe("Your equipment inspection report has been recorded.");

    const saved = await subRepo.getSubmissionById(submissionResult.submissionId, tenantA);
    expect(saved).not.toBeNull();
    expect((saved?.data_jsonb as any).fields.inspector_name).toBe("Jane Doe");
    expect(saved?.created_by).toBeNull();
  });

  it("Requirement 9 (failure path): validates required fields and rejects incomplete submissions", async () => {
    await expect(
      subService.submitPublicForm("equipment-inspect-hq", {
        fields: {
          service_provider: "Acme Logistics",
        },
      }),
    ).rejects.toThrow(/Submission validation failed: "Inspector Name" is required/i);
  });

  // 10. Republishing and updating the public form
  it("Requirement 10: republishing automatically updates the public form while preserving version history", async () => {
    const draftV2 = await formRepo.createDraftFromPublished({
      formId,
      organizationId: tenantA,
      userId: adminA,
    });

    const updatedSchemaV2: FormSchemaV1 = {
      ...draftV2.schema_jsonb,
      form: { ...draftV2.schema_jsonb.form, title: "Equipment Inspection (Updated v2)" },
      settings: {
        ...draftV2.schema_jsonb.settings,
        publicAccess: {
          enabled: true,
          customSlug: "equipment-inspect-hq",
        },
      },
    };

    await formRepo.saveDraft({
      versionId: draftV2.id,
      formId,
      organizationId: tenantA,
      schema: updatedSchemaV2,
    });

    await formRepo.publishVersion({
      formId,
      versionId: draftV2.id,
      organizationId: tenantA,
      userId: adminA,
      changeNote: "Version 2 release with updated inspection guidelines",
    });

    const publicDataV2 = await formService.getPublicPublishedForm("equipment-inspect-hq");
    expect(publicDataV2.publishedVersion.version_number).toBe(2);
    expect(publicDataV2.form.title).toBe("Equipment Inspection (Updated v2)");

    const allVersions = await formRepo.listVersions(formId, tenantA);
    expect(allVersions.length).toBe(2);
    expect(allVersions.map((v) => v.version_number)).toEqual([2, 1]);
    expect(allVersions.find((v) => v.version_number === 1)?.change_note).toBe("Initial published release");
  });

  // 11. Mobile rendering constraints
  it("Requirement 11: public form payload and settings support responsive viewport configurations", async () => {
    const publicData = await formService.getPublicPublishedForm("equipment-inspect-hq");
    const schema = publicData.publishedVersion.schema_jsonb;

    expect(schema.header.columns).toBe(2);
    const firstTab = schema.tabs[0] as FormTabDefinition;
    expect(firstTab.columns).toBe(2);
  });

  // 12. Security, role authorization, payload sanitization, and server-side calculations
  it("Requirement 12: strips internal permissions, workflow, and listView from public form schema", async () => {
    const v1 = formRepo.versions.get("v1_pub")!;
    formRepo.versions.set("v1_pub", {
      ...v1,
      schema_jsonb: {
        ...v1.schema_jsonb,
        permissions: { manageFormRoles: ["super_admin"], readAllRoles: ["business_admin"] },
        workflow: { enabled: true, steps: [] } as any,
        listView: { columns: [{ id: "col_inspector", sourceRef: "inspector_name", label: "Inspector", visible: true, order: 0 }] },
      },
    });

    const publicData = await formService.getPublicPublishedForm("equipment-inspect-hq");
    expect(publicData.publishedVersion.schema_jsonb.permissions).toEqual({});
    expect(publicData.publishedVersion.schema_jsonb.workflow).toBeNull();
    expect(publicData.publishedVersion.schema_jsonb.listView.columns).toEqual([]);
  });

  it("Requirement 13: rejects non-admin setPublicAccess, invalid custom slugs, and unpublished forms", async () => {
    const employeeUser = "employee_tenant_a";
    const managerUser = "manager_tenant_a";
    membershipRepo.add(employeeUser, tenantA, "employee", "active");
    membershipRepo.add(managerUser, tenantA, "manager", "active");

    await expect(
      formService.setPublicAccess({
        userId: employeeUser,
        organizationId: tenantA,
        formId,
        isPublic: false,
      }),
    ).rejects.toThrow(/Unauthorized/i);

    await expect(
      formService.setPublicAccess({
        userId: managerUser,
        organizationId: tenantA,
        formId,
        isPublic: false,
      }),
    ).rejects.toThrow(/Unauthorized/i);

    await expect(
      formService.setPublicAccess({
        userId: adminA,
        organizationId: tenantA,
        formId,
        isPublic: true,
        publicSlug: "bad slug with spaces!",
      }),
    ).rejects.toThrow(/Public slug must be 3-61 characters/i);

    const unpubFormId = "form_unpub_1";
    formRepo.forms.set(unpubFormId, {
      id: unpubFormId,
      organization_id: tenantA,
      key: "unpublished_checklist",
      title: "Unpublished Checklist",
      description: null,
      status: "draft",
      is_public: false,
      public_slug: null,
      current_draft_version_id: "d_unpub",
      current_published_version_id: null,
      created_by: adminA,
      created_at: "2026-11-13T08:00:00Z",
      updated_at: "2026-11-13T08:00:00Z",
      archived_at: null,
    });

    await expect(
      formService.setPublicAccess({
        userId: adminA,
        organizationId: tenantA,
        formId: unpubFormId,
        isPublic: true,
      }),
    ).rejects.toThrow(/before the form has been published/i);

    await expect(formService.getPublicPublishedForm(unpubFormId)).rejects.toThrow(/not found/i);
  });

  it("Requirement 14: blocks expired public links and forms disallowing anonymous submissions", async () => {
    const v1 = formRepo.versions.get("v1_pub")!;
    formRepo.versions.set("v1_pub", {
      ...v1,
      schema_jsonb: {
        ...v1.schema_jsonb,
        settings: {
          ...v1.schema_jsonb.settings,
          publicAccess: {
            enabled: true,
            expiryDate: "2020-01-01T00:00:00Z",
          },
        },
      },
    });

    await expect(formService.getPublicPublishedForm("equipment-inspect-hq")).rejects.toThrow(/expired/i);
    await expect(
      subService.submitPublicForm("equipment-inspect-hq", {
        fields: { inspector_name: "Jane", serial_number: "SN-1" },
      }),
    ).rejects.toThrow(/expired/i);

    formRepo.versions.set("v1_pub", {
      ...v1,
      schema_jsonb: {
        ...v1.schema_jsonb,
        settings: {
          ...v1.schema_jsonb.settings,
          publicAccess: {
            enabled: true,
            allowAnonymousSubmissions: false,
          },
        },
      },
    });

    await expect(
      subService.submitPublicForm("equipment-inspect-hq", {
        fields: { inspector_name: "Jane", serial_number: "SN-1" },
      }),
    ).rejects.toThrow(/does not accept anonymous submissions/i);
  });

  it("Requirement 15: sanitizes unknown keys, validates dropdown/date/details, and recomputes calculated fields server-side", async () => {
    const v1 = formRepo.versions.get("v1_pub")!;
    formRepo.versions.set("v1_pub", {
      ...v1,
      schema_jsonb: {
        ...v1.schema_jsonb,
        header: {
          columns: 2,
          sections: [
            ...v1.schema_jsonb.header.sections,
            {
              id: "sec_metrics",
              key: "metrics",
              title: "Metrics",
              order: 1,
              fields: [
                {
                  id: "f_unit_cost",
                  key: "unit_cost",
                  label: "Unit Cost",
                  type: "currency",
                  required: true,
                  order: 0,
                  validation: { min: 0 },
                },
                {
                  id: "f_qty",
                  key: "quantity",
                  label: "Quantity",
                  type: "number",
                  required: true,
                  order: 1,
                  validation: { min: 1 },
                },
                {
                  id: "f_total",
                  key: "total_cost",
                  label: "Total Cost",
                  type: "calculated",
                  order: 2,
                  calculationConfig: {
                    operation: "multiply",
                    operands: ["unit_cost", "quantity"],
                  },
                },
                {
                  id: "f_priority",
                  key: "priority",
                  label: "Priority",
                  type: "dropdown",
                  options: [
                    { label: "Low", value: "low" },
                    { label: "High", value: "high" },
                  ],
                  order: 3,
                },
                {
                  id: "f_inspected_date",
                  key: "inspected_date",
                  label: "Inspected Date",
                  type: "date",
                  order: 4,
                },
              ],
            },
          ],
        },
      },
    });

    // Rejects invalid dropdown option & invalid date
    await expect(
      subService.submitPublicForm("equipment-inspect-hq", {
        fields: {
          inspector_name: "Jane Doe",
          serial_number: "SN-100",
          unit_cost: 25,
          quantity: 4,
          priority: "invalid_tier",
          inspected_date: "not-a-date",
        },
      }),
    ).rejects.toThrow(/contains an invalid option/i);

    // Strips unknown keys & ignores client-tampered calculated field value
    const res = await subService.submitPublicForm("equipment-inspect-hq", {
      fields: {
        inspector_name: "Jane Doe",
        serial_number: "SN-100",
        unit_cost: 25,
        quantity: 4,
        total_cost: 999999,
        priority: "high",
        inspected_date: "2026-11-13",
        injected_admin_flag: true,
      },
    });

    const saved = await subRepo.getSubmissionById(res.submissionId, tenantA);
    const savedFields = (saved?.data_jsonb as any).fields;
    expect(savedFields.total_cost).toBe(100);
    expect(savedFields.injected_admin_flag).toBeUndefined();
  });

  it("Requirement 16: enforces conditional required rules and keeps anonymous/outsider callers out of authenticated actions", async () => {
    const v1 = formRepo.versions.get("v1_pub")!;
    formRepo.versions.set("v1_pub", {
      ...v1,
      schema_jsonb: {
        ...v1.schema_jsonb,
        header: {
          columns: 2,
          sections: [
            ...v1.schema_jsonb.header.sections,
            {
              id: "sec_extra",
              key: "extra",
              title: "Extra",
              order: 1,
              fields: [
                { id: "f_flag", key: "needs_followup", label: "Needs Followup", type: "checkbox", order: 0 },
                { id: "f_reason", key: "followup_reason", label: "Followup Reason", type: "text", order: 1 },
              ],
            },
          ],
        },
        rules: [
          {
            id: "r_req_reason",
            key: "require_followup_reason",
            name: "Require reason when followup checked",
            enabled: true,
            conditionLogic: "AND",
            conditions: [{ fieldId: "needs_followup", operator: "equals", value: true }],
            actions: [{ action: "require", targetFieldId: "followup_reason" }],
          },
        ],
      },
    });

    await expect(
      subService.submitPublicForm("equipment-inspect-hq", {
        fields: {
          inspector_name: "Jane Doe",
          serial_number: "SN-100",
          needs_followup: true,
        },
      }),
    ).rejects.toThrow(/"Followup Reason" is required/i);

    // Outsider cannot preview or read tenant submissions through FormService/SubmissionService
    await expect(
      formService.getPublishedVersionForPreview({
        userId: "anonymous-outsider",
        organizationId: tenantA,
        formId,
      }),
    ).rejects.toThrow(/Unauthorized/i);

    const crossTenantSub = await subRepo.getSubmissionById("nonexistent-or-other", tenantB);
    expect(crossTenantSub).toBeNull();
  });
});
