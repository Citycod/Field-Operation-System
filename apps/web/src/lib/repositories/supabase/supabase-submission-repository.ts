import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@field/types';
import { createClient } from '@/lib/supabase/client';
import {
  SubmissionRepository,
  FormSubmissionEntity,
} from '../submission-repository';

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

  async listSubmissions(params: {
    organizationId: string;
    formId: string;
    limit?: number;
    offset?: number;
  }): Promise<FormSubmissionEntity[]> {
    const supabase = this.client();
    let query = (supabase as any)
      .from('form_submissions')
      .select('*')
      .eq('organization_id', params.organizationId)
      .eq('form_id', params.formId)
      .order('created_at', { ascending: false });

    if (params.limit) query = query.limit(params.limit);
    if (params.offset !== undefined) {
      query = query.range(params.offset, params.offset + (params.limit || 50) - 1);
    }

    const { data, error } = await query;
    if (error) {
      throw new Error(`Failed to list submissions: ${error.message}`);
    }

    return (data as FormSubmissionEntity[]) ?? [];
  }
}
