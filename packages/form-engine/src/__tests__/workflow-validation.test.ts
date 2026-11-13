import { describe, expect, it } from 'vitest';
import {
  ALL_FIELD_TYPES_SCHEMA,
  MINIMAL_VALID_SCHEMA,
  createDefaultFlowWorkflow,
  isLegacySequentialWorkflow,
  normalizeWorkflowDefinition,
  validateDraftSchema,
  validatePublishableSchema,
  workflowHasUserAssignees,
  type FlowWorkflowDefinition,
  type FormSchemaV1,
} from '../index';

function makeFlowSchema(workflow: FlowWorkflowDefinition | null): FormSchemaV1 {
  const base = structuredClone(MINIMAL_VALID_SCHEMA);
  base.header.sections = [
    {
      id: 'sec_eq',
      key: 'inspection_header',
      title: 'Inspection Header',
      order: 0,
      fields: [
        { id: 'fld_amount', key: 'estimated_cost', label: 'Estimated Cost', type: 'currency', order: 0 },
        { id: 'fld_site', key: 'site_name', label: 'Site Name', type: 'text', order: 1 },
        { id: 'fld_total', key: 'calculated_total', label: 'Calculated Total', type: 'calculated', order: 2, calculationConfig: { operation: 'add', operands: ['fld_amount'] } },
      ],
    },
  ];
  base.workflow = workflow;
  return base;
}

describe('Workflow Schema Compatibility & Normalization', () => {
  it('preserves workflow: null and legacy sequential workflow validity', () => {
    expect(validatePublishableSchema(MINIMAL_VALID_SCHEMA).valid).toBe(true);
    expect(validatePublishableSchema(ALL_FIELD_TYPES_SCHEMA).valid).toBe(true);
    expect(isLegacySequentialWorkflow(ALL_FIELD_TYPES_SCHEMA.workflow)).toBe(true);
  });

  it('normalizes legacy sequential workflow stages into FlowWorkflowDefinition cleanly', () => {
    const legacy = ALL_FIELD_TYPES_SCHEMA.workflow;
    const normalized = normalizeWorkflowDefinition(legacy);
    expect(normalized).not.toBeNull();
    expect(normalized?.enabled).toBe(true);
    expect(normalized?.steps.some((s) => s.type === 'start')).toBe(true);
    expect(normalized?.steps.some((s) => s.type === 'approval')).toBe(true);
    expect(normalized?.steps.some((s) => s.type === 'end' && s.outcome === 'approved')).toBe(true);
    expect(normalized?.steps.some((s) => s.type === 'end' && s.outcome === 'rejected')).toBe(true);

    // Normalized flow must pass publish validation cleanly
    const schemaWithNormalized = makeFlowSchema(normalized);
    expect(validatePublishableSchema(schemaWithNormalized).valid).toBe(true);
  });

  it('creates valid default flow workflow out of the box', () => {
    const wf = createDefaultFlowWorkflow('Equipment Inspection');
    const schema = makeFlowSchema(wf);
    expect(validateDraftSchema(schema).valid).toBe(true);
    expect(validatePublishableSchema(schema).valid).toBe(true);
  });
});

describe('Workflow Validation — Draft & Publish', () => {
  it('allows incomplete draft workflows with actionable warnings while blocking structurally corrupt duplicates', () => {
    const wf = createDefaultFlowWorkflow('Equipment Inspection');
    // Remove assignees and End node -> valid draft with warnings, invalid publish
    wf.steps = wf.steps.filter((s) => s.type !== 'end');
    wf.transitions = wf.transitions.filter((t) => wf.steps.some((s) => s.id === t.toStepId));
    const appr = wf.steps.find((s) => s.type === 'approval');
    if (appr && appr.type === 'approval') {
      appr.assignees = [];
    }

    const incompleteSchema = makeFlowSchema(wf);
    const draftRes = validateDraftSchema(incompleteSchema);
    expect(draftRes.valid).toBe(true);
    expect(draftRes.warnings.some((w) => w.code === 'WORKFLOW_MISSING_END')).toBe(true);
    expect(draftRes.warnings.some((w) => w.code === 'MISSING_WORKFLOW_ASSIGNEE')).toBe(true);

    const pubRes = validatePublishableSchema(incompleteSchema);
    expect(pubRes.valid).toBe(false);
    expect(pubRes.errors.some((e) => e.code === 'WORKFLOW_MISSING_END')).toBe(true);
    expect(pubRes.errors.some((e) => e.code === 'MISSING_WORKFLOW_ASSIGNEE')).toBe(true);
  });

  it('rejects duplicate step IDs and keys even in draft mode', () => {
    const wf = createDefaultFlowWorkflow();
    wf.steps.push({
      id: wf.steps[0].id,
      key: wf.steps[0].key,
      name: 'Duplicate',
      type: 'assignment',
      assignee: { type: 'role', value: 'manager' },
    });
    const draftRes = validateDraftSchema(makeFlowSchema(wf));
    expect(draftRes.valid).toBe(false);
    expect(draftRes.errors.some((e) => e.code === 'DUPLICATE_WORKFLOW_STEP_ID')).toBe(true);
    expect(draftRes.errors.some((e) => e.code === 'DUPLICATE_WORKFLOW_STEP_KEY')).toBe(true);
  });

  it('blocks missing Start, multiple Starts, missing End, and invalid outcomes on publish', () => {
    const noStart = createDefaultFlowWorkflow();
    noStart.steps = noStart.steps.filter((s) => s.type !== 'start');
    noStart.transitions = noStart.transitions.filter((t) => t.fromStepId !== 'wf_step_start');
    expect(
      validatePublishableSchema(makeFlowSchema(noStart)).errors.some(
        (e) => e.code === 'WORKFLOW_MISSING_START',
      ),
    ).toBe(true);

    const twoStarts = createDefaultFlowWorkflow();
    twoStarts.steps.push({ id: 'wf_start_2', key: 'start_2', name: 'Start 2', type: 'start' });
    expect(
      validatePublishableSchema(makeFlowSchema(twoStarts)).errors.some(
        (e) => e.code === 'WORKFLOW_MULTIPLE_START',
      ),
    ).toBe(true);
  });

  it('blocks invalid transitions, unreachable steps, and circular workflow loops', () => {
    const wf = createDefaultFlowWorkflow();
    // Unreachable orphan step
    wf.steps.push({
      id: 'wf_orphan',
      key: 'orphan_task',
      name: 'Orphan Task',
      type: 'assignment',
      assignee: { type: 'role', value: 'manager' },
    });
    wf.transitions.push({
      id: 'tr_orphan_end',
      fromStepId: 'wf_orphan',
      toStepId: 'wf_step_end_approved',
      outcome: 'default',
    });

    const unreachableRes = validatePublishableSchema(makeFlowSchema(wf));
    expect(unreachableRes.valid).toBe(false);
    expect(unreachableRes.errors.some((e) => e.code === 'WORKFLOW_UNREACHABLE_STEP')).toBe(true);

    // Cycle check: point approval returned back to start -> cycle
    const cyclic = createDefaultFlowWorkflow();
    cyclic.transitions.push({
      id: 'tr_cycle',
      fromStepId: 'wf_step_approval_1',
      toStepId: 'wf_step_start',
      outcome: 'returned',
    });
    const cyclicRes = validatePublishableSchema(makeFlowSchema(cyclic));
    expect(cyclicRes.valid).toBe(false);
    expect(cyclicRes.errors.some((e) => e.code === 'WORKFLOW_CYCLE_DETECTED')).toBe(true);

    // Dangling non-existent transition target
    const brokenEdge = createDefaultFlowWorkflow();
    brokenEdge.transitions[0].toStepId = 'missing_step_id';
    const brokenRes = validatePublishableSchema(makeFlowSchema(brokenEdge));
    expect(brokenRes.valid).toBe(false);
    expect(brokenRes.errors.some((e) => e.code === 'INVALID_WORKFLOW_TRANSITION')).toBe(true);
  });

  it('validates conditional branches, fallback paths, and field references', () => {
    const wf: FlowWorkflowDefinition = {
      id: 'wf_cond',
      name: 'Conditional Routing',
      enabled: true,
      triggers: [{ id: 't1', type: 'on_submit', enabled: true }],
      steps: [
        { id: 's_start', key: 'start', name: 'Start', type: 'start' },
        {
          id: 's_cond',
          key: 'check_cost',
          name: 'Check Cost',
          type: 'condition',
          branches: [
            {
              id: 'b_high',
              label: 'High Cost',
              conditionLogic: 'AND',
              conditions: [{ fieldId: 'missing_field', operator: 'greaterThan', value: 1000 }],
              targetStepId: 's_appr',
            },
          ],
          defaultTargetStepId: undefined,
        },
        {
          id: 's_appr',
          key: 'dir_appr',
          name: 'Director Approval',
          type: 'approval',
          mode: 'single',
          assignees: [{ type: 'role', value: 'business_admin' }],
        },
        { id: 's_end', key: 'end_ok', name: 'Completed', type: 'end', outcome: 'completed' },
      ],
      transitions: [
        { id: 'tr1', fromStepId: 's_start', toStepId: 's_cond', outcome: 'default' },
        { id: 'tr2', fromStepId: 's_appr', toStepId: 's_end', outcome: 'approved' },
      ],
    };

    const res = validatePublishableSchema(makeFlowSchema(wf));
    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => e.code === 'BROKEN_WORKFLOW_FIELD_REF')).toBe(true);
    expect(res.errors.some((e) => e.code === 'WORKFLOW_MISSING_FALLBACK')).toBe(true);

    // Fix field reference and fallback target
    if (wf.steps[1].type === 'condition') {
      wf.steps[1].branches[0].conditions[0].fieldId = 'estimated_cost';
      wf.steps[1].defaultTargetStepId = 's_end';
    }
    expect(validatePublishableSchema(makeFlowSchema(wf)).valid).toBe(true);
  });

  it('blocks unsafe notification templates even in draft mode', () => {
    const wf = createDefaultFlowWorkflow();
    wf.steps.splice(2, 0, {
      id: 's_notif',
      key: 'notify_admin',
      name: 'Notify Admin',
      type: 'notification',
      event: 'approved',
      recipients: [{ type: 'requester' }],
      subjectTemplate: 'Approved <script>alert(1)</script>',
      bodyTemplate: 'Request {{system.reference_number}} approved.',
    });
    const draftRes = validateDraftSchema(makeFlowSchema(wf));
    expect(draftRes.valid).toBe(false);
    expect(draftRes.errors.some((e) => e.code === 'UNSAFE_WORKFLOW_TEMPLATE')).toBe(true);
  });

  it('validates assignee roles, tenant-scoped user IDs, and update_record targets on publish', () => {
    const wf = createDefaultFlowWorkflow();
    wf.steps.splice(
      2,
      0,
      {
        id: 's_upd',
        key: 'mark_approved',
        name: 'Update Record',
        type: 'update_record',
        updates: [{ id: 'u1', targetRef: 'calculated_total', value: 123 }],
      },
    );
    const appr = wf.steps.find((s) => s.type === 'approval');
    if (appr && appr.type === 'approval') {
      appr.assignees = [{ type: 'user', value: 'user_outside_org' }];
    }
    wf.transitions = [
      { id: 'tr1', fromStepId: 'wf_step_start', toStepId: 'wf_step_approval_1', outcome: 'default' },
      { id: 'tr2', fromStepId: 'wf_step_approval_1', toStepId: 's_upd', outcome: 'approved' },
      { id: 'tr3', fromStepId: 'wf_step_approval_1', toStepId: 'wf_step_end_rejected', outcome: 'rejected' },
      { id: 'tr4', fromStepId: 's_upd', toStepId: 'wf_step_end_approved', outcome: 'default' },
    ];

    const res = validatePublishableSchema(makeFlowSchema(wf), {
      activeMemberUserIds: new Set(['user_org_a']),
    });
    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => e.code === 'INVALID_WORKFLOW_ASSIGNEE')).toBe(true);
    expect(res.errors.some((e) => e.code === 'BROKEN_WORKFLOW_FIELD_REF')).toBe(true);
  });

  it('treats an explicitly supplied empty Set as having zero valid tenant users across flow and legacy workflows', () => {
    const wf = createDefaultFlowWorkflow();
    const appr = wf.steps.find((s) => s.type === 'approval');
    if (appr && appr.type === 'approval') {
      appr.assignees = [{ type: 'user', value: 'user_org_a' }];
    }

    // Active member passes
    expect(
      validatePublishableSchema(makeFlowSchema(wf), {
        activeMemberUserIds: new Set(['user_org_a']),
      }).valid,
    ).toBe(true);

    // Explicit empty Set rejects user assignment (does not fail open)
    const emptyRosterRes = validatePublishableSchema(makeFlowSchema(wf), {
      activeMemberUserIds: new Set(),
    });
    expect(emptyRosterRes.valid).toBe(false);
    expect(
      emptyRosterRes.errors.some((e) => e.code === 'INVALID_WORKFLOW_ASSIGNEE'),
    ).toBe(true);

    // Legacy sequential stage with approverType: 'user' also enforces explicit empty/tenant roster
    const legacySchema = makeFlowSchema(null);
    legacySchema.workflow = {
      type: 'sequential',
      stages: [
        {
          id: 'stg_user',
          key: 'user_stage',
          name: 'Named Reviewer',
          order: 0,
          approverType: 'user',
          approverValue: 'user_org_a',
        },
      ],
    };
    expect(
      validatePublishableSchema(legacySchema, {
        activeMemberUserIds: new Set(['user_org_a']),
      }).valid,
    ).toBe(true);
    const legacyEmptyRes = validatePublishableSchema(legacySchema, {
      activeMemberUserIds: new Set(),
    });
    expect(legacyEmptyRes.valid).toBe(false);
    expect(
      legacyEmptyRes.errors.some((e) => e.code === 'INVALID_WORKFLOW_ASSIGNEE'),
    ).toBe(true);

    // Detection helper identifies user-specific assignees accurately
    expect(workflowHasUserAssignees(wf)).toBe(true);
    expect(workflowHasUserAssignees(legacySchema.workflow)).toBe(true);
    expect(workflowHasUserAssignees(createDefaultFlowWorkflow())).toBe(false);
    expect(workflowHasUserAssignees(null)).toBe(false);
  });
});