import { FormSchemaV1 } from '@field/form-engine';

export interface FormEntity {
  id: string;
  organization_id: string;
  key: string;
  title: string;
  description: string | null;
  status: string;
  current_draft_version_id: string | null;
  current_published_version_id: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

export interface FormVersionEntity {
  id: string;
  organization_id: string;
  form_id: string;
  version_number: number;
  status: string;
  schema_version: number;
  schema_jsonb: FormSchemaV1;
  change_note: string | null;
  created_by: string;
  created_at: string;
  published_by: string | null;
  published_at: string | null;
}

export interface FormListItem extends FormEntity {
  draft_version_number: number | null;
  published_version_number: number | null;
}

export interface FormRepository {
  listForms(organizationId: string): Promise<FormListItem[]>;

  createForm(params: {
    organizationId: string;
    key: string;
    title: string;
    description?: string;
    createdBy: string;
    initialSchema: FormSchemaV1;
  }): Promise<{ form: FormEntity; version: FormVersionEntity }>;

  getFormById(id: string, organizationId: string): Promise<FormEntity | null>;
  
  getFormByKey(key: string, organizationId: string): Promise<FormEntity | null>;

  getDraftVersion(formId: string, organizationId: string): Promise<FormVersionEntity | null>;

  getPublishedVersion(formId: string, organizationId: string): Promise<FormVersionEntity | null>;

  saveDraft(params: {
    versionId: string;
    formId: string;
    organizationId: string;
    schema: FormSchemaV1;
    changeNote?: string;
  }): Promise<FormVersionEntity>;

  publishVersion(params: {
    formId: string;
    versionId: string;
    organizationId: string;
    userId: string;
    changeNote?: string;
  }): Promise<void>;

  listVersions(formId: string, organizationId: string): Promise<FormVersionEntity[]>;

  createDraftFromPublished(params: {
    formId: string;
    organizationId: string;
    userId: string;
  }): Promise<FormVersionEntity>;
}
