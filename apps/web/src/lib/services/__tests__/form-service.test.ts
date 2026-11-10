import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FormService } from '../form-service';
import { FormRepository, FormEntity, FormVersionEntity } from '../../repositories/form-repository';
import { MembershipRepository } from '../../repositories/membership-repository';
import { OrganizationMembership } from '@field/types';
import { MINIMAL_VALID_SCHEMA } from '@field/form-engine';

class MockMembershipRepository implements MembershipRepository {
  private activeMemberships = new Set<string>();

  addMembership(userId: string, orgId: string) {
    this.activeMemberships.add(`${userId}:${orgId}`);
  }

  async findByUserId(userId: string): Promise<OrganizationMembership[]> {
    return [];
  }

  async findUserMembershipInOrg(userId: string, organizationId: string): Promise<OrganizationMembership | null> {
    if (this.activeMemberships.has(`${userId}:${organizationId}`)) {
      return {
        id: `mem_${userId}`,
        organization_id: organizationId,
        user_id: userId,
        role_key: 'business_admin',
        status: 'active',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
    }
    return null;
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
    ).rejects.toThrow('Form not found or inaccessible in this organization');
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

});
