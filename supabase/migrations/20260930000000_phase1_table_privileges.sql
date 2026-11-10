-- Explicit, least-privilege access for the existing Phase 1 request paths.
-- Do not depend on project-specific default privileges. In particular, remove
-- inherited table-level TRUNCATE/TRIGGER/REFERENCES grants (TRUNCATE ignores RLS).
REVOKE ALL PRIVILEGES ON TABLE
    public.profiles, public.organizations, public.organization_memberships,
    public.forms, public.form_versions
FROM PUBLIC, anon, authenticated, service_role;

-- Session/profile and tenant resolution; SELECT policies also read memberships.
GRANT SELECT ON TABLE
    public.profiles, public.organizations, public.organization_memberships
TO authenticated;

-- Ordinary requests remain authenticated and subject to the existing RLS.
-- Forms are archived by UPDATE, not deleted. Version DELETE remains protected
-- by management-role RLS and the published/archived immutability trigger.
GRANT SELECT, INSERT, UPDATE ON TABLE public.forms TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.form_versions TO authenticated;

-- Explicit admin-only fixture provisioning with RETURNING, plus the tenant-FK
-- verification insert. Cleanup uses scoped management SQL as database owner.
-- No service-role application route or service-role publish permission is added.
GRANT SELECT, INSERT ON TABLE
    public.organizations, public.organization_memberships, public.form_versions
TO service_role;

-- Existing public-schema USAGE and authenticated helper/RPC EXECUTE privileges
-- were verified remotely. UUID defaults need no sequence grants. No policies,
-- functions, auth.uid() behavior, or RLS settings are changed here.
