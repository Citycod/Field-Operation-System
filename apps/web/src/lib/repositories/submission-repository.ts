export type SubmissionSortField =
  | 'created_at'
  | 'submitted_at'
  | 'reference_number'
  | 'status';

export type SubmissionSortOrder = 'asc' | 'desc';

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

export interface SubmissionFilterParams {
  organizationId: string;
  formId?: string;
  authorizedFormIds?: string[];
  status?: string;
  referenceNumber?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  pageSize?: number;
  sortBy?: SubmissionSortField;
  sortOrder?: SubmissionSortOrder;
  createdOrSubmittedBy?: string;
}

export interface PaginatedSubmissionsResult {
  submissions: FormSubmissionEntity[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
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

  getSubmissionDetailRows(
    submissionId: string,
    organizationId: string,
  ): Promise<SubmissionDetailRowEntity[]>;

  listSubmissions(params: SubmissionFilterParams): Promise<PaginatedSubmissionsResult>;
}
