import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FormService } from '../form-service';
import { FormRepository, FormEntity, FormVersionEntity } from '../../repositories/form-repository';
import { MembershipRepository } from '../../repositories/membership-repository';
import { OrganizationMembership, PlatformRole } from '@field/types';
import { MINIMAL_VALID_SCHEMA, createDefaultFlowWorkflow, type FormSchemaV1 } from '@field/form-engine';

class MockMembershipRepository implements MembershipRepository {
  private activeMemberships = new Map<
    string,
    { role_key: PlatformRole; status: 'active' | 'invited' | 'disabled' }
  >();

  addMembership(
    userId: string,
    orgId: string,
    role_key: PlatformRole = 'business_admin',
    status: 'active' | 'invited' | 'disabled' = 'active',
  ) {
    this.activeMemberships.set(`${userId}:${orgId}`, { role_key, status });
  }

  async findByUserId(userId: string): Promise<OrganizationMembership[]> {
    return [];
  }

  async findUserMembershipInOrg(userId: string, organizationId: string): Promise<OrganizationMembership | null> {
    const found = this.activeMemberships.get(`${userId}:${organizationId}`);
    if (found) {
      return {
        id: `mem_${userId}`,
        organization_id: organizationId,
        user_id: userId,
        role_key: found.role_key,
        status: found.status,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
    }
    return null;
  }

  async getRoster(): Promise<any> {
    return [];
  }

  async manageMembership(): Promise<any> {
    return { success: true };
  }
}

class MockFormRepository implements FormRepository {
  public forms: Map<string, FormEntity> = new Map();
  public versions: Map<string, FormVersionEntity> = new Map();
  private sequence = 0;

  async listForms(organizationId: string) {
    return [...this.forms.values()]
      .filter((form) => form.organization_id === organizationId && !form.archived_at)
      .map((form) => {
        const versions = [...this.versions.values()].filter((version) => version.form_id === form.id);
        const latest = (status: string) => versions
          .filter((version) => version.status === status)
          .reduce<number | null>((max, version) => max === null || version.version_number > max ? version.version_number : max, null);
        return { ...form, draft_version_number: latest('draft'), published_version_number: latest('published') };
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
    this.sequence += 1;
    const formId = `form_${this.sequence}`;
    const versionId = `ver_${this.sequence}`;

    const version: FormVersionEntity = {
      id: versionId,
      organization_id: params.organizationId,
      form_id: formId,
      version_number: 1,
      status: 'draft',
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
      status: 'active',
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
    if (f && f.organization_id === organizationId) return f;
    return null;
  }

  async getFormByKey(key: string, organizationId: string) {
    for (const f of this.forms.values()) {
      if (f.key === key && f.organization_id === organizationId) return f;
    }
    return null;
  }

  async getDraftVersion(formId: string, organizationId: string) {
    for (const v of this.versions.values()) {
      if (v.form_id === formId && v.organization_id === organizationId && v.status === 'draft') {
        return v;
      }
    }
    return null;
  }

  async getPublishedVersion(formId: string, organizationId: string) {
    let latest: FormVersionEntity | null = null;
    for (const v of this.versions.values()) {
      if (v.form_id === formId && v.organization_id === organizationId && v.status === 'published') {
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
    if (!v || v.status !== 'draft' || v.organization_id !== params.organizationId) {
      throw new Error('Draft version not found');
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
  }) {
    const v = this.versions.get(params.versionId);
    if (!v || v.status !== 'draft' || v.organization_id !== params.organizationId) {
      throw new Error('Draft version not found');
    }
    v.status = 'published';
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
    return [...this.versions.values()]
      .filter((v) => v.form_id === formId && v.organization_id === organizationId)
      .sort((a, b) => b.version_number - a.version_number);
  }

  async createDraftFromPublished(params: {
    formId: string;
    organizationId: string;
    userId: string;
  }) {
    const activeDraft = await this.getDraftVersion(params.formId, params.organizationId);
    if (activeDraft) {
      throw new Error('Active draft already exists');
    }

    const published = await this.getPublishedVersion(params.formId, params.organizationId);
    if (!published) {
      throw new Error('No published version found');
    }

    let maxVer = 0;
    for (const v of this.versions.values()) {
      if (v.form_id === params.formId) {
        maxVer = Math.max(maxVer, v.version_number);
      }
    }

    const newVersionId = `ver_${Date.now()}_v${maxVer + 1}`;
    const newVersion: FormVersionEntity = {
      id: newVersionId,
      organization_id: params.organizationId,
      form_id: params.formId,
      version_number: maxVer + 1,
      status: 'draft',
      schema_version: published.schema_version,
      schema_jsonb: JSON.parse(JSON.stringify(published.schema_jsonb)),
      change_note: null,
      created_by: params.userId,
      created_at: new Date().toISOString(),
      published_by: null,
      published_at: null,
    };

    this.versions.set(newVersionId, newVersion);

    const f = this.forms.get(params.formId);
    if (f) {
      f.current_draft_version_id = newVersionId;
    }

    return newVersion;
  }

  async getPublicForm(slugOrId: string): Promise<{ form: FormEntity; publishedVersion: FormVersionEntity } | null> {
    const form = [...this.forms.values()].find(
      (f) => (f.id === slugOrId || f.key === slugOrId || f.public_slug === slugOrId) && !f.archived_at,
    );
    if (!form || !form.current_published_version_id) return null;
    const version = this.versions.get(form.current_published_version_id);
    if (!version || version.status !== 'published') return null;
    return { form, publishedVersion: version };
  }

  async setFormPublicAccess(params: {
    formId: string;
    organizationId: string;
    isPublic: boolean;
    publicSlug?: string;
  }): Promise<FormEntity> {
    const form = await this.getFormById(params.formId, params.organizationId);
    if (!form) throw new Error('Form not found');
    form.is_public = params.isPublic;
    if (params.publicSlug !== undefined) form.public_slug = params.publicSlug;
    return form;
  }
}

describe('FormService', () => {
  let membershipRepo: MockMembershipRepository;
  let formRepo: MockFormRepository;
  let formService: FormService;

  const orgA = 'org_a_123';
  const orgB = 'org_b_456';
  const userA = 'user_a_123';
  const userB = 'user_b_456';

  beforeEach(() => {
    membershipRepo = new MockMembershipRepository();
    formRepo = new MockFormRepository();
    formService = new FormService(formRepo, membershipRepo);

    membershipRepo.addMembership(userA, orgA);
    membershipRepo.addMembership(userB, orgB);
  });

  it('rejects unauthorized creation if user is not an active org member', async () => {
    await expect(
      formService.createForm({
        userId: userA,
        organizationId: orgB,
        key: 'purchase_req',
        title: 'Purchase Requisition',
      })
    ).rejects.toThrow(/Unauthorized/);
  });

  it('lists only forms in the authorized active tenant', async () => {
    await formService.createForm({ userId: userA, organizationId: orgA, key: 'org_a_form', title: 'Org A form' });
    await formService.createForm({ userId: userB, organizationId: orgB, key: 'org_b_form', title: 'Org B form' });

    const forms = await formService.listForms({ userId: userA, organizationId: orgA });
    expect(forms).toHaveLength(1);
    expect(forms[0]).toMatchObject({ organization_id: orgA, key: 'org_a_form', draft_version_number: 1 });
    await expect(formService.listForms({ userId: userA, organizationId: orgB })).rejects.toThrow('Unauthorized');
  });

  it('loads and saves the authorized editable draft through the service boundary', async () => {
    const created = await formService.createForm({
      userId: userA,
      organizationId: orgA,
      key: 'builder_draft',
      title: 'Builder draft',
    });
    const schema = structuredClone(created.version.schema_jsonb);
    schema.header.sections.push({
      id: 'section_main',
      key: 'main',
      title: 'Main information',
      order: 0,
      width: 'full',
      fields: [],
    });

    await formService.saveDraft({
      userId: userA,
      organizationId: orgA,
      formId: created.form.id,
      versionId: created.version.id,
      schema,
    });
    const reloaded = await formService.getEditableDraft({
      userId: userA,
      organizationId: orgA,
      formId: created.form.id,
    });

    expect(reloaded?.draft?.schema_jsonb.header.sections[0]?.title).toBe('Main information');
    await expect(
      formService.getEditableDraft({ userId: userA, organizationId: orgB, formId: created.form.id }),
    ).rejects.toThrow('Unauthorized');
  });

  it('handles full lifecycle: Create Form -> Draft V1 -> Publish -> Edit -> Draft V2 -> Publish', async () => {
    // 1. Create Form (Draft V1)
    const { form, version: draftV1 } = await formService.createForm({
      userId: userA,
      organizationId: orgA,
      key: 'inspection_form',
      title: 'Site Inspection Form',
    });

    expect(form.key).toBe('inspection_form');
    expect(draftV1.version_number).toBe(1);
    expect(draftV1.status).toBe('draft');
    expect(form.current_draft_version_id).toBe(draftV1.id);
    expect(form.current_published_version_id).toBeNull();

    // 2. Save Draft V1
    const updatedSchema = {
      ...MINIMAL_VALID_SCHEMA,
      form: { ...MINIMAL_VALID_SCHEMA.form, title: 'Updated Site Inspection Form' },
    };

    await formService.saveDraft({
      userId: userA,
      organizationId: orgA,
      formId: form.id,
      versionId: draftV1.id,
      schema: updatedSchema,
      changeNote: 'Updated title',
    });

    // 3. Publish V1
    await formService.publishForm({
      userId: userA,
      organizationId: orgA,
      formId: form.id,
      versionId: draftV1.id,
    });

    const updatedForm1 = await formRepo.getFormById(form.id, orgA);
    expect(updatedForm1?.current_draft_version_id).toBeNull();
    expect(updatedForm1?.current_published_version_id).toBe(draftV1.id);

    const publishedV1 = await formRepo.getPublishedVersion(form.id, orgA);
    expect(publishedV1?.status).toBe('published');

    // 4. Create Draft V2 from Published V1
    const draftV2 = await formService.createDraftFromPublished({
      userId: userA,
      organizationId: orgA,
      formId: form.id,
    });

    expect(draftV2.version_number).toBe(2);
    expect(draftV2.status).toBe('draft');

    const updatedForm2 = await formRepo.getFormById(form.id, orgA);
    expect(updatedForm2?.current_draft_version_id).toBe(draftV2.id);
    expect(updatedForm2?.current_published_version_id).toBe(publishedV1?.id); // Published V1 remains active published!

    // 5. Publish V2
    await formService.publishForm({
      userId: userA,
      organizationId: orgA,
      formId: form.id,
      versionId: draftV2.id,
    });

    const updatedForm3 = await formRepo.getFormById(form.id, orgA);
    expect(updatedForm3?.current_draft_version_id).toBeNull();
    expect(updatedForm3?.current_published_version_id).toBe(draftV2.id);
  });
  it('saves an incomplete draft but blocks publishing the same schema', async () => {
    const { form, version } = await formService.createForm({ userId: userA, organizationId: orgA, key: 'incomplete', title: 'Incomplete' });
    const schema = structuredClone(MINIMAL_VALID_SCHEMA);
    schema.rules = [{ id: 'rule', key: 'rule', name: 'Incomplete', conditions: [{ fieldId: 'future-field', operator: 'equals', value: true }], actions: [{ targetFieldId: 'future-field', action: 'show' }] }];
    await formService.saveDraft({ userId: userA, organizationId: orgA, formId: form.id, versionId: version.id, schema });
    expect(formRepo.versions.get(version.id)?.schema_jsonb).toEqual(schema);
    const publish = vi.spyOn(formRepo, 'publishVersion');
    await expect(formService.publishForm({ userId: userA, organizationId: orgA, formId: form.id, versionId: version.id })).rejects.toThrow('Cannot publish');
    expect(publish).not.toHaveBeenCalled();
    expect(formRepo.versions.get(version.id)?.status).toBe('draft');
  });

  it('publishes a form draft with an optional change note and updates status', async () => {
    const { form, version } = await formService.createForm({
      userId: userA,
      organizationId: orgA,
      key: 'publish-note-form',
      title: 'Publish With Note',
    });

    await formService.publishForm({
      userId: userA,
      organizationId: orgA,
      formId: form.id,
      versionId: version.id,
      changeNote: 'Initial production release v1',
    });

    const publishedVersion = formRepo.versions.get(version.id);
    expect(publishedVersion?.status).toBe('published');
    expect(publishedVersion?.change_note).toBe('Initial production release v1');
    expect(publishedVersion?.published_by).toBe(userA);
  });

  it('retrieves full version history in descending version order and enforces tenant isolation', async () => {
    const { form, version: draftV1 } = await formService.createForm({
      userId: userA,
      organizationId: orgA,
      key: 'history-form',
      title: 'History Form',
    });

    await formService.publishForm({
      userId: userA,
      organizationId: orgA,
      formId: form.id,
      versionId: draftV1.id,
      changeNote: 'V1 published',
    });

    const draftV2 = await formService.createDraftFromPublished({
      userId: userA,
      organizationId: orgA,
      formId: form.id,
    });

    // List versions for orgA
    const history = await formService.listVersions({
      userId: userA,
      organizationId: orgA,
      formId: form.id,
    });

    expect(history.length).toBe(2);
    expect(history[0].version_number).toBe(2);
    expect(history[0].status).toBe('draft');
    expect(history[1].version_number).toBe(1);
    expect(history[1].status).toBe('published');
    expect(history[1].change_note).toBe('V1 published');

    // Tenant isolation: querying from another tenant or unauthorized user rejects
    await expect(
      formService.listVersions({
        userId: userB,
        organizationId: orgB,
        formId: form.id,
      }),
    ).rejects.toThrow(/Form not found or inaccessible/);
  });

  it('blocks saving edits to an already published version', async () => {
    const { form, version } = await formService.createForm({
      userId: userA,
      organizationId: orgA,
      key: 'immutable-form',
      title: 'Immutable Form',
    });

    await formService.publishForm({
      userId: userA,
      organizationId: orgA,
      formId: form.id,
      versionId: version.id,
    });

    // Attempting to save draft to an already published version throws
    await expect(
      formService.saveDraft({
        userId: userA,
        organizationId: orgA,
        formId: form.id,
        versionId: version.id,
        schema: MINIMAL_VALID_SCHEMA,
      }),
    ).rejects.toThrow();
  });

  it.each(['disabled', 'employee', 'unrelated'])('blocks %s membership before writing', async kind => {
    vi.spyOn(membershipRepo, 'findUserMembershipInOrg').mockResolvedValue(kind === 'unrelated' ? null : {
      id: 'membership', organization_id: orgA, user_id: userA,
      role_key: kind === 'employee' ? 'employee' : 'business_admin',
      status: kind === 'disabled' ? 'disabled' : 'active', created_at: '', updated_at: '',
    });
    const create = vi.spyOn(formRepo, 'createForm');
    await expect(formService.createForm({ userId: userA, organizationId: orgA, key: 'denied', title: 'Denied' })).rejects.toThrow('Unauthorized');
    expect(create).not.toHaveBeenCalled();
  });

  describe('Form publishing authorization and tenant isolation', () => {
    it('prevents an active manager membership from publishing a form', async () => {
      const { form, version: draft } = await formService.createForm({
        userId: userA,
        organizationId: orgA,
        key: 'manager_test_form',
        title: 'Manager Test Form',
      });

      const managerUser = 'user_manager_789';
      membershipRepo.addMembership(managerUser, orgA, 'manager', 'active');

      await expect(
        formService.publishForm({
          userId: managerUser,
          organizationId: orgA,
          formId: form.id,
          versionId: draft.id,
        }),
      ).rejects.toThrow(/Unauthorized: Only business_admin and super_admin are authorized to publish forms\./);
    });

    it('prevents an employee from publishing a form', async () => {
      const { form, version: draft } = await formService.createForm({
        userId: userA,
        organizationId: orgA,
        key: 'employee_test_form',
        title: 'Employee Test Form',
      });

      const employeeUser = 'user_employee_101';
      membershipRepo.addMembership(employeeUser, orgA, 'employee', 'active');

      await expect(
        formService.publishForm({
          userId: employeeUser,
          organizationId: orgA,
          formId: form.id,
          versionId: draft.id,
        }),
      ).rejects.toThrow(/Unauthorized: Only business_admin and super_admin are authorized to publish forms\./);
    });

    it('allows an authorized business administrator or super admin to publish', async () => {
      // 1. business_admin publish
      const { form: form1, version: draft1 } = await formService.createForm({
        userId: userA,
        organizationId: orgA,
        key: 'admin_test_form_1',
        title: 'Admin Test Form 1',
      });

      await expect(
        formService.publishForm({
          userId: userA,
          organizationId: orgA,
          formId: form1.id,
          versionId: draft1.id,
          changeNote: 'Published by business_admin',
        }),
      ).resolves.toBeUndefined();

      const published1 = await formRepo.getPublishedVersion(form1.id, orgA);
      expect(published1?.status).toBe('published');
      expect(published1?.change_note).toBe('Published by business_admin');

      // 2. super_admin publish
      const superAdminUser = 'user_super_admin_999';
      membershipRepo.addMembership(superAdminUser, orgA, 'super_admin', 'active');

      const { form: form2, version: draft2 } = await formService.createForm({
        userId: userA,
        organizationId: orgA,
        key: 'admin_test_form_2',
        title: 'Admin Test Form 2',
      });

      await expect(
        formService.publishForm({
          userId: superAdminUser,
          organizationId: orgA,
          formId: form2.id,
          versionId: draft2.id,
          changeNote: 'Published by super_admin',
        }),
      ).resolves.toBeUndefined();

      const published2 = await formRepo.getPublishedVersion(form2.id, orgA);
      expect(published2?.status).toBe('published');
      expect(published2?.change_note).toBe('Published by super_admin');
    });

    it('rejects publishing when version belongs to another organization', async () => {
      const { form: formA, version: draftA } = await formService.createForm({
        userId: userA,
        organizationId: orgA,
        key: 'org_a_cross_test',
        title: 'Org A Form',
      });

      const { form: formB, version: draftB } = await formService.createForm({
        userId: userB,
        organizationId: orgB,
        key: 'org_b_cross_test',
        title: 'Org B Form',
      });

      // User A attempts to publish Form A with Version B ID (cross-tenant version injection)
      await expect(
        formService.publishForm({
          userId: userA,
          organizationId: orgA,
          formId: formA.id,
          versionId: draftB.id,
        }),
      ).rejects.toThrow('Specified version is not the active draft for this form.');

      // User B attempts to publish Form A within Org B scope (tenant isolation: Form A not in Org B)
      await expect(
        formService.publishForm({
          userId: userB,
          organizationId: orgB,
          formId: formA.id,
          versionId: draftA.id,
        }),
      ).rejects.toThrow(/Form not found or inaccessible/);
    });

    it('rejects publishing when caller does not have active membership in target organization', async () => {
      const { form, version: draft } = await formService.createForm({
        userId: userA,
        organizationId: orgA,
        key: 'membership_test_form',
        title: 'Membership Test Form',
      });

      const externalUser = 'user_external_404';

      await expect(
        formService.publishForm({
          userId: externalUser,
          organizationId: orgA,
          formId: form.id,
          versionId: draft.id,
        }),
      ).rejects.toThrow(/Unauthorized: User user_external_404 is not an active member of organization org_a_123/);
    });
  });

  describe('Phase B: Form Settings & Permissions Authorization (authorizeFormAction)', () => {
    const managerUser = 'user_manager_b';
    const employeeUser = 'user_employee_b';

    beforeEach(() => {
      membershipRepo.addMembership(managerUser, orgA, 'manager', 'active');
      membershipRepo.addMembership(employeeUser, orgA, 'employee', 'active');
    });

    it('allows business_admin and super_admin to manage_form by default', async () => {
      const { form } = await formService.createForm({
        userId: userA,
        organizationId: orgA,
        key: 'manage_default_form',
        title: 'Default Form',
      });

      const adminRes = await formService.authorizeFormAction({
        userId: userA,
        organizationId: orgA,
        formId: form.id,
        action: 'manage_form',
      });
      expect(adminRes.form.id).toBe(form.id);
      expect(adminRes.membership.role_key).toBe('business_admin');
    });

    it('denies manager and employee manage_form by default when not in manageFormRoles', async () => {
      const { form } = await formService.createForm({
        userId: userA,
        organizationId: orgA,
        key: 'manage_denial_form',
        title: 'Denial Form',
      });

      await expect(
        formService.authorizeFormAction({
          userId: managerUser,
          organizationId: orgA,
          formId: form.id,
          action: 'manage_form',
        }),
      ).rejects.toThrow(/Unauthorized: Role "manager" is not permitted to manage this form\./);

      await expect(
        formService.authorizeFormAction({
          userId: employeeUser,
          organizationId: orgA,
          formId: form.id,
          action: 'manage_form',
        }),
      ).rejects.toThrow(/Unauthorized: Role "employee" is not permitted to manage this form\./);
    });

    it('allows manager to manage_form when manager is explicitly in draft manageFormRoles', async () => {
      const { form, version } = await formService.createForm({
        userId: userA,
        organizationId: orgA,
        key: 'manage_grant_form',
        title: 'Grant Form',
      });

      const updatedSchema = {
        ...MINIMAL_VALID_SCHEMA,
        permissions: {
          manageFormRoles: ['business_admin', 'super_admin', 'manager'] as PlatformRole[],
        },
      };

      await formService.saveDraft({
        userId: userA,
        organizationId: orgA,
        formId: form.id,
        versionId: version.id,
        schema: updatedSchema,
      });

      // Manager can now authorize manage_form and save drafts!
      const managerRes = await formService.authorizeFormAction({
        userId: managerUser,
        organizationId: orgA,
        formId: form.id,
        action: 'manage_form',
      });
      expect(managerRes.membership.role_key).toBe('manager');

      await expect(
        formService.saveDraft({
          userId: managerUser,
          organizationId: orgA,
          formId: form.id,
          versionId: version.id,
          schema: updatedSchema,
          changeNote: 'Manager saved draft',
        }),
      ).resolves.toBeDefined();

      // Employee is still not permitted
      await expect(
        formService.saveDraft({
          userId: employeeUser,
          organizationId: orgA,
          formId: form.id,
          versionId: version.id,
          schema: updatedSchema,
        }),
      ).rejects.toThrow(/Unauthorized: Role "employee" is not permitted to manage this form\./);
    });

    it('strictly forbids manager from publishing even if granted manageFormRoles', async () => {
      const { form, version } = await formService.createForm({
        userId: userA,
        organizationId: orgA,
        key: 'manager_cannot_publish_form',
        title: 'Manager Publish Prohibition',
      });

      const schemaWithManager = {
        ...MINIMAL_VALID_SCHEMA,
        permissions: {
          manageFormRoles: ['business_admin', 'super_admin', 'manager'] as PlatformRole[],
        },
      };

      await formService.saveDraft({
        userId: userA,
        organizationId: orgA,
        formId: form.id,
        versionId: version.id,
        schema: schemaWithManager,
      });

      await expect(
        formService.publishForm({
          userId: managerUser,
          organizationId: orgA,
          formId: form.id,
          versionId: version.id,
        }),
      ).rejects.toThrow(/Unauthorized: Only business_admin and super_admin are authorized to publish forms\./);
    });

    it('enforces admin lockout prevention: admins retain manage_form even if schema omits them', async () => {
      const { form, version } = await formService.createForm({
        userId: userA,
        organizationId: orgA,
        key: 'lockout_test_form',
        title: 'Lockout Test Form',
      });

      // Directly simulate a corrupted draft where manageFormRoles is missing business_admin
      const draftEntity = formRepo.versions.get(version.id)!;
      draftEntity.schema_jsonb = {
        ...MINIMAL_VALID_SCHEMA,
        permissions: {
          manageFormRoles: ['manager'] as any,
        },
      };

      // business_admin still retains manage_form rights
      const auth = await formService.authorizeFormAction({
        userId: userA,
        organizationId: orgA,
        formId: form.id,
        action: 'manage_form',
      });
      expect(auth.membership.role_key).toBe('business_admin');
    });

    it('evaluates submission actions against published permissions', async () => {
      const { form, version } = await formService.createForm({
        userId: userA,
        organizationId: orgA,
        key: 'sub_perms_form',
        title: 'Submission Permissions Form',
      });

      // Configure customized permissions:
      // - createRoles: only manager & employee
      // - readAllRoles: only super_admin & business_admin (exclude manager)
      // - readOwnRoles: manager & employee
      const schema = {
        ...MINIMAL_VALID_SCHEMA,
        permissions: {
          manageFormRoles: ['business_admin', 'super_admin'] as PlatformRole[],
          createRoles: ['manager', 'employee'] as PlatformRole[],
          readAllRoles: ['business_admin', 'super_admin'] as PlatformRole[],
          readOwnRoles: ['manager', 'employee'] as PlatformRole[],
        },
      };

      await formService.saveDraft({
        userId: userA,
        organizationId: orgA,
        formId: form.id,
        versionId: version.id,
        schema,
      });

      await formService.publishForm({
        userId: userA,
        organizationId: orgA,
        formId: form.id,
        versionId: version.id,
      });

      // 1. create_submission
      await expect(
        formService.authorizeFormAction({
          userId: employeeUser,
          organizationId: orgA,
          formId: form.id,
          action: 'create_submission',
        }),
      ).resolves.toBeDefined();

      await expect(
        formService.authorizeFormAction({
          userId: userA, // business_admin is excluded from createRoles in this custom schema
          organizationId: orgA,
          formId: form.id,
          action: 'create_submission',
        }),
      ).rejects.toThrow(/Unauthorized: Role "business_admin" is not permitted to create submissions for this form\./);

      // 2. read_all_submissions
      await expect(
        formService.authorizeFormAction({
          userId: userA,
          organizationId: orgA,
          formId: form.id,
          action: 'read_all_submissions',
        }),
      ).resolves.toBeDefined();

      await expect(
        formService.authorizeFormAction({
          userId: managerUser,
          organizationId: orgA,
          formId: form.id,
          action: 'read_all_submissions',
        }),
      ).rejects.toThrow(/Unauthorized: Role "manager" is not permitted to view all submissions for this form\./);

      // 3. read_own_submission
      await expect(
        formService.authorizeFormAction({
          userId: employeeUser,
          organizationId: orgA,
          formId: form.id,
          action: 'read_own_submission',
        }),
      ).resolves.toBeDefined();
    });

    it('loads published form with getPublishedForm when authorized', async () => {
      const { form, version } = await formService.createForm({
        userId: userA,
        organizationId: orgA,
        key: 'published_loader_form',
        title: 'Published Loader Form',
      });

      // Before publish, getPublishedForm fails
      await expect(
        formService.getPublishedForm({
          userId: employeeUser,
          organizationId: orgA,
          formId: form.id,
        }),
      ).rejects.toThrow(/Form does not have an active published version\./);

      await formService.publishForm({
        userId: userA,
        organizationId: orgA,
        formId: form.id,
        versionId: version.id,
      });

      // Default action is create_submission
      const publishedData = await formService.getPublishedForm({
        userId: employeeUser,
        organizationId: orgA,
        formId: form.id,
      });

      expect(publishedData.form.id).toBe(form.id);
      expect(publishedData.publishedVersion.id).toBe(version.id);
      expect(publishedData.publishedVersion.status).toBe('published');
    });

    it('allows read-only users with read permissions to retrieve published form even if create_submission is denied', async () => {
      const { form, version } = await formService.createForm({
        userId: userA,
        organizationId: orgA,
        key: 'readonly_access_form',
        title: 'Read Only Access Form',
      });

      // Custom permissions:
      // - createRoles: only manager (employee cannot create!)
      // - readOwnRoles: employee (employee can view own records!)
      // - readAllRoles: business_admin, super_admin
      const schema = {
        ...MINIMAL_VALID_SCHEMA,
        permissions: {
          manageFormRoles: ['business_admin', 'super_admin'] as PlatformRole[],
          createRoles: ['manager'] as PlatformRole[],
          readOwnRoles: ['employee', 'manager'] as PlatformRole[],
          readAllRoles: ['business_admin', 'super_admin'] as PlatformRole[],
        },
      };

      await formService.saveDraft({
        userId: userA,
        organizationId: orgA,
        formId: form.id,
        versionId: version.id,
        schema,
      });

      await formService.publishForm({
        userId: userA,
        organizationId: orgA,
        formId: form.id,
        versionId: version.id,
      });

      // 1. Employee calling with default action (create_submission) is denied
      await expect(
        formService.getPublishedForm({
          userId: employeeUser,
          organizationId: orgA,
          formId: form.id,
        }),
      ).rejects.toThrow(/Unauthorized: Role "employee" is not permitted to create submissions/);

      // 2. Employee calling with action: 'create_submission' explicitly is denied
      await expect(
        formService.getPublishedForm({
          userId: employeeUser,
          organizationId: orgA,
          formId: form.id,
          action: 'create_submission',
        }),
      ).rejects.toThrow(/Unauthorized: Role "employee" is not permitted to create submissions/);

      // 3. Employee calling with action: 'read_own_submission' SUCCEEDS!
      const readOwnResult = await formService.getPublishedForm({
        userId: employeeUser,
        organizationId: orgA,
        formId: form.id,
        action: 'read_own_submission',
      });
      expect(readOwnResult.publishedVersion.id).toBe(version.id);

      // 4. Employee calling with action: 'read_all_submissions' is denied (not in readAllRoles)
      await expect(
        formService.getPublishedForm({
          userId: employeeUser,
          organizationId: orgA,
          formId: form.id,
          action: 'read_all_submissions',
        }),
      ).rejects.toThrow(/Unauthorized: Role "employee" is not permitted to view all submissions/);

      // 5. Admin calling with action: 'read_all_submissions' SUCCEEDS
      const readAllResult = await formService.getPublishedForm({
        userId: userA,
        organizationId: orgA,
        formId: form.id,
        action: 'read_all_submissions',
      });
      expect(readAllResult.publishedVersion.id).toBe(version.id);

      // 6. Cross-tenant access remains denied
      await expect(
        formService.getPublishedForm({
          userId: userB,
          organizationId: orgB,
          formId: form.id,
          action: 'read_all_submissions',
        }),
      ).rejects.toThrow(/Form not found or inaccessible/);
    });
  });

  describe('fail-closed workflow active-member publish validation', () => {
    function buildWorkflowSchemaWithUser(userIdValue: string): FormSchemaV1 {
      const base = structuredClone(MINIMAL_VALID_SCHEMA) as FormSchemaV1;
      const wf = createDefaultFlowWorkflow('Synthetic Workflow Form');
      const appr = wf.steps.find((s) => s.type === 'approval');
      if (appr && appr.type === 'approval') {
        appr.assignees = [{ type: 'user', value: userIdValue }];
      }
      return { ...base, workflow: wf };
    }

    it('fails closed when roster lookup throws or returns empty/inactive/cross-tenant users for user-specific workflow assignees', async () => {
      const { form, version } = await formService.createForm({
        userId: userA,
        organizationId: orgA,
        key: 'synthetic_roster_check',
        title: 'Synthetic Roster Check',
      });

      // 1. Default MockMembershipRepository returns [] -> empty roster MUST reject user-specific assignee
      await formService.saveDraft({
        userId: userA,
        organizationId: orgA,
        formId: form.id,
        versionId: version.id,
        schema: buildWorkflowSchemaWithUser('user_invited'),
      });
      await expect(
        formService.publishForm({
          userId: userA,
          organizationId: orgA,
          formId: form.id,
          versionId: version.id,
        }),
      ).rejects.toThrow(/INVALID_WORKFLOW_ASSIGNEE/);

      // 2. Roster throws exception -> MUST NOT swallow error or publish
      const getRosterSpy = vi
        .spyOn(membershipRepo, 'getRoster')
        .mockRejectedValueOnce(new Error('RPC timeout'));
      await expect(
        formService.publishForm({
          userId: userA,
          organizationId: orgA,
          formId: form.id,
          versionId: version.id,
        }),
      ).rejects.toThrow(/Failed to verify active organization members.*RPC timeout/);
      expect(getRosterSpy).toHaveBeenCalledWith(orgA);

      // 3. Roster contains invited/disabled and active orgB user -> still rejected for non-active orgA users
      getRosterSpy.mockResolvedValue([
        { user_id: 'user_invited', status: 'invited' },
        { user_id: 'user_disabled', status: 'disabled' },
        { user_id: 'user_active_a', status: 'active' },
      ]);

      await expect(
        formService.publishForm({
          userId: userA,
          organizationId: orgA,
          formId: form.id,
          versionId: version.id,
        }),
      ).rejects.toThrow(/INVALID_WORKFLOW_ASSIGNEE/);

      // Cross-tenant userB rejected
      await formService.saveDraft({
        userId: userA,
        organizationId: orgA,
        formId: form.id,
        versionId: version.id,
        schema: buildWorkflowSchemaWithUser(userB),
      });
      await expect(
        formService.publishForm({
          userId: userA,
          organizationId: orgA,
          formId: form.id,
          versionId: version.id,
        }),
      ).rejects.toThrow(/INVALID_WORKFLOW_ASSIGNEE/);

      // Valid active user passes
      await formService.saveDraft({
        userId: userA,
        organizationId: orgA,
        formId: form.id,
        versionId: version.id,
        schema: buildWorkflowSchemaWithUser('user_active_a'),
      });
      await expect(
        formService.publishForm({
          userId: userA,
          organizationId: orgA,
          formId: form.id,
          versionId: version.id,
        }),
      ).resolves.toBeUndefined();
    });

    it('skips unnecessary roster lookups when workflow is null or role-only', async () => {
      const getRosterSpy = vi
        .spyOn(membershipRepo, 'getRoster')
        .mockRejectedValue(new Error('Should not be called without user assignees'));

      const noWfForm = await formService.createForm({
        userId: userA,
        organizationId: orgA,
        key: 'synthetic_no_wf',
        title: 'Synthetic No Workflow',
      });
      await expect(
        formService.publishForm({
          userId: userA,
          organizationId: orgA,
          formId: noWfForm.form.id,
          versionId: noWfForm.version.id,
        }),
      ).resolves.toBeUndefined();

      const roleOnlyForm = await formService.createForm({
        userId: userA,
        organizationId: orgA,
        key: 'synthetic_role_wf',
        title: 'Synthetic Role Workflow',
      });
      const roleSchema: FormSchemaV1 = {
        ...(structuredClone(MINIMAL_VALID_SCHEMA) as FormSchemaV1),
        workflow: createDefaultFlowWorkflow('Synthetic Role Workflow'),
      };
      await formService.saveDraft({
        userId: userA,
        organizationId: orgA,
        formId: roleOnlyForm.form.id,
        versionId: roleOnlyForm.version.id,
        schema: roleSchema,
      });
      await expect(
        formService.publishForm({
          userId: userA,
          organizationId: orgA,
          formId: roleOnlyForm.form.id,
          versionId: roleOnlyForm.version.id,
        }),
      ).resolves.toBeUndefined();

      expect(getRosterSpy).not.toHaveBeenCalled();
    });
  });

});
