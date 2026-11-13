-- Migration: Secure Business Workspace Provisioning & Organization Profile
-- Target: Supabase / PostgreSQL
-- Description:
-- 1. Creates public.organization_profiles table (1:1 with public.organizations)
-- 2. Sets RLS on organization_profiles (read for members, update for admins)
-- 3. Creates public.create_business_workspace() SECURITY DEFINER atomic function
-- 4. Grants explicit least-privilege execute permissions to authenticated role

-- -----------------------------------------------------------------------------
-- 1. ORGANIZATION PROFILES TABLE
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.organization_profiles (
    organization_id UUID PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
    business_email TEXT,
    business_phone TEXT,
    industry TEXT,
    address_line_1 TEXT,
    address_line_2 TEXT,
    city TEXT,
    state_region TEXT,
    postal_code TEXT,
    country_code TEXT,
    website TEXT,
    logo_path TEXT,
    timezone TEXT NOT NULL DEFAULT 'UTC',
    currency_code TEXT NOT NULL DEFAULT 'USD',
    date_format TEXT NOT NULL DEFAULT 'YYYY-MM-DD',
    settings_jsonb JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_org_profiles_country_code ON public.organization_profiles(country_code);
CREATE INDEX IF NOT EXISTS idx_org_profiles_industry ON public.organization_profiles(industry);

-- -----------------------------------------------------------------------------
-- 2. ROW LEVEL SECURITY: ORGANIZATION PROFILES
-- -----------------------------------------------------------------------------
ALTER TABLE public.organization_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view active organization profile"
    ON public.organization_profiles
    FOR SELECT TO authenticated
    USING (public.is_organization_member(organization_id));

CREATE POLICY "Admins can update organization profile"
    ON public.organization_profiles
    FOR UPDATE TO authenticated
    USING (
        public.is_organization_member(organization_id)
        AND public.get_organization_role(organization_id) IN ('super_admin', 'business_admin')
    )
    WITH CHECK (
        public.is_organization_member(organization_id)
        AND public.get_organization_role(organization_id) IN ('super_admin', 'business_admin')
    );

-- Table privileges
REVOKE ALL PRIVILEGES ON TABLE public.organization_profiles FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, UPDATE ON TABLE public.organization_profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.organization_profiles TO service_role;

-- -----------------------------------------------------------------------------
-- 3. ATOMIC WORKSPACE PROVISIONING RPC
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
    v_clean_name := trim(p_name);
    IF v_clean_name IS NULL OR length(v_clean_name) < 2 THEN
        RAISE EXCEPTION 'Business name must be at least 2 characters';
    END IF;
    IF length(v_clean_name) > 100 THEN
        RAISE EXCEPTION 'Business name must not exceed 100 characters';
    END IF;

    v_clean_slug := lower(trim(p_slug));
    -- Enforce safe slug format: lowercase alphanumeric and hyphens, 2-50 chars, no leading/trailing hyphens
    IF v_clean_slug !~ '^[a-z0-9][a-z0-9-]{0,48}[a-z0-9]$' THEN
        RAISE EXCEPTION 'Invalid business slug format. Use 2-50 lowercase alphanumeric characters and hyphens.';
    END IF;

    -- Reserved slugs
    IF v_clean_slug IN ('admin', 'api', 'app', 'auth', 'dashboard', 'dev', 'login', 'onboarding', 'platform', 'public', 'system') THEN
        RAISE EXCEPTION 'The requested business slug is reserved';
    END IF;

    -- 3. Atomically Insert Organization
    -- Handle unique violation safely via EXCEPTION block if concurrent request races
    BEGIN
        INSERT INTO public.organizations (name, slug, status, created_at, updated_at)
        VALUES (v_clean_name, v_clean_slug, 'active', v_created_at, v_created_at)
        RETURNING id INTO v_org_id;
    EXCEPTION
        WHEN unique_violation THEN
            RAISE EXCEPTION 'Business identifier (slug) "%" is already in use', v_clean_slug;
    END;

    -- 4. Atomically Insert Initial Business Admin Membership
    -- Creator cannot choose their role; business_admin is assigned strictly
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
        created_at,
        updated_at
    )
    VALUES (
        v_org_id,
        nullif(trim(v_profile->>'business_email'), ''),
        nullif(trim(v_profile->>'business_phone'), ''),
        nullif(trim(v_profile->>'industry'), ''),
        nullif(trim(v_profile->>'address_line_1'), ''),
        nullif(trim(v_profile->>'address_line_2'), ''),
        nullif(trim(v_profile->>'city'), ''),
        nullif(trim(v_profile->>'state_region'), ''),
        nullif(trim(v_profile->>'postal_code'), ''),
        nullif(trim(v_profile->>'country_code'), ''),
        nullif(trim(v_profile->>'website'), ''),
        nullif(trim(v_profile->>'logo_path'), ''),
        COALESCE(nullif(trim(v_profile->>'timezone'), ''), 'UTC'),
        COALESCE(nullif(trim(v_profile->>'currency_code'), ''), 'USD'),
        COALESCE(nullif(trim(v_profile->>'date_format'), ''), 'YYYY-MM-DD'),
        COALESCE(v_profile->'settings', '{}'::jsonb),
        v_created_at,
        v_created_at
    );

    -- 6. Return Structured Result
    RETURN jsonb_build_object(
        'organization_id', v_org_id,
        'name', v_clean_name,
        'slug', v_clean_slug,
        'status', 'active',
        'membership_id', v_mem_id,
        'role_key', 'business_admin',
        'created_at', v_created_at
    );
END;
$$;

REVOKE ALL ON FUNCTION public.create_business_workspace(TEXT, TEXT, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_business_workspace(TEXT, TEXT, JSONB) TO authenticated;
