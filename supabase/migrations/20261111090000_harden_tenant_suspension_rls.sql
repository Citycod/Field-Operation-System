-- Migration: Harden tenant suspension and archival enforcement in PostgreSQL RLS
-- Target: Supabase / PostgreSQL
-- Description:
-- 1. Updates is_organization_member(target_org_id) to verify both membership.status = 'active'
--    AND organization.status = 'active'.
-- 2. Updates get_organization_role(target_org_id) to verify both membership.status = 'active'
--    AND organization.status = 'active'.
-- 3. Hardens forms and form_versions SELECT policies to use public.is_organization_member.
-- 4. Ensures explicit search_path and execution privileges to prevent security definer leakage.

-- -----------------------------------------------------------------------------
-- 1. HARDEN RLS HELPER: is_organization_member
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_organization_member(target_org_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id UUID := auth.uid();
BEGIN
    IF v_user_id IS NULL OR target_org_id IS NULL THEN
        RETURN FALSE;
    END IF;

    RETURN EXISTS (
        SELECT 1
        FROM public.organization_memberships m
        JOIN public.organizations o ON o.id = m.organization_id
        WHERE m.organization_id = target_org_id
          AND m.user_id = v_user_id
          AND m.status = 'active'
          AND o.status = 'active'
    );
END;
$$;

REVOKE ALL ON FUNCTION public.is_organization_member(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_organization_member(UUID) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 2. HARDEN RLS HELPER: get_organization_role
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_organization_role(target_org_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    user_role TEXT;
BEGIN
    IF v_user_id IS NULL OR target_org_id IS NULL THEN
        RETURN NULL;
    END IF;

    SELECT m.role_key INTO user_role
    FROM public.organization_memberships m
    JOIN public.organizations o ON o.id = m.organization_id
    WHERE m.organization_id = target_org_id
      AND m.user_id = v_user_id
      AND m.status = 'active'
      AND o.status = 'active';

    RETURN user_role;
END;
$$;

REVOKE ALL ON FUNCTION public.get_organization_role(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_organization_role(UUID) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 3. CANONICALIZE FORMS AND FORM_VERSIONS SELECT POLICIES
-- -----------------------------------------------------------------------------
-- Previously, forms and form_versions used inline EXISTS subqueries on organization_memberships
-- that did not evaluate organization status. Route them through the hardened is_organization_member helper.

DROP POLICY IF EXISTS "Users can view forms in their organizations" ON public.forms;
CREATE POLICY "Users can view forms in their organizations" ON public.forms
    FOR SELECT TO authenticated
    USING (public.is_organization_member(forms.organization_id));

DROP POLICY IF EXISTS "Users can view form versions in their organizations" ON public.form_versions;
CREATE POLICY "Users can view form versions in their organizations" ON public.form_versions
    FOR SELECT TO authenticated
    USING (public.is_organization_member(form_versions.organization_id));

