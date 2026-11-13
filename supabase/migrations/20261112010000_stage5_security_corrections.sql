-- Migration: Stage 5 Security Corrections & Stage 4 Audit Instrumentation
-- Target: Supabase / PostgreSQL
-- Description:
-- 1. Explicitly revokes TRUNCATE on public.audit_logs from PUBLIC, anon, authenticated, and service_role
-- 2. Adds statement-level trigger trg_audit_logs_truncate as defense-in-depth against TRUNCATE
-- 3. Adds is_active and updated_at to public.platform_administrators with is_active validation in helpers
-- 4. Installs appoint_platform_administrator and revoke_platform_administrator RPCs with advisory lock serialization and last-super-admin protection
-- 5. Hardens manage_organization_lifecycle with explicit role separation (platform_auditor denied, platform_support restricted, platform_super_admin governance)
-- 6. Aligns reactivate_voluntary_suspension to strictly require tenant super_admin
-- 7. Instruments Stage 4 procedures (complete_organization_onboarding, create_organization_invitation, accept_organization_invitation, revoke_organization_invitation) with atomic audit event recording

-- -----------------------------------------------------------------------------
-- 1. AUDIT LOG TRUNCATE HARDENING
-- -----------------------------------------------------------------------------
REVOKE TRUNCATE ON TABLE public.audit_logs FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.enforce_audit_log_truncate_protection()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    RAISE EXCEPTION 'AUDIT_LOG_IMMUTABLE: Truncation of audit_logs is strictly prohibited.';
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_logs_truncate ON public.audit_logs;
CREATE TRIGGER trg_audit_logs_truncate
    BEFORE TRUNCATE ON public.audit_logs
    FOR EACH STATEMENT
    EXECUTE FUNCTION public.enforce_audit_log_truncate_protection();

-- -----------------------------------------------------------------------------
-- 2. PLATFORM ADMINISTRATOR LIFECYCLE & HELPERS
-- -----------------------------------------------------------------------------
ALTER TABLE public.platform_administrators
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now());

CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.platform_administrators
        WHERE user_id = auth.uid() AND is_active = true
    );
$$;

CREATE OR REPLACE FUNCTION public.is_platform_super_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.platform_administrators
        WHERE user_id = auth.uid() AND role = 'platform_super_admin' AND is_active = true
    );
$$;

CREATE OR REPLACE FUNCTION public.get_platform_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT role FROM public.platform_administrators
    WHERE user_id = auth.uid() AND is_active = true;
$$;

REVOKE ALL ON FUNCTION public.get_platform_role() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_platform_role() TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 3. APPOINT & REVOKE PLATFORM ADMINISTRATOR RPCS
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.appoint_platform_administrator(
    p_user_id UUID,
    p_role TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_id UUID := auth.uid();
    v_caller_role TEXT;
    v_caller_active BOOLEAN;
    v_existing RECORD;
    v_now TIMESTAMPTZ := timezone('utc'::text, now());
BEGIN
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'AUTHENTICATION_REQUIRED: Sign in required to appoint platform administrators';
    END IF;

    IF p_role NOT IN ('platform_super_admin', 'platform_support', 'platform_auditor') THEN
        RAISE EXCEPTION 'INVALID_ROLE: Role must be platform_super_admin, platform_support, or platform_auditor';
    END IF;

    -- Verify target user exists in auth.users
    IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_user_id) THEN
        RAISE EXCEPTION 'USER_NOT_FOUND: Target user does not exist';
    END IF;

    -- Acquire global platform governance advisory lock to serialize platform administrator mutations
    PERFORM pg_advisory_xact_lock(hashtext('platform_administrators_governance_lock')::bigint);

    -- Caller MUST be an active platform_super_admin
    SELECT role, is_active INTO v_caller_role, v_caller_active
    FROM public.platform_administrators
    WHERE user_id = v_caller_id;

    IF NOT FOUND OR v_caller_active IS NOT TRUE OR v_caller_role <> 'platform_super_admin' THEN
        RAISE EXCEPTION 'UNAUTHORIZED: Only an active platform super administrator can appoint platform administrators';
    END IF;

    -- Check if target user record already exists
    SELECT * INTO v_existing
    FROM public.platform_administrators
    WHERE user_id = p_user_id
    FOR UPDATE;

    IF FOUND THEN
        UPDATE public.platform_administrators
        SET
            role = p_role,
            is_active = true,
            updated_at = v_now
        WHERE user_id = p_user_id;
    ELSE
        INSERT INTO public.platform_administrators (
            user_id,
            role,
            is_active,
            created_at,
            created_by,
            updated_at
        ) VALUES (
            p_user_id,
            p_role,
            true,
            v_now,
            v_caller_id,
            v_now
        );
    END IF;

    -- Record event in audit log (organization_id is NULL for platform-level events)
    PERFORM public.internal_record_audit_event(
        NULL,
        'platform_admin.appointed',
        'platform_administrator',
        p_user_id,
        'appoint',
        jsonb_build_object(
            'target_user_id', p_user_id,
            'role', p_role,
            'previous_role', CASE WHEN v_existing IS NOT NULL THEN v_existing.role ELSE NULL END,
            'was_reactivated', CASE WHEN v_existing IS NOT NULL AND v_existing.is_active IS FALSE THEN true ELSE false END
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'user_id', p_user_id,
        'role', p_role,
        'is_active', true,
        'updated_at', v_now
    );
END;
$$;

REVOKE ALL ON FUNCTION public.appoint_platform_administrator(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.appoint_platform_administrator(UUID, TEXT) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.revoke_platform_administrator(
    p_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_id UUID := auth.uid();
    v_caller_role TEXT;
    v_caller_active BOOLEAN;
    v_target RECORD;
    v_remaining_super_admins INTEGER;
    v_now TIMESTAMPTZ := timezone('utc'::text, now());
BEGIN
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'AUTHENTICATION_REQUIRED: Sign in required to revoke platform administrators';
    END IF;

    -- Acquire global platform governance advisory lock to serialize platform administrator mutations
    PERFORM pg_advisory_xact_lock(hashtext('platform_administrators_governance_lock')::bigint);

    -- Caller MUST be an active platform_super_admin
    SELECT role, is_active INTO v_caller_role, v_caller_active
    FROM public.platform_administrators
    WHERE user_id = v_caller_id;

    IF NOT FOUND OR v_caller_active IS NOT TRUE OR v_caller_role <> 'platform_super_admin' THEN
        RAISE EXCEPTION 'UNAUTHORIZED: Only an active platform super administrator can revoke platform administrators';
    END IF;

    -- Lock target user record
    SELECT * INTO v_target
    FROM public.platform_administrators
    WHERE user_id = p_user_id
    FOR UPDATE;

    IF NOT FOUND OR v_target.is_active IS FALSE THEN
        RAISE EXCEPTION 'NOT_FOUND: Active platform administrator record not found for user';
    END IF;

    -- Prevent removal or deactivation of the last active platform super admin
    IF v_target.role = 'platform_super_admin' THEN
        SELECT count(*) INTO v_remaining_super_admins
        FROM public.platform_administrators
        WHERE role = 'platform_super_admin'
          AND is_active = true
          AND user_id <> p_user_id;

        IF v_remaining_super_admins < 1 THEN
            RAISE EXCEPTION 'CANNOT_REMOVE_LAST_PLATFORM_SUPER_ADMIN: At least one active platform super administrator must be retained';
        END IF;
    END IF;

    -- Deactivate
    UPDATE public.platform_administrators
    SET
        is_active = false,
        updated_at = v_now
    WHERE user_id = p_user_id;

    -- Record event in audit log
    PERFORM public.internal_record_audit_event(
        NULL,
        'platform_admin.revoked',
        'platform_administrator',
        p_user_id,
        'revoke',
        jsonb_build_object(
            'target_user_id', p_user_id,
            'previous_role', v_target.role,
            'is_self_revocation', (v_caller_id = p_user_id)
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'user_id', p_user_id,
        'is_active', false,
        'updated_at', v_now
    );
END;
$$;

REVOKE ALL ON FUNCTION public.revoke_platform_administrator(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revoke_platform_administrator(UUID) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 4. MANAGE ORGANIZATION LIFECYCLE RPC (HARMONIZED & ROLE-SEPARATED)
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
    v_platform_role TEXT := public.get_platform_role();
    v_is_platform BOOLEAN := (v_platform_role IS NOT NULL);
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

    -- Authority & Transition Matrix Evaluation
    IF v_is_platform THEN
        -- Platform Role Separation:
        -- 1. platform_auditor is strictly read-only
        IF v_platform_role = 'platform_auditor' THEN
            RAISE EXCEPTION 'UNAUTHORIZED: Platform auditors possess read-only privileges and cannot mutate workspace lifecycle state';
        END IF;

        -- 2. platform_support can perform operational suspensions or lift platform suspensions, but CANNOT archive or restore archived
        IF v_platform_role = 'platform_support' THEN
            IF p_new_status = 'archived' OR v_org.status = 'archived' THEN
                RAISE EXCEPTION 'UNAUTHORIZED: Platform Super Administrator privileges required to archive organizations or restore archived organizations';
            END IF;
            IF p_new_status = 'suspended' THEN
                v_suspension_type := 'platform_enforcement';
            ELSIF p_new_status = 'active' THEN
                v_suspension_type := NULL;
            END IF;
        -- 3. platform_super_admin has full platform lifecycle governance
        ELSIF v_platform_role = 'platform_super_admin' THEN
            IF p_new_status = 'suspended' THEN
                v_suspension_type := 'platform_enforcement';
            ELSIF p_new_status = 'active' THEN
                v_suspension_type := NULL;
            ELSIF p_new_status = 'archived' THEN
                v_suspension_type := NULL;
            END IF;
        ELSE
            RAISE EXCEPTION 'UNAUTHORIZED: Unrecognized platform role: %', v_platform_role;
        END IF;
    ELSE
        -- Tenant Administrator Governance:
        -- Only tenant super_admin can voluntarily suspend or archive
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
            'initiated_by_platform_admin', v_is_platform,
            'platform_role', v_platform_role
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
GRANT EXECUTE ON FUNCTION public.manage_organization_lifecycle(UUID, TEXT, TEXT) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 5. REACTIVATE VOLUNTARY SUSPENSION RPC (ALIGNED TO SUPER_ADMIN ONLY)
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

    -- Caller Verification: STRICTLY tenant super_admin
    SELECT role_key, status INTO v_caller_role, v_caller_status
    FROM public.organization_memberships
    WHERE organization_id = p_organization_id AND user_id = v_user_id;

    IF NOT FOUND OR v_caller_status <> 'active' OR v_caller_role <> 'super_admin' THEN
        RAISE EXCEPTION 'UNAUTHORIZED: Only a tenant super administrator can reactivate a voluntarily suspended workspace';
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
GRANT EXECUTE ON FUNCTION public.reactivate_voluntary_suspension(UUID) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 6. STAGE 4 AUDIT INSTRUMENTATION
-- -----------------------------------------------------------------------------

-- 6.1 complete_organization_onboarding
CREATE OR REPLACE FUNCTION public.complete_organization_onboarding(
    p_organization_id UUID
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
    v_profile RECORD;
    v_now TIMESTAMPTZ := now();
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    -- Lock Level 1: Organization
    IF NOT EXISTS (
        SELECT 1 FROM public.organizations WHERE id = p_organization_id AND status = 'active' FOR SHARE
    ) THEN
        RAISE EXCEPTION 'Active organization not found';
    END IF;

    -- Lock Level 2: Caller Membership
    SELECT role_key, status INTO v_caller_role, v_caller_status
    FROM public.organization_memberships
    WHERE organization_id = p_organization_id AND user_id = v_user_id
    FOR SHARE;

    IF NOT FOUND OR v_caller_status <> 'active' OR v_caller_role NOT IN ('super_admin', 'business_admin') THEN
        RAISE EXCEPTION 'Unauthorized: Administrator access required';
    END IF;

    -- Lock Level 6: Profile
    SELECT organization_id, requires_onboarding, onboarding_completed, onboarding_status
    INTO v_profile
    FROM public.organization_profiles
    WHERE organization_id = p_organization_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Organization profile not found';
    END IF;

    IF v_profile.onboarding_completed THEN
        RETURN jsonb_build_object(
            'success', true,
            'already_completed', true,
            'organization_id', p_organization_id,
            'onboarding_completed', true,
            'onboarding_status', v_profile.onboarding_status
        );
    END IF;

    PERFORM set_config('app.authorized_onboarding_context', 'onboarding_completion', true);

    UPDATE public.organization_profiles
    SET
        onboarding_completed = true,
        onboarding_step = 'completed',
        onboarding_status = 'completed',
        onboarding_completed_at = COALESCE(onboarding_completed_at, v_now),
        updated_at = v_now
    WHERE organization_id = p_organization_id;

    PERFORM set_config('app.authorized_onboarding_context', '', true);

    -- Audit Logging
    PERFORM public.internal_record_audit_event(
        p_organization_id,
        'organization.onboarding_completed',
        'organization',
        p_organization_id,
        'complete_onboarding',
        jsonb_build_object(
            'organization_id', p_organization_id,
            'completed_by_user_id', v_user_id,
            'completed_at', v_now
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'organization_id', p_organization_id,
        'onboarding_completed', true,
        'onboarding_step', 'completed',
        'onboarding_status', 'completed',
        'onboarding_completed_at', v_now
    );
END;
$$;

REVOKE ALL ON FUNCTION public.complete_organization_onboarding(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_organization_onboarding(UUID) TO authenticated, service_role;

-- 6.2 create_organization_invitation
CREATE OR REPLACE FUNCTION public.create_organization_invitation(
    p_organization_id UUID,
    p_email TEXT,
    p_role TEXT,
    p_token_hash TEXT,
    p_expires_at TIMESTAMPTZ DEFAULT NULL
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
    v_clean_email TEXT;
    v_expires_at TIMESTAMPTZ;
    v_target_user_id UUID;
    v_existing_membership RECORD;
    v_existing_invite RECORD;
    v_invite_id UUID;
    v_now TIMESTAMPTZ := now();
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    -- Strict role validation: ONLY manager or employee
    IF p_role NOT IN ('manager', 'employee') THEN
        RAISE EXCEPTION 'Invalid invitation role: "%". Only "manager" and "employee" invitations are permitted.', p_role;
    END IF;

    -- Email normalization and format validation
    v_clean_email := lower(btrim(p_email));
    IF v_clean_email IS NULL OR length(v_clean_email) < 3 OR length(v_clean_email) > 255 OR v_clean_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
        RAISE EXCEPTION 'Invalid email address';
    END IF;

    -- Token hash validation: must be 64-character lowercase hex (SHA-256)
    IF p_token_hash IS NULL OR length(p_token_hash) <> 64 OR p_token_hash !~ '^[0-9a-f]{64}$' THEN
        RAISE EXCEPTION 'Invalid token hash format';
    END IF;

    v_expires_at := COALESCE(p_expires_at, v_now + INTERVAL '7 days');
    IF v_expires_at <= v_now THEN
        RAISE EXCEPTION 'Invitation expiration must be in the future';
    END IF;

    -- Lock Level 1: Organization FOR SHARE
    IF NOT EXISTS (
        SELECT 1 FROM public.organizations WHERE id = p_organization_id AND status = 'active' FOR SHARE
    ) THEN
        RAISE EXCEPTION 'Active organization not found';
    END IF;

    -- Lock Level 2: Caller Membership FOR SHARE
    SELECT role_key, status INTO v_caller_role, v_caller_status
    FROM public.organization_memberships
    WHERE organization_id = p_organization_id AND user_id = v_user_id
    FOR SHARE;

    IF NOT FOUND OR v_caller_status <> 'active' OR v_caller_role NOT IN ('super_admin', 'business_admin') THEN
        RAISE EXCEPTION 'Unauthorized: Administrator access required to invite members';
    END IF;

    -- Lock Level 3: Advisory lock for org + email serialization
    PERFORM pg_advisory_xact_lock(hashtext(p_organization_id::text), hashtext(v_clean_email));

    -- Check if target email belongs to existing active member
    SELECT id INTO v_target_user_id FROM auth.users WHERE lower(btrim(email)) = v_clean_email LIMIT 1;
    IF v_target_user_id IS NOT NULL THEN
        SELECT id, role_key, status INTO v_existing_membership
        FROM public.organization_memberships
        WHERE organization_id = p_organization_id AND user_id = v_target_user_id;

        IF FOUND AND v_existing_membership.status = 'active' THEN
            RAISE EXCEPTION 'User is already an active member of this organization';
        END IF;
    END IF;

    -- Lock Level 4: Existing pending invitation FOR UPDATE
    SELECT id, expires_at INTO v_existing_invite
    FROM public.organization_invitations
    WHERE organization_id = p_organization_id AND email = v_clean_email AND status = 'pending'
    FOR UPDATE;

    IF FOUND THEN
        IF v_existing_invite.expires_at > v_now THEN
            RAISE EXCEPTION 'An active invitation for this email already exists';
        ELSE
            UPDATE public.organization_invitations
            SET status = 'expired', updated_at = v_now
            WHERE id = v_existing_invite.id;
        END IF;
    END IF;

    -- Insert new invitation
    INSERT INTO public.organization_invitations (
        organization_id,
        email,
        role,
        status,
        token_hash,
        invited_by,
        expires_at,
        created_at,
        updated_at
    ) VALUES (
        p_organization_id,
        v_clean_email,
        p_role,
        'pending',
        p_token_hash,
        v_user_id,
        v_expires_at,
        v_now,
        v_now
    ) RETURNING id INTO v_invite_id;

    -- Audit Logging (Note: raw token and token_hash are strictly omitted from audit metadata)
    PERFORM public.internal_record_audit_event(
        p_organization_id,
        'invitation.created',
        'organization_invitation',
        v_invite_id,
        'create_invitation',
        jsonb_build_object(
            'invitation_id', v_invite_id,
            'email', v_clean_email,
            'role', p_role,
            'expires_at', v_expires_at
        )
    );

    RETURN jsonb_build_object(
        'id', v_invite_id,
        'organization_id', p_organization_id,
        'email', v_clean_email,
        'role', p_role,
        'status', 'pending',
        'expires_at', v_expires_at,
        'created_at', v_now
    );
END;
$$;

REVOKE ALL ON FUNCTION public.create_organization_invitation(UUID, TEXT, TEXT, TEXT, TIMESTAMPTZ) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_organization_invitation(UUID, TEXT, TEXT, TEXT, TIMESTAMPTZ) TO authenticated, service_role;

-- 6.3 accept_organization_invitation
CREATE OR REPLACE FUNCTION public.accept_organization_invitation(
    p_token_hash TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_user_email TEXT;
    v_initial_org_id UUID;
    v_invitation RECORD;
    v_org RECORD;
    v_existing_membership RECORD;
    v_membership_id UUID;
    v_now TIMESTAMPTZ := now();
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'AUTHENTICATION_REQUIRED: Sign in is required to accept an invitation';
    END IF;

    IF p_token_hash IS NULL OR length(p_token_hash) <> 64 OR p_token_hash !~ '^[0-9a-f]{64}$' THEN
        RAISE EXCEPTION 'INVALID_TOKEN: Invalid invitation token';
    END IF;

    -- Fetch caller's verified email from auth.users
    SELECT lower(btrim(email)) INTO v_user_email
    FROM auth.users
    WHERE id = v_user_id;

    IF v_user_email IS NULL THEN
        RAISE EXCEPTION 'USER_NOT_FOUND: User account does not have an email';
    END IF;

    -- Step 1: Initial non-locking lookup of target organization_id
    SELECT organization_id
    INTO v_initial_org_id
    FROM public.organization_invitations
    WHERE token_hash = p_token_hash;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'INVITATION_NOT_FOUND: The invitation was not found';
    END IF;

    -- Step 2: Lock Level 1: Organization FOR SHARE
    SELECT id, status INTO v_org
    FROM public.organizations
    WHERE id = v_initial_org_id
    FOR SHARE;

    IF NOT FOUND OR v_org.status <> 'active' THEN
        RAISE EXCEPTION 'ORGANIZATION_INACTIVE: Target organization is not active';
    END IF;

    -- Step 3: Lock Level 3: Advisory lock for (organization_id, user_id)
    PERFORM pg_advisory_xact_lock(hashtext(v_initial_org_id::text), hashtext(v_user_id::text));

    -- Step 4: Lock Level 4: Lock the invitation row by token_hash
    SELECT id, organization_id, email, role, status, expires_at
    INTO v_invitation
    FROM public.organization_invitations
    WHERE token_hash = p_token_hash
    FOR UPDATE;

    -- Step 5: Post-lock revalidation
    IF NOT FOUND THEN
        RAISE EXCEPTION 'INVITATION_NOT_FOUND: The invitation was not found';
    END IF;

    IF v_invitation.organization_id <> v_initial_org_id THEN
        RAISE EXCEPTION 'INVITATION_INVALID: Organization mismatch detected';
    END IF;

    IF v_invitation.status <> 'pending' THEN
        RAISE EXCEPTION 'INVITATION_INVALID: Invitation status is %', v_invitation.status;
    END IF;

    IF v_invitation.expires_at <= v_now THEN
        UPDATE public.organization_invitations
        SET status = 'expired', updated_at = v_now
        WHERE id = v_invitation.id;
        RAISE EXCEPTION 'INVITATION_EXPIRED: The invitation has expired';
    END IF;

    -- Email matching
    IF v_user_email <> v_invitation.email THEN
        RAISE EXCEPTION 'EMAIL_MISMATCH: This invitation was issued to % but you are signed in as %', v_invitation.email, v_user_email;
    END IF;

    -- Step 6: Lock Level 5: Membership row locking & conflict recovery
    SELECT id, role_key, status
    INTO v_existing_membership
    FROM public.organization_memberships
    WHERE organization_id = v_invitation.organization_id AND user_id = v_user_id
    FOR UPDATE;

    IF FOUND THEN
        IF v_existing_membership.status = 'active' THEN
            -- Already active member: close invite and return success idempotently
            UPDATE public.organization_invitations
            SET status = 'accepted', accepted_at = v_now, updated_at = v_now
            WHERE id = v_invitation.id;

            -- Audit Logging
            PERFORM public.internal_record_audit_event(
                v_invitation.organization_id,
                'invitation.accepted',
                'organization_invitation',
                v_invitation.id,
                'accept_invitation',
                jsonb_build_object(
                    'invitation_id', v_invitation.id,
                    'accepted_by_user_id', v_user_id,
                    'email', v_invitation.email,
                    'role', v_existing_membership.role_key,
                    'membership_id', v_existing_membership.id,
                    'already_member', true
                )
            );

            RETURN jsonb_build_object(
                'organization_id', v_invitation.organization_id,
                'membership_id', v_existing_membership.id,
                'role_key', v_existing_membership.role_key,
                'status', 'active',
                'message', 'Already an active member'
            );
        ELSE
            -- Reactivate invited or disabled membership to the invitation role
            UPDATE public.organization_memberships
            SET role_key = v_invitation.role, status = 'active', updated_at = v_now
            WHERE id = v_existing_membership.id;
            v_membership_id := v_existing_membership.id;
        END IF;
    ELSE
        -- Insert new membership with atomic conflict recovery on uq_org_user
        BEGIN
            INSERT INTO public.organization_memberships (
                organization_id, user_id, role_key, status, created_at, updated_at
            ) VALUES (
                v_invitation.organization_id, v_user_id, v_invitation.role, 'active', v_now, v_now
            ) RETURNING id INTO v_membership_id;
        EXCEPTION
            WHEN unique_violation THEN
                SELECT id, role_key, status INTO v_existing_membership
                FROM public.organization_memberships
                WHERE organization_id = v_invitation.organization_id AND user_id = v_user_id
                FOR UPDATE;

                IF FOUND THEN
                    UPDATE public.organization_memberships
                    SET role_key = v_invitation.role, status = 'active', updated_at = v_now
                    WHERE id = v_existing_membership.id;
                    v_membership_id := v_existing_membership.id;
                ELSE
                    RAISE;
                END IF;
        END;
    END IF;

    -- Mark invitation accepted
    UPDATE public.organization_invitations
    SET status = 'accepted', accepted_at = v_now, updated_at = v_now
    WHERE id = v_invitation.id;

    -- Audit Logging
    PERFORM public.internal_record_audit_event(
        v_invitation.organization_id,
        'invitation.accepted',
        'organization_invitation',
        v_invitation.id,
        'accept_invitation',
        jsonb_build_object(
            'invitation_id', v_invitation.id,
            'accepted_by_user_id', v_user_id,
            'email', v_invitation.email,
            'role', v_invitation.role,
            'membership_id', v_membership_id
        )
    );

    RETURN jsonb_build_object(
        'organization_id', v_invitation.organization_id,
        'membership_id', v_membership_id,
        'role_key', v_invitation.role,
        'status', 'active'
    );
END;
$$;

REVOKE ALL ON FUNCTION public.accept_organization_invitation(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_organization_invitation(TEXT) TO authenticated, service_role;

-- 6.4 revoke_organization_invitation
CREATE OR REPLACE FUNCTION public.revoke_organization_invitation(
    p_invitation_id UUID,
    p_organization_id UUID
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
    v_invitation RECORD;
    v_now TIMESTAMPTZ := now();
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    -- Lock Level 1: Organization FOR SHARE
    IF NOT EXISTS (
        SELECT 1 FROM public.organizations WHERE id = p_organization_id AND status = 'active' FOR SHARE
    ) THEN
        RAISE EXCEPTION 'Active organization not found';
    END IF;

    -- Lock Level 2: Caller Membership FOR SHARE
    SELECT role_key, status INTO v_caller_role, v_caller_status
    FROM public.organization_memberships
    WHERE organization_id = p_organization_id AND user_id = v_user_id
    FOR SHARE;

    IF NOT FOUND OR v_caller_status <> 'active' OR v_caller_role NOT IN ('super_admin', 'business_admin') THEN
        RAISE EXCEPTION 'Unauthorized: Administrator access required';
    END IF;

    -- Lock Level 4: Invitation FOR UPDATE
    SELECT id, email, role, status INTO v_invitation
    FROM public.organization_invitations
    WHERE id = p_invitation_id AND organization_id = p_organization_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Invitation not found';
    END IF;

    IF v_invitation.status <> 'pending' THEN
        RAISE EXCEPTION 'Only pending invitations can be revoked';
    END IF;

    UPDATE public.organization_invitations
    SET status = 'revoked', revoked_at = v_now, updated_at = v_now
    WHERE id = p_invitation_id;

    -- Audit Logging
    PERFORM public.internal_record_audit_event(
        p_organization_id,
        'invitation.revoked',
        'organization_invitation',
        p_invitation_id,
        'revoke_invitation',
        jsonb_build_object(
            'invitation_id', p_invitation_id,
            'revoked_by_user_id', v_user_id,
            'target_email', v_invitation.email,
            'role', v_invitation.role
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'invitation_id', p_invitation_id,
        'status', 'revoked',
        'revoked_at', v_now
    );
END;
$$;

REVOKE ALL ON FUNCTION public.revoke_organization_invitation(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revoke_organization_invitation(UUID, UUID) TO authenticated, service_role;

