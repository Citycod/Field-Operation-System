-- Migration: Stage 5 — Tenant Management, Membership Governance & Audit Logging
-- Target: Supabase / PostgreSQL
-- Description:
-- 1. Adds suspension tracking columns to public.organizations
-- 2. Creates public.platform_administrators table with role constraints and RLS
-- 3. Creates public.audit_logs table with append-only immutability trigger and tenant/platform RLS
-- 4. Installs manage_organization_membership RPC with organization row serialization and last-admin guard
-- 5. Installs manage_organization_lifecycle RPC for governed active/suspended/archived transitions
-- 6. Installs reactivate_voluntary_suspension RPC for safe tenant-owner recovery
-- 7. Installs get_organization_members_roster RPC for profile-joined membership listing
-- 8. Configures least-privilege function execution grants

-- -----------------------------------------------------------------------------
-- 1. ALTER ORGANIZATIONS TABLE
-- -----------------------------------------------------------------------------
ALTER TABLE public.organizations
    ADD COLUMN IF NOT EXISTS suspension_type TEXT,
    ADD COLUMN IF NOT EXISTS suspended_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS suspension_reason TEXT,
    ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_suspension_type'
    ) THEN
        ALTER TABLE public.organizations
            ADD CONSTRAINT chk_suspension_type
            CHECK (suspension_type IS NULL OR suspension_type IN ('voluntary', 'platform_enforcement'));
    END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_organizations_suspension_type
    ON public.organizations(suspension_type)
    WHERE suspension_type IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 2. PLATFORM ADMINISTRATORS TABLE & HELPERS
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.platform_administrators (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'platform_support',
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    CONSTRAINT chk_platform_admin_role CHECK (role IN ('platform_super_admin', 'platform_support', 'platform_auditor'))
);

ALTER TABLE public.platform_administrators ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.platform_administrators FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.platform_administrators
        WHERE user_id = auth.uid()
    );
$$;

REVOKE ALL ON FUNCTION public.is_platform_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_platform_admin() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.is_platform_super_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.platform_administrators
        WHERE user_id = auth.uid() AND role = 'platform_super_admin'
    );
$$;

REVOKE ALL ON FUNCTION public.is_platform_super_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_platform_super_admin() TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 3. AUDIT LOGS TABLE & IMMUTABILITY TRIGGER
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE RESTRICT,
    actor_id UUID,
    actor_email TEXT NOT NULL,
    actor_role TEXT NOT NULL,
    actor_display_name TEXT,
    event_type TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id UUID NOT NULL,
    action TEXT NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_org_created 
    ON public.audit_logs(organization_id, created_at DESC) 
    WHERE organization_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_audit_logs_event_type 
    ON public.audit_logs(event_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_actor 
    ON public.audit_logs(actor_id, created_at DESC) 
    WHERE actor_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.enforce_audit_log_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    RAISE EXCEPTION 'AUDIT_LOG_IMMUTABLE: Audit records cannot be modified, deleted, or truncated.';
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_logs_immutable ON public.audit_logs;
CREATE TRIGGER trg_audit_logs_immutable
    BEFORE UPDATE OR DELETE ON public.audit_logs
    FOR EACH ROW
    EXECUTE FUNCTION public.enforce_audit_log_immutability();

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.audit_logs FROM PUBLIC, anon, authenticated;
REVOKE TRUNCATE ON TABLE public.audit_logs FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.audit_logs TO authenticated;

DROP POLICY IF EXISTS "Tenant admins can view own org audit logs" ON public.audit_logs;
CREATE POLICY "Tenant admins can view own org audit logs"
    ON public.audit_logs FOR SELECT TO authenticated
    USING (
        organization_id IS NOT NULL 
        AND public.is_organization_member(organization_id) 
        AND public.get_organization_role(organization_id) IN ('super_admin', 'business_admin')
    );

DROP POLICY IF EXISTS "Platform admins can view all audit logs" ON public.audit_logs;
CREATE POLICY "Platform admins can view all audit logs"
    ON public.audit_logs FOR SELECT TO authenticated
    USING (public.is_platform_admin());

-- Internal Audit Logger Helper
CREATE OR REPLACE FUNCTION public.internal_record_audit_event(
    p_organization_id UUID,
    p_event_type TEXT,
    p_entity_type TEXT,
    p_entity_id UUID,
    p_action TEXT,
    p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_actor_email TEXT := 'system@internal';
    v_actor_role TEXT := 'system';
    v_actor_name TEXT := 'System';
    v_audit_id UUID;
    v_now TIMESTAMPTZ := now();
BEGIN
    IF v_user_id IS NOT NULL THEN
        SELECT COALESCE(email, 'unknown@internal') INTO v_actor_email
        FROM auth.users
        WHERE id = v_user_id;

        SELECT display_name INTO v_actor_name
        FROM public.profiles
        WHERE id = v_user_id;

        IF p_organization_id IS NOT NULL THEN
            SELECT COALESCE(role_key, 'unknown') INTO v_actor_role
            FROM public.organization_memberships
            WHERE organization_id = p_organization_id AND user_id = v_user_id;
        ELSE
            SELECT COALESCE(role, 'platform_admin') INTO v_actor_role
            FROM public.platform_administrators
            WHERE user_id = v_user_id;
        END IF;

        v_actor_role := COALESCE(v_actor_role, 'authenticated');
    END IF;

    INSERT INTO public.audit_logs (
        organization_id,
        actor_id,
        actor_email,
        actor_role,
        actor_display_name,
        event_type,
        entity_type,
        entity_id,
        action,
        metadata,
        created_at
    ) VALUES (
        p_organization_id,
        v_user_id,
        v_actor_email,
        v_actor_role,
        v_actor_name,
        p_event_type,
        p_entity_type,
        p_entity_id,
        p_action,
        COALESCE(p_metadata, '{}'::jsonb),
        v_now
    ) RETURNING id INTO v_audit_id;

    RETURN v_audit_id;
END;
$$;

REVOKE ALL ON FUNCTION public.internal_record_audit_event(UUID, TEXT, TEXT, UUID, TEXT, JSONB) FROM PUBLIC, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 4. MANAGE ORGANIZATION MEMBERSHIP RPC
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.manage_organization_membership(
    p_organization_id UUID,
    p_target_user_id UUID,
    p_action TEXT,
    p_new_role TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_caller_role TEXT;
    v_caller_status TEXT;
    v_target_record RECORD;
    v_org RECORD;
    v_remaining_admins INTEGER;
    v_now TIMESTAMPTZ := now();
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'AUTHENTICATION_REQUIRED: Sign in required to manage memberships';
    END IF;

    IF p_action NOT IN ('update_role', 'remove') THEN
        RAISE EXCEPTION 'INVALID_ACTION: Action must be either "update_role" or "remove"';
    END IF;

    IF p_action = 'update_role' AND (p_new_role IS NULL OR p_new_role NOT IN ('super_admin', 'business_admin', 'manager', 'employee')) THEN
        RAISE EXCEPTION 'INVALID_ROLE: Role must be one of: super_admin, business_admin, manager, employee';
    END IF;

    -- Level 1: Organization Row Lock (FOR NO KEY UPDATE)
    SELECT id, status INTO v_org
    FROM public.organizations
    WHERE id = p_organization_id
    FOR NO KEY UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'ORGANIZATION_NOT_FOUND: Organization does not exist';
    END IF;

    IF v_org.status <> 'active' THEN
        RAISE EXCEPTION 'ORGANIZATION_INACTIVE: Cannot modify memberships in a non-active organization (status: %)', v_org.status;
    END IF;

    -- Level 2: Caller Membership Role Verification
    SELECT role_key, status INTO v_caller_role, v_caller_status
    FROM public.organization_memberships
    WHERE organization_id = p_organization_id AND user_id = v_user_id;

    IF NOT FOUND OR v_caller_status <> 'active' THEN
        RAISE EXCEPTION 'UNAUTHORIZED: Active organization membership required';
    END IF;

    -- Self-leave allowed; all other actions require administrator privileges
    IF v_user_id <> p_target_user_id AND v_caller_role NOT IN ('super_admin', 'business_admin') THEN
        RAISE EXCEPTION 'UNAUTHORIZED: Administrator access required to modify member roles or remove members';
    END IF;

    -- Hierarchical RBAC: Only super_admin can grant super_admin
    IF p_action = 'update_role' AND p_new_role = 'super_admin' AND v_caller_role <> 'super_admin' THEN
        RAISE EXCEPTION 'UNAUTHORIZED: Only a super administrator can grant super_admin privileges';
    END IF;

    -- Level 3: Target Membership Row Lock (FOR UPDATE directly; no lock upgrade)
    SELECT id, role_key, status INTO v_target_record
    FROM public.organization_memberships
    WHERE organization_id = p_organization_id AND user_id = p_target_user_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'MEMBERSHIP_NOT_FOUND: Target user is not a member of this organization';
    END IF;

    -- Hierarchical RBAC: business_admin cannot demote or remove super_admin
    IF v_user_id <> p_target_user_id AND v_target_record.role_key = 'super_admin' AND v_caller_role <> 'super_admin' THEN
        RAISE EXCEPTION 'UNAUTHORIZED: Business administrators cannot modify or remove a super administrator';
    END IF;

    -- Invariant: Last Administrator Protection
    IF v_target_record.role_key IN ('super_admin', 'business_admin') AND v_target_record.status = 'active' THEN
        IF p_action = 'remove' OR (p_action = 'update_role' AND p_new_role NOT IN ('super_admin', 'business_admin')) THEN
            SELECT count(*) INTO v_remaining_admins
            FROM public.organization_memberships
            WHERE organization_id = p_organization_id
              AND user_id <> p_target_user_id
              AND role_key IN ('super_admin', 'business_admin')
              AND status = 'active';

            IF v_remaining_admins < 1 THEN
                RAISE EXCEPTION 'CANNOT_REMOVE_LAST_ADMIN: Organization must retain at least one active administrator';
            END IF;
        END IF;
    END IF;

    -- Execute Action
    IF p_action = 'update_role' THEN
        UPDATE public.organization_memberships
        SET role_key = p_new_role, updated_at = v_now
        WHERE id = v_target_record.id;

        PERFORM public.internal_record_audit_event(
            p_organization_id,
            'member.role_updated',
            'organization_membership',
            v_target_record.id,
            'update_role',
            jsonb_build_object(
                'target_user_id', p_target_user_id,
                'old_role', v_target_record.role_key,
                'new_role', p_new_role
            )
        );

        RETURN jsonb_build_object(
            'success', true,
            'action', 'update_role',
            'membership_id', v_target_record.id,
            'organization_id', p_organization_id,
            'user_id', p_target_user_id,
            'role_key', p_new_role,
            'status', v_target_record.status,
            'updated_at', v_now
        );
    ELSE -- p_action = 'remove'
        UPDATE public.organization_memberships
        SET status = 'disabled', updated_at = v_now
        WHERE id = v_target_record.id;

        PERFORM public.internal_record_audit_event(
            p_organization_id,
            'member.removed',
            'organization_membership',
            v_target_record.id,
            'remove',
            jsonb_build_object(
                'target_user_id', p_target_user_id,
                'previous_role', v_target_record.role_key,
                'is_self_removal', (v_user_id = p_target_user_id)
            )
        );

        RETURN jsonb_build_object(
            'success', true,
            'action', 'remove',
            'membership_id', v_target_record.id,
            'organization_id', p_organization_id,
            'user_id', p_target_user_id,
            'status', 'disabled',
            'updated_at', v_now
        );
    END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.manage_organization_membership(UUID, UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.manage_organization_membership(UUID, UUID, TEXT, TEXT) TO authenticated;

-- -----------------------------------------------------------------------------
-- 5. MANAGE ORGANIZATION LIFECYCLE RPC
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.manage_organization_lifecycle(
    p_organization_id UUID,
    p_new_status TEXT,
    p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_is_platform_admin BOOLEAN := public.is_platform_admin();
    v_is_platform_super BOOLEAN := public.is_platform_super_admin();
    v_caller_role TEXT;
    v_caller_status TEXT;
    v_org RECORD;
    v_suspension_type TEXT;
    v_now TIMESTAMPTZ := now();
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'AUTHENTICATION_REQUIRED: Sign in required to manage workspace lifecycle';
    END IF;

    IF p_new_status NOT IN ('active', 'suspended', 'archived') THEN
        RAISE EXCEPTION 'INVALID_STATUS: Status must be active, suspended, or archived';
    END IF;

    -- Level 1: Organization Row Lock (FOR UPDATE)
    SELECT id, name, slug, status, suspension_type INTO v_org
    FROM public.organizations
    WHERE id = p_organization_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'ORGANIZATION_NOT_FOUND: Organization does not exist';
    END IF;

    IF v_org.status = p_new_status THEN
        RETURN jsonb_build_object(
            'success', true,
            'already_in_state', true,
            'organization_id', p_organization_id,
            'status', v_org.status
        );
    END IF;

    -- Evaluate Authority & Transition Matrix
    IF v_is_platform_admin THEN
        -- Platform Admins can suspend or archive any org
        IF p_new_status = 'suspended' THEN
            v_suspension_type := 'platform_enforcement';
        ELSIF p_new_status = 'active' THEN
            -- Reactivating from archived requires platform super admin
            IF v_org.status = 'archived' AND NOT v_is_platform_super THEN
                RAISE EXCEPTION 'UNAUTHORIZED: Platform Super Administrator privileges required to restore archived organizations';
            END IF;
            v_suspension_type := NULL;
        ELSIF p_new_status = 'archived' THEN
            v_suspension_type := NULL;
        END IF;
    ELSE
        -- Tenant Administrator Governance
        SELECT role_key, status INTO v_caller_role, v_caller_status
        FROM public.organization_memberships
        WHERE organization_id = p_organization_id AND user_id = v_user_id;

        IF NOT FOUND OR v_caller_status <> 'active' OR v_caller_role <> 'super_admin' THEN
            RAISE EXCEPTION 'UNAUTHORIZED: Only a tenant super administrator can manage organization lifecycle';
        END IF;

        IF p_new_status = 'suspended' THEN
            IF v_org.status <> 'active' THEN
                RAISE EXCEPTION 'INVALID_TRANSITION: Only active organizations can be voluntarily suspended';
            END IF;
            v_suspension_type := 'voluntary';
        ELSIF p_new_status = 'archived' THEN
            IF v_org.status NOT IN ('active', 'suspended') THEN
                RAISE EXCEPTION 'INVALID_TRANSITION: Cannot archive organization in status "%"', v_org.status;
            END IF;
            v_suspension_type := NULL;
        ELSIF p_new_status = 'active' THEN
            RAISE EXCEPTION 'UNAUTHORIZED: Use reactivate_voluntary_suspension() to restore voluntary suspensions';
        END IF;
    END IF;

    -- Update Organization
    UPDATE public.organizations
    SET
        status = p_new_status,
        suspension_type = v_suspension_type,
        suspended_by_user_id = CASE WHEN p_new_status = 'suspended' THEN v_user_id ELSE NULL END,
        suspension_reason = CASE WHEN p_new_status = 'suspended' THEN nullif(btrim(p_reason), '') ELSE NULL END,
        suspended_at = CASE WHEN p_new_status = 'suspended' THEN v_now ELSE NULL END,
        updated_at = v_now
    WHERE id = p_organization_id;

    -- If archiving, automatically revoke all pending invitations
    IF p_new_status = 'archived' THEN
        UPDATE public.organization_invitations
        SET status = 'revoked', revoked_at = v_now, updated_at = v_now
        WHERE organization_id = p_organization_id AND status = 'pending';
    END IF;

    -- Audit Logging
    PERFORM public.internal_record_audit_event(
        p_organization_id,
        'organization.status_changed',
        'organization',
        p_organization_id,
        'lifecycle_' || p_new_status,
        jsonb_build_object(
            'old_status', v_org.status,
            'new_status', p_new_status,
            'suspension_type', v_suspension_type,
            'reason', p_reason,
            'initiated_by_platform_admin', v_is_platform_admin
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'organization_id', p_organization_id,
        'old_status', v_org.status,
        'new_status', p_new_status,
        'suspension_type', v_suspension_type,
        'updated_at', v_now
    );
END;
$$;

REVOKE ALL ON FUNCTION public.manage_organization_lifecycle(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.manage_organization_lifecycle(UUID, TEXT, TEXT) TO authenticated;

-- -----------------------------------------------------------------------------
-- 6. REACTIVATE VOLUNTARY SUSPENSION RPC
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reactivate_voluntary_suspension(
    p_organization_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_org RECORD;
    v_caller_role TEXT;
    v_caller_status TEXT;
    v_now TIMESTAMPTZ := now();
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'AUTHENTICATION_REQUIRED: Sign in required to reactivate workspace';
    END IF;

    -- Level 1: Organization Row Lock (FOR UPDATE)
    SELECT id, status, suspension_type, suspended_by_user_id
    INTO v_org
    FROM public.organizations
    WHERE id = p_organization_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'ORGANIZATION_NOT_FOUND: Organization does not exist';
    END IF;

    IF v_org.status <> 'suspended' THEN
        RAISE EXCEPTION 'INVALID_OPERATION: Organization is not suspended (current status: %)', v_org.status;
    END IF;

    IF v_org.suspension_type IS DISTINCT FROM 'voluntary' THEN
        RAISE EXCEPTION 'UNAUTHORIZED_REACTIVATION: Organization was suspended by platform administration. Contact platform support.';
    END IF;

    -- Caller Verification
    SELECT role_key, status INTO v_caller_role, v_caller_status
    FROM public.organization_memberships
    WHERE organization_id = p_organization_id AND user_id = v_user_id;

    IF NOT FOUND OR v_caller_status <> 'active' OR v_caller_role NOT IN ('super_admin', 'business_admin') THEN
        RAISE EXCEPTION 'UNAUTHORIZED: Only an active administrator can reactivate this organization';
    END IF;

    -- Atomic Reactivation
    UPDATE public.organizations
    SET
        status = 'active',
        suspension_type = NULL,
        suspended_by_user_id = NULL,
        suspension_reason = NULL,
        suspended_at = NULL,
        updated_at = v_now
    WHERE id = p_organization_id;

    -- Audit Logging
    PERFORM public.internal_record_audit_event(
        p_organization_id,
        'organization.voluntarily_reactivated',
        'organization',
        p_organization_id,
        'reactivate',
        jsonb_build_object('reactivated_at', v_now)
    );

    RETURN jsonb_build_object(
        'success', true,
        'organization_id', p_organization_id,
        'status', 'active',
        'reactivated_at', v_now
    );
END;
$$;

REVOKE ALL ON FUNCTION public.reactivate_voluntary_suspension(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reactivate_voluntary_suspension(UUID) TO authenticated;

-- -----------------------------------------------------------------------------
-- 7. GET ORGANIZATION MEMBERS ROSTER RPC
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_organization_members_roster(
    p_organization_id UUID
)
RETURNS TABLE (
    membership_id UUID,
    organization_id UUID,
    user_id UUID,
    role_key TEXT,
    status TEXT,
    email TEXT,
    first_name TEXT,
    last_name TEXT,
    display_name TEXT,
    avatar_url TEXT,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_caller_role TEXT;
    v_caller_status TEXT;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'AUTHENTICATION_REQUIRED: Sign in required to view organization roster';
    END IF;

    -- Caller must be active member of target organization OR platform admin
    IF NOT public.is_platform_admin() THEN
        SELECT m.role_key, m.status INTO v_caller_role, v_caller_status
        FROM public.organization_memberships m
        JOIN public.organizations o ON o.id = m.organization_id
        WHERE m.organization_id = p_organization_id 
          AND m.user_id = v_user_id
          AND m.status = 'active'
          AND o.status = 'active';

        IF NOT FOUND THEN
            RAISE EXCEPTION 'UNAUTHORIZED: Active membership in active organization required';
        END IF;
    END IF;

    RETURN QUERY
    SELECT 
        m.id AS membership_id,
        m.organization_id,
        m.user_id,
        m.role_key,
        m.status,
        u.email::TEXT,
        p.first_name,
        p.last_name,
        p.display_name,
        p.avatar_url,
        m.created_at,
        m.updated_at
    FROM public.organization_memberships m
    LEFT JOIN auth.users u ON u.id = m.user_id
    LEFT JOIN public.profiles p ON p.id = m.user_id
    WHERE m.organization_id = p_organization_id
    ORDER BY 
        CASE m.role_key 
            WHEN 'super_admin' THEN 1 
            WHEN 'business_admin' THEN 2 
            WHEN 'manager' THEN 3 
            WHEN 'employee' THEN 4 
            ELSE 5 
        END,
        m.created_at ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_organization_members_roster(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_organization_members_roster(UUID) TO authenticated;

