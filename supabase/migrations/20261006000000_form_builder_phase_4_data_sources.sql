-- Form Builder Phase 4 Migration
-- Tables: data_sources, data_source_fields, data_source_items
-- Multi-tenant RLS & Explicit Least-Privilege Grants

-- 1. Create data_sources table
CREATE TABLE public.data_sources (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    key text NOT NULL,
    name text NOT NULL,
    description text,
    display_field_key text NOT NULL,
    value_field_key text NOT NULL,
    status text NOT NULL DEFAULT 'active',
    created_by uuid NOT NULL REFERENCES auth.users(id),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT data_sources_org_key_key UNIQUE (organization_id, key),
    CONSTRAINT data_sources_org_id_key UNIQUE (organization_id, id),
    CONSTRAINT data_sources_status_check CHECK (status IN ('active', 'inactive', 'archived'))
);

-- 2. Create data_source_fields table
CREATE TABLE public.data_source_fields (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL,
    data_source_id uuid NOT NULL,
    key text NOT NULL,
    label text NOT NULL,
    field_type text NOT NULL DEFAULT 'text',
    required boolean NOT NULL DEFAULT false,
    order_index integer NOT NULL DEFAULT 0,
    config_jsonb jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT data_source_fields_source_key_key UNIQUE (data_source_id, key),
    CONSTRAINT data_source_fields_field_type_check CHECK (field_type IN ('text', 'number', 'currency', 'date', 'boolean')),
    CONSTRAINT data_source_fields_org_source_fkey FOREIGN KEY (organization_id, data_source_id) REFERENCES public.data_sources(organization_id, id) ON DELETE CASCADE
);

-- 3. Create data_source_items table
CREATE TABLE public.data_source_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL,
    data_source_id uuid NOT NULL,
    data_jsonb jsonb NOT NULL DEFAULT '{}'::jsonb,
    status text NOT NULL DEFAULT 'active',
    created_by uuid NOT NULL REFERENCES auth.users(id),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT data_source_items_status_check CHECK (status IN ('active', 'inactive')),
    CONSTRAINT data_source_items_org_source_fkey FOREIGN KEY (organization_id, data_source_id) REFERENCES public.data_sources(organization_id, id) ON DELETE CASCADE
);

-- 4. Indexes
CREATE INDEX idx_data_sources_organization_id ON public.data_sources(organization_id);
CREATE INDEX idx_data_sources_org_status ON public.data_sources(organization_id, status);
CREATE INDEX idx_data_source_fields_org_source ON public.data_source_fields(organization_id, data_source_id);
CREATE INDEX idx_data_source_items_org_source_status ON public.data_source_items(organization_id, data_source_id, status);

-- 5. Enable Row Level Security
ALTER TABLE public.data_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.data_source_fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.data_source_items ENABLE ROW LEVEL SECURITY;

-- 6. RLS Policies: data_sources
CREATE POLICY "Users can view data sources in their organizations"
    ON public.data_sources
    FOR SELECT TO authenticated
    USING (public.is_organization_member(organization_id));

CREATE POLICY "Admins can insert data sources in their organizations"
    ON public.data_sources
    FOR INSERT TO authenticated
    WITH CHECK (
        public.get_organization_role(data_sources.organization_id) IN ('super_admin', 'business_admin')
        AND created_by = auth.uid()
    );

CREATE POLICY "Admins can update data sources in their organizations"
    ON public.data_sources
    FOR UPDATE TO authenticated
    USING (public.get_organization_role(data_sources.organization_id) IN ('super_admin', 'business_admin'))
    WITH CHECK (public.get_organization_role(data_sources.organization_id) IN ('super_admin', 'business_admin'));

-- 7. RLS Policies: data_source_fields
CREATE POLICY "Users can view data source fields in their organizations"
    ON public.data_source_fields
    FOR SELECT TO authenticated
    USING (public.is_organization_member(organization_id));

CREATE POLICY "Admins can insert data source fields in their organizations"
    ON public.data_source_fields
    FOR INSERT TO authenticated
    WITH CHECK (public.get_organization_role(data_source_fields.organization_id) IN ('super_admin', 'business_admin'));

CREATE POLICY "Admins can update data source fields in their organizations"
    ON public.data_source_fields
    FOR UPDATE TO authenticated
    USING (public.get_organization_role(data_source_fields.organization_id) IN ('super_admin', 'business_admin'))
    WITH CHECK (public.get_organization_role(data_source_fields.organization_id) IN ('super_admin', 'business_admin'));

CREATE POLICY "Admins can delete data source fields in their organizations"
    ON public.data_source_fields
    FOR DELETE TO authenticated
    USING (public.get_organization_role(data_source_fields.organization_id) IN ('super_admin', 'business_admin'));

-- 8. RLS Policies: data_source_items
CREATE POLICY "Users can view data source items in their organizations"
    ON public.data_source_items
    FOR SELECT TO authenticated
    USING (public.is_organization_member(organization_id));

CREATE POLICY "Admins can insert data source items in their organizations"
    ON public.data_source_items
    FOR INSERT TO authenticated
    WITH CHECK (
        public.get_organization_role(data_source_items.organization_id) IN ('super_admin', 'business_admin')
        AND created_by = auth.uid()
    );

CREATE POLICY "Admins can update data source items in their organizations"
    ON public.data_source_items
    FOR UPDATE TO authenticated
    USING (public.get_organization_role(data_source_items.organization_id) IN ('super_admin', 'business_admin'))
    WITH CHECK (public.get_organization_role(data_source_items.organization_id) IN ('super_admin', 'business_admin'));

CREATE POLICY "Admins can delete data source items in their organizations"
    ON public.data_source_items
    FOR DELETE TO authenticated
    USING (public.get_organization_role(data_source_items.organization_id) IN ('super_admin', 'business_admin'));

-- 9. Explicit Least-Privilege Table Grants
REVOKE ALL PRIVILEGES ON TABLE
    public.data_sources, public.data_source_fields, public.data_source_items
FROM PUBLIC, anon, authenticated, service_role;

GRANT SELECT, INSERT, UPDATE ON TABLE public.data_sources TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.data_source_fields TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.data_source_items TO authenticated;

GRANT SELECT, INSERT ON TABLE
    public.data_sources, public.data_source_fields, public.data_source_items
TO service_role;

