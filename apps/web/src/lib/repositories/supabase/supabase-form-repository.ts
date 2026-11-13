import { FormRepository, FormEntity, FormVersionEntity, FormListItem } from '../form-repository';
import { FormSchemaV1 } from '@field/form-engine';
import type { Database, Json } from '@field/types';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';

export class SupabaseFormRepository implements FormRepository {
  constructor(private readonly injectedClient?: SupabaseClient<Database>) {}

  private client(): SupabaseClient<Database> {
    return this.injectedClient ?? createClient();
  }

  async listForms(organizationId: string): Promise<FormListItem[]> {
    const supabase = this.client();
    const { data: forms, error } = await supabase
      .from('forms')
      .select('*')
      .eq('organization_id', organizationId)
      .is('archived_at', null)
      .order('updated_at', { ascending: false });
    if (error) throw new Error(`Failed to load forms: ${error.message}`);
    if (!forms?.length) return [];

    const { data: versions, error: versionError } = await supabase
      .from('form_versions')
      .select('form_id,version_number,status')
      .eq('organization_id', organizationId)
      .in('form_id', forms.map((form) => form.id));
    if (versionError) throw new Error(`Failed to load form lifecycle: ${versionError.message}`);

    return forms.map((form) => {
      const related = (versions ?? []).filter((version) => version.form_id === form.id);
      const latest = (status: string) => related
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
    initialSchema: FormSchemaV1;
  }): Promise<{ form: FormEntity; version: FormVersionEntity }> {
    const supabase = this.client();

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

    const initialSchema: FormSchemaV1 = {
      ...params.initialSchema,
      form: { ...params.initialSchema.form, id: form.id },
    };

    // Insert draft v1
    const { data: version, error: versionError } = await supabase
      .from('form_versions')
      .insert({
        organization_id: params.organizationId,
        form_id: form.id,
        version_number: 1,
        status: 'draft',
        schema_version: initialSchema.schemaVersion,
        schema_jsonb: initialSchema as unknown as Json,
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
      version: version as unknown as FormVersionEntity,
    };
  }

  async getFormById(id: string, organizationId: string): Promise<FormEntity | null> {
    const supabase = this.client();
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
    const supabase = this.client();
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
    const supabase = this.client();
    const { data, error } = await supabase
      .from('form_versions')
      .select('*')
      .eq('form_id', formId)
      .eq('organization_id', organizationId)
      .eq('status', 'draft')
      .single();

    if (error || !data) return null;
    return data as unknown as FormVersionEntity;
  }

  async getPublishedVersion(formId: string, organizationId: string): Promise<FormVersionEntity | null> {
    const supabase = this.client();
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
    return data as unknown as FormVersionEntity;
  }

  async saveDraft(params: {
    versionId: string;
    formId: string;
    organizationId: string;
    schema: FormSchemaV1;
    changeNote?: string;
  }): Promise<FormVersionEntity> {
    const supabase = this.client();
    const { data, error } = await supabase
      .from('form_versions')
      .update({
        schema_jsonb: params.schema as unknown as Json,
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

    return data as unknown as FormVersionEntity;
  }

  async publishVersion(params: {
    formId: string;
    versionId: string;
    organizationId: string;
    userId: string;
    changeNote?: string;
  }): Promise<void> {
    const supabase = this.client();

    // Call atomic RPC — published_by is derived from auth.uid() and change_note is
    // updated within the same transaction inside the DB function.
    const { error } = await supabase.rpc('publish_form_version', {
      p_form_id: params.formId,
      p_version_id: params.versionId,
      p_change_note: params.changeNote ?? null,
    });

    if (error) {
      throw new Error(`Failed to publish form version atomically: ${error.message}`);
    }
  }

  async listVersions(formId: string, organizationId: string): Promise<FormVersionEntity[]> {
    const supabase = this.client();
    const { data, error } = await supabase
      .from('form_versions')
      .select('*')
      .eq('form_id', formId)
      .eq('organization_id', organizationId)
      .order('version_number', { ascending: false });

    if (error) {
      throw new Error(`Failed to list form versions: ${error.message}`);
    }

    return (data || []) as unknown as FormVersionEntity[];
  }

  async createDraftFromPublished(params: {
    formId: string;
    organizationId: string;
    userId: string;
  }): Promise<FormVersionEntity> {
    const supabase = this.client();

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
        schema_jsonb: published.schema_jsonb as unknown as Json,
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

    return newDraft as unknown as FormVersionEntity;
  }

  async getPublicForm(
    slugOrId: string,
  ): Promise<{ form: FormEntity; publishedVersion: FormVersionEntity } | null> {
    const supabase = this.client();
    const isUuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        slugOrId,
      );

    let formData: any = null;

    if (isUuid) {
      const { data, error } = await (supabase.from('forms') as any)
        .select('*')
        .is('archived_at', null)
        .eq('status', 'active')
        .eq('is_public', true)
        .eq('id', slugOrId)
        .maybeSingle();
      if (!error && data) formData = data;
    } else {
      // Match globally-unique custom public_slug first (normalized lowercase), then unique active public key
      const normalizedSlug = slugOrId.trim().toLowerCase();
      const { data: slugMatch, error: slugError } = await (supabase.from('forms') as any)
        .select('*')
        .is('archived_at', null)
        .eq('status', 'active')
        .eq('is_public', true)
        .eq('public_slug', normalizedSlug)
        .maybeSingle();

      if (!slugError && slugMatch) {
        formData = slugMatch;
      } else {
        const { data: keyMatches, error: keyError } = await (supabase.from('forms') as any)
          .select('*')
          .is('archived_at', null)
          .eq('status', 'active')
          .eq('is_public', true)
          .eq('key', slugOrId)
          .limit(2);

        if (!keyError && Array.isArray(keyMatches) && keyMatches.length === 1) {
          formData = keyMatches[0];
        }
      }
    }

    if (!formData) return null;

    const form = formData as FormEntity;
    if (!form.current_published_version_id) return null;

    // Enforce active organization status (suspended/archived orgs must not expose public forms)
    const { data: orgData, error: orgError } = await supabase
      .from('organizations')
      .select('id,status')
      .eq('id', form.organization_id)
      .eq('status', 'active')
      .maybeSingle();

    if (orgError || !orgData) return null;

    const { data: versionData, error: versionError } = await supabase
      .from('form_versions')
      .select('*')
      .eq('id', form.current_published_version_id)
      .eq('form_id', form.id)
      .eq('organization_id', form.organization_id)
      .eq('status', 'published')
      .single();

    if (versionError || !versionData) return null;

    return {
      form,
      publishedVersion: versionData as unknown as FormVersionEntity,
    };
  }

  async setFormPublicAccess(params: {
    formId: string;
    organizationId: string;
    isPublic: boolean;
    publicSlug?: string;
  }): Promise<FormEntity> {
    const supabase = this.client();
    const updatePayload: Record<string, unknown> = {
      is_public: params.isPublic,
    };
    if (params.publicSlug !== undefined) {
      updatePayload.public_slug = params.publicSlug;
    }

    const { data, error } = await (supabase.from('forms') as any)
      .update(updatePayload)
      .eq('id', params.formId)
      .eq('organization_id', params.organizationId)
      .select()
      .single();

    if (error || !data) {
      throw new Error(
        error?.message
          ? `Failed to update public access settings: ${error.message}`
          : 'Form not found or public access update failed.',
      );
    }

    return data as FormEntity;
  }
}
