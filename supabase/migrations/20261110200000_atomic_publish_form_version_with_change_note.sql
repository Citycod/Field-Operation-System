-- Migration: 20261110200000_atomic_publish_form_version_with_change_note.sql
-- Description: Make publication and change_note update atomic in publish_form_version RPC.

-- Drop the old 2-argument signature to avoid ambiguous function call resolution in PostgreSQL.
DROP FUNCTION IF EXISTS public.publish_form_version(uuid, uuid);

CREATE OR REPLACE FUNCTION public.publish_form_version(
    p_form_id uuid,
    p_version_id uuid,
    p_change_note text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    v_user_id uuid := auth.uid();
    v_org_id uuid;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'publish_form_version requires an authenticated user context';
    END IF;

    -- Serialize publication for this form and verify organization-level publishing authorization.
    SELECT organization_id INTO v_org_id
    FROM public.forms
    WHERE id = p_form_id
      AND public.get_organization_role(organization_id) IN ('super_admin', 'business_admin')
    FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Form not found or publishing not authorized';
    END IF;

    -- Atomically update status, audit timestamps, publisher, and optional change_note in the same transaction
    -- with explicit form_id, version_id, status, and organization_id scoping.
    UPDATE public.form_versions
    SET status = 'published',
        published_by = v_user_id,
        published_at = now(),
        change_note = COALESCE(p_change_note, change_note)
    WHERE id = p_version_id
      AND form_id = p_form_id
      AND organization_id = v_org_id
      AND status = 'draft';
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Version is not a valid draft for this form';
    END IF;

    -- Atomically update form pointers
    UPDATE public.forms
    SET current_published_version_id = p_version_id,
        current_draft_version_id = NULL,
        updated_at = now()
    WHERE id = p_form_id;
END;
$$;

REVOKE ALL ON FUNCTION public.publish_form_version(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.publish_form_version(uuid, uuid, text) TO authenticated;

