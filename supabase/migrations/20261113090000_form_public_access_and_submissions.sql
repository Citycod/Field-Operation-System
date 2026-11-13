-- Migration: 20261113090000_form_public_access_and_submissions.sql
-- Description: Adds is_public and public_slug to forms table, and provisions
--              form_submissions and submission_detail_rows tables per 03-DATA-MODEL.md.

-- 1. Extend forms table with public access fields
ALTER TABLE public.forms
  ADD COLUMN IF NOT EXISTS is_public boolean NOT NULL DEFAULT false;

ALTER TABLE public.forms
  ADD COLUMN IF NOT EXISTS public_slug text NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_forms_public_slug
  ON public.forms (public_slug)
  WHERE public_slug IS NOT NULL AND archived_at IS NULL;

-- 2. Create form_submissions table
CREATE TABLE IF NOT EXISTS public.form_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  form_id uuid NOT NULL REFERENCES public.forms(id) ON DELETE CASCADE,
  form_version_id uuid NOT NULL REFERENCES public.form_versions(id) ON DELETE RESTRICT,
  reference_number text NULL,
  status text NOT NULL DEFAULT 'submitted',
  data_jsonb jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid NULL,
  submitted_by uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  submitted_at timestamptz NULL DEFAULT now(),
  completed_at timestamptz NULL
);

-- 3. Create submission_detail_rows table
CREATE TABLE IF NOT EXISTS public.submission_detail_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  submission_id uuid NOT NULL REFERENCES public.form_submissions(id) ON DELETE CASCADE,
  tab_id text NOT NULL,
  row_order integer NOT NULL,
  data_jsonb jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz NULL
);

-- 4. Indexes for performance and multi-tenant queries
CREATE INDEX IF NOT EXISTS idx_form_submissions_org_form
  ON public.form_submissions (organization_id, form_id);

CREATE INDEX IF NOT EXISTS idx_form_submissions_org_form_status
  ON public.form_submissions (organization_id, form_id, status);

CREATE INDEX IF NOT EXISTS idx_form_submissions_org_created_by
  ON public.form_submissions (organization_id, created_by);

CREATE INDEX IF NOT EXISTS idx_form_submissions_submitted_at
  ON public.form_submissions (submitted_at);

CREATE INDEX IF NOT EXISTS idx_form_submissions_reference_number
  ON public.form_submissions (reference_number);

CREATE INDEX IF NOT EXISTS idx_sub_detail_rows_org_sub_tab
  ON public.submission_detail_rows (organization_id, submission_id, tab_id);

CREATE INDEX IF NOT EXISTS idx_sub_detail_rows_sub_order
  ON public.submission_detail_rows (submission_id, row_order);

-- 5. Enable Row Level Security
ALTER TABLE public.form_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.submission_detail_rows ENABLE ROW LEVEL SECURITY;

-- 6. Row Level Security Policies
-- Tenants can only view submissions belonging to their active organization & active membership
DROP POLICY IF EXISTS form_submissions_select_policy ON public.form_submissions;
CREATE POLICY form_submissions_select_policy
  ON public.form_submissions
  FOR SELECT
  TO authenticated
  USING (public.is_organization_member(organization_id));

DROP POLICY IF EXISTS submission_detail_rows_select_policy ON public.submission_detail_rows;
CREATE POLICY submission_detail_rows_select_policy
  ON public.submission_detail_rows
  FOR SELECT
  TO authenticated
  USING (public.is_organization_member(organization_id));

-- Service role has full management
DROP POLICY IF EXISTS form_submissions_service_role_all ON public.form_submissions;
CREATE POLICY form_submissions_service_role_all
  ON public.form_submissions
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS submission_detail_rows_service_role_all ON public.submission_detail_rows;
CREATE POLICY submission_detail_rows_service_role_all
  ON public.submission_detail_rows
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 7. Least-privilege table grants
-- Allow server-side public form lookup (service_role) without exposing anon PostgREST access.
GRANT SELECT ON TABLE public.forms TO service_role;

REVOKE ALL PRIVILEGES ON TABLE
  public.form_submissions,
  public.submission_detail_rows
FROM PUBLIC, anon, authenticated, service_role;

GRANT SELECT ON TABLE public.form_submissions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.form_submissions TO service_role;

GRANT SELECT ON TABLE public.submission_detail_rows TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.submission_detail_rows TO service_role;

