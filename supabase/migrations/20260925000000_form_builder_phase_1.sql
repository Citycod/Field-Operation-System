-- Form Builder Phase 1 Migration
-- Tables: forms, form_versions

-- Create forms table
CREATE TABLE public.forms (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    key text NOT NULL,
    title text NOT NULL,
    description text,
    status text NOT NULL DEFAULT 'active',
    current_draft_version_id uuid,
    current_published_version_id uuid,
    created_by uuid NOT NULL REFERENCES auth.users(id),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    archived_at timestamptz,
    CONSTRAINT forms_org_key_key UNIQUE (organization_id, key),
    CONSTRAINT forms_org_id_key UNIQUE (organization_id, id) -- needed for form_versions composite FK
);

-- Create form_versions table
CREATE TABLE public.form_versions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL,
    form_id uuid NOT NULL,
    version_number integer NOT NULL,
    status text NOT NULL,
    schema_version integer NOT NULL,
    schema_jsonb jsonb NOT NULL,
    change_note text,
    created_by uuid NOT NULL REFERENCES auth.users(id),
    created_at timestamptz NOT NULL DEFAULT now(),
    published_by uuid REFERENCES auth.users(id),
    published_at timestamptz,
    CONSTRAINT form_versions_form_id_version_number_key UNIQUE (form_id, version_number),
    CONSTRAINT form_versions_org_form_fkey FOREIGN KEY (organization_id, form_id) REFERENCES public.forms(organization_id, id) ON DELETE CASCADE
);

-- Add circular FKs to forms
ALTER TABLE public.forms 
  ADD CONSTRAINT forms_draft_version_fkey FOREIGN KEY (current_draft_version_id) REFERENCES public.form_versions(id) ON DELETE SET NULL,
  ADD CONSTRAINT forms_published_version_fkey FOREIGN KEY (current_published_version_id) REFERENCES public.form_versions(id) ON DELETE SET NULL;

-- Indexes
CREATE INDEX idx_forms_organization_id ON public.forms(organization_id);
CREATE INDEX idx_form_versions_organization_id ON public.form_versions(organization_id);
CREATE INDEX idx_form_versions_form_id ON public.form_versions(form_id);
CREATE INDEX idx_form_versions_status ON public.form_versions(status);

-- Partial index: only one active draft per form
CREATE UNIQUE INDEX one_active_draft_per_form ON public.form_versions(form_id) WHERE status = 'draft';

-- Atomic publishing function
-- Uses auth.uid() for published_by — caller cannot impersonate another user.
CREATE OR REPLACE FUNCTION public.publish_form_version(
    p_form_id uuid,
    p_version_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_id uuid := auth.uid();
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'publish_form_version requires an authenticated user context';
    END IF;

    -- Ensure the version exists, belongs to the form, and is a draft
    IF NOT EXISTS (
        SELECT 1 FROM public.form_versions
        WHERE id = p_version_id AND form_id = p_form_id AND status = 'draft'
    ) THEN
        RAISE EXCEPTION 'Version is not a valid draft for this form';
    END IF;

    -- Update version status — published_by derived from auth.uid()
    UPDATE public.form_versions
    SET status = 'published',
        published_by = v_user_id,
        published_at = now()
    WHERE id = p_version_id;

    -- Update form references
    UPDATE public.forms
    SET current_published_version_id = p_version_id,
        current_draft_version_id = NULL,
        updated_at = now()
    WHERE id = p_form_id;
END;
$$;

-- Triggers for immutability of published versions
-- Protected fields: schema_jsonb, schema_version, organization_id, form_id,
--   version_number, created_by, created_at
-- Intentionally mutable: change_note (editorial), published_by/published_at
--   (set atomically by publish RPC), status (only via archive workflow).
CREATE OR REPLACE FUNCTION public.prevent_published_version_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF OLD.status = 'published' AND (
        NEW.schema_jsonb IS DISTINCT FROM OLD.schema_jsonb OR
        NEW.form_id IS DISTINCT FROM OLD.form_id OR
        NEW.version_number IS DISTINCT FROM OLD.version_number OR
        NEW.schema_version IS DISTINCT FROM OLD.schema_version OR
        NEW.organization_id IS DISTINCT FROM OLD.organization_id OR
        NEW.created_by IS DISTINCT FROM OLD.created_by OR
        NEW.created_at IS DISTINCT FROM OLD.created_at
    ) THEN
        RAISE EXCEPTION 'Cannot modify structural/audit fields of a published form version.';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_prevent_published_version_update
BEFORE UPDATE ON public.form_versions
FOR EACH ROW
EXECUTE FUNCTION public.prevent_published_version_update();

CREATE OR REPLACE FUNCTION public.prevent_published_version_delete()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF OLD.status = 'published' THEN
        RAISE EXCEPTION 'Cannot delete a published form version.';
    END IF;
    RETURN OLD;
END;
$$;

CREATE TRIGGER trg_prevent_published_version_delete
BEFORE DELETE ON public.form_versions
FOR EACH ROW
EXECUTE FUNCTION public.prevent_published_version_delete();

-- RLS Enablement
ALTER TABLE public.forms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.form_versions ENABLE ROW LEVEL SECURITY;

-- Forms RLS
CREATE POLICY "Users can view forms in their organizations" ON public.forms
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.organization_memberships m
            WHERE m.organization_id = forms.organization_id
            AND m.user_id = auth.uid()
            AND m.status = 'active'
        )
    );

CREATE POLICY "Users can insert forms in their organizations" ON public.forms
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.organization_memberships m
            WHERE m.organization_id = organization_id
            AND m.user_id = auth.uid()
            AND m.status = 'active'
            -- We might want a role check here, but relying on membership is a start.
        )
    );

CREATE POLICY "Users can update forms in their organizations" ON public.forms
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM public.organization_memberships m
            WHERE m.organization_id = forms.organization_id
            AND m.user_id = auth.uid()
            AND m.status = 'active'
        )
    ) WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.organization_memberships m
            WHERE m.organization_id = organization_id
            AND m.user_id = auth.uid()
            AND m.status = 'active'
        )
    );

-- Form Versions RLS
CREATE POLICY "Users can view form versions in their organizations" ON public.form_versions
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.organization_memberships m
            WHERE m.organization_id = form_versions.organization_id
            AND m.user_id = auth.uid()
            AND m.status = 'active'
        )
    );

CREATE POLICY "Users can insert form versions in their organizations" ON public.form_versions
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.organization_memberships m
            WHERE m.organization_id = organization_id
            AND m.user_id = auth.uid()
            AND m.status = 'active'
        )
    );

CREATE POLICY "Users can update form versions in their organizations" ON public.form_versions
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM public.organization_memberships m
            WHERE m.organization_id = form_versions.organization_id
            AND m.user_id = auth.uid()
            AND m.status = 'active'
        )
    ) WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.organization_memberships m
            WHERE m.organization_id = organization_id
            AND m.user_id = auth.uid()
            AND m.status = 'active'
        )
    );

CREATE POLICY "Users can delete form versions in their organizations" ON public.form_versions
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM public.organization_memberships m
            WHERE m.organization_id = form_versions.organization_id
            AND m.user_id = auth.uid()
            AND m.status = 'active'
        )
    );
