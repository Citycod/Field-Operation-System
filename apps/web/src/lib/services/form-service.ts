import { FormRepository, FormEntity, FormVersionEntity } from '../repositories/form-repository';
import { MembershipRepository } from '../repositories/membership-repository';
import {
  validateDraftSchema,
  validatePublishableSchema,
  workflowHasUserAssignees,
  FormSchemaV1,
} from '@field/form-engine';
import { OrganizationMembership, OrganizationMemberRosterItem } from '@field/types';

export type FormAction =
  | 'manage_form'
  | 'publish_form'
  | 'create_submission'
  | 'read_own_submission'
  | 'read_all_submissions';

export interface AuthorizeFormResult {
  membership: OrganizationMembership;
  form: FormEntity;
  version?: FormVersionEntity | null;
}

export class FormService {
  constructor(
    private formRepository: FormRepository,
    private membershipRepository: MembershipRepository
  ) {}

  private async checkMembership(userId: string, organizationId: string): Promise<OrganizationMembership> {
    const membership = await this.membershipRepository.findUserMembershipInOrg(userId, organizationId);
    if (!membership || membership.status !== 'active' || !['business_admin', 'super_admin'].includes(membership.role_key)) {
      throw new Error(`Unauthorized: User ${userId} does not have active form-management permission in organization ${organizationId}`);
    }
    return membership;
  }

  async authorizeFormAction(params: {
    userId: string;
    organizationId: string;
    formId: string;
    action: FormAction;
  }): Promise<AuthorizeFormResult> {
    const membership = await this.membershipRepository.findUserMembershipInOrg(
      params.userId,
      params.organizationId,
    );
    if (!membership || membership.status !== 'active') {
      throw new Error(
        `Unauthorized: User ${params.userId} is not an active member of organization ${params.organizationId}`,
      );
    }

    const form = await this.formRepository.getFormById(
      params.formId,
      params.organizationId,
    );
    if (!form || form.organization_id !== params.organizationId) {
      throw new Error(
        `Form not found or inaccessible in organization ${params.organizationId}`,
      );
    }

    const isPlatformAdmin = ['super_admin', 'business_admin'].includes(membership.role_key);

    if (params.action === 'publish_form') {
      if (!isPlatformAdmin) {
        throw new Error(
          `Unauthorized: Only business_admin and super_admin are authorized to publish forms.`,
        );
      }
      return { membership, form };
    }

    if (params.action === 'manage_form') {
      if (isPlatformAdmin) {
        return { membership, form };
      }
      const draft = await this.formRepository.getDraftVersion(
        params.formId,
        params.organizationId,
      );
      const manageRoles =
        (draft?.schema_jsonb as FormSchemaV1 | undefined)?.permissions?.manageFormRoles ??
        ['business_admin', 'super_admin'];
      if (!manageRoles.includes(membership.role_key)) {
        throw new Error(
          `Unauthorized: Role "${membership.role_key}" is not permitted to manage this form.`,
        );
      }
      return { membership, form, version: draft };
    }

    // Submission actions evaluate permissions from the active published version
    const published = await this.formRepository.getPublishedVersion(
      params.formId,
      params.organizationId,
    );
    if (!published) {
      throw new Error('Form does not have an active published version.');
    }

    const perms = (published.schema_jsonb as FormSchemaV1 | undefined)?.permissions || {};

    if (params.action === 'create_submission') {
      const allowed = perms.createRoles ?? ['super_admin', 'business_admin', 'manager', 'employee'];
      if (!allowed.includes(membership.role_key)) {
        throw new Error(
          `Unauthorized: Role "${membership.role_key}" is not permitted to create submissions for this form.`,
        );
      }
      return { membership, form, version: published };
    }

    if (params.action === 'read_all_submissions') {
      const allowed = perms.readAllRoles ?? ['super_admin', 'business_admin', 'manager'];
      if (!allowed.includes(membership.role_key)) {
        throw new Error(
          `Unauthorized: Role "${membership.role_key}" is not permitted to view all submissions for this form.`,
        );
      }
      return { membership, form, version: published };
    }

    if (params.action === 'read_own_submission') {
      const allowed = perms.readOwnRoles ?? ['super_admin', 'business_admin', 'manager', 'employee'];
      if (!allowed.includes(membership.role_key)) {
        throw new Error(
          `Unauthorized: Role "${membership.role_key}" is not permitted to view submissions for this form.`,
        );
      }
      return { membership, form, version: published };
    }

    return { membership, form, version: published };
  }

  async listForms(params: { userId: string; organizationId: string }) {
    await this.checkMembership(params.userId, params.organizationId);
    return this.formRepository.listForms(params.organizationId);
  }

  async getEditableDraft(params: { userId: string; organizationId: string; formId: string }) {
    await this.authorizeFormAction({
      userId: params.userId,
      organizationId: params.organizationId,
      formId: params.formId,
      action: 'manage_form',
    });
    const form = await this.formRepository.getFormById(params.formId, params.organizationId);
    if (!form) return null;
    const draft = await this.formRepository.getDraftVersion(params.formId, params.organizationId);
    return { form, draft };
  }

  async getPublishedForm(params: {
    userId: string;
    organizationId: string;
    formId: string;
    action?: 'create_submission' | 'read_all_submissions' | 'read_own_submission';
  }) {
    const action = params.action ?? 'create_submission';
    const authResult = await this.authorizeFormAction({
      userId: params.userId,
      organizationId: params.organizationId,
      formId: params.formId,
      action,
    });
    if (!authResult.version) {
      throw new Error('Form does not have an active published version.');
    }
    return {
      form: authResult.form,
      publishedVersion: authResult.version,
    };
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
    await this.authorizeFormAction({
      userId: params.userId,
      organizationId: params.organizationId,
      formId: params.formId,
      action: 'manage_form',
    });

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
    changeNote?: string;
  }) {
    await this.authorizeFormAction({
      userId: params.userId,
      organizationId: params.organizationId,
      formId: params.formId,
      action: 'publish_form',
    });

    const draft = await this.formRepository.getDraftVersion(params.formId, params.organizationId);
    if (!draft || draft.id !== params.versionId) {
      throw new Error('Specified version is not the active draft for this form.');
    }

    let activeMemberUserIds: Set<string> | undefined;
    if (workflowHasUserAssignees(draft.schema_jsonb?.workflow)) {
      let roster: OrganizationMemberRosterItem[];
      try {
        roster = await this.membershipRepository.getRoster(params.organizationId);
      } catch (err) {
        const reason =
          err instanceof Error && err.message
            ? err.message
            : 'Unable to retrieve organization member roster';
        throw new Error(
          `Cannot publish: Failed to verify active organization members (${reason}).`,
        );
      }

      if (!Array.isArray(roster)) {
        throw new Error(
          'Cannot publish: Failed to verify active organization members (invalid roster response).',
        );
      }

      // Explicitly pass the active Set (even when empty) so workflow validation fails closed.
      activeMemberUserIds = new Set(
        roster
          .filter(
            (m) =>
              m &&
              m.status === 'active' &&
              typeof m.user_id === 'string' &&
              m.user_id.trim().length > 0,
          )
          .map((m) => m.user_id),
      );
    }

    const publishValidation = validatePublishableSchema(draft.schema_jsonb, {
      activeMemberUserIds,
    });
    if (!publishValidation.valid) {
      throw new Error(`Cannot publish: Schema has semantic errors: ${JSON.stringify(publishValidation.errors)}`);
    }

    await this.formRepository.publishVersion({
      formId: params.formId,
      versionId: params.versionId,
      organizationId: params.organizationId,
      userId: params.userId,
      changeNote: params.changeNote,
    });
  }

  async listVersions(params: {
    userId: string;
    organizationId: string;
    formId: string;
  }) {
    await this.authorizeFormAction({
      userId: params.userId,
      organizationId: params.organizationId,
      formId: params.formId,
      action: 'manage_form',
    });
    return this.formRepository.listVersions(params.formId, params.organizationId);
  }

  async createDraftFromPublished(params: {
    userId: string;
    organizationId: string;
    formId: string;
  }) {
    await this.authorizeFormAction({
      userId: params.userId,
      organizationId: params.organizationId,
      formId: params.formId,
      action: 'manage_form',
    });
    return this.formRepository.createDraftFromPublished(params);
  }
}
