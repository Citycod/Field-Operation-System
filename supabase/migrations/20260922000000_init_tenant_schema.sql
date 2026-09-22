-- Migration: Initialize Multi-Tenant Platform Schema & Row Level Security (RLS)
-- Target: Supabase / PostgreSQL

-- -----------------------------------------------------------------------------
-- 1. PROFILES TABLE (Linked 1:1 to auth.users)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    first_name TEXT,
    last_name TEXT,
    display_name TEXT,
    avatar_url TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for profile status queries
CREATE INDEX IF NOT EXISTS idx_profiles_status ON public.profiles(status);

-- Automatic Profile Creation Trigger on auth.users insert
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, first_name, last_name, display_name, status)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'first_name', ''),
        COALESCE(NEW.raw_user_meta_data->>'last_name', ''),
        COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.email),
        'active'
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- -----------------------------------------------------------------------------
-- 2. ORGANIZATIONS TABLE
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_organization_status CHECK (status IN ('active', 'suspended', 'archived'))
);

CREATE INDEX IF NOT EXISTS idx_organizations_slug ON public.organizations(slug);
CREATE INDEX IF NOT EXISTS idx_organizations_status ON public.organizations(status);

-- -----------------------------------------------------------------------------
-- 3. ORGANIZATION MEMBERSHIPS TABLE
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.organization_memberships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role_key TEXT NOT NULL DEFAULT 'employee',
    status TEXT NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_org_user UNIQUE (organization_id, user_id),
    CONSTRAINT chk_membership_role CHECK (role_key IN ('super_admin', 'business_admin', 'manager', 'employee')),
    CONSTRAINT chk_membership_status CHECK (status IN ('active', 'invited', 'disabled'))
);

CREATE INDEX IF NOT EXISTS idx_org_memberships_user ON public.organization_memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_org_memberships_org ON public.organization_memberships(organization_id);

-- -----------------------------------------------------------------------------
-- 4. SECURITY DEFINER HELPER FUNCTION FOR RLS
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_organization_member(target_org_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1
        FROM public.organization_memberships
        WHERE organization_id = target_org_id
          AND user_id = auth.uid()
          AND status = 'active'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Helper to check organization role
CREATE OR REPLACE FUNCTION public.get_organization_role(target_org_id UUID)
RETURNS TEXT AS $$
DECLARE
    user_role TEXT;
BEGIN
    SELECT role_key INTO user_role
    FROM public.organization_memberships
    WHERE organization_id = target_org_id
      AND user_id = auth.uid()
      AND status = 'active';

    RETURN user_role;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- -----------------------------------------------------------------------------
-- 5. ROW LEVEL SECURITY (RLS) POLICIES
-- -----------------------------------------------------------------------------
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_memberships ENABLE ROW LEVEL SECURITY;

-- RLS: Profiles
CREATE POLICY "Users can read own profile"
    ON public.profiles FOR SELECT
    USING (id = auth.uid() OR EXISTS (
        SELECT 1 FROM public.organization_memberships m1
        JOIN public.organization_memberships m2 ON m1.organization_id = m2.organization_id
        WHERE m1.user_id = auth.uid() AND m2.user_id = public.profiles.id
          AND m1.status = 'active' AND m2.status = 'active'
    ));

CREATE POLICY "Users can update own profile"
    ON public.profiles FOR UPDATE
    USING (id = auth.uid());

-- RLS: Organizations
CREATE POLICY "Members can view their active organizations"
    ON public.organizations FOR SELECT
    USING (public.is_organization_member(id));

CREATE POLICY "Business Admins can update their organization"
    ON public.organizations FOR UPDATE
    USING (public.is_organization_member(id) AND public.get_organization_role(id) IN ('super_admin', 'business_admin'));

-- RLS: Organization Memberships
CREATE POLICY "Users can view memberships in their organizations"
    ON public.organization_memberships FOR SELECT
    USING (user_id = auth.uid() OR public.is_organization_member(organization_id));

CREATE POLICY "Business Admins can manage memberships in their organization"
    ON public.organization_memberships FOR ALL
    USING (public.is_organization_member(organization_id) AND public.get_organization_role(organization_id) IN ('super_admin', 'business_admin'));

-- -----------------------------------------------------------------------------
-- 6. SUPABASE STORAGE BUCKETS & POLICIES
-- -----------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'platform-files',
    'platform-files',
    false,
    52428800, -- 50MB limit
    ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'text/csv', 'application/json']
)
ON CONFLICT (id) DO NOTHING;

-- Storage Policy: Organization member read access
-- Bucket objects structured as: {organization_id}/{module}/{entity_id}/{filename}
CREATE POLICY "Tenant Members Read Storage Policy"
    ON storage.objects FOR SELECT
    TO authenticated
    USING (
        bucket_id = 'platform-files'
        AND public.is_organization_member((split_part(name, '/', 1))::uuid)
    );

-- Storage Policy: Organization member insert access
CREATE POLICY "Tenant Members Insert Storage Policy"
    ON storage.objects FOR INSERT
    TO authenticated
    WITH CHECK (
        bucket_id = 'platform-files'
        AND public.is_organization_member((split_part(name, '/', 1))::uuid)
    );

-- Storage Policy: Organization member delete access
CREATE POLICY "Tenant Members Delete Storage Policy"
    ON storage.objects FOR DELETE
    TO authenticated
    USING (
        bucket_id = 'platform-files'
        AND public.is_organization_member((split_part(name, '/', 1))::uuid)
        AND (
            owner = auth.uid()
            OR public.get_organization_role((split_part(name, '/', 1))::uuid) IN ('super_admin', 'business_admin')
        )
    );
