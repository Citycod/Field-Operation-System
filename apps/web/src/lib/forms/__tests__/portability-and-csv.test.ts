import { describe, expect, it } from 'vitest';
import type { FormSchemaV1 } from '@field/form-engine';
import type { OrganizationMembership, PlatformRole } from '@field/types';
import {
  MAX_FORM_IMPORT_BYTES,
  buildFormExportEnvelope,
  parseAndValidateImportPayload,
} from '../portability';
import { buildSubmissionsCsv, escapeCsvCell } from '../csv-export';
import { FormService } from '@/lib/services/form-service';
import { SubmissionService } from '@/lib/services/submission-service';
import type {
  FormEntity,
  FormListItem,
  FormRepository,
  FormVersionEntity,
} from '@/lib/repositories/form-repository';
import type { MembershipRepository } from '@/lib/repositories/membership-repository';
import type {
  FormSubmissionEntity,
  PaginatedSubmissionsResult,
  SubmissionDetailRowEntity,
  SubmissionFilterParams,
  SubmissionRepository,
} from '@/lib/repositories/submission-repository';

function createValidSchema(overrides?: Partial<FormSchemaV1>): FormSchemaV1 {
  return {
    schemaVersion: 1,
    form: {
      id: 'form_orig',
      key: 'purchase_req',
      title: 'Purchase Request',
      description: 'Order goods',
      schemaVersion: 1,
    },
    header: {
      columns: 2,
      sections: [
        {
          id: 'sec_h',
          key: 'req_header',
          title: 'Request Info',
          order: 0,
          fields: [
            {
              id: 'f_vendor',
              key: 'vendor_name',
              label: 'Vendor Name',
              type: 'text',
              order: 0,
              required: true,
            },
            {
              id: 'f_amount',
              key: 'total_amount',
              label: 'Total Amount',
              type: 'currency',
              order: 1,
            },
          ],
        },
      ],
    },
    tabs: [
      {
        id: 'tab_main',
        key: 'main',
        title: 'Main',
        type: 'form',
        order: 0,
        sections: [],
      },
    ],
    rules: [],
    workflow: null,
    listView: {
      columns: [
        { id: 'col_ref', sourceRef: 'system.reference_number', label: 'Ref #', order: 0 },
        { id: 'col_vendor', sourceRef: 'vendor_name', label: 'Vendor', order: 1 },
        { id: 'col_amount', sourceRef: 'total_amount', label: 'Total', order: 2 },
      ],
    },
    permissions: {},
    settings: {
      publicAccess: {
        enabled: true,
        customSlug: 'old-org-slug',
      },
    },
    ...overrides,
  };
}

class InMemoryMembershipRepo implements MembershipRepository {
  private map = new Map<string, PlatformRole>();
  set(userId: string, orgId: string, role: PlatformRole) {
    this.map.set(`${userId}:${orgId}`, role);
  }
  async findByUserId(): Promise<OrganizationMembership[]> {
    return [];
  }
  async findUserMembershipInOrg(userId: string, orgId: string): Promise<OrganizationMembership | null> {
    const role = this.map.get(`${userId}:${orgId}`);
    if (!role) return null;
    return {
      id: `mem_${userId}_${orgId}`,
      organization_id: orgId,
      user_id: userId,
      role_key: role,
      status: 'active',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  }
  async getRoster(): Promise<any[]> {
    return [];
  }
  async manageMembership(): Promise<any> {
    throw new Error('Not implemented');
  }
}

class InMemoryFormRepo implements FormRepository {
  forms = new Map<string, FormEntity>();
  versions = new Map<string, FormVersionEntity[]>();
  private seq = 0;

  async listForms(orgId: string): Promise<FormListItem[]> {
    return Array.from(this.forms.values())
      .filter((f) => f.organization_id === orgId)
      .map((f) => ({ ...f, draft_version_number: 1, published_version_number: null }));
  }

  async createForm(params: {
    organizationId: string;
    key: string;
    title: string;
    description?: string;
    createdBy: string;
    initialSchema: FormSchemaV1;
  }): Promise<{ form: FormEntity; version: FormVersionEntity }> {
    this.seq += 1;
    const now = new Date().toISOString();
    const formId = `form_${this.seq}`;
    const verId = `ver_${this.seq}`;
    const form: FormEntity = {
      id: formId,
      organization_id: params.organizationId,
      key: params.key,
      title: params.title,
      description: params.description ?? null,
      status: 'active',
      current_draft_version_id: verId,
      current_published_version_id: null,
      created_by: params.createdBy,
      created_at: now,
      updated_at: now,
      archived_at: null,
    };
    const version: FormVersionEntity = {
      id: verId,
      organization_id: params.organizationId,
      form_id: formId,
      version_number: 1,
      status: 'draft',
      schema_version: 1,
      schema_jsonb: params.initialSchema,
      change_note: null,
      created_by: params.createdBy,
      created_at: now,
      published_by: null,
      published_at: null,
    };
    this.forms.set(formId, form);
    this.versions.set(formId, [version]);
    return { form, version };
  }

  async getFormById(id: string, orgId: string): Promise<FormEntity | null> {
    const f = this.forms.get(id);
    return f && f.organization_id === orgId ? f : null;
  }
  async getFormByKey(): Promise<FormEntity | null> {
    return null;
  }
  async getDraftVersion(formId: string, orgId: string): Promise<FormVersionEntity | null> {
    return (this.versions.get(formId) || []).find(
      (v) => v.organization_id === orgId && v.status === 'draft',
    ) ?? null;
  }
  async getPublishedVersion(formId: string, orgId: string): Promise<FormVersionEntity | null> {
    return (this.versions.get(formId) || []).find(
      (v) => v.organization_id === orgId && v.status === 'published',
    ) ?? null;
  }
  async getVersionById(versionId: string, orgId: string): Promise<FormVersionEntity | null> {
    for (const list of this.versions.values()) {
      const found = list.find((v) => v.id === versionId && v.organization_id === orgId);
      if (found) return found;
    }
    return null;
  }
  async saveDraft(params: {
    versionId: string;
    formId: string;
    organizationId: string;
    schema: FormSchemaV1;
    changeNote?: string;
  }): Promise<FormVersionEntity> {
    const list = this.versions.get(params.formId) || [];
    const target = list.find(
      (v) => v.id === params.versionId && v.organization_id === params.organizationId,
    )!;
    target.schema_jsonb = params.schema;
    target.change_note = params.changeNote ?? null;
    return target;
  }
  async publishVersion(): Promise<void> {}
  async listVersions(formId: string, orgId: string): Promise<FormVersionEntity[]> {
    return (this.versions.get(formId) || []).filter((v) => v.organization_id === orgId);
  }
  async createDraftFromPublished(): Promise<any> {
    throw new Error('Not implemented');
  }
  async getPublicForm(): Promise<any> {
    return null;
  }
  async setFormPublicAccess(): Promise<any> {
    throw new Error('Not implemented');
  }
}

class InMemorySubmissionRepo implements SubmissionRepository {
  submissions: FormSubmissionEntity[] = [];
  async createSubmission(): Promise<any> {
    throw new Error('Not implemented');
  }
  async getSubmissionById(): Promise<FormSubmissionEntity | null> {
    return null;
  }
  async getSubmissionDetailRows(): Promise<SubmissionDetailRowEntity[]> {
    return [];
  }
  async listSubmissions(params: SubmissionFilterParams): Promise<PaginatedSubmissionsResult> {
    const filtered = this.submissions.filter((s) => {
      if (s.organization_id !== params.organizationId) return false;
      if (params.formId && s.form_id !== params.formId) return false;
      if (params.createdOrSubmittedBy) {
        const owner = s.submitted_by || s.created_by;
        if (owner !== params.createdOrSubmittedBy) return false;
      }
      return true;
    });
    return {
      submissions: filtered,
      totalCount: filtered.length,
      page: 1,
      pageSize: 100,
      totalPages: filtered.length ? 1 : 0,
    };
  }
}

describe('Phase 8 — Form Portability & CSV Export', () => {
  describe('portability.ts', () => {
    it('exports sanitized envelope excluding secrets, customSlug, and foreign org IDs', () => {
      const schemaWithSecrets = createValidSchema() as any;
      schemaWithSecrets.organizationId = 'foreign-org-id';
      schemaWithSecrets.secrets = { webhookToken: 'secret-123' };

      const envelope = buildFormExportEnvelope({
        formKey: 'purchase_req',
        formTitle: 'Purchase Request',
        formDescription: 'Order goods',
        versionNumber: 2,
        schemaVersion: 1,
        status: 'published',
        schema: schemaWithSecrets,
      });

      expect(envelope.exportFormatVersion).toBe(1);
      expect((envelope.schema as any).organizationId).toBeUndefined();
      expect((envelope.schema as any).secrets).toBeUndefined();
      expect(envelope.schema.settings.publicAccess?.customSlug).toBeUndefined();
    });

    it('rejects malformed JSON, unsupported schemaVersion, oversized files, broken refs, and unsafe endpoints', () => {
      expect(() => parseAndValidateImportPayload('{bad json')).toThrow('MALFORMED_JSON');

      expect(() =>
        parseAndValidateImportPayload({ ...createValidSchema(), schemaVersion: 2 }),
      ).toThrow('UNSUPPORTED_SCHEMA_VERSION');

      const hugeString = 'x'.repeat(MAX_FORM_IMPORT_BYTES + 10);
      expect(() => parseAndValidateImportPayload(hugeString)).toThrow('IMPORT_TOO_LARGE');

      const brokenRefSchema = createValidSchema({
        rules: [
          {
            id: 'r1',
            key: 'broken_rule',
            name: 'Broken Rule',
            enabled: true,
            conditionLogic: 'AND',
            conditions: [{ id: 'c1', fieldId: 'nonexistent_field', operator: 'isNotEmpty' }],
            actions: [{ id: 'a1', targetFieldId: 'f_vendor', action: 'require' }],
          },
        ],
      });
      expect(() => parseAndValidateImportPayload(brokenRefSchema)).toThrow(
        'IMPORT_BROKEN_REFERENCES',
      );

      const unsafeLookupSchema = createValidSchema();
      unsafeLookupSchema.header.sections[0].fields.push({
        id: 'f_api',
        key: 'external_lookup',
        label: 'External Lookup',
        type: 'lookup',
        order: 2,
        lookupConfig: {
          sourceType: 'api',
          targetEntity: 'ext_api',
          displayField: 'name',
          valueField: 'id',
          apiEndpoint: 'http://169.254.169.254/latest/meta-data',
        },
      });
      expect(() => parseAndValidateImportPayload(unsafeLookupSchema)).toThrow(
        'UNSAFE_EXTERNAL_REFERENCE',
      );
    });
  });

  describe('csv-export.ts', () => {
    it('neutralizes CSV formula injection and escapes commas/quotes safely', () => {
      expect(escapeCsvCell('=SUM(A1:A2)')).toBe("'=SUM(A1:A2)");
      expect(escapeCsvCell('+cmd|calc')).toBe("'+cmd|calc");
      expect(escapeCsvCell('-2+3')).toBe("'-2+3");
      expect(escapeCsvCell('@SUM(1,2)')).toBe('"\'@SUM(1,2)"');
      expect(escapeCsvCell('\tmalicious')).toBe("'\tmalicious");
      expect(escapeCsvCell('Acme, "Inc."')).toBe('"Acme, ""Inc."""');
    });

    it('builds CSV using configured listView columns and escapes cell payloads', () => {
      const schema = createValidSchema();
      const result = buildSubmissionsCsv({
        form: { id: 'f1', key: 'purchase_req', title: 'Purchase Request' },
        schema,
        submissions: [
          {
            id: 'sub1',
            organization_id: 'orgA',
            form_id: 'f1',
            form_version_id: 'v1',
            reference_number: 'PR-001',
            status: 'approved',
            data_jsonb: {
              fields: { vendor_name: '=HYPERLINK("http://evil")', total_amount: 450 },
            },
            created_by: 'user1',
            submitted_by: 'user1',
            created_at: '2026-11-27T01:00:00Z',
            updated_at: '2026-11-27T01:00:00Z',
            submitted_at: '2026-11-27T01:00:00Z',
            completed_at: null,
          },
        ],
      });

      expect(result.fileName).toBe('purchase_req_submissions.csv');
      expect(result.rowCount).toBe(1);
      const lines = result.csv.split('\r\n');
      expect(lines[0]).toContain('Ref #,Vendor,Total');
      expect(lines[1]).toContain('PR-001');
      expect(lines[1]).toContain('"\'=HYPERLINK(""http://evil"")"');
    });
  });

  describe('Service Integration — Import, Export & CSV Isolation', () => {
    const orgA = 'org-a';
    const orgB = 'org-b';
    const adminA = 'user-admin-a';
    const employeeA = 'user-emp-a';
    const employeeB = 'user-emp-b';

    it('imports valid V1 form as Draft in current org, replaces foreign org IDs, and enforces admin permissions', async () => {
      const memberRepo = new InMemoryMembershipRepo();
      memberRepo.set(adminA, orgA, 'business_admin');
      memberRepo.set(employeeA, orgA, 'employee');

      const formRepo = new InMemoryFormRepo();
      const formService = new FormService(formRepo, memberRepo);

      const foreignEnvelope = {
        exportFormatVersion: 1,
        organizationId: orgB,
        form: { key: 'foreign_form', title: 'Imported Inspection', description: 'Checklist' },
        schema: {
          ...createValidSchema(),
          organizationId: orgB,
        },
      };

      // Employee cannot import forms
      await expect(
        formService.importFormDefinition({
          userId: employeeA,
          organizationId: orgA,
          rawPayload: foreignEnvelope,
        }),
      ).rejects.toThrow('Unauthorized:');

      // Business Admin imports -> creates Draft v1 in orgA
      const imported = await formService.importFormDefinition({
        userId: adminA,
        organizationId: orgA,
        rawPayload: foreignEnvelope,
      });

      expect(imported.form.organization_id).toBe(orgA);
      expect(imported.version.organization_id).toBe(orgA);
      expect(imported.version.status).toBe('draft');
      expect(imported.version.version_number).toBe(1);
      expect(imported.version.schema_jsonb.form.id).toBe(imported.form.id);
      expect(imported.version.schema_jsonb.settings.publicAccess?.enabled).toBe(false);

      // Export version scoped to orgA works, orgB denied
      const exported = await formService.exportFormVersion({
        userId: adminA,
        organizationId: orgA,
        formId: imported.form.id,
        versionId: imported.version.id,
      });
      expect(exported.envelope.form.title).toBe('Imported Inspection');

      await expect(
        formService.exportFormVersion({
          userId: employeeB,
          organizationId: orgB,
          formId: imported.form.id,
          versionId: imported.version.id,
        }),
      ).rejects.toThrow('Unauthorized:');
    });

    it('exports only authorized CSV rows per tenant and role permissions', async () => {
      const memberRepo = new InMemoryMembershipRepo();
      memberRepo.set(adminA, orgA, 'business_admin');
      memberRepo.set(employeeA, orgA, 'employee');
      memberRepo.set(employeeB, orgB, 'business_admin');

      const formRepo = new InMemoryFormRepo();
      const created = await formRepo.createForm({
        organizationId: orgA,
        key: 'expense_form',
        title: 'Expense Form',
        createdBy: adminA,
        initialSchema: createValidSchema(),
      });
      created.version.status = 'published';

      const subRepo = new InMemorySubmissionRepo();
      subRepo.submissions.push(
        {
          id: 'sub-emp-a',
          organization_id: orgA,
          form_id: created.form.id,
          form_version_id: created.version.id,
          reference_number: 'EXP-001',
          status: 'submitted',
          data_jsonb: { fields: { vendor_name: 'EmpA Vendor', total_amount: 100 } },
          created_by: employeeA,
          submitted_by: employeeA,
          created_at: '2026-11-27T01:00:00Z',
          updated_at: '2026-11-27T01:00:00Z',
          submitted_at: '2026-11-27T01:00:00Z',
          completed_at: null,
        },
        {
          id: 'sub-admin-a',
          organization_id: orgA,
          form_id: created.form.id,
          form_version_id: created.version.id,
          reference_number: 'EXP-002',
          status: 'approved',
          data_jsonb: { fields: { vendor_name: 'AdminA Vendor', total_amount: 500 } },
          created_by: adminA,
          submitted_by: adminA,
          created_at: '2026-11-27T02:00:00Z',
          updated_at: '2026-11-27T02:00:00Z',
          submitted_at: '2026-11-27T02:00:00Z',
          completed_at: null,
        },
      );

      const subService = new SubmissionService(formRepo, subRepo, memberRepo);

      // Employee with readOwn only sees own submission in CSV
      const empCsv = await subService.exportSubmissionsCsv({
        userId: employeeA,
        organizationId: orgA,
        formId: created.form.id,
      });
      expect(empCsv.rowCount).toBe(1);
      expect(empCsv.csv).toContain('EXP-001');
      expect(empCsv.csv).not.toContain('EXP-002');

      // Admin sees all org submissions in CSV
      const adminCsv = await subService.exportSubmissionsCsv({
        userId: adminA,
        organizationId: orgA,
        formId: created.form.id,
      });
      expect(adminCsv.rowCount).toBe(2);

      // Cross-tenant admin in orgB cannot export orgA form CSV
      await expect(
        subService.exportSubmissionsCsv({
          userId: employeeB,
          organizationId: orgB,
          formId: created.form.id,
        }),
      ).rejects.toThrow('not found');
    });
  });
});
