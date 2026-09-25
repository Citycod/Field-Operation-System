import { FormRepository, FormEntity, FormVersionEntity } from '../form-repository';
import { FormSchemaV1 } from '@field/form-engine';
import { createClient } from '@/lib/supabase/client';

export class SupabaseFormRepository implements FormRepository {
  async createForm(params: {
    organizationId: string;
    key: string;
    title: string;
    description?: string;
    createdBy: string;
    initialSchema: FormSchemaV1;
  }): Promise<{ form: FormEntity; version: FormVersionEntity }> {
    const supabase = createClient() as any;

    // Insert into forms first
    const { data: form, error: formError } = await supabase
      .from('forms')
      .insert({
        organization_id: params.organizationId,
        key: params.key,
        title: params.title,
        description: params.description || null,
        created_by: params.createdBy,
        status: 'active',
      })
      .select()
      .single();

    if (formError || !form) {
      throw new Error(`Failed to create form: ${formError?.message}`);
    }

    // Insert draft v1
    const { data: version, error: versionError } = await supabase
      .from('form_versions')
      .insert({
        organization_id: params.organizationId,
        form_id: form.id,
        version_number: 1,
        status: 'draft',
        schema_version: params.initialSchema.schemaVersion,
        schema_jsonb: params.initialSchema,
        created_by: params.createdBy,
      })
      .select()
      .single();

    if (versionError || !version) {
      throw new Error(`Failed to create initial form version draft: ${versionError?.message}`);
    }

    // Update current_draft_version_id
    const { data: updatedForm, error: updateError } = await supabase
      .from('forms')
      .update({ current_draft_version_id: version.id })
      .eq('id', form.id)
      .select()
      .single();

    if (updateError || !updatedForm) {
      throw new Error(`Failed to update form draft version ref: ${updateError?.message}`);
    }

    return {
      form: updatedForm as FormEntity,
      version: version as FormVersionEntity,
    };
  }

  async getFormById(id: string, organizationId: string): Promise<FormEntity | null> {
    const supabase = createClient() as any;
    const { data, error } = await supabase
      .from('forms')
      .select('*')
      .eq('id', id)
      .eq('organization_id', organizationId)
      .single();

    if (error || !data) return null;
    return data as FormEntity;
  }

  async getFormByKey(key: string, organizationId: string): Promise<FormEntity | null> {
    const supabase = createClient() as any;
    const { data, error } = await supabase
      .from('forms')
      .select('*')
      .eq('key', key)
      .eq('organization_id', organizationId)
      .single();

    if (error || !data) return null;
    return data as FormEntity;
  }

  async getDraftVersion(formId: string, organizationId: string): Promise<FormVersionEntity | null> {
    const supabase = createClient() as any;
    const { data, error } = await supabase
      .from('form_versions')
      .select('*')
      .eq('form_id', formId)
      .eq('organization_id', organizationId)
      .eq('status', 'draft')
      .single();

    if (error || !data) return null;
    return data as FormVersionEntity;
  }

  async getPublishedVersion(formId: string, organizationId: string): Promise<FormVersionEntity | null> {
    const supabase = createClient() as any;
    const { data, error } = await supabase
      .from('form_versions')
      .select('*')
      .eq('form_id', formId)
      .eq('organization_id', organizationId)
      .eq('status', 'published')
      .order('version_number', { ascending: false })
      .limit(1)
      .single();

    if (error || !data) return null;
    return data as FormVersionEntity;
  }

  async saveDraft(params: {
    versionId: string;
    formId: string;
    organizationId: string;
    schema: FormSchemaV1;
    changeNote?: string;
  }): Promise<FormVersionEntity> {
    const supabase = createClient() as any;
    const { data, error } = await supabase
      .from('form_versions')
      .update({
        schema_jsonb: params.schema,
        change_note: params.changeNote || null,
      })
      .eq('id', params.versionId)
      .eq('form_id', params.formId)
      .eq('organization_id', params.organizationId)
      .eq('status', 'draft')
      .select()
      .single();

    if (error || !data) {
      throw new Error(`Failed to save draft schema: ${error?.message || 'Version not found or not a draft'}`);
    }

    return data as FormVersionEntity;
  }

  async publishVersion(params: {
    formId: string;
    versionId: string;
    organizationId: string;
    userId: string;
  }): Promise<void> {
    const supabase = createClient() as any;
    
    // Call atomic RPC — published_by is derived from auth.uid() inside the
    // DB function, not from the caller-supplied userId. The userId param is
    // kept in the interface for application-layer authorization only.
    const { error } = await supabase.rpc('publish_form_version', {
      p_form_id: params.formId,
      p_version_id: params.versionId,
    });

    if (error) {
      throw new Error(`Failed to publish form version atomically: ${error.message}`);
    }
  }

  async createDraftFromPublished(params: {
    formId: string;
    organizationId: string;
    userId: string;
  }): Promise<FormVersionEntity> {
    const supabase = createClient() as any;

    // Check if there is already an active draft
    const existingDraft = await this.getDraftVersion(params.formId, params.organizationId);
    if (existingDraft) {
      throw new Error('An active draft already exists for this form.');
    }

    // Get current published version to clone
    const published = await this.getPublishedVersion(params.formId, params.organizationId);
    if (!published) {
      throw new Error('No published version found to create a draft from.');
    }

    // Get highest version number
    const { data: latestVersions, error: versionQueryError } = await supabase
      .from('form_versions')
      .select('version_number')
      .eq('form_id', params.formId)
      .eq('organization_id', params.organizationId)
      .order('version_number', { ascending: false })
      .limit(1);

    if (versionQueryError || !latestVersions || latestVersions.length === 0) {
      throw new Error('Failed to query latest version number.');
    }

    const nextVersionNumber = latestVersions[0].version_number + 1;

    // Create draft
    const { data: newDraft, error: insertError } = await supabase
      .from('form_versions')
      .insert({
        organization_id: params.organizationId,
        form_id: params.formId,
        version_number: nextVersionNumber,
        status: 'draft',
        schema_version: published.schema_version,
        schema_jsonb: published.schema_jsonb,
        created_by: params.userId,
      })
      .select()
      .single();

    if (insertError || !newDraft) {
      throw new Error(`Failed to create new draft: ${insertError?.message}`);
    }

    // Update form's current_draft_version_id
    const { error: updateFormError } = await supabase
      .from('forms')
      .update({ current_draft_version_id: newDraft.id })
      .eq('id', params.formId)
      .eq('organization_id', params.organizationId);

    if (updateFormError) {
      throw new Error(`Failed to link draft version to form: ${updateFormError.message}`);
    }

    return newDraft as FormVersionEntity;
  }
}
