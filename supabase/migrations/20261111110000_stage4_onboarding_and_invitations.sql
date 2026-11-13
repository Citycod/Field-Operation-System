-- Migration: Stage 4 — Business Onboarding Wizard & Team Invitations
-- Target: Supabase / PostgreSQL
-- Description:
-- 1. Adds onboarding state columns to public.organization_profiles with idempotent backfill
-- 2. Installs check_organization_profile_invariants trigger to protect state columns
-- 3. Creates public.organization_invitations table with strict role constraints and partial index
-- 4. Updates public.create_business_workspace provisioning RPC
-- 5. Adds onboarding lifecycle RPCs: complete_organization_onboarding, resolve_legacy_organization_profile
-- 6. Adds invitation management RPCs: create, accept, revoke, resend, list, preview
-- 7. Configures least-privilege column grants and table privileges

-- -----------------------------------------------------------------------------
-- 1. ALTER ORGANIZATION PROFILES TABLE
-- -----------------------------------------------------------------------------
ALTER TABLE public.organization_profiles
    ADD COLUMN IF NOT EXISTS requires_onboarding BOOLEAN,
    ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN,
    ADD COLUMN IF NOT EXISTS onboarding_step TEXT,
    ADD COLUMN IF NOT EXISTS onboarding_status TEXT,
    ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMPTZ;

-- Idempotent backfill: only target rows where requires_onboarding IS NULL
UPDATE public.organization_profiles
SET
    requires_onboarding = false,
    onboarding_completed = true,
    onboarding_step = 'completed',
    onboarding_status = 'legacy_unresolved',
    onboarding_completed_at = COALESCE(onboarding_completed_at, created_at, NOW())
WHERE requires_onboarding IS NULL;

-- Enforce defaults and NOT NULL
ALTER TABLE public.organization_profiles
    ALTER COLUMN requires_onboarding SET DEFAULT true,
    ALTER COLUMN requires_onboarding SET NOT NULL,
    ALTER COLUMN onboarding_completed SET DEFAULT false,
    ALTER COLUMN onboarding_completed SET NOT NULL,
    ALTER COLUMN onboarding_step SET DEFAULT 'profile',
    ALTER COLUMN onboarding_step SET NOT NULL,
    ALTER COLUMN onboarding_status SET DEFAULT 'not_started',
    ALTER COLUMN onboarding_status SET NOT NULL;

-- Enforce constraints
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_onboarding_step'
    ) THEN
        ALTER TABLE public.organization_profiles
            ADD CONSTRAINT chk_onboarding_step
            CHECK (onboarding_step IN ('profile', 'team_invites', 'completed'));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_onboarding_status'
    ) THEN
        ALTER TABLE public.organization_profiles
            ADD CONSTRAINT chk_onboarding_status
            CHECK (onboarding_status IN ('not_started', 'in_progress', 'completed', 'legacy_unresolved'));
    END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_org_profiles_onboarding_status
    ON public.organization_profiles(onboarding_status);

-- -----------------------------------------------------------------------------
-- 2. TRIGGER: PROTECT ONBOARDING STATE INVARIANTS
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_organization_profile_invariants()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_context TEXT;
    v_is_state_changing BOOLEAN;
BEGIN
    v_is_state_changing := (
        NEW.requires_onboarding IS DISTINCT FROM OLD.requires_onboarding OR
        NEW.onboarding_completed IS DISTINCT FROM OLD.onboarding_completed OR
        NEW.onboarding_step IS DISTINCT FROM OLD.onboarding_step OR
        NEW.onboarding_status IS DISTINCT FROM OLD.onboarding_status OR
        NEW.onboarding_completed_at IS DISTINCT FROM OLD.onboarding_completed_at
    );

    IF v_is_state_changing THEN
        v_context := NULLIF(current_setting('app.authorized_onboarding_context', true), '');
        IF v_context IS NULL OR v_context NOT IN ('workspace_provisioning', 'onboarding_completion', 'legacy_resolution') THEN
            RAISE EXCEPTION 'Direct modification of organization onboarding state is prohibited. Use authorized procedures.';
        END IF;
    END IF;

    -- Invariant: completed state must be fully consistent
    IF NEW.onboarding_completed = true THEN
        IF NEW.onboarding_step <> 'completed' THEN
            RAISE EXCEPTION 'Completed onboarding requires onboarding_step = "completed"';
        END IF;
        IF NEW.onboarding_status NOT IN ('completed', 'legacy_unresolved') THEN
            RAISE EXCEPTION 'Completed onboarding requires onboarding_status in ("completed", "legacy_unresolved")';
        END IF;
        IF NEW.onboarding_completed_at IS NULL THEN
            RAISE EXCEPTION 'Completed onboarding requires onboarding_completed_at timestamp';
        END IF;
    END IF;

    -- Monotonic completion invariant: once completed, cannot revert or clear completion
    IF OLD.onboarding_completed = true THEN
        IF NEW.onboarding_completed = false THEN
            RAISE EXCEPTION 'Onboarding completion is irreversible';
        END IF;
        IF NEW.onboarding_step <> 'completed' THEN
            RAISE EXCEPTION 'Completed onboarding step cannot be reverted';
        END IF;
        IF NEW.onboarding_status NOT IN ('completed', 'legacy_unresolved') THEN
            RAISE EXCEPTION 'Completed onboarding status cannot be reverted to uncompleted status';
        END IF;
        IF NEW.onboarding_completed_at IS NULL THEN
            RAISE EXCEPTION 'Completion timestamp cannot be cleared';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_org_profile_invariants ON public.organization_profiles;
CREATE TRIGGER trg_check_org_profile_invariants
    BEFORE UPDATE ON public.organization_profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.check_organization_profile_invariants();

-- -----------------------------------------------------------------------------
-- 3. ORGANIZATION INVITATIONS TABLE
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.organization_invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    role TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    token_hash TEXT NOT NULL,
    invited_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
    expires_at TIMESTAMPTZ NOT NULL,
    accepted_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT chk_invitation_role CHECK (role IN ('manager', 'employee')),
    CONSTRAINT chk_invitation_status CHECK (status IN ('pending', 'accepted', 'revoked', 'expired')),
    CONSTRAINT chk_invitation_email CHECK (email = lower(btrim(email)) AND length(email) <= 255 AND email LIKE '%_@__%.__%')
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_active_pending_invitation
    ON public.organization_invitations(organization_id, email)
    WHERE (status = 'pending');

CREATE INDEX IF NOT EXISTS idx_invitations_token_hash
    ON public.organization_invitations(token_hash);

CREATE INDEX IF NOT EXISTS idx_invitations_org_created
    ON public.organization_invitations(organization_id, created_at DESC);

ALTER TABLE public.organization_invitations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.organization_invitations FROM PUBLIC, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 4. UPDATE CREATE_BUSINESS_WORKSPACE RPC
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_business_workspace(
    p_name TEXT,
    p_slug TEXT,
    p_profile JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_clean_name TEXT;
    v_clean_slug TEXT;
    v_org_id UUID;
    v_mem_id UUID;
    v_created_at TIMESTAMPTZ := now();
    v_profile JSONB := COALESCE(p_profile, '{}'::jsonb);
BEGIN
    -- 1. Identity Verification
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required to provision a business workspace';
    END IF;

    -- Verify user profile exists in public.profiles and is active
    IF NOT EXISTS (
        SELECT 1 FROM public.profiles WHERE id = v_user_id AND status = 'active'
    ) THEN
        RAISE EXCEPTION 'Active user profile required to provision a business workspace';
    END IF;

    -- 2. Validation & Normalization
    v_clean_name := btrim(p_name);
    IF v_clean_name IS NULL OR length(v_clean_name) < 2 THEN
        RAISE EXCEPTION 'Business name must be at least 2 characters';
    END IF;
    IF length(v_clean_name) > 100 THEN
        RAISE EXCEPTION 'Business name must not exceed 100 characters';
    END IF;

    v_clean_slug := lower(btrim(p_slug));
    IF v_clean_slug !~ '^[a-z0-9][a-z0-9-]{0,48}[a-z0-9]$' THEN
        RAISE EXCEPTION 'Invalid business slug format. Use 2-50 lowercase alphanumeric characters and hyphens.';
    END IF;

    IF v_clean_slug IN ('admin', 'api', 'app', 'auth', 'dashboard', 'dev', 'login', 'onboarding', 'platform', 'public', 'system') THEN
        RAISE EXCEPTION 'The requested business slug is reserved';
    END IF;

    -- 3. Atomically Insert Organization
    BEGIN
        INSERT INTO public.organizations (name, slug, status, created_at, updated_at)
        VALUES (v_clean_name, v_clean_slug, 'active', v_created_at, v_created_at)
        RETURNING id INTO v_org_id;
    EXCEPTION
        WHEN unique_violation THEN
            RAISE EXCEPTION 'Business identifier (slug) "%" is already in use', v_clean_slug;
    END;

    -- 4. Atomically Insert Initial Business Admin Membership
    INSERT INTO public.organization_memberships (
        organization_id,
        user_id,
        role_key,
        status,
        created_at,
        updated_at
    )
    VALUES (
        v_org_id,
        v_user_id,
        'business_admin',
        'active',
        v_created_at,
        v_created_at
    )
    RETURNING id INTO v_mem_id;

    -- 5. Atomically Insert Initial Organization Profile
    PERFORM set_config('app.authorized_onboarding_context', 'workspace_provisioning', true);

    INSERT INTO public.organization_profiles (
        organization_id,
        business_email,
        business_phone,
        industry,
        address_line_1,
        address_line_2,
        city,
        state_region,
        postal_code,
        country_code,
        website,
        logo_path,
        timezone,
        currency_code,
        date_format,
        settings_jsonb,
        requires_onboarding,
        onboarding_completed,
        onboarding_step,
        onboarding_status,
        onboarding_completed_at,
        created_at,
        updated_at
    )
    VALUES (
        v_org_id,
        nullif(btrim(v_profile->>'business_email'), ''),
        nullif(btrim(v_profile->>'business_phone'), ''),
        nullif(btrim(v_profile->>'industry'), ''),
        nullif(btrim(v_profile->>'address_line_1'), ''),
        nullif(btrim(v_profile->>'address_line_2'), ''),
        nullif(btrim(v_profile->>'city'), ''),
        nullif(btrim(v_profile->>'state_region'), ''),
        nullif(btrim(v_profile->>'postal_code'), ''),
        nullif(btrim(v_profile->>'country_code'), ''),
        nullif(btrim(v_profile->>'website'), ''),
        nullif(btrim(v_profile->>'logo_path'), ''),
        COALESCE(nullif(btrim(v_profile->>'timezone'), ''), 'UTC'),
        COALESCE(nullif(btrim(v_profile->>'currency_code'), ''), 'USD'),
        COALESCE(nullif(btrim(v_profile->>'date_format'), ''), 'YYYY-MM-DD'),
        COALESCE(v_profile->'settings', '{}'::jsonb),
        true,
        false,
        'profile',
        'not_started',
        NULL,
        v_created_at,
        v_created_at
    );

    PERFORM set_config('app.authorized_onboarding_context', '', true);

    -- 6. Return Structured Result
    RETURN jsonb_build_object(
        'organization_id', v_org_id,
        'name', v_clean_name,
        'slug', v_clean_slug,
        'status', 'active',
        'membership_id', v_mem_id,
        'role_key', 'business_admin',
        'requires_onboarding', true,
        'onboarding_status', 'not_started',
        'created_at', v_created_at
    );
END;
$$;

-- -----------------------------------------------------------------------------
-- 5. ONBOARDING LIFECYCLE RPCS
-- -----------------------------------------------------------------------------
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

CREATE OR REPLACE FUNCTION public.resolve_legacy_organization_profile(
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

    IF v_profile.onboarding_status = 'completed' THEN
        RETURN jsonb_build_object(
            'success', true,
            'already_resolved', true,
            'organization_id', p_organization_id,
            'onboarding_status', 'completed'
        );
    END IF;

    PERFORM set_config('app.authorized_onboarding_context', 'legacy_resolution', true);

    UPDATE public.organization_profiles
    SET
        onboarding_status = 'completed',
        updated_at = v_now
    WHERE organization_id = p_organization_id;

    PERFORM set_config('app.authorized_onboarding_context', '', true);

    RETURN jsonb_build_object(
        'success', true,
        'organization_id', p_organization_id,
        'onboarding_status', 'completed',
        'resolved_at', v_now
    );
END;
$$;

-- -----------------------------------------------------------------------------
-- 6. INVITATION MANAGEMENT RPCS
-- -----------------------------------------------------------------------------
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

    RETURN jsonb_build_object(
        'organization_id', v_invitation.organization_id,
        'membership_id', v_membership_id,
        'role_key', v_invitation.role,
        'status', 'active'
    );
END;
$$;

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
    SELECT id, status INTO v_invitation
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

    RETURN jsonb_build_object(
        'success', true,
        'invitation_id', p_invitation_id,
        'status', 'revoked',
        'revoked_at', v_now
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.resend_organization_invitation(
    p_invitation_id UUID,
    p_organization_id UUID,
    p_new_token_hash TEXT,
    p_new_expires_at TIMESTAMPTZ DEFAULT NULL
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
    v_expires_at TIMESTAMPTZ;
    v_now TIMESTAMPTZ := now();
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    IF p_new_token_hash IS NULL OR length(p_new_token_hash) <> 64 OR p_new_token_hash !~ '^[0-9a-f]{64}$' THEN
        RAISE EXCEPTION 'Invalid token hash format';
    END IF;

    v_expires_at := COALESCE(p_new_expires_at, v_now + INTERVAL '7 days');
    IF v_expires_at <= v_now THEN
        RAISE EXCEPTION 'Expiration must be in the future';
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
    SELECT id, email, status INTO v_invitation
    FROM public.organization_invitations
    WHERE id = p_invitation_id AND organization_id = p_organization_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Invitation not found';
    END IF;

    IF v_invitation.status NOT IN ('pending', 'expired') THEN
        RAISE EXCEPTION 'Only pending or expired invitations can be resent';
    END IF;

    UPDATE public.organization_invitations
    SET
        token_hash = p_new_token_hash,
        expires_at = v_expires_at,
        status = 'pending',
        updated_at = v_now
    WHERE id = p_invitation_id;

    RETURN jsonb_build_object(
        'success', true,
        'invitation_id', p_invitation_id,
        'status', 'pending',
        'expires_at', v_expires_at,
        'updated_at', v_now
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.list_organization_invitations(
    p_organization_id UUID
)
RETURNS TABLE (
    id UUID,
    organization_id UUID,
    email TEXT,
    role TEXT,
    status TEXT,
    invited_by UUID,
    expires_at TIMESTAMPTZ,
    accepted_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
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
        RAISE EXCEPTION 'Authentication required';
    END IF;

    -- Caller must be active admin of p_organization_id
    SELECT m.role_key, m.status INTO v_caller_role, v_caller_status
    FROM public.organization_memberships m
    WHERE m.organization_id = p_organization_id AND m.user_id = v_user_id;

    IF NOT FOUND OR v_caller_status <> 'active' OR v_caller_role NOT IN ('super_admin', 'business_admin') THEN
        RAISE EXCEPTION 'Unauthorized: Administrator access required';
    END IF;

    RETURN QUERY
    SELECT
        i.id,
        i.organization_id,
        i.email,
        i.role,
        i.status,
        i.invited_by,
        i.expires_at,
        i.accepted_at,
        i.revoked_at,
        i.created_at,
        i.updated_at
    FROM public.organization_invitations i
    WHERE i.organization_id = p_organization_id
    ORDER BY i.created_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_invitation_preview(
    p_token_hash TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_preview RECORD;
BEGIN
    IF p_token_hash IS NULL OR length(p_token_hash) <> 64 OR p_token_hash !~ '^[0-9a-f]{64}$' THEN
        RAISE EXCEPTION 'INVITATION_UNAVAILABLE: Invalid invitation link';
    END IF;

    SELECT
        i.organization_id,
        o.name AS organization_name,
        i.email,
        i.role,
        i.expires_at
    INTO v_preview
    FROM public.organization_invitations i
    JOIN public.organizations o ON o.id = i.organization_id
    WHERE i.token_hash = p_token_hash
      AND i.status = 'pending'
      AND i.expires_at > now()
      AND o.status = 'active';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'INVITATION_UNAVAILABLE: The invitation link is invalid or has expired';
    END IF;

    RETURN jsonb_build_object(
        'organization_id', v_preview.organization_id,
        'organization_name', v_preview.organization_name,
        'email', v_preview.email,
        'role', v_preview.role,
        'expires_at', v_preview.expires_at
    );
END;
$$;

-- -----------------------------------------------------------------------------
-- 7. PRIVILEGES AND GRANTS
-- -----------------------------------------------------------------------------
-- Revoke table-level update from authenticated, anon, PUBLIC
REVOKE UPDATE ON TABLE public.organization_profiles FROM PUBLIC, anon, authenticated;

-- Grant column-level update ONLY on non-protected profile columns to authenticated
GRANT UPDATE (
    business_email,
    business_phone,
    industry,
    address_line_1,
    address_line_2,
    city,
    state_region,
    postal_code,
    country_code,
    website,
    logo_path,
    timezone,
    currency_code,
    date_format,
    settings_jsonb,
    updated_at
) ON public.organization_profiles TO authenticated;

-- Function grants
REVOKE ALL ON FUNCTION public.create_business_workspace(TEXT, TEXT, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_business_workspace(TEXT, TEXT, JSONB) TO authenticated;

REVOKE ALL ON FUNCTION public.complete_organization_onboarding(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_organization_onboarding(UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.resolve_legacy_organization_profile(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_legacy_organization_profile(UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.create_organization_invitation(UUID, TEXT, TEXT, TEXT, TIMESTAMPTZ) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_organization_invitation(UUID, TEXT, TEXT, TEXT, TIMESTAMPTZ) TO authenticated;

REVOKE ALL ON FUNCTION public.accept_organization_invitation(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_organization_invitation(TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.revoke_organization_invitation(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revoke_organization_invitation(UUID, UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.resend_organization_invitation(UUID, UUID, TEXT, TIMESTAMPTZ) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resend_organization_invitation(UUID, UUID, TEXT, TIMESTAMPTZ) TO authenticated;

REVOKE ALL ON FUNCTION public.list_organization_invitations(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_organization_invitations(UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.get_invitation_preview(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_invitation_preview(TEXT) TO anon, authenticated;
