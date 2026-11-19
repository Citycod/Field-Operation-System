import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@field/types';
import { createClient } from '@/lib/supabase/client';
import {
  SubmissionRepository,
  FormSubmissionEntity,
  SubmissionDetailRowEntity,
  SubmissionFilterParams,
  PaginatedSubmissionsResult,
  SubmissionSortField,
} from '../submission-repository';

const ALLOWED_STATUSES = new Set([
  'draft',
  'submitted',
  'pending_approval',
  'approved',
  'rejected',
  'archived',
]);

const ALLOWED_SORT_FIELDS: Record<SubmissionSortField, string> = {
  created_at: 'created_at',
  submitted_at: 'submitted_at',
  reference_number: 'reference_number',
  status: 'status',
};

export class SupabaseSubmissionRepository implements SubmissionRepository {
  constructor(private readonly injectedClient?: SupabaseClient<Database>) {}

  private client(): SupabaseClient<Database> {
    return this.injectedClient ?? createClient();
  }

  async createSubmission(params: {
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
  }): Promise<FormSubmissionEntity> {
    const supabase = this.client();
    const now = new Date().toISOString();
    const submissionId =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `sub_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    const { data, error } = await (supabase as any)
      .from('form_submissions')
      .insert({
        id: submissionId,
        organization_id: params.organizationId,
        form_id: params.formId,
        form_version_id: params.formVersionId,
        reference_number: params.referenceNumber ?? null,
        status: params.status,
        data_jsonb: params.dataJsonb,
        created_by: params.createdBy ?? null,
        submitted_by: params.submittedBy ?? params.createdBy ?? null,
        created_at: now,
        updated_at: now,
        submitted_at: now,
      })
      .select()
      .single();

    if (error || !data) {
      throw new Error(
        error?.message
          ? `Failed to persist submission: ${error.message}`
          : 'Failed to persist submission to database.',
      );
    }

    if (params.detailRows && params.detailRows.length > 0) {
      const detailInserts = params.detailRows.map((row) => ({
        organization_id: params.organizationId,
        submission_id: data.id,
        tab_id: row.tabId,
        row_order: row.rowOrder,
        data_jsonb: row.dataJsonb,
        created_by: params.createdBy ?? null,
        created_at: now,
        updated_at: now,
      }));
      const { error: detailError } = await (supabase as any)
        .from('submission_detail_rows')
        .insert(detailInserts);

      if (detailError) {
        throw new Error(`Failed to persist submission detail rows: ${detailError.message}`);
      }
    }

    return data as FormSubmissionEntity;
  }

  async getSubmissionById(
    id: string,
    organizationId: string,
  ): Promise<FormSubmissionEntity | null> {
    const supabase = this.client();
    const { data, error } = await (supabase as any)
      .from('form_submissions')
      .select('*')
      .eq('id', id)
      .eq('organization_id', organizationId)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to retrieve submission: ${error.message}`);
    }

    return (data as FormSubmissionEntity) ?? null;
  }

  async getSubmissionDetailRows(
    submissionId: string,
    organizationId: string,
  ): Promise<SubmissionDetailRowEntity[]> {
    const supabase = this.client();
    const { data, error } = await (supabase as any)
      .from('submission_detail_rows')
      .select('*')
      .eq('submission_id', submissionId)
      .eq('organization_id', organizationId)
      .is('deleted_at', null)
      .order('tab_id', { ascending: true })
      .order('row_order', { ascending: true })
      .limit(500);

    if (error) {
      throw new Error(`Failed to retrieve submission detail rows: ${error.message}`);
    }

    return (data as SubmissionDetailRowEntity[]) ?? [];
  }

  async listSubmissions(params: SubmissionFilterParams): Promise<PaginatedSubmissionsResult> {
    const page = Math.max(1, params.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 20));
    const offset = (page - 1) * pageSize;

    // Fail closed if the caller supplied an explicit empty list of authorized form IDs
    if (Array.isArray(params.authorizedFormIds) && params.authorizedFormIds.length === 0) {
      return {
        submissions: [],
        totalCount: 0,
        page,
        pageSize,
        totalPages: 0,
      };
    }

    const supabase = this.client();
    let query = (supabase as any)
      .from('form_submissions')
      .select('*', { count: 'exact' })
      .eq('organization_id', params.organizationId);

    if (params.formId) {
      query = query.eq('form_id', params.formId);
    }

    if (Array.isArray(params.authorizedFormIds) && params.authorizedFormIds.length > 0) {
      query = query.in('form_id', params.authorizedFormIds);
    }

    if (params.status && ALLOWED_STATUSES.has(params.status)) {
      query = query.eq('status', params.status);
    }

    if (params.referenceNumber && params.referenceNumber.trim().length > 0) {
      const escapedRef = params.referenceNumber.trim().replace(/[%_\\]/g, '\\$&');
      query = query.ilike('reference_number', `%${escapedRef}%`);
    }

    if (params.dateFrom) {
      const fromTime = Date.parse(params.dateFrom);
      if (!Number.isNaN(fromTime)) {
        query = query.gte('created_at', new Date(fromTime).toISOString());
      }
    }

    if (params.dateTo) {
      const toTime = Date.parse(params.dateTo);
      if (!Number.isNaN(toTime)) {
        query = query.lte('created_at', new Date(toTime).toISOString());
      }
    }

    if (params.createdOrSubmittedBy) {
      const safeUserId = params.createdOrSubmittedBy.replace(/[^a-zA-Z0-9_-]/g, '');
      if (safeUserId) {
        query = query.or(`created_by.eq.${safeUserId},submitted_by.eq.${safeUserId}`);
      }
    }

    const sortCol = (params.sortBy && ALLOWED_SORT_FIELDS[params.sortBy]) || 'created_at';
    const ascending = params.sortOrder === 'asc';
    query = query.order(sortCol, { ascending, nullsFirst: false });
    if (sortCol !== 'id') {
      query = query.order('id', { ascending: true });
    }

    query = query.range(offset, offset + pageSize - 1);

    const { data, count, error } = await query;
    if (error) {
      throw new Error(`Failed to list submissions: ${error.message}`);
    }

    const totalCount = count ?? 0;
    const totalPages = totalCount > 0 ? Math.ceil(totalCount / pageSize) : 0;

    return {
      submissions: (data as FormSubmissionEntity[]) ?? [],
      totalCount,
      page,
      pageSize,
      totalPages,
    };
  }
}
