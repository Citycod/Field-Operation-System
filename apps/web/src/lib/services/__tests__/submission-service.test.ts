import { describe, it, expect, beforeEach } from 'vitest';
import { SubmissionService } from '../submission-service';
import type {
  FormRepository,
  FormEntity,
  FormVersionEntity,
  FormListItem,
} from '../../repositories/form-repository';
import type {
  SubmissionRepository,
  FormSubmissionEntity,
  SubmissionDetailRowEntity,
  SubmissionFilterParams,
  PaginatedSubmissionsResult,
} from '../../repositories/submission-repository';
import type { MembershipRepository } from '../../repositories/membership-repository';
import type { OrganizationMembership, PlatformRole } from '@field/types';
import type { FormSchemaV1 } from '@field/form-engine';

class MockMembershipRepository implements MembershipRepository {
  private memberships = new Map<string, { role_key: PlatformRole; status: 'active' | 'invited' | 'disabled' }>();

  add(userId: string, orgId: string, role_key: PlatformRole = 'business_admin', status: 'active' | 'invited' | 'disabled' = 'active') {
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
    throw new Error('Not implemented in mock');
  }
}

class MockFormRepository implements FormRepository {
  public forms = new Map<string, FormEntity>();
  public versions = new Map<string, FormVersionEntity[]>();

  async listForms(organizationId: string): Promise<FormListItem[]> {
    return Array.from(this.forms.values())
      .filter((f) => f.organization_id === organizationId && !f.archived_at)
      .map((f) => {
        const vers = this.versions.get(f.id) || [];
        const draft = vers.find((v) => v.status === 'draft')?.version_number ?? null;
        const pub = vers.find((v) => v.status === 'published')?.version_number ?? null;
        return { ...f, draft_version_number: draft, published_version_number: pub };
      });
  }

  async createForm(): Promise<any> {
    throw new Error('Not implemented');
  }

  async getFormById(id: string, organizationId: string): Promise<FormEntity | null> {
    const f = this.forms.get(id);
    if (!f || f.organization_id !== organizationId) return null;
    return f;
  }

  async getFormByKey(key: string, organizationId: string): Promise<FormEntity | null> {
    for (const f of this.forms.values()) {
      if (f.key === key && f.organization_id === organizationId) return f;
    }
    return null;
  }

  async getDraftVersion(formId: string, organizationId: string): Promise<FormVersionEntity | null> {
    const vers = this.versions.get(formId) || [];
    return vers.find((v) => v.organization_id === organizationId && v.status === 'draft') ?? null;
  }

  async getPublishedVersion(formId: string, organizationId: string): Promise<FormVersionEntity | null> {
    const vers = this.versions.get(formId) || [];
    return (
      vers
        .filter((v) => v.organization_id === organizationId && v.status === 'published')
        .sort((a, b) => b.version_number - a.version_number)[0] ?? null
    );
  }

  async getVersionById(versionId: string, organizationId: string): Promise<FormVersionEntity | null> {
    for (const vers of this.versions.values()) {
      const found = vers.find((v) => v.id === versionId && v.organization_id === organizationId);
      if (found) return found;
    }
    return null;
  }

  async saveDraft(): Promise<any> {
    throw new Error('Not implemented');
  }

  async publishVersion(): Promise<any> {
    throw new Error('Not implemented');
  }

  async listVersions(formId: string, organizationId: string): Promise<FormVersionEntity[]> {
    const vers = this.versions.get(formId) || [];
    return vers.filter((v) => v.organization_id === organizationId);
  }

  async createDraftFromPublished(): Promise<any> {
    throw new Error('Not implemented');
  }

  async getPublicForm(slugOrId: string): Promise<any> {
    for (const f of this.forms.values()) {
      if (f.id === slugOrId || f.key === slugOrId) {
        const vers = this.versions.get(f.id) || [];
        const pub = vers.find((v) => v.status === 'published');
        if (pub) return { form: f, publishedVersion: pub };
      }
    }
    return null;
  }

  async setFormPublicAccess(): Promise<any> {
    throw new Error('Not implemented');
  }
}

class MockSubmissionRepository implements SubmissionRepository {
  public submissions = new Map<string, FormSubmissionEntity>();
  public detailRows = new Map<string, SubmissionDetailRowEntity[]>();

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

    if (params.detailRows && params.detailRows.length > 0) {
      const rows: SubmissionDetailRowEntity[] = params.detailRows.map((r, i) => ({
        id: `row_${id}_${i}`,
        organization_id: params.organizationId,
        submission_id: id,
        tab_id: r.tabId,
        row_order: r.rowOrder,
        data_jsonb: r.dataJsonb,
        created_by: params.createdBy ?? null,
        created_at: now,
        updated_at: now,
        deleted_at: null,
      }));
      this.detailRows.set(id, rows);
    }

    return entity;
  }

  async getSubmissionById(id: string, organizationId: string): Promise<FormSubmissionEntity | null> {
    const sub = this.submissions.get(id);
    if (!sub || sub.organization_id !== organizationId) return null;
    return sub;
  }

  async getSubmissionDetailRows(
    submissionId: string,
    organizationId: string,
  ): Promise<SubmissionDetailRowEntity[]> {
    const rows = this.detailRows.get(submissionId) ?? [];
    return rows.filter((r) => r.organization_id === organizationId && r.deleted_at === null);
  }

  async listSubmissions(params: SubmissionFilterParams): Promise<PaginatedSubmissionsResult> {
    const page = Math.max(1, params.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 20));

    if (Array.isArray(params.authorizedFormIds) && params.authorizedFormIds.length === 0) {
      return {
        submissions: [],
        totalCount: 0,
        page,
        pageSize,
        totalPages: 0,
      };
    }

    let list = Array.from(this.submissions.values()).filter(
      (s) => s.organization_id === params.organizationId,
    );

    if (params.formId) {
      list = list.filter((s) => s.form_id === params.formId);
    }

    if (Array.isArray(params.authorizedFormIds) && params.authorizedFormIds.length > 0) {
      const allowed = new Set(params.authorizedFormIds);
      list = list.filter((s) => allowed.has(s.form_id));
    }

    if (params.status) {
      list = list.filter((s) => s.status === params.status);
    }

    if (params.referenceNumber && params.referenceNumber.trim().length > 0) {
      const q = params.referenceNumber.trim().toLowerCase();
      list = list.filter((s) => s.reference_number?.toLowerCase().includes(q));
    }

    if (params.dateFrom) {
      const fromTime = Date.parse(params.dateFrom);
      list = list.filter((s) => Date.parse(s.created_at) >= fromTime);
    }

    if (params.dateTo) {
      const toTime = Date.parse(params.dateTo);
      list = list.filter((s) => Date.parse(s.created_at) <= toTime);
    }

    if (params.createdOrSubmittedBy) {
      list = list.filter(
        (s) =>
          s.created_by === params.createdOrSubmittedBy ||
          s.submitted_by === params.createdOrSubmittedBy,
      );
    }

    const sortField = params.sortBy ?? 'created_at';
    const ascending = params.sortOrder === 'asc';

    list.sort((a, b) => {
      const valA = (a as any)[sortField] ?? '';
      const valB = (b as any)[sortField] ?? '';
      if (valA < valB) return ascending ? -1 : 1;
      if (valA > valB) return ascending ? 1 : -1;
      return a.id.localeCompare(b.id);
    });

    const totalCount = list.length;
    const totalPages = totalCount > 0 ? Math.ceil(totalCount / pageSize) : 0;
    const offset = (page - 1) * pageSize;

    return {
      submissions: list.slice(offset, offset + pageSize),
      totalCount,
      page,
      pageSize,
      totalPages,
    };
  }
}

describe('Authenticated Submissions Service & Repository Suite', () => {
  const tenantA = '11111111-1111-4111-a111-111111111111';
  const tenantB = '22222222-2222-4222-b222-222222222222';

  const adminUser = 'usr_admin_001';
  const managerUser = 'usr_manager_001';
  const employeeUser = 'usr_employee_001';
  const otherEmployeeUser = 'usr_employee_002';
  const disabledUser = 'usr_disabled_001';

  const formEquipmentId = 'form_equipment_inspection_uuid';
  const formIncidentId = 'form_incident_report_uuid';
  const formVersionEquipmentV1 = 'ver_equip_v1';
  const formVersionEquipmentV2 = 'ver_equip_v2';
  const formVersionIncidentV1 = 'ver_incident_v1';

  let membershipRepo: MockMembershipRepository;
  let formRepo: MockFormRepository;
  let submissionRepo: MockSubmissionRepository;
  let service: SubmissionService;

  const equipmentSchemaV1: FormSchemaV1 = {
    schemaVersion: 1,
    form: {
      id: formEquipmentId,
      key: 'equipment_inspection',
      title: 'Equipment Inspection',
      schemaVersion: 1,
    },
    header: {
      columns: 2,
      sections: [
        {
          id: 'sec_1',
          key: 'sec_1',
          title: 'General',
          order: 0,
          fields: [
            {
              id: 'f_equip_name',
              key: 'equipment_name',
              label: 'Equipment Name',
              type: 'text',
              order: 0,
              required: true,
            },
            {
              id: 'f_rating',
              key: 'rating',
              label: 'Condition Rating',
              type: 'number',
              order: 1,
              required: false,
            },
          ],
        },
      ],
    },
    tabs: [
      {
        id: 'tab_parts',
        key: 'parts',
        title: 'Inspected Parts',
        type: 'details',
        order: 0,
        configuration: {
          columns: [
            { id: 'col_1', key: 'part_name', label: 'Part Name', type: 'text', required: true, order: 0 },
            { id: 'col_2', key: 'cost', label: 'Cost', type: 'currency', required: false, order: 1 },
          ],
        },
      },
    ],
    rules: [],
    workflow: null,
    listView: { columns: [] },
    permissions: {
      readAllRoles: ['super_admin', 'business_admin', 'manager'],
      readOwnRoles: ['super_admin', 'business_admin', 'manager', 'employee'],
    },
    settings: {},
  };

  const incidentSchemaRestrictedV1: FormSchemaV1 = {
    schemaVersion: 1,
    form: {
      id: formIncidentId,
      key: 'incident_report',
      title: 'Confidential Incident Report',
      schemaVersion: 1,
    },
    header: {
      columns: 2,
      sections: [
        {
          id: 'sec_inc',
          key: 'sec_inc',
          title: 'Details',
          order: 0,
          fields: [
            { id: 'f_desc', key: 'description', label: 'Description', type: 'textarea', order: 0, required: true },
          ],
        },
      ],
    },
    tabs: [],
    rules: [],
    workflow: null,
    listView: { columns: [] },
    permissions: {
      readAllRoles: ['super_admin', 'business_admin'], // Manager excluded from readAll
      readOwnRoles: ['super_admin', 'business_admin'], // Employee excluded completely
    },
    settings: {},
  };

  beforeEach(() => {
    membershipRepo = new MockMembershipRepository();
    formRepo = new MockFormRepository();
    submissionRepo = new MockSubmissionRepository();
    service = new SubmissionService(formRepo, submissionRepo, membershipRepo);

    // Setup active tenant memberships
    membershipRepo.add(adminUser, tenantA, 'business_admin', 'active');
    membershipRepo.add(managerUser, tenantA, 'manager', 'active');
    membershipRepo.add(employeeUser, tenantA, 'employee', 'active');
    membershipRepo.add(otherEmployeeUser, tenantA, 'employee', 'active');
    membershipRepo.add(disabledUser, tenantA, 'employee', 'disabled');

    // Tenant B memberships
    membershipRepo.add(adminUser, tenantB, 'business_admin', 'active');

    // Setup Form 1: Equipment Inspection
    const formEquip: FormEntity = {
      id: formEquipmentId,
      organization_id: tenantA,
      key: 'equipment_inspection',
      title: 'Equipment Inspection',
      description: 'Routine equipment check',
      status: 'active',
      current_draft_version_id: null,
      current_published_version_id: formVersionEquipmentV2,
      created_by: adminUser,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-02T00:00:00.000Z',
      archived_at: null,
    };
    formRepo.forms.set(formEquipmentId, formEquip);

    // Version 1 (historical snapshot)
    const verEquipV1: FormVersionEntity = {
      id: formVersionEquipmentV1,
      organization_id: tenantA,
      form_id: formEquipmentId,
      version_number: 1,
      status: 'archived',
      schema_version: 1,
      schema_jsonb: equipmentSchemaV1,
      change_note: 'Initial release',
      created_by: adminUser,
      created_at: '2026-01-01T00:00:00.000Z',
      published_by: adminUser,
      published_at: '2026-01-01T00:00:00.000Z',
    };

    // Version 2 (latest published)
    const verEquipV2: FormVersionEntity = {
      id: formVersionEquipmentV2,
      organization_id: tenantA,
      form_id: formEquipmentId,
      version_number: 2,
      status: 'published',
      schema_version: 1,
      schema_jsonb: {
        ...equipmentSchemaV1,
        form: { ...equipmentSchemaV1.form, title: 'Equipment Inspection V2' },
      },
      change_note: 'Updated title',
      created_by: adminUser,
      created_at: '2026-01-02T00:00:00.000Z',
      published_by: adminUser,
      published_at: '2026-01-02T00:00:00.000Z',
    };

    formRepo.versions.set(formEquipmentId, [verEquipV1, verEquipV2]);

    // Setup Form 2: Restricted Incident Report
    const formIncident: FormEntity = {
      id: formIncidentId,
      organization_id: tenantA,
      key: 'incident_report',
      title: 'Confidential Incident Report',
      description: null,
      status: 'active',
      current_draft_version_id: null,
      current_published_version_id: formVersionIncidentV1,
      created_by: adminUser,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
      archived_at: null,
    };
    formRepo.forms.set(formIncidentId, formIncident);

    const verIncidentV1: FormVersionEntity = {
      id: formVersionIncidentV1,
      organization_id: tenantA,
      form_id: formIncidentId,
      version_number: 1,
      status: 'published',
      schema_version: 1,
      schema_jsonb: incidentSchemaRestrictedV1,
      change_note: 'Initial confidential release',
      created_by: adminUser,
      created_at: '2026-01-01T00:00:00.000Z',
      published_by: adminUser,
      published_at: '2026-01-01T00:00:00.000Z',
    };
    formRepo.versions.set(formIncidentId, [verIncidentV1]);
  });

  describe('Authentication and Tenant Scoping', () => {
    it('rejects unauthenticated requests or non-members', async () => {
      await expect(
        service.listAuthenticatedSubmissions({
          userId: 'unknown_stranger',
          organizationId: tenantA,
        }),
      ).rejects.toThrow(/not an active member/i);

      await expect(
        service.getAuthenticatedSubmissionDetail({
          userId: 'unknown_stranger',
          organizationId: tenantA,
          submissionId: 'sub_any',
        }),
      ).rejects.toThrow(/not an active member/i);
    });

    it('rejects disabled/inactive members fail-closed', async () => {
      await expect(
        service.listAuthenticatedSubmissions({
          userId: disabledUser,
          organizationId: tenantA,
        }),
      ).rejects.toThrow(/not an active member/i);
    });

    it('prevents cross-tenant access to submissions', async () => {
      // Create a submission in Tenant A
      const subA = await submissionRepo.createSubmission({
        organizationId: tenantA,
        formId: formEquipmentId,
        formVersionId: formVersionEquipmentV1,
        referenceNumber: 'REF-EQ-001',
        status: 'submitted',
        dataJsonb: { fields: { equipment_name: 'Excavator 1' } },
        createdBy: employeeUser,
        submittedBy: employeeUser,
      });

      // Admin of Tenant B attempts to fetch submission in Tenant B context
      await expect(
        service.getAuthenticatedSubmissionDetail({
          userId: adminUser,
          organizationId: tenantB,
          submissionId: subA.id,
        }),
      ).rejects.toThrow(/not found or inaccessible/i);
    });

    it('throws if membership repository was not supplied to service', async () => {
      const publicOnlyService = new SubmissionService(formRepo, submissionRepo);
      await expect(
        publicOnlyService.listAuthenticatedSubmissions({
          userId: adminUser,
          organizationId: tenantA,
        }),
      ).rejects.toThrow(/Membership repository is required/i);
    });
  });

  describe('Form Permissions and Ownership Scoping', () => {
    let subEmployee1: FormSubmissionEntity;
    let subEmployee2: FormSubmissionEntity;
    let subAnonymous: FormSubmissionEntity;

    beforeEach(async () => {
      // Submission by Employee 1
      subEmployee1 = await submissionRepo.createSubmission({
        organizationId: tenantA,
        formId: formEquipmentId,
        formVersionId: formVersionEquipmentV1,
        referenceNumber: 'REF-001',
        status: 'submitted',
        dataJsonb: { fields: { equipment_name: 'Drill Press' } },
        createdBy: employeeUser,
        submittedBy: employeeUser,
        detailRows: [
          { tabId: 'tab_parts', rowOrder: 0, dataJsonb: { part_name: 'Motor', cost: 150 } },
          { tabId: 'tab_parts', rowOrder: 1, dataJsonb: { part_name: 'Belt', cost: 30 } },
        ],
      });

      // Submission by Employee 2
      subEmployee2 = await submissionRepo.createSubmission({
        organizationId: tenantA,
        formId: formEquipmentId,
        formVersionId: formVersionEquipmentV1,
        referenceNumber: 'REF-002',
        status: 'submitted',
        dataJsonb: { fields: { equipment_name: 'Bulldozer 5' } },
        createdBy: otherEmployeeUser,
        submittedBy: otherEmployeeUser,
      });

      // Public anonymous submission (createdBy = null, submittedBy = null)
      subAnonymous = await submissionRepo.createSubmission({
        organizationId: tenantA,
        formId: formEquipmentId,
        formVersionId: formVersionEquipmentV1,
        referenceNumber: 'REF-ANON-001',
        status: 'submitted',
        dataJsonb: { fields: { equipment_name: 'Crane 9' } },
        createdBy: null,
        submittedBy: null,
      });
    });

    it('allows business_admin and manager to read all submissions including anonymous ones', async () => {
      const adminList = await service.listAuthenticatedSubmissions({
        userId: adminUser,
        organizationId: tenantA,
        formId: formEquipmentId,
      });
      expect(adminList.totalCount).toBe(3);

      const managerList = await service.listAuthenticatedSubmissions({
        userId: managerUser,
        organizationId: tenantA,
        formId: formEquipmentId,
      });
      expect(managerList.totalCount).toBe(3);

      // Detail retrieval of anonymous submission succeeds for manager
      const detailAnon = await service.getAuthenticatedSubmissionDetail({
        userId: managerUser,
        organizationId: tenantA,
        submissionId: subAnonymous.id,
      });
      expect(detailAnon.submission.id).toBe(subAnonymous.id);
      expect(detailAnon.submission.created_by).toBeNull();
    });

    it('restricts employee to own submissions and filters out other employees submissions', async () => {
      const empList = await service.listAuthenticatedSubmissions({
        userId: employeeUser,
        organizationId: tenantA,
        formId: formEquipmentId,
      });
      expect(empList.totalCount).toBe(1);
      expect(empList.submissions[0].id).toBe(subEmployee1.id);

      // Employee 1 can read own submission detail
      const detailOwn = await service.getAuthenticatedSubmissionDetail({
        userId: employeeUser,
        organizationId: tenantA,
        submissionId: subEmployee1.id,
      });
      expect(detailOwn.submission.id).toBe(subEmployee1.id);

      // Employee 1 CANNOT read Employee 2's submission detail
      await expect(
        service.getAuthenticatedSubmissionDetail({
          userId: employeeUser,
          organizationId: tenantA,
          submissionId: subEmployee2.id,
        }),
      ).rejects.toThrow(/not authorized to view submissions submitted by other users/i);
    });

    it('CRITICAL: prevents employee with read_own permission from accessing anonymous submissions', async () => {
      // Anonymous submission has created_by: null and submitted_by: null
      await expect(
        service.getAuthenticatedSubmissionDetail({
          userId: employeeUser,
          organizationId: tenantA,
          submissionId: subAnonymous.id,
        }),
      ).rejects.toThrow(/not authorized to view submissions submitted by other users/i);
    });

    it('rejects access if user role is excluded from form permissions', async () => {
      // Create a submission under the confidential incident form
      const subIncident = await submissionRepo.createSubmission({
        organizationId: tenantA,
        formId: formIncidentId,
        formVersionId: formVersionIncidentV1,
        referenceNumber: 'INC-001',
        status: 'submitted',
        dataJsonb: { fields: { description: 'Confidential leak' } },
        createdBy: adminUser,
        submittedBy: adminUser,
      });

      // Employee has no read permission on Incident Report
      await expect(
        service.listAuthenticatedSubmissions({
          userId: employeeUser,
          organizationId: tenantA,
          formId: formIncidentId,
        }),
      ).rejects.toThrow(/not permitted to view submissions/i);

      await expect(
        service.getAuthenticatedSubmissionDetail({
          userId: employeeUser,
          organizationId: tenantA,
          submissionId: subIncident.id,
        }),
      ).rejects.toThrow(/not permitted to view this submission/i);

      // Manager is also excluded by incident permissions
      await expect(
        service.listAuthenticatedSubmissions({
          userId: managerUser,
          organizationId: tenantA,
          formId: formIncidentId,
        }),
      ).rejects.toThrow(/not permitted to view submissions/i);
    });
  });

  describe('Historical Snapshot and Detail Row Formatting', () => {
    it('retrieves the exact historical form version snapshot tied to submission', async () => {
      const sub = await submissionRepo.createSubmission({
        organizationId: tenantA,
        formId: formEquipmentId,
        formVersionId: formVersionEquipmentV1, // Tied to historical V1, even though V2 is published
        referenceNumber: 'REF-HIST-001',
        status: 'submitted',
        dataJsonb: {
          fields: { equipment_name: 'Lathe A', rating: 4 },
          notes: [{ text: 'Checked oil level' }],
          documents: [],
        },
        createdBy: adminUser,
        submittedBy: adminUser,
        detailRows: [
          { tabId: 'tab_parts', rowOrder: 0, dataJsonb: { part_name: 'Chuck', cost: 80 } },
          { tabId: 'tab_parts', rowOrder: 1, dataJsonb: { part_name: 'Spindle', cost: 220 } },
        ],
      });

      const detail = await service.getAuthenticatedSubmissionDetail({
        userId: adminUser,
        organizationId: tenantA,
        submissionId: sub.id,
      });

      // Verify historical version is returned
      expect(detail.formVersion.id).toBe(formVersionEquipmentV1);
      expect(detail.formVersion.version_number).toBe(1);
      expect(detail.form.title).toBe('Equipment Inspection');

      // Verify detail rows are returned and correctly grouped for FormRenderer
      expect(detail.detailRows.length).toBe(2);
      expect(detail.rendererValue.fields.equipment_name).toBe('Lathe A');
      expect(detail.rendererValue.fields.rating).toBe(4);
      expect(detail.rendererValue.details['tab_parts']).toHaveLength(2);
      expect(detail.rendererValue.details['tab_parts'][0].values.part_name).toBe('Chuck');
      expect(detail.rendererValue.details['tab_parts'][1].values.cost).toBe(220);
      expect(detail.rendererValue.notes).toHaveLength(1);
    });
  });

  describe('Tenant-Wide Cross-Form Submissions Listing', () => {
    beforeEach(async () => {
      // 2 equipment inspection submissions
      await submissionRepo.createSubmission({
        organizationId: tenantA,
        formId: formEquipmentId,
        formVersionId: formVersionEquipmentV1,
        referenceNumber: 'REF-EQ-10',
        status: 'submitted',
        dataJsonb: { fields: { equipment_name: 'Truck 1' } },
        createdBy: employeeUser,
        submittedBy: employeeUser,
      });
      await submissionRepo.createSubmission({
        organizationId: tenantA,
        formId: formEquipmentId,
        formVersionId: formVersionEquipmentV1,
        referenceNumber: 'REF-EQ-20',
        status: 'approved',
        dataJsonb: { fields: { equipment_name: 'Truck 2' } },
        createdBy: otherEmployeeUser,
        submittedBy: otherEmployeeUser,
      });

      // 1 incident report submission
      await submissionRepo.createSubmission({
        organizationId: tenantA,
        formId: formIncidentId,
        formVersionId: formVersionIncidentV1,
        referenceNumber: 'REF-INC-10',
        status: 'draft',
        dataJsonb: { fields: { description: 'Minor scratch' } },
        createdBy: adminUser,
        submittedBy: adminUser,
      });
    });

    it('business_admin sees all submissions across all forms in the tenant', async () => {
      const res = await service.listAuthenticatedSubmissions({
        userId: adminUser,
        organizationId: tenantA,
      });
      expect(res.totalCount).toBe(3);
    });

    it('manager sees only submissions from forms they have read permission on', async () => {
      // Manager has readAll on Equipment, but NO permission on Incident
      const res = await service.listAuthenticatedSubmissions({
        userId: managerUser,
        organizationId: tenantA,
      });
      expect(res.totalCount).toBe(2);
      expect(res.submissions.every((s) => s.form_id === formEquipmentId)).toBe(true);
    });

    it('employee cross-form listing only returns their own submissions from permitted forms', async () => {
      const res = await service.listAuthenticatedSubmissions({
        userId: employeeUser,
        organizationId: tenantA,
      });
      expect(res.totalCount).toBe(1);
      expect(res.submissions[0].reference_number).toBe('REF-EQ-10');
      expect(res.submissions[0].created_by).toBe(employeeUser);
    });
  });

  describe('Filtering, Pagination, and Sorting', () => {
    beforeEach(async () => {
      const statuses = ['submitted', 'approved', 'rejected', 'submitted'];
      for (let i = 1; i <= 15; i++) {
        await submissionRepo.createSubmission({
          organizationId: tenantA,
          formId: formEquipmentId,
          formVersionId: formVersionEquipmentV1,
          referenceNumber: `REF-SRCH-${String(i).padStart(3, '0')}`,
          status: statuses[i % statuses.length],
          dataJsonb: { fields: { equipment_name: `Generator ${i}` } },
          createdBy: adminUser,
          submittedBy: adminUser,
        });
      }
    });

    it('paginates results accurately with page and pageSize', async () => {
      const page1 = await service.listAuthenticatedSubmissions({
        userId: adminUser,
        organizationId: tenantA,
        formId: formEquipmentId,
        page: 1,
        pageSize: 5,
      });
      expect(page1.submissions.length).toBe(5);
      expect(page1.totalCount).toBe(15);
      expect(page1.page).toBe(1);
      expect(page1.totalPages).toBe(3);

      const page3 = await service.listAuthenticatedSubmissions({
        userId: adminUser,
        organizationId: tenantA,
        formId: formEquipmentId,
        page: 3,
        pageSize: 5,
      });
      expect(page3.submissions.length).toBe(5);
      expect(page3.page).toBe(3);
    });

    it('filters by status', async () => {
      const res = await service.listAuthenticatedSubmissions({
        userId: adminUser,
        organizationId: tenantA,
        formId: formEquipmentId,
        status: 'approved',
      });
      expect(res.submissions.every((s) => s.status === 'approved')).toBe(true);
    });

    it('filters by referenceNumber partial match', async () => {
      const res = await service.listAuthenticatedSubmissions({
        userId: adminUser,
        organizationId: tenantA,
        formId: formEquipmentId,
        referenceNumber: '007',
      });
      expect(res.totalCount).toBe(1);
      expect(res.submissions[0].reference_number).toBe('REF-SRCH-007');
    });

    it('sorts by reference_number ascending and descending', async () => {
      const asc = await service.listAuthenticatedSubmissions({
        userId: adminUser,
        organizationId: tenantA,
        formId: formEquipmentId,
        sortBy: 'reference_number',
        sortOrder: 'asc',
        pageSize: 15,
      });
      expect(asc.submissions[0].reference_number).toBe('REF-SRCH-001');

      const desc = await service.listAuthenticatedSubmissions({
        userId: adminUser,
        organizationId: tenantA,
        formId: formEquipmentId,
        sortBy: 'reference_number',
        sortOrder: 'desc',
        pageSize: 15,
      });
      expect(desc.submissions[0].reference_number).toBe('REF-SRCH-015');
    });
  });

  describe('Dropdown canonical validation and server-side calculated field enforcement', () => {
    it('accepts canonical option key and rejects mutable display label on submission', () => {
      const dropdownOptions = {
        options: [
          { key: 'office_supplies', value: 'office_supplies', label: 'Office Supplies' },
          { key: 'computers', value: 'computers', label: 'Computers & Hardware' },
        ],
      };

      // Submitting canonical key succeeds
      const validKeyErr = (service as any).validateFieldValue(
        'Category',
        'dropdown',
        'office_supplies',
        { options: dropdownOptions }
      );
      expect(validKeyErr).toBeNull();

      // Submitting display label fails
      const labelErr = (service as any).validateFieldValue(
        'Category',
        'dropdown',
        'Office Supplies',
        { options: dropdownOptions }
      );
      expect(labelErr).toBe('"Category" contains an invalid option.');

      // Submitting arbitrary invalid string fails
      const unknownErr = (service as any).validateFieldValue(
        'Category',
        'dropdown',
        'random_garbage',
        { options: dropdownOptions }
      );
      expect(unknownErr).toBe('"Category" contains an invalid option.');
    });

    it('accepts legacy options having only value and label via compatibility path', () => {
      const legacyDropdownOptions = {
        options: [
          { value: 'legacy_val_1', label: 'Legacy Option 1' },
          { value: 'legacy_val_2', label: 'Legacy Option 2' },
        ],
      };

      // Submitting legacy value succeeds
      const validValErr = (service as any).validateFieldValue(
        'Category',
        'dropdown',
        'legacy_val_1',
        { options: legacyDropdownOptions }
      );
      expect(validValErr).toBeNull();

      // Submitting label still fails because value exists
      const labelErr = (service as any).validateFieldValue(
        'Category',
        'dropdown',
        'Legacy Option 1',
        { options: legacyDropdownOptions }
      );
      expect(labelErr).toBe('"Category" contains an invalid option.');
    });

    it('recalculates formulas strictly on the server, overriding client-submitted calculated values', async () => {
      const formKey = 'loan_calculator_test';
      const calcFormId = 'form_loan_calc_id';

      const loanSchema: FormSchemaV1 = {
        schemaVersion: 1,
        form: {
          id: calcFormId,
          key: formKey,
          title: 'Loan Calculator Form',
          schemaVersion: 1,
        },
        header: {
          columns: 2,
          sections: [
            {
              id: 'sec_loan',
              key: 'sec_loan',
              title: 'Loan Information',
              order: 0,
              fields: [
                { id: 'f_p', key: 'principal_amount', label: 'Principal', type: 'currency', order: 0 },
                { id: 'f_r', key: 'interest_rate', label: 'Rate', type: 'number', order: 1 },
                { id: 'f_t', key: 'tenor_days', label: 'Tenor Days', type: 'number', order: 2 },
                {
                  id: 'f_interest',
                  key: 'interest_payable',
                  label: 'Interest Payable',
                  type: 'calculated',
                  order: 3,
                  calculationConfig: {
                    operation: 'custom',
                    formula: '(principal_amount * interest_rate * tenor_days) / 36500',
                    precision: 2,
                  },
                },
              ],
            },
          ],
        },
        tabs: [],
        rules: [],
        workflow: null,
        listView: { columns: [] },
        permissions: {},
        settings: {},
      };

      const publishedVer: FormVersionEntity = {
        id: 'ver_loan_1',
        form_id: calcFormId,
        organization_id: tenantA,
        version_number: 1,
        status: 'published',
        schema_version: 1,
        schema_jsonb: loanSchema,
        change_note: 'Initial publish',
        created_by: adminUser,
        published_at: new Date().toISOString(),
        published_by: adminUser,
        created_at: new Date().toISOString(),
      };

      const loanForm: FormEntity = {
        id: calcFormId,
        organization_id: tenantA,
        key: formKey,
        title: 'Loan Calculator Form',
        description: null,
        status: 'active',
        is_public: true,
        public_slug: formKey,
        created_by: adminUser,
        current_draft_version_id: null,
        current_published_version_id: 'ver_loan_1',
        archived_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      formRepo.forms.set(calcFormId, loanForm);
      formRepo.versions.set(calcFormId, [publishedVer]);

      // Client attempts to tamper with interest_payable by sending $0.00
      const submitRes = await service.submitPublicForm(formKey, {
        fields: {
          principal_amount: 1000000,
          interest_rate: 18,
          tenor_days: 60,
          interest_payable: 0, // Tampered client value!
        },
      });

      expect(submitRes.submissionId).toBeDefined();

      // Retrieve persisted submission from repo
      const persisted = await submissionRepo.getSubmissionById(submitRes.submissionId, tenantA);
      expect(persisted).toBeDefined();

      // Server-side recalculation must override tampered value:
      // (1000000 * 18 * 60) / 36500 with precision 2 = 29589.04
      expect((persisted?.data_jsonb.fields as any)['interest_payable']).toBe(29589.04);
    });

    it('sets calculated field to null and does not crash when formula encounters division by zero on submission', async () => {
      const formKey = 'div_zero_test';
      const divFormId = 'form_div_zero_id';

      const divSchema: FormSchemaV1 = {
        schemaVersion: 1,
        form: { id: divFormId, key: formKey, title: 'Div Zero Form', schemaVersion: 1 },
        header: {
          columns: 2,
          sections: [
            {
              id: 'sec_div',
              key: 'sec_div',
              title: 'Div Info',
              order: 0,
              fields: [
                { id: 'f_n', key: 'numerator', label: 'Numerator', type: 'number', order: 0 },
                { id: 'f_d', key: 'denominator', label: 'Denominator', type: 'number', order: 1 },
                {
                  id: 'f_res',
                  key: 'ratio',
                  label: 'Ratio',
                  type: 'calculated',
                  order: 2,
                  calculationConfig: {
                    operation: 'custom',
                    formula: 'numerator / denominator',
                  },
                },
              ],
            },
          ],
        },
        tabs: [],
        rules: [],
        workflow: null,
        listView: { columns: [] },
        permissions: {},
        settings: {},
      };

      const publishedVer: FormVersionEntity = {
        id: 'ver_div_1',
        form_id: divFormId,
        organization_id: tenantA,
        version_number: 1,
        status: 'published',
        schema_version: 1,
        schema_jsonb: divSchema,
        change_note: 'Initial publish',
        created_by: adminUser,
        published_at: new Date().toISOString(),
        published_by: adminUser,
        created_at: new Date().toISOString(),
      };

      const divForm: FormEntity = {
        id: divFormId,
        organization_id: tenantA,
        key: formKey,
        title: 'Div Zero Form',
        description: null,
        status: 'active',
        is_public: true,
        public_slug: formKey,
        created_by: adminUser,
        current_draft_version_id: null,
        current_published_version_id: 'ver_div_1',
        archived_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      formRepo.forms.set(divFormId, divForm);
      formRepo.versions.set(divFormId, [publishedVer]);

      // Submit with denominator 0
      const submitRes = await service.submitPublicForm(formKey, {
        fields: {
          numerator: 100,
          denominator: 0,
        },
      });

      const persisted = await submissionRepo.getSubmissionById(submitRes.submissionId, tenantA);
      // Division by zero evaluates to null, not 0 or NaN
      expect((persisted?.data_jsonb.fields as any)['ratio']).toBeNull();
    });
  });
});

