-- Migration: 20261126000000_workflow_approval_runtime.sql
-- Description: Phase 6B / 7B Runtime Workflow & Approval Execution tables,
--              append-only decision triggers, tenant RLS policies, least-privilege grants,
--              and atomic decide_approval_stage RPC per 03-DATA-MODEL.md §§ 16-18.

-- 1. Create approval_instances table
CREATE TABLE IF NOT EXISTS public.approval_instances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  submission_id uuid NOT NULL REFERENCES public.form_submissions(id) ON DELETE CASCADE,
  form_version_id uuid NOT NULL REFERENCES public.form_versions(id) ON DELETE RESTRICT,
  workflow_id text NULL,
  status text NOT NULL DEFAULT 'active',
  current_stage_order integer NULL,
  current_step_id text NULL,
  cycle_number integer NOT NULL DEFAULT 1,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_approval_instance_status CHECK (
    status IN ('active', 'approved', 'rejected', 'returned', 'cancelled')
  ),
  CONSTRAINT chk_approval_instance_cycle CHECK (cycle_number >= 1),
  CONSTRAINT uq_approval_instances_sub_cycle UNIQUE (submission_id, cycle_number)
);

-- 2. Create approval_stage_instances table
CREATE TABLE IF NOT EXISTS public.approval_stage_instances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  approval_instance_id uuid NOT NULL REFERENCES public.approval_instances(id) ON DELETE CASCADE,
  stage_definition_id text NOT NULL,
  stage_order integer NOT NULL,
  assignee_index integer NOT NULL DEFAULT 0,
  stage_name text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  assigned_approver_id uuid NULL,
  assigned_role_id uuid NULL,
  assigned_role_key text NULL,
  started_at timestamptz NULL,
  completed_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_approval_stage_status CHECK (
    status IN ('pending', 'active', 'approved', 'rejected', 'returned', 'skipped', 'cancelled')
  ),
  CONSTRAINT uq_approval_stage_instance_order UNIQUE (approval_instance_id, stage_order)
);

-- 3. Create approval_decisions table (append-only decision history)
CREATE TABLE IF NOT EXISTS public.approval_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  stage_instance_id uuid NOT NULL REFERENCES public.approval_stage_instances(id) ON DELETE CASCADE,
  approver_id uuid NOT NULL,
  decision text NOT NULL,
  comment text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_approval_decision_value CHECK (
    decision IN ('approved', 'rejected', 'returned')
  )
);

-- 4. Indexes (tenant-owned indexes start with organization_id per 03-DATA-MODEL.md § 24)
CREATE INDEX IF NOT EXISTS idx_approval_instances_org_sub
  ON public.approval_instances (organization_id, submission_id);

CREATE INDEX IF NOT EXISTS idx_approval_instances_org_status
  ON public.approval_instances (organization_id, status);

CREATE INDEX IF NOT EXISTS idx_approval_stage_instances_inst_order
  ON public.approval_stage_instances (approval_instance_id, stage_order);

CREATE INDEX IF NOT EXISTS idx_approval_stage_instances_org_approver_status
  ON public.approval_stage_instances (organization_id, assigned_approver_id, status);

CREATE INDEX IF NOT EXISTS idx_approval_stage_instances_org_role_status
  ON public.approval_stage_instances (organization_id, assigned_role_key, status);

CREATE INDEX IF NOT EXISTS idx_approval_decisions_stage
  ON public.approval_decisions (stage_instance_id);

CREATE INDEX IF NOT EXISTS idx_approval_decisions_org_approver
  ON public.approval_decisions (organization_id, approver_id);

-- 5. Append-only immutability enforcement for approval_decisions
CREATE OR REPLACE FUNCTION public.prevent_approval_decision_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'APPROVAL_DECISION_IMMUTABLE: Approval decisions are append-only and cannot be modified or deleted.';
END;
$$;

DROP TRIGGER IF EXISTS trg_approval_decisions_immutable ON public.approval_decisions;
CREATE TRIGGER trg_approval_decisions_immutable
  BEFORE UPDATE OR DELETE ON public.approval_decisions
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_approval_decision_mutation();

DROP TRIGGER IF EXISTS trg_approval_decisions_truncate ON public.approval_decisions;
CREATE TRIGGER trg_approval_decisions_truncate
  BEFORE TRUNCATE ON public.approval_decisions
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.prevent_approval_decision_mutation();

-- 6. Enable Row Level Security
ALTER TABLE public.approval_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.approval_stage_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.approval_decisions ENABLE ROW LEVEL SECURITY;

-- 7. Row Level Security Policies
DROP POLICY IF EXISTS approval_instances_select_policy ON public.approval_instances;
CREATE POLICY approval_instances_select_policy
  ON public.approval_instances
  FOR SELECT
  TO authenticated
  USING (public.is_organization_member(organization_id));

DROP POLICY IF EXISTS approval_stage_instances_select_policy ON public.approval_stage_instances;
CREATE POLICY approval_stage_instances_select_policy
  ON public.approval_stage_instances
  FOR SELECT
  TO authenticated
  USING (public.is_organization_member(organization_id));

DROP POLICY IF EXISTS approval_decisions_select_policy ON public.approval_decisions;
CREATE POLICY approval_decisions_select_policy
  ON public.approval_decisions
  FOR SELECT
  TO authenticated
  USING (public.is_organization_member(organization_id));

DROP POLICY IF EXISTS approval_instances_service_role_all ON public.approval_instances;
CREATE POLICY approval_instances_service_role_all
  ON public.approval_instances
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS approval_stage_instances_service_role_all ON public.approval_stage_instances;
CREATE POLICY approval_stage_instances_service_role_all
  ON public.approval_stage_instances
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS approval_decisions_service_role_all ON public.approval_decisions;
CREATE POLICY approval_decisions_service_role_all
  ON public.approval_decisions
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 8. Least-privilege table grants
REVOKE ALL PRIVILEGES ON TABLE
  public.approval_instances,
  public.approval_stage_instances,
  public.approval_decisions
FROM PUBLIC, anon, authenticated, service_role;

GRANT SELECT ON TABLE
  public.approval_instances,
  public.approval_stage_instances,
  public.approval_decisions
TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.approval_instances,
  public.approval_stage_instances
TO service_role;

-- Decisions are append-only even for service_role
GRANT SELECT, INSERT ON TABLE public.approval_decisions TO service_role;

-- 9. Atomic Approval Decision RPC
-- Serializes concurrent decisions on the same stage/instance via row-level FOR UPDATE locking,
-- enforces tenant membership, assignment authorization, idempotency, append-only decision insert,
-- next-stage activation or terminal submission completion, and audit logging.
CREATE OR REPLACE FUNCTION public.decide_approval_stage(
  p_organization_id uuid,
  p_stage_instance_id uuid,
  p_decision text,
  p_comment text DEFAULT NULL,
  p_next_step_id text DEFAULT NULL,
  p_next_stage_name text DEFAULT NULL,
  p_next_assignee_index integer DEFAULT 0,
  p_next_assigned_approver_id uuid DEFAULT NULL,
  p_next_assigned_role_key text DEFAULT NULL,
  p_terminal_submission_status text DEFAULT NULL,
  p_updated_fields_jsonb jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_user_role text;
  v_stage public.approval_stage_instances%ROWTYPE;
  v_instance public.approval_instances%ROWTYPE;
  v_submission public.form_submissions%ROWTYPE;
  v_now timestamptz := now();
  v_decision_id uuid;
  v_next_stage_id uuid;
  v_next_stage_order integer;
  v_instance_status text;
  v_submission_status text;
  v_next_data_jsonb jsonb;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'AUTHENTICATION_REQUIRED: Sign in is required to decide an approval stage.';
  END IF;

  IF p_organization_id IS NULL OR p_stage_instance_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_REQUEST: Organization ID and stage instance ID are required.';
  END IF;

  IF p_decision NOT IN ('approved', 'rejected', 'returned') THEN
    RAISE EXCEPTION 'INVALID_DECISION: Decision must be approved, rejected, or returned.';
  END IF;

  SELECT m.role_key INTO v_user_role
  FROM public.organization_memberships m
  JOIN public.organizations o ON o.id = m.organization_id
  WHERE m.organization_id = p_organization_id
    AND m.user_id = v_user_id
    AND m.status = 'active'
    AND o.status = 'active';

  IF v_user_role IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: User is not an active member of this organization.';
  END IF;

  -- Lock current stage row to serialize concurrent decisions (double-click / race protection)
  SELECT * INTO v_stage
  FROM public.approval_stage_instances
  WHERE id = p_stage_instance_id
    AND organization_id = p_organization_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'APPROVAL_STAGE_NOT_FOUND: Approval stage instance not found in organization.';
  END IF;

  IF v_stage.status <> 'active' THEN
    RAISE EXCEPTION 'APPROVAL_STAGE_ALREADY_DECIDED: This approval stage has already been decided (%).', v_stage.status;
  END IF;

  SELECT * INTO v_instance
  FROM public.approval_instances
  WHERE id = v_stage.approval_instance_id
    AND organization_id = p_organization_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'APPROVAL_INSTANCE_NOT_FOUND: Approval instance not found.';
  END IF;

  IF v_instance.status <> 'active' THEN
    RAISE EXCEPTION 'APPROVAL_INSTANCE_NOT_ACTIVE: Approval workflow is no longer active (%).', v_instance.status;
  END IF;

  SELECT * INTO v_submission
  FROM public.form_submissions
  WHERE id = v_instance.submission_id
    AND organization_id = p_organization_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SUBMISSION_NOT_FOUND: Associated submission not found.';
  END IF;

  IF v_submission.status IN ('approved', 'rejected', 'archived', 'completed') THEN
    RAISE EXCEPTION 'SUBMISSION_ALREADY_TERMINAL: Submission is already in terminal status (%).', v_submission.status;
  END IF;

  -- Verify actor authorization against assigned user or assigned role
  IF v_stage.assigned_approver_id IS NOT NULL THEN
    IF v_stage.assigned_approver_id <> v_user_id THEN
      RAISE EXCEPTION 'UNAUTHORIZED: You are not the assigned approver for this stage.';
    END IF;
  ELSIF v_stage.assigned_role_key IS NOT NULL THEN
    IF v_stage.assigned_role_key <> v_user_role THEN
      RAISE EXCEPTION 'UNAUTHORIZED: Your role (%) is not assigned to this approval stage (%).', v_user_role, v_stage.assigned_role_key;
    END IF;
  ELSE
    RAISE EXCEPTION 'UNAUTHORIZED: Approval stage has no valid assignee configured.';
  END IF;

  -- Append immutable decision record
  INSERT INTO public.approval_decisions (
    organization_id,
    stage_instance_id,
    approver_id,
    decision,
    comment,
    created_at
  ) VALUES (
    p_organization_id,
    v_stage.id,
    v_user_id,
    p_decision,
    NULLIF(btrim(COALESCE(p_comment, '')), ''),
    v_now
  )
  RETURNING id INTO v_decision_id;

  -- Complete current stage
  UPDATE public.approval_stage_instances
  SET status = p_decision,
      completed_at = v_now
  WHERE id = v_stage.id;

  v_next_data_jsonb := v_submission.data_jsonb;
  IF p_updated_fields_jsonb IS NOT NULL AND jsonb_typeof(p_updated_fields_jsonb) = 'object' THEN
    v_next_data_jsonb := jsonb_set(
      COALESCE(v_next_data_jsonb, '{}'::jsonb),
      '{fields}',
      COALESCE(v_next_data_jsonb->'fields', '{}'::jsonb) || p_updated_fields_jsonb,
      true
    );
  END IF;

  IF p_next_step_id IS NOT NULL THEN
    v_next_stage_order := v_stage.stage_order + 1;
    INSERT INTO public.approval_stage_instances (
      organization_id,
      approval_instance_id,
      stage_definition_id,
      stage_order,
      assignee_index,
      stage_name,
      status,
      assigned_approver_id,
      assigned_role_key,
      started_at,
      created_at
    ) VALUES (
      p_organization_id,
      v_instance.id,
      p_next_step_id,
      v_next_stage_order,
      COALESCE(p_next_assignee_index, 0),
      COALESCE(NULLIF(btrim(COALESCE(p_next_stage_name, '')), ''), 'Approval Stage'),
      'active',
      p_next_assigned_approver_id,
      p_next_assigned_role_key,
      v_now,
      v_now
    )
    RETURNING id INTO v_next_stage_id;

    UPDATE public.approval_instances
    SET current_stage_order = v_next_stage_order,
        current_step_id = p_next_step_id
    WHERE id = v_instance.id;

    v_instance_status := 'active';
    v_submission_status := 'pending_approval';

    UPDATE public.form_submissions
    SET status = v_submission_status,
        data_jsonb = v_next_data_jsonb,
        updated_at = v_now
    WHERE id = v_submission.id;
  ELSE
    v_instance_status := CASE p_decision
      WHEN 'returned' THEN 'returned'
      WHEN 'rejected' THEN 'rejected'
      ELSE 'approved'
    END;

    v_submission_status := COALESCE(NULLIF(btrim(COALESCE(p_terminal_submission_status, '')), ''), v_instance_status);

    UPDATE public.approval_instances
    SET status = v_instance_status,
        completed_at = v_now
    WHERE id = v_instance.id;

    UPDATE public.form_submissions
    SET status = v_submission_status,
        data_jsonb = v_next_data_jsonb,
        completed_at = CASE
          WHEN v_submission_status IN ('approved', 'rejected', 'completed', 'archived') THEN v_now
          ELSE completed_at
        END,
        updated_at = v_now
    WHERE id = v_submission.id;
  END IF;

  PERFORM public.internal_record_audit_event(
    p_organization_id,
    'approval.' || p_decision,
    'form_submission',
    v_submission.id,
    'approval_stage_' || p_decision,
    jsonb_build_object(
      'approval_instance_id', v_instance.id,
      'stage_instance_id', v_stage.id,
      'stage_name', v_stage.stage_name,
      'decision_id', v_decision_id,
      'next_stage_instance_id', v_next_stage_id,
      'submission_status', v_submission_status
    )
  );

  RETURN jsonb_build_object(
    'decision_id', v_decision_id,
    'stage_instance_id', v_stage.id,
    'approval_instance_id', v_instance.id,
    'submission_id', v_submission.id,
    'submission_status', v_submission_status,
    'instance_status', v_instance_status,
    'next_stage_instance_id', v_next_stage_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.decide_approval_stage(
  uuid, uuid, text, text, text, text, integer, uuid, text, text, jsonb
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.decide_approval_stage(
  uuid, uuid, text, text, text, text, integer, uuid, text, text, jsonb
) TO authenticated;

-- 10. Atomic Authenticated Submission Creation + Optional Workflow Start RPC
CREATE OR REPLACE FUNCTION public.create_authenticated_submission(
  p_organization_id uuid,
  p_form_id uuid,
  p_form_version_id uuid,
  p_reference_number text,
  p_status text,
  p_data_jsonb jsonb,
  p_detail_rows jsonb DEFAULT '[]'::jsonb,
  p_workflow_id text DEFAULT NULL,
  p_first_step_id text DEFAULT NULL,
  p_first_stage_name text DEFAULT NULL,
  p_first_assignee_index integer DEFAULT 0,
  p_first_assigned_approver_id uuid DEFAULT NULL,
  p_first_assigned_role_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_now timestamptz := now();
  v_submission_id uuid := gen_random_uuid();
  v_approval_instance_id uuid;
  v_stage_instance_id uuid;
  v_row jsonb;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'AUTHENTICATION_REQUIRED: Sign in is required to submit a form.';
  END IF;

  IF NOT public.is_organization_member(p_organization_id) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: User is not an active member of this organization.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.form_versions fv
    JOIN public.forms f ON f.id = fv.form_id
    WHERE fv.id = p_form_version_id
      AND fv.form_id = p_form_id
      AND fv.organization_id = p_organization_id
      AND f.organization_id = p_organization_id
      AND fv.status = 'published'
  ) THEN
    RAISE EXCEPTION 'INVALID_FORM_VERSION: Published form version not found in organization.';
  END IF;

  INSERT INTO public.form_submissions (
    id,
    organization_id,
    form_id,
    form_version_id,
    reference_number,
    status,
    data_jsonb,
    created_by,
    submitted_by,
    created_at,
    updated_at,
    submitted_at,
    completed_at
  ) VALUES (
    v_submission_id,
    p_organization_id,
    p_form_id,
    p_form_version_id,
    p_reference_number,
    p_status,
    COALESCE(p_data_jsonb, '{}'::jsonb),
    v_user_id,
    v_user_id,
    v_now,
    v_now,
    v_now,
    CASE WHEN p_status IN ('approved', 'rejected', 'completed', 'archived') THEN v_now ELSE NULL END
  );

  IF p_detail_rows IS NOT NULL AND jsonb_typeof(p_detail_rows) = 'array' THEN
    FOR v_row IN SELECT * FROM jsonb_array_elements(p_detail_rows)
    LOOP
      INSERT INTO public.submission_detail_rows (
        organization_id,
        submission_id,
        tab_id,
        row_order,
        data_jsonb,
        created_by,
        created_at,
        updated_at
      ) VALUES (
        p_organization_id,
        v_submission_id,
        v_row->>'tab_id',
        COALESCE((v_row->>'row_order')::integer, 0),
        COALESCE(v_row->'data_jsonb', '{}'::jsonb),
        v_user_id,
        v_now,
        v_now
      );
    END LOOP;
  END IF;

  IF p_first_step_id IS NOT NULL THEN
    INSERT INTO public.approval_instances (
      organization_id,
      submission_id,
      form_version_id,
      workflow_id,
      status,
      current_stage_order,
      current_step_id,
      cycle_number,
      started_at,
      created_at
    ) VALUES (
      p_organization_id,
      v_submission_id,
      p_form_version_id,
      p_workflow_id,
      'active',
      0,
      p_first_step_id,
      1,
      v_now,
      v_now
    )
    RETURNING id INTO v_approval_instance_id;

    INSERT INTO public.approval_stage_instances (
      organization_id,
      approval_instance_id,
      stage_definition_id,
      stage_order,
      assignee_index,
      stage_name,
      status,
      assigned_approver_id,
      assigned_role_key,
      started_at,
      created_at
    ) VALUES (
      p_organization_id,
      v_approval_instance_id,
      p_first_step_id,
      0,
      COALESCE(p_first_assignee_index, 0),
      COALESCE(NULLIF(btrim(COALESCE(p_first_stage_name, '')), ''), 'Approval Stage'),
      'active',
      p_first_assigned_approver_id,
      p_first_assigned_role_key,
      v_now,
      v_now
    )
    RETURNING id INTO v_stage_instance_id;
  END IF;

  PERFORM public.internal_record_audit_event(
    p_organization_id,
    'submission.submitted',
    'form_submission',
    v_submission_id,
    'submit_form',
    jsonb_build_object(
      'form_id', p_form_id,
      'form_version_id', p_form_version_id,
      'status', p_status,
      'approval_instance_id', v_approval_instance_id
    )
  );

  RETURN jsonb_build_object(
    'submission_id', v_submission_id,
    'approval_instance_id', v_approval_instance_id,
    'stage_instance_id', v_stage_instance_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_authenticated_submission(
  uuid, uuid, uuid, text, text, jsonb, jsonb, text, text, text, integer, uuid, text
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.create_authenticated_submission(
  uuid, uuid, uuid, text, text, jsonb, jsonb, text, text, text, integer, uuid, text
) TO authenticated;

-- 11. Atomic Resubmit Returned Submission + New Approval Cycle RPC
CREATE OR REPLACE FUNCTION public.resubmit_returned_submission(
  p_organization_id uuid,
  p_submission_id uuid,
  p_status text,
  p_data_jsonb jsonb,
  p_detail_rows jsonb DEFAULT '[]'::jsonb,
  p_workflow_id text DEFAULT NULL,
  p_first_step_id text DEFAULT NULL,
  p_first_stage_name text DEFAULT NULL,
  p_first_assignee_index integer DEFAULT 0,
  p_first_assigned_approver_id uuid DEFAULT NULL,
  p_first_assigned_role_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_now timestamptz := now();
  v_submission public.form_submissions%ROWTYPE;
  v_next_cycle integer;
  v_approval_instance_id uuid;
  v_stage_instance_id uuid;
  v_row jsonb;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'AUTHENTICATION_REQUIRED: Sign in is required to resubmit a form.';
  END IF;

  IF NOT public.is_organization_member(p_organization_id) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: User is not an active member of this organization.';
  END IF;

  SELECT * INTO v_submission
  FROM public.form_submissions
  WHERE id = p_submission_id
    AND organization_id = p_organization_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SUBMISSION_NOT_FOUND: Submission not found in organization.';
  END IF;

  IF v_submission.status <> 'returned' THEN
    RAISE EXCEPTION 'SUBMISSION_NOT_RETURNED: Only returned submissions can be resubmitted (%).', v_submission.status;
  END IF;

  IF COALESCE(v_submission.submitted_by, v_submission.created_by) <> v_user_id THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Only the submission requester can resubmit a returned submission.';
  END IF;

  UPDATE public.form_submissions
  SET status = p_status,
      data_jsonb = COALESCE(p_data_jsonb, '{}'::jsonb),
      submitted_at = v_now,
      updated_at = v_now,
      completed_at = CASE WHEN p_status IN ('approved', 'rejected', 'completed', 'archived') THEN v_now ELSE NULL END
  WHERE id = v_submission.id;

  -- Soft-delete previous detail rows and insert updated ones
  UPDATE public.submission_detail_rows
  SET deleted_at = v_now,
      updated_at = v_now
  WHERE submission_id = v_submission.id
    AND organization_id = p_organization_id
    AND deleted_at IS NULL;

  IF p_detail_rows IS NOT NULL AND jsonb_typeof(p_detail_rows) = 'array' THEN
    FOR v_row IN SELECT * FROM jsonb_array_elements(p_detail_rows)
    LOOP
      INSERT INTO public.submission_detail_rows (
        organization_id,
        submission_id,
        tab_id,
        row_order,
        data_jsonb,
        created_by,
        created_at,
        updated_at
      ) VALUES (
        p_organization_id,
        v_submission.id,
        v_row->>'tab_id',
        COALESCE((v_row->>'row_order')::integer, 0),
        COALESCE(v_row->'data_jsonb', '{}'::jsonb),
        v_user_id,
        v_now,
        v_now
      );
    END LOOP;
  END IF;

  IF p_first_step_id IS NOT NULL THEN
    SELECT COALESCE(MAX(cycle_number), 0) + 1 INTO v_next_cycle
    FROM public.approval_instances
    WHERE submission_id = v_submission.id
      AND organization_id = p_organization_id;

    INSERT INTO public.approval_instances (
      organization_id,
      submission_id,
      form_version_id,
      workflow_id,
      status,
      current_stage_order,
      current_step_id,
      cycle_number,
      started_at,
      created_at
    ) VALUES (
      p_organization_id,
      v_submission.id,
      v_submission.form_version_id,
      p_workflow_id,
      'active',
      0,
      p_first_step_id,
      v_next_cycle,
      v_now,
      v_now
    )
    RETURNING id INTO v_approval_instance_id;

    INSERT INTO public.approval_stage_instances (
      organization_id,
      approval_instance_id,
      stage_definition_id,
      stage_order,
      assignee_index,
      stage_name,
      status,
      assigned_approver_id,
      assigned_role_key,
      started_at,
      created_at
    ) VALUES (
      p_organization_id,
      v_approval_instance_id,
      p_first_step_id,
      0,
      COALESCE(p_first_assignee_index, 0),
      COALESCE(NULLIF(btrim(COALESCE(p_first_stage_name, '')), ''), 'Approval Stage'),
      'active',
      p_first_assigned_approver_id,
      p_first_assigned_role_key,
      v_now,
      v_now
    )
    RETURNING id INTO v_stage_instance_id;
  END IF;

  PERFORM public.internal_record_audit_event(
    p_organization_id,
    'submission.resubmitted',
    'form_submission',
    v_submission.id,
    'resubmit_form',
    jsonb_build_object(
      'status', p_status,
      'cycle_number', v_next_cycle,
      'approval_instance_id', v_approval_instance_id
    )
  );

  RETURN jsonb_build_object(
    'submission_id', v_submission.id,
    'approval_instance_id', v_approval_instance_id,
    'stage_instance_id', v_stage_instance_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.resubmit_returned_submission(
  uuid, uuid, text, jsonb, jsonb, text, text, text, integer, uuid, text
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.resubmit_returned_submission(
  uuid, uuid, text, jsonb, jsonb, text, text, text, integer, uuid, text
) TO authenticated;
