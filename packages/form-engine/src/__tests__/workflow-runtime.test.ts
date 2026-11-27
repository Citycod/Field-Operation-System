import { describe, expect, it } from 'vitest';
import { FieldDefinition } from '../schema/fields';
import { FlowWorkflowDefinition, LegacySequentialWorkflowDefinition, createDefaultFlowWorkflow } from '../schema/workflow';
import { advanceWorkflowFromApproval, evaluateWorkflowStart } from '../workflow/runtime';

const FIELDS: FieldDefinition[] = [
  { id: 'f_amount', key: 'total_amount', label: 'Total Amount', type: 'currency', order: 0 },
  { id: 'f_dept', key: 'department', label: 'Department', type: 'text', order: 1 },
  { id: 'f_priority', key: 'priority', label: 'Priority', type: 'text', order: 2 },
];

describe('Workflow Runtime Stepper', () => {
  it('returns triggered: false when workflow is null or disabled', () => {
    const disabled = createDefaultFlowWorkflow('Expense');
    disabled.enabled = false;

    expect(evaluateWorkflowStart(null, {}, FIELDS).triggered).toBe(false);
    expect(evaluateWorkflowStart(disabled, {}, FIELDS).triggered).toBe(false);
  });

  it('starts default workflow and pauses at Manager Review approval step', () => {
    const wf = createDefaultFlowWorkflow('Purchase Request');
    const start = evaluateWorkflowStart(wf, { total_amount: 500 }, FIELDS);

    expect(start.triggered).toBe(true);
    expect(start.errors).toEqual([]);
    expect(start.pausedAtApprovalStep?.id).toBe('wf_step_approval_1');
    expect(start.resolvedSubmissionStatus).toBe('pending_approval');

    const approved = advanceWorkflowFromApproval(wf, 'wf_step_approval_1', 'approved', { total_amount: 500 }, FIELDS);
    expect(approved.completedEndStep?.outcome).toBe('approved');
    expect(approved.resolvedSubmissionStatus).toBe('approved');

    const rejected = advanceWorkflowFromApproval(wf, 'wf_step_approval_1', 'rejected', { total_amount: 500 }, FIELDS);
    expect(rejected.completedEndStep?.outcome).toBe('rejected');
    expect(rejected.resolvedSubmissionStatus).toBe('rejected');

    const returned = advanceWorkflowFromApproval(wf, 'wf_step_approval_1', 'returned', { total_amount: 500 }, FIELDS);
    expect(returned.pausedAtApprovalStep).toBeNull();
    expect(returned.resolvedSubmissionStatus).toBe('returned');
  });

  it('evaluates trigger conditions and conditional branches across multi-stage approvals', () => {
    const wf: FlowWorkflowDefinition = {
      id: 'wf_cond',
      name: 'Conditional Approval',
      enabled: true,
      triggers: [
        {
          id: 'tr_1',
          type: 'on_submit',
          enabled: true,
          conditionLogic: 'AND',
          conditions: [{ id: 'c_1', fieldId: 'total_amount', operator: 'greaterThan', value: 100 }],
        },
      ],
      steps: [
        { id: 'start', key: 'start', name: 'Start', type: 'start' },
        {
          id: 'appr_1',
          key: 'mgr',
          name: 'Manager Approval',
          type: 'approval',
          mode: 'single',
          assignees: [{ type: 'role', value: 'manager' }],
        },
        {
          id: 'cond_high',
          key: 'cond_high',
          name: 'High Value Check',
          type: 'condition',
          branches: [
            {
              id: 'br_high',
              label: 'Over 1000',
              conditionLogic: 'AND',
              conditions: [{ id: 'c_2', fieldId: 'total_amount', operator: 'greaterThan', value: 1000 }],
              targetStepId: 'appr_2',
            },
          ],
          defaultTargetStepId: 'upd_auto',
        },
        {
          id: 'appr_2',
          key: 'admin',
          name: 'Finance Director Approval',
          type: 'approval',
          mode: 'single',
          assignees: [{ type: 'role', value: 'business_admin' }],
        },
        {
          id: 'upd_auto',
          key: 'upd_auto',
          name: 'Mark Priority Normal',
          type: 'update_record',
          updates: [{ id: 'u_1', targetRef: 'priority', value: 'auto_approved' }],
        },
        {
          id: 'notif_done',
          key: 'notif_done',
          name: 'Notify Requester',
          type: 'notification',
          event: 'approved',
          recipients: [{ type: 'requester' }],
          subjectTemplate: 'Approved {{system.reference_number}}',
          bodyTemplate: 'Amount {{total_amount}} approved.',
        },
        { id: 'end_ok', key: 'end_ok', name: 'Approved', type: 'end', outcome: 'approved', finalStatus: 'approved' },
        { id: 'end_rej', key: 'end_rej', name: 'Rejected', type: 'end', outcome: 'rejected', finalStatus: 'rejected' },
      ],
      transitions: [
        { id: 't1', fromStepId: 'start', toStepId: 'appr_1', outcome: 'default' },
        { id: 't2', fromStepId: 'appr_1', toStepId: 'cond_high', outcome: 'approved' },
        { id: 't3', fromStepId: 'appr_1', toStepId: 'end_rej', outcome: 'rejected' },
        { id: 't4', fromStepId: 'appr_2', toStepId: 'notif_done', outcome: 'approved' },
        { id: 't5', fromStepId: 'appr_2', toStepId: 'end_rej', outcome: 'rejected' },
        { id: 't6', fromStepId: 'upd_auto', toStepId: 'notif_done', outcome: 'default' },
        { id: 't7', fromStepId: 'notif_done', toStepId: 'end_ok', outcome: 'default' },
      ],
    };

    // Below trigger threshold -> does not trigger
    expect(evaluateWorkflowStart(wf, { total_amount: 50 }, FIELDS).triggered).toBe(false);

    // Above trigger threshold -> pauses at Manager Approval
    const startHigh = evaluateWorkflowStart(wf, { total_amount: 2500 }, FIELDS);
    expect(startHigh.triggered).toBe(true);
    expect(startHigh.pausedAtApprovalStep?.id).toBe('appr_1');

    // Approve step 1 for high value -> routes through condition to Finance Director Approval
    const afterStage1High = advanceWorkflowFromApproval(wf, 'appr_1', 'approved', { total_amount: 2500 }, FIELDS);
    expect(afterStage1High.pausedAtApprovalStep?.id).toBe('appr_2');
    expect(afterStage1High.resolvedSubmissionStatus).toBe('pending_approval');

    // Approve step 2 -> notification + End Approved
    const afterStage2 = advanceWorkflowFromApproval(
      wf,
      'appr_2',
      'approved',
      { total_amount: 2500 },
      FIELDS,
      { 'system.reference_number': 'PR-00012' },
    );
    expect(afterStage2.completedEndStep?.id).toBe('end_ok');
    expect(afterStage2.resolvedSubmissionStatus).toBe('approved');
    expect(afterStage2.notifications[0]?.subject).toBe('Approved PR-00012');

    // Approve step 1 for standard value (500) -> takes else branch -> update_record -> notification -> End Approved
    const afterStage1Std = advanceWorkflowFromApproval(wf, 'appr_1', 'approved', { total_amount: 500 }, FIELDS);
    expect(afterStage1Std.pausedAtApprovalStep).toBeNull();
    expect(afterStage1Std.completedEndStep?.id).toBe('end_ok');
    expect(afterStage1Std.fieldUpdates).toEqual({ priority: 'auto_approved' });
    expect(afterStage1Std.resolvedSubmissionStatus).toBe('approved');
  });

  it('supports legacy sequential workflow definitions cleanly', () => {
    const legacy: LegacySequentialWorkflowDefinition = {
      type: 'sequential',
      stages: [
        { id: 'st_1', key: 'mgr', name: 'Manager', order: 0, approverType: 'role', approverValue: 'manager' },
        { id: 'st_2', key: 'dir', name: 'Director', order: 1, approverType: 'user', approverValue: 'user-dir-1' },
      ],
    };

    const start = evaluateWorkflowStart(legacy, {}, FIELDS);
    expect(start.triggered).toBe(true);
    expect(start.pausedAtApprovalStep?.id).toBe('st_1');

    const step2 = advanceWorkflowFromApproval(legacy, 'st_1', 'approved', {}, FIELDS);
    expect(step2.pausedAtApprovalStep?.id).toBe('st_2');

    const done = advanceWorkflowFromApproval(legacy, 'st_2', 'approved', {}, FIELDS);
    expect(done.completedEndStep?.outcome).toBe('approved');
    expect(done.resolvedSubmissionStatus).toBe('approved');
  });
});
