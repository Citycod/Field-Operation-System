-- Append-only hardening: close tenant/audit bypasses without rewriting history.
-- Remove the legacy overload if an earlier deployment accepted a caller identity.
DROP FUNCTION IF EXISTS public.publish_form_version(uuid, uuid, uuid);

CREATE OR REPLACE FUNCTION public.publish_form_version(p_form_id uuid, p_version_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    v_user_id uuid := auth.uid();
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'publish_form_version requires an authenticated user context';
    END IF;

    -- Serialize publication for this form; all reads/writes also enforce RLS.
    PERFORM 1 FROM public.forms
    WHERE id = p_form_id
      AND public.get_organization_role(organization_id) IN ('super_admin', 'business_admin')
    FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Form not found or publishing not authorized';
    END IF;

    UPDATE public.form_versions
    SET status = 'published', published_by = v_user_id, published_at = now()
    WHERE id = p_version_id AND form_id = p_form_id AND status = 'draft';
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Version is not a valid draft for this form';
    END IF;

    UPDATE public.forms
    SET current_published_version_id = p_version_id,
        current_draft_version_id = NULL, updated_at = now()
    WHERE id = p_form_id;
END;
$$;
REVOKE ALL ON FUNCTION public.publish_form_version(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.publish_form_version(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.prevent_published_version_update()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
    -- Archived snapshots remain protected. Never allow a status round-trip to
    -- draft to erase the publication history. Only editorial change_note and
    -- the one-way published -> archived transition may change a snapshot.
    IF OLD.status IN ('published', 'archived') THEN
        IF (to_jsonb(NEW) - 'change_note' - 'status') IS DISTINCT FROM
           (to_jsonb(OLD) - 'change_note' - 'status')
           OR (NEW.status IS DISTINCT FROM OLD.status AND
               NOT (OLD.status = 'published' AND NEW.status = 'archived')) THEN
            RAISE EXCEPTION 'Cannot modify structural/audit fields of a published or archived form version';
        END IF;
    ELSIF NEW.status = 'published' THEN
        IF auth.uid() IS NULL THEN
            RAISE EXCEPTION 'Publishing requires an authenticated user context';
        END IF;
        -- Applies even to direct SQL/REST status updates, not only the RPC.
        NEW.published_by := auth.uid();
        NEW.published_at := now();
    ELSIF NEW.status = 'draft' AND
        (NEW.published_by IS NOT NULL OR NEW.published_at IS NOT NULL) THEN
        RAISE EXCEPTION 'Draft versions cannot carry publication metadata';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.prevent_published_version_delete()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
    IF OLD.status IN ('published', 'archived') THEN
        RAISE EXCEPTION 'Cannot delete a published or archived form version';
    END IF;
    RETURN OLD;
END;
$$;

ALTER TABLE public.form_versions ADD CONSTRAINT form_versions_status_check
    CHECK (status IN ('draft', 'published', 'archived'));

-- Replace ambiguous correlated expressions with the existing platform helpers.
-- Builder writes require an active Business Admin or Super Admin membership.
DROP POLICY "Users can insert forms in their organizations" ON public.forms;
CREATE POLICY "Users can insert forms in their organizations" ON public.forms
FOR INSERT TO authenticated WITH CHECK (
    public.get_organization_role(forms.organization_id) IN ('super_admin', 'business_admin')
    AND created_by = auth.uid()
);
DROP POLICY "Users can update forms in their organizations" ON public.forms;
CREATE POLICY "Users can update forms in their organizations" ON public.forms
FOR UPDATE TO authenticated
USING (public.get_organization_role(forms.organization_id) IN ('super_admin', 'business_admin'))
WITH CHECK (public.get_organization_role(forms.organization_id) IN ('super_admin', 'business_admin'));

DROP POLICY "Users can insert form versions in their organizations" ON public.form_versions;
CREATE POLICY "Users can insert form versions in their organizations" ON public.form_versions
FOR INSERT TO authenticated WITH CHECK (
    public.get_organization_role(form_versions.organization_id) IN ('super_admin', 'business_admin')
    AND created_by = auth.uid() AND status = 'draft'
    AND published_by IS NULL AND published_at IS NULL
);
DROP POLICY "Users can update form versions in their organizations" ON public.form_versions;
CREATE POLICY "Users can update form versions in their organizations" ON public.form_versions
FOR UPDATE TO authenticated
USING (public.get_organization_role(form_versions.organization_id) IN ('super_admin', 'business_admin'))
WITH CHECK (public.get_organization_role(form_versions.organization_id) IN ('super_admin', 'business_admin'));
DROP POLICY "Users can delete form versions in their organizations" ON public.form_versions;
CREATE POLICY "Users can delete form versions in their organizations" ON public.form_versions
FOR DELETE TO authenticated
USING (public.get_organization_role(form_versions.organization_id) IN ('super_admin', 'business_admin'));
