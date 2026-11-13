export interface FormSubmissionEntity {
  id: string;
  organization_id: string;
  form_id: string;
  form_version_id: string;
  reference_number: string | null;
  status: string;
  data_jsonb: Record<string, unknown>;
  created_by: string | null;
  submitted_by: string | null;
  created_at: string;
  updated_at: string;
  submitted_at: string | null;
  completed_at: string | null;
}

export interface SubmissionDetailRowEntity {
  id: string;
  organization_id: string;
  submission_id: string;
  tab_id: string;
  row_order: number;
  data_jsonb: Record<string, unknown>;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface SubmissionRepository {
  createSubmission(params: {
    organizationId: string;
    formId: string;
    formVersionId: string;
    referenceNumber?: string | null;
    status: string;
    dataJsonb: Record<string, unknown>;
    createdBy?: string | null;
    submittedBy?: string | null;
    detailRows?: Array<{
      tabId: string;
      rowOrder: number;
      dataJsonb: Record<string, unknown>;
    }>;
  }): Promise<FormSubmissionEntity>;

  getSubmissionById(
    id: string,
    organizationId: string,
  ): Promise<FormSubmissionEntity | null>;

  listSubmissions(params: {
    organizationId: string;
    formId: string;
    limit?: number;
    offset?: number;
  }): Promise<FormSubmissionEntity[]>;
}

