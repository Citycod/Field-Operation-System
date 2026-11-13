import { describe, expect, it } from 'vitest';
import {
  simulateWorkflow,
  type FieldDefinition,
  type FlowWorkflowDefinition,
} from '../index';

const FIELDS: FieldDefinition[] = [
  { id: 'fld_amount', key: 'estimated_cost', label: 'Estimated Cost', type: 'currency', order: 0 },
  { id: 'fld_critical', key: 'is_critical', label: 'Safety Critical', type: 'checkbox', order: 1 },
  { id: 'fld_site', key: 'site_name', label: 'Site Name', type: 'text', order: 2 },
];

const WORKFLOW: FlowWorkflowDefinition = {
  id: 'wf_sim_test',
  name: 'Equipment Maintenance Workflow',
  enabled: true,
  triggers: [
    {
      id: 'trig_submit',
      type: 'on_submit',
      enabled: true,
      conditionLogic: 'AND',
      conditions: [],
    },
  ],
  steps: [
    { id: 's_start', key: 'start', name: 'Start', type: 'start' },
    {
      id: 's_cond',
      key: 'escalation_check',
      name: 'Escalation Check',
      type: 'condition',
      branches: [
        {
          id: 'br_high',
          label: 'High Cost or Critical',
          conditionLogic: 'OR',
          conditions: [
            { fieldId: 'estimated_cost', operator: 'greaterThan', value: 5000 },
            { fieldId: 'is_critical', operator: 'equals', value: true },
          ],
          targetStepId: 's_appr',
        },
      ],
      defaultTargetStepId: 's_upd_auto',
    },
    {
      id: 's_appr',
      key: 'manager_approval',
      name: 'Manager Approval',
      type: 'approval',
      mode: 'single',
      assignees: [{ type: 'role', value: 'manager', label: 'Manager' }],
    },
    {
      id: 's_notif',
      key: 'notify_ok',
      name: 'Send Approval Confirmation',
      type: 'notification',
      event: 'approved',
      recipients: [{ type: 'requester' }],
      subjectTemplate: 'Approved for {{site_name}}',
      bodyTemplate: 'Estimated cost {{estimated_cost}} was approved.',
    },
    {
      id: 's_upd_auto',
      key: 'auto_status',
      name: 'Mark Auto-Completed',
      type: 'update_record',
      updates: [{ id: 'u1', targetRef: 'system.status', value: 'completed' }],
    },
    { id: 's_end_appr', key: 'end_approved', name: 'Approved', type: 'end', outcome: 'approved' },
    { id: 's_end_rej', key: 'end_rejected', name: 'Rejected', type: 'end', outcome: 'rejected' },
    { id: 's_end_auto', key: 'end_auto', name: 'Completed', type: 'end', outcome: 'completed' },
  ],
  transitions: [
    { id: 'tr1', fromStepId: 's_start', toStepId: 's_cond', outcome: 'default' },
    { id: 'tr2', fromStepId: 's_appr', toStepId: 's_notif', outcome: 'approved' },
    { id: 'tr3', fromStepId: 's_appr', toStepId: 's_end_rej', outcome: 'rejected' },
    { id: 'tr4', fromStepId: 's_notif', toStepId: 's_end_appr', outcome: 'default' },
    { id: 'tr5', fromStepId: 's_upd_auto', toStepId: 's_end_auto', outcome: 'default' },
  ],
};

describe('Workflow Simulator', () => {
  it('routes through OR condition match, simulates approval decision, and interpolates notifications', () => {
    const res = simulateWorkflow(
      WORKFLOW,
      { estimated_cost: 7500, is_critical: false, site_name: 'Plant North' },
      FIELDS,
      { s_appr: 'approved' },
    );

    expect(res.synthetic).toBe(true);
    expect(res.triggered).toBe(true);
    expect(res.completed).toBe(true);
    expect(res.terminalOutcome).toBe('approved');
    expect(res.visitedStepIds).toEqual(['s_start', 's_cond', 's_appr', 's_notif', 's_end_appr']);
    expect(res.branchDecisions[0]).toMatchObject({
      stepId: 's_cond',
      selectedBranchLabel: 'High Cost or Critical',
      matched: true,
    });
    expect(res.notificationsPreview[0].subject).toBe('Approved for Plant North');
    expect(res.errors).toEqual([]);
  });

  it('follows rejection outcome when approval decision is simulated as rejected', () => {
    const res = simulateWorkflow(
      WORKFLOW,
      { estimated_cost: 200, is_critical: true, site_name: 'Depot West' },
      FIELDS,
      { s_appr: 'rejected' },
    );

    expect(res.completed).toBe(true);
    expect(res.terminalOutcome).toBe('rejected');
    expect(res.visitedStepIds).toEqual(['s_start', 's_cond', 's_appr', 's_end_rej']);
  });

  it('follows fallback branch and records synthetic field updates when OR conditions do not match', () => {
    const res = simulateWorkflow(
      WORKFLOW,
      { estimated_cost: 250, is_critical: false, site_name: 'Depot East' },
      FIELDS,
    );

    expect(res.completed).toBe(true);
    expect(res.terminalOutcome).toBe('completed');
    expect(res.visitedStepIds).toEqual(['s_start', 's_cond', 's_upd_auto', 's_end_auto']);
    expect(res.branchDecisions[0]).toMatchObject({
      selectedBranchLabel: 'Default / Else',
      matched: false,
    });
    expect(res.recordUpdatesPreview).toEqual([
      { stepId: 's_upd_auto', targetRef: 'system.status', value: 'completed' },
    ]);
  });

  it('guards against circular paths safely without infinite recursion', () => {
    const cyclic: FlowWorkflowDefinition = {
      id: 'wf_loop',
      name: 'Looping Workflow',
      enabled: true,
      triggers: [{ id: 't1', type: 'on_submit', enabled: true }],
      steps: [
        { id: 's_start', key: 'start', name: 'Start', type: 'start' },
        { id: 's_a', key: 'step_a', name: 'Step A', type: 'assignment', assignee: { type: 'role', value: 'manager' } },
        { id: 's_end', key: 'end', name: 'End', type: 'end', outcome: 'completed' },
      ],
      transitions: [
        { id: 'tr1', fromStepId: 's_start', toStepId: 's_a', outcome: 'default' },
        { id: 'tr2', fromStepId: 's_a', toStepId: 's_start', outcome: 'default' },
      ],
    };

    const res = simulateWorkflow(cyclic, {}, FIELDS);
    expect(res.completed).toBe(false);
    expect(res.errors.some((e) => /Circular path detected/i.test(e))).toBe(true);
  });

  it('respects AND condition groups on trigger gates', () => {
    const gatedWorkflow: FlowWorkflowDefinition = {
      ...WORKFLOW,
      triggers: [
        {
          id: 'trig_gated',
          type: 'on_submit',
          enabled: true,
          conditionLogic: 'AND',
          conditions: [
            { fieldId: 'estimated_cost', operator: 'greaterThan', value: 100 },
            { fieldId: 'is_critical', operator: 'equals', value: true },
          ],
        },
      ],
    };

    const blocked = simulateWorkflow(gatedWorkflow, { estimated_cost: 500, is_critical: false }, FIELDS);
    expect(blocked.triggered).toBe(false);
    expect(blocked.completed).toBe(false);

    const passed = simulateWorkflow(gatedWorkflow, { estimated_cost: 500, is_critical: true }, FIELDS);
    expect(passed.triggered).toBe(true);
    expect(passed.completed).toBe(true);
  });
});

