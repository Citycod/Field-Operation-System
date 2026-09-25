import { FormRepository } from '../repositories/form-repository';
import { MembershipRepository } from '../repositories/membership-repository';
import { validateDraftSchema, validatePublishableSchema, FormSchemaV1 } from '@field/form-engine';

export class FormService {
  constructor(
    private formRepository: FormRepository,
    private membershipRepository: MembershipRepository
  ) {}

  private async checkMembership(userId: string, organizationId: string): Promise<void> {
    const membership = await this.membershipRepository.findUserMembershipInOrg(userId, organizationId);
    if (!membership || membership.status !== 'active') {
      throw new Error(`Unauthorized: User ${userId} is not an active member of organization ${organizationId}`);
    }
  }

  async createForm(params: {
    userId: string;
    organizationId: string;
    key: string;
    title: string;
    description?: string;
  }) {
    await this.checkMembership(params.userId, params.organizationId);

    const initialSchema: FormSchemaV1 = {
      schemaVersion: 1,
      form: {
        id: `form_${params.key}`,
        key: params.key,
        title: params.title,
        description: params.description,
        schemaVersion: 1,
      },
      header: {
        columns: 2,
        sections: [],
      },
      tabs: [
        {
          id: 'tab_general',
          key: 'general',
          title: 'General Information',
          type: 'form',
          order: 0,
          sections: [],
        },
      ],
      rules: [],
      workflow: null,
      listView: {
        columns: [],
      },
      permissions: {},
      settings: {},
    };

    const draftValidation = validateDraftSchema(initialSchema);
    if (!draftValidation.valid) {
      throw new Error(`Initial schema structure invalid: ${JSON.stringify(draftValidation.errors)}`);
    }

    return this.formRepository.createForm({
      organizationId: params.organizationId,
      key: params.key,
      title: params.title,
      description: params.description,
      createdBy: params.userId,
      initialSchema,
    });
  }

  async saveDraft(params: {
    userId: string;
    organizationId: string;
    formId: string;
    versionId: string;
    schema: FormSchemaV1;
    changeNote?: string;
  }) {
    await this.checkMembership(params.userId, params.organizationId);

    const draftValidation = validateDraftSchema(params.schema);
    if (!draftValidation.valid) {
      throw new Error(`Draft schema validation failed: ${JSON.stringify(draftValidation.errors)}`);
    }

    return this.formRepository.saveDraft({
      versionId: params.versionId,
      formId: params.formId,
      organizationId: params.organizationId,
      schema: params.schema,
      changeNote: params.changeNote,
    });
  }

  async publishForm(params: {
    userId: string;
    organizationId: string;
    formId: string;
    versionId: string;
  }) {
    await this.checkMembership(params.userId, params.organizationId);

    const draft = await this.formRepository.getDraftVersion(params.formId, params.organizationId);
    if (!draft || draft.id !== params.versionId) {
      throw new Error('Specified version is not the active draft for this form.');
    }

    const publishValidation = validatePublishableSchema(draft.schema_jsonb);
    if (!publishValidation.valid) {
      throw new Error(`Cannot publish: Schema has semantic errors: ${JSON.stringify(publishValidation.errors)}`);
    }

    await this.formRepository.publishVersion({
      formId: params.formId,
      versionId: params.versionId,
      organizationId: params.organizationId,
      userId: params.userId,
    });
  }

  async createDraftFromPublished(params: {
    userId: string;
    organizationId: string;
    formId: string;
  }) {
    await this.checkMembership(params.userId, params.organizationId);
    return this.formRepository.createDraftFromPublished(params);
  }
}
