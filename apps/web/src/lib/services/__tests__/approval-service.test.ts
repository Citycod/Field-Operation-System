import { beforeEach, describe, expect, it } from 'vitest';
import {
  FlowWorkflowDefinition,
  FormSchemaV1,
  createDefaultFlowWorkflow,
} from '@field/form-engine';
import type { OrganizationMembership, PlatformRole } from '@field/types';
import { ApprovalService } from '../approval-service';
import { SubmissionService } from '../submission-service';
import type {
  ApprovalDecisionEntity,
  ApprovalInstanceEntity,
  ApprovalRepository,
  ApprovalStageContext,
  ApprovalStageInstanceEntity,
  DecideApprovalStageParams,
  DecideApprovalStageResult,
  PendingApprovalTask,
  SubmissionApprovalHistory,
} from '../../repositories/approval-repository';
import type {
  FormEntity,
  FormListItem,
  FormRepository,
  FormVersionEntity,
} from '../../repositories/form-repository';
import type { MembershipRepository } from '../../repositories/membership-repository';
import type {
  FormSubmissionEntity,
  PaginatedSubmissionsResult,
  SubmissionDetailRowEntity,
  SubmissionFilterParams,
  SubmissionRepository,
} from '../../repositories/submission-repository';

class MockMembershipRepository implements MembershipRepository {
  private memberships = new Map<
    string,
    { role_key: PlatformRole; status: 'active' | 'invited' | 'disabled' }
  >();

  add(
    userId: string,
    orgId: string,
    role_key: PlatformRole,
    status: 'active' | 'invited' | 'disabled' = 'active',
  ) {
    this.memberships.set(`${userId}:${orgId}`, { role_key, status });
  }

  async findByUserId(): Promise<OrganizationMembership[]> {
    return [];
  }

  async findUserMembershipInOrg(
    userId: string,
    organizationId: string,
  ): Promise<OrganizationMembership | null> {
    const entry = this.memberships.get(`${userId}:${organizationId}`);
    if (!entry) return null;
    return {
      id: `mem_${userId}_${organizationId}`,
      organization_id: organizationId,
      user_id: userId,
      role_key: entry.role_key,
      status: entry.status,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  }

  async getRoster(): Promise<any[]> {
    return [];
  }

  async manageMembership(): Promise<any> {
    throw new Error('Not implemented');
  }
}

class MockFormRepository implements FormRepository {
  forms = new Map<string, FormEntity>();
  versions = new Map<string, FormVersionEntity[]>();

  async listForms(organizationId: string): Promise<FormListItem[]> {
    return Array.from(this.forms.values())
      .filter((f) => f.organization_id === organizationId)
      .map((f) => ({
        ...f,
        draft_version_number: null,
        published_version_number: 1,
      }));
  }

  async createForm(): Promise<any> {
    throw new Error('Not implemented');
  }

  async getFormById(id: string, organizationId: string): Promise<FormEntity | null> {
    const form = this.forms.get(id);
    if (!form || form.organization_id !== organizationId) return null;
    return form;
  }

  async getFormByKey(key: string, organizationId: string): Promise<FormEntity | null> {
    for (const form of this.forms.values()) {
      if (form.key === key && form.organization_id === organizationId) return form;
    }
    return null;
  }

  async getDraftVersion(): Promise<FormVersionEntity | null> {
    return null;
  }

  async getPublishedVersion(
    formId: string,
    organizationId: string,
  ): Promise<FormVersionEntity | null> {
    const vers = this.versions.get(formId) || [];
    return (
      vers
        .filter((v) => v.organization_id === organizationId && v.status === 'published')
        .sort((a, b) => b.version_number - a.version_number)[0] ?? null
    );
  }

  async getVersionById(
    versionId: string,
    organizationId: string,
  ): Promise<FormVersionEntity | null> {
    for (const vers of this.versions.values()) {
      const found = vers.find(
        (v) => v.id === versionId && v.organization_id === organizationId,
      );
      if (found) return found;
    }
    return null;
  }

  async saveDraft(): Promise<any> {
    throw new Error('Not implemented');
  }

  async publishVersion(): Promise<any> {
    throw new Error('Not implemented');
  }

  async listVersions(
    formId: string,
    organizationId: string,
  ): Promise<FormVersionEntity[]> {
    return (this.versions.get(formId) || []).filter(
      (v) => v.organization_id === organizationId,
    );
  }

  async createDraftFromPublished(): Promise<any> {
    throw new Error('Not implemented');
  }

  async getPublicForm(slugOrId: string): Promise<any> {
    for (const f of this.forms.values()) {
      if (f.id === slugOrId || f.public_slug === slugOrId || f.key === slugOrId) {
        const pub = await this.getPublishedVersion(f.id, f.organization_id);
        if (pub) return { form: f, publishedVersion: pub };
      }
    }
    return null;
  }

  async setFormPublicAccess(): Promise<any> {
    throw new Error('Not implemented');
  }
}

class MockSubmissionRepository implements SubmissionRepository {
  submissions = new Map<string, FormSubmissionEntity>();
  detailRows = new Map<string, SubmissionDetailRowEntity[]>();
  private seq = 0;

  async createSubmission(params: {
    organizationId: string;
    formId: string;
    formVersionId: string;
    referenceNumber?: string | null;
    status: string;
    dataJsonb: Record<string, unknown>;
    createdBy?: string | null;
    submittedBy?: string | null;
    detailRows?: Array<{
      tabId: string;
      rowOrder: number;
      dataJsonb: Record<string, unknown>;
    }>;
  }): Promise<FormSubmissionEntity> {
    this.seq += 1;
    const id = `sub_${this.seq}`;
    const now = new Date().toISOString();
    const entity: FormSubmissionEntity = {
      id,
      organization_id: params.organizationId,
      form_id: params.formId,
      form_version_id: params.formVersionId,
      reference_number: params.referenceNumber ?? null,
      status: params.status,
      data_jsonb: params.dataJsonb,
      created_by: params.createdBy ?? null,
      submitted_by: params.submittedBy ?? null,
      created_at: now,
      updated_at: now,
      submitted_at: now,
      completed_at: null,
    };
    this.submissions.set(id, entity);
    if (params.detailRows?.length) {
      this.detailRows.set(
        id,
        params.detailRows.map((r, i) => ({
          id: `row_${id}_${i}`,
          organization_id: params.organizationId,
          submission_id: id,
          tab_id: r.tabId,
          row_order: r.rowOrder,
          data_jsonb: r.dataJsonb,
          created_by: params.createdBy ?? null,
          created_at: now,
          updated_at: now,
          deleted_at: null,
        })),
      );
    }
    return entity;
  }

  async getSubmissionById(
    id: string,
    organizationId: string,
  ): Promise<FormSubmissionEntity | null> {
    const sub = this.submissions.get(id);
    if (!sub || sub.organization_id !== organizationId) return null;
    return sub;
  }

  async getSubmissionDetailRows(
    submissionId: string,
    organizationId: string,
  ): Promise<SubmissionDetailRowEntity[]> {
    return (this.detailRows.get(submissionId) || []).filter(
      (r) => r.organization_id === organizationId && !r.deleted_at,
    );
  }

  async listSubmissions(params: SubmissionFilterParams): Promise<PaginatedSubmissionsResult> {
    const all = Array.from(this.submissions.values()).filter(
      (s) => s.organization_id === params.organizationId,
    );
    return {
      submissions: all,
      totalCount: all.length,
      page: 1,
      pageSize: 20,
      totalPages: all.length ? 1 : 0,
    };
  }
}

class MockApprovalRepository implements ApprovalRepository {
  instances = new Map<string, ApprovalInstanceEntity>();
  stages = new Map<string, ApprovalStageInstanceEntity>();
  decisions: ApprovalDecisionEntity[] = [];
  private seq = 0;

  constructor(
    private readonly formRepo: MockFormRepository,
    private readonly subRepo: MockSubmissionRepository,
  ) {}

  async createApprovalInstanceWithInitialStage(params: {
    organizationId: string;
    submissionId: string;
    formVersionId: string;
    workflowId: string | null;
    cycleNumber: number;
    firstStage: {
      stepId: string;
      stageName: string;
      assigneeIndex: number;
      assignedApproverId: string | null;
      assignedRoleKey: string | null;
    };
  }): Promise<{
    instance: ApprovalInstanceEntity;
    stage: ApprovalStageInstanceEntity;
  }> {
    this.seq += 1;
    const now = new Date().toISOString();
    const instId = `inst_${this.seq}`;
    const stageId = `stg_${this.seq}`;

    const instance: ApprovalInstanceEntity = {
      id: instId,
      organization_id: params.organizationId,
      submission_id: params.submissionId,
      form_version_id: params.formVersionId,
      workflow_id: params.workflowId,
      status: 'active',
      current_stage_order: 0,
      current_step_id: params.firstStage.stepId,
      cycle_number: params.cycleNumber,
      started_at: now,
      completed_at: null,
      created_at: now,
    };

    const stage: ApprovalStageInstanceEntity = {
      id: stageId,
      organization_id: params.organizationId,
      approval_instance_id: instId,
      stage_definition_id: params.firstStage.stepId,
      stage_order: 0,
      assignee_index: params.firstStage.assigneeIndex,
      stage_name: params.firstStage.stageName,
      status: 'active',
      assigned_approver_id: params.firstStage.assignedApproverId,
      assigned_role_id: null,
      assigned_role_key: params.firstStage.assignedRoleKey,
      started_at: now,
      completed_at: null,
      created_at: now,
    };

    this.instances.set(instId, instance);
    this.stages.set(stageId, stage);
    return { instance, stage };
  }

  async getSubmissionApprovalHistory(
    submissionId: string,
    organizationId: string,
  ): Promise<SubmissionApprovalHistory> {
    const instances = Array.from(this.instances.values())
      .filter(
        (i) => i.submission_id === submissionId && i.organization_id === organizationId,
      )
      .sort((a, b) => a.cycle_number - b.cycle_number);

    const instIds = new Set(instances.map((i) => i.id));
    const stages = Array.from(this.stages.values())
      .filter(
        (s) => s.organization_id === organizationId && instIds.has(s.approval_instance_id),
      )
      .sort((a, b) => a.stage_order - b.stage_order);

    const stageIds = new Set(stages.map((s) => s.id));
    const decisions = this.decisions.filter(
      (d) => d.organization_id === organizationId && stageIds.has(d.stage_instance_id),
    );

    return { instances, stages, decisions };
  }

  async getStageInstanceContext(
    stageInstanceId: string,
    organizationId: string,
  ): Promise<ApprovalStageContext | null> {
    const stage = this.stages.get(stageInstanceId);
    if (!stage || stage.organization_id !== organizationId) return null;
    const instance = this.instances.get(stage.approval_instance_id);
    if (!instance || instance.organization_id !== organizationId) return null;
    const submission = this.subRepo.submissions.get(instance.submission_id);
    if (!submission || submission.organization_id !== organizationId) return null;
    return { stage, instance, submission };
  }

  async listPendingTasksForUser(params: {
    organizationId: string;
    userId: string;
    roleKey: string;
  }): Promise<PendingApprovalTask[]> {
    const tasks: PendingApprovalTask[] = [];
    for (const stage of this.stages.values()) {
      if (stage.organization_id !== params.organizationId || stage.status !== 'active') {
        continue;
      }
      const assignedToUser =
        stage.assigned_approver_id !== null
          ? stage.assigned_approver_id === params.userId
          : stage.assigned_role_key === params.roleKey;
      if (!assignedToUser) continue;

      const instance = this.instances.get(stage.approval_instance_id);
      if (!instance || instance.status !== 'active') continue;
      const sub = this.subRepo.submissions.get(instance.submission_id);
      if (!sub) continue;
      const form = this.formRepo.forms.get(sub.form_id);

      tasks.push({
        stage,
        instance,
        submission: {
          id: sub.id,
          form_id: sub.form_id,
          form_version_id: sub.form_version_id,
          reference_number: sub.reference_number,
          status: sub.status,
          submitted_by: sub.submitted_by,
          submitted_at: sub.submitted_at,
          created_at: sub.created_at,
        },
        formTitle: form?.title ?? 'Untitled',
        formKey: form?.key ?? sub.form_id,
      });
    }
    return tasks;
  }

  async hasAssignedStageForSubmission(params: {
    submissionId: string;
    organizationId: string;
    userId: string;
    roleKey: string;
  }): Promise<boolean> {
    const history = await this.getSubmissionApprovalHistory(
      params.submissionId,
      params.organizationId,
    );
    return history.stages.some((s) =>
      s.assigned_approver_id
        ? s.assigned_approver_id === params.userId
        : s.assigned_role_key === params.roleKey,
    );
  }

  async decideApprovalStage(
    params: DecideApprovalStageParams,
  ): Promise<DecideApprovalStageResult> {
    const stage = this.stages.get(params.stageInstanceId);
    if (!stage || stage.organization_id !== params.organizationId) {
      throw new Error('APPROVAL_STAGE_NOT_FOUND');
    }
    if (stage.status !== 'active') {
      throw new Error('APPROVAL_STAGE_ALREADY_DECIDED');
    }
    const instance = this.instances.get(stage.approval_instance_id)!;
    const submission = this.subRepo.submissions.get(instance.submission_id)!;
    const now = new Date().toISOString();

    this.seq += 1;
    const decisionId = `dec_${this.seq}`;
    this.decisions.push({
      id: decisionId,
      organization_id: params.organizationId,
      stage_instance_id: stage.id,
      approver_id: params.actorUserId,
      decision: params.decision,
      comment: params.comment ?? null,
      created_at: now,
    });

    stage.status = params.decision;
    stage.completed_at = now;

    if (params.updatedFields) {
      submission.data_jsonb = {
        ...submission.data_jsonb,
        fields: {
          ...((submission.data_jsonb.fields as Record<string, unknown>) || {}),
          ...params.updatedFields,
        },
      };
    }

    let nextStageInstanceId: string | null = null;
    if (params.nextStage) {
      this.seq += 1;
      nextStageInstanceId = `stg_${this.seq}`;
      const nextStageOrder = stage.stage_order + 1;
      this.stages.set(nextStageInstanceId, {
        id: nextStageInstanceId,
        organization_id: params.organizationId,
        approval_instance_id: instance.id,
        stage_definition_id: params.nextStage.stepId,
        stage_order: nextStageOrder,
        assignee_index: params.nextStage.assigneeIndex,
        stage_name: params.nextStage.stageName,
        status: 'active',
        assigned_approver_id: params.nextStage.assignedApproverId,
        assigned_role_id: null,
        assigned_role_key: params.nextStage.assignedRoleKey,
        started_at: now,
        completed_at: null,
        created_at: now,
      });
      instance.current_stage_order = nextStageOrder;
      instance.current_step_id = params.nextStage.stepId;
      submission.status = 'pending_approval';
    } else {
      instance.status =
        params.decision === 'returned'
          ? 'returned'
          : params.decision === 'rejected'
            ? 'rejected'
            : 'approved';
      instance.completed_at = now;
      submission.status = params.terminalSubmissionStatus || instance.status;
      if (['approved', 'rejected', 'completed', 'archived'].includes(submission.status)) {
        submission.completed_at = now;
      }
    }

    return {
      decisionId,
      stageInstanceId: stage.id,
      approvalInstanceId: instance.id,
      submissionId: submission.id,
      submissionStatus: submission.status,
      instanceStatus: instance.status,
      nextStageInstanceId,
    };
  }
}

describe('Phase 6B / 7B — Runtime Workflow & Approval Execution', () => {
  const orgA = 'org-a-uuid';
  const orgB = 'org-b-uuid';
  const requesterA = 'user-emp-a';
  const managerA = 'user-mgr-a';
  const directorA = 'user-dir-a';
  const adminA = 'user-admin-a';
  const managerB = 'user-mgr-b';

  let membershipRepo: MockMembershipRepository;
  let formRepo: MockFormRepository;
  let submissionRepo: MockSubmissionRepository;
  let approvalRepo: MockApprovalRepository;
  let submissionService: SubmissionService;
  let approvalService: ApprovalService;

  function seedForm(
    formId: string,
    orgId: string,
    workflow: FlowWorkflowDefinition | null,
    options?: { isPublic?: boolean },
  ) {
    const schema: FormSchemaV1 = {
      schemaVersion: 1,
      form: { id: formId, key: `key_${formId}`, title: `Form ${formId}`, schemaVersion: 1 },
      header: {
        columns: 2,
        sections: [
          {
            id: 'sec_1',
            key: 'sec_1',
            title: 'Details',
            order: 0,
            fields: [
              { id: 'f_title', key: 'title', label: 'Title', type: 'text', required: true, order: 0 },
              { id: 'f_amt', key: 'amount', label: 'Amount', type: 'currency', order: 1 },
            ],
          },
        ],
      },
      tabs: [],
      rules: [],
      workflow,
      listView: { columns: [] },
      permissions: {
        createRoles: ['super_admin', 'business_admin', 'manager', 'employee'],
        readOwnRoles: ['employee', 'manager', 'business_admin', 'super_admin'],
        readAllRoles: ['business_admin', 'super_admin'],
      },
      settings: {
        referenceNumber: { enabled: true, prefix: 'REQ-', sequenceLength: 4 },
      },
    };

    const form: FormEntity = {
      id: formId,
      organization_id: orgId,
      key: `key_${formId}`,
      title: `Form ${formId}`,
      description: null,
      status: 'active',
      is_public: Boolean(options?.isPublic),
      public_slug: options?.isPublic ? `pub-${formId}` : null,
      created_by: adminA,
      current_draft_version_id: null,
      current_published_version_id: `ver_${formId}_1`,
      archived_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const version: FormVersionEntity = {
      id: `ver_${formId}_1`,
      form_id: formId,
      organization_id: orgId,
      version_number: 1,
      status: 'published',
      schema_version: 1,
      schema_jsonb: schema,
      change_note: 'Publish v1',
      created_by: adminA,
      published_by: adminA,
      published_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
    };

    formRepo.forms.set(formId, form);
    formRepo.versions.set(formId, [version]);
  }

  beforeEach(() => {
    membershipRepo = new MockMembershipRepository();
    membershipRepo.add(requesterA, orgA, 'employee');
    membershipRepo.add(managerA, orgA, 'manager');
    membershipRepo.add(directorA, orgA, 'employee');
    membershipRepo.add(adminA, orgA, 'business_admin');
    membershipRepo.add(managerB, orgB, 'manager');

    formRepo = new MockFormRepository();
    submissionRepo = new MockSubmissionRepository();
    approvalRepo = new MockApprovalRepository(formRepo, submissionRepo);

    submissionService = new SubmissionService(
      formRepo,
      submissionRepo,
      membershipRepo,
      approvalRepo,
    );
    approvalService = new ApprovalService(
      formRepo,
      approvalRepo,
      membershipRepo,
    );
  });

  it('starts workflow on authenticated submit and completes sequential multi-stage approval', async () => {
    const multiStageWf: FlowWorkflowDefinition = {
      id: 'wf_multi',
      name: 'Two-Stage Approval',
      enabled: true,
      triggers: [
        { id: 'tr_1', type: 'on_submit', enabled: true, conditionLogic: 'AND', conditions: [] },
      ],
      steps: [
        { id: 'start', key: 'start', name: 'Start', type: 'start' },
        {
          id: 'stage_1',
          key: 'mgr_review',
          name: 'Manager Review',
          type: 'approval',
          mode: 'single',
          assignees: [{ type: 'role', value: 'manager' }],
        },
        {
          id: 'cond_amt',
          key: 'cond_amt',
          name: 'Amount Check',
          type: 'condition',
          branches: [
            {
              id: 'br_high',
              label: 'High Value',
              conditionLogic: 'AND',
              conditions: [{ id: 'c1', fieldId: 'amount', operator: 'greaterThan', value: 1000 }],
              targetStepId: 'stage_2',
            },
          ],
          defaultTargetStepId: 'end_approved',
        },
        {
          id: 'stage_2',
          key: 'dir_review',
          name: 'Director Sign-Off',
          type: 'approval',
          mode: 'single',
          assignees: [{ type: 'user', value: directorA }],
          requireCommentOnApprove: true,
        },
        { id: 'end_approved', key: 'end_ok', name: 'Approved', type: 'end', outcome: 'approved', finalStatus: 'approved' },
        { id: 'end_rejected', key: 'end_rej', name: 'Rejected', type: 'end', outcome: 'rejected', finalStatus: 'rejected' },
      ],
      transitions: [
        { id: 't1', fromStepId: 'start', toStepId: 'stage_1', outcome: 'default' },
        { id: 't2', fromStepId: 'stage_1', toStepId: 'cond_amt', outcome: 'approved' },
        { id: 't3', fromStepId: 'stage_1', toStepId: 'end_rejected', outcome: 'rejected' },
        { id: 't4', fromStepId: 'stage_2', toStepId: 'end_approved', outcome: 'approved' },
        { id: 't5', fromStepId: 'stage_2', toStepId: 'end_rejected', outcome: 'rejected' },
      ],
    };

    seedForm('form_pr', orgA, multiStageWf);

    const submitRes = await submissionService.submitAuthenticatedForm({
      userId: requesterA,
      organizationId: orgA,
      formId: 'form_pr',
      payload: { fields: { title: 'Laptop Purchase', amount: 2500 } },
    });

    expect(submitRes.approvalStarted).toBe(true);
    expect(submitRes.submission.status).toBe('pending_approval');

    // Manager A sees pending task; Director A & Employee A do not yet
    const mgrTasks = await approvalService.listMyPendingApprovals({
      userId: managerA,
      organizationId: orgA,
    });
    expect(mgrTasks).toHaveLength(1);
    expect(mgrTasks[0].stage.stage_name).toBe('Manager Review');

    const dirTasksBefore = await approvalService.listMyPendingApprovals({
      userId: directorA,
      organizationId: orgA,
    });
    expect(dirTasksBefore).toHaveLength(0);

    // Assigned manager can read submission detail even without global readAllRoles
    const detailAsMgr = await submissionService.getAuthenticatedSubmissionDetail({
      userId: managerA,
      organizationId: orgA,
      submissionId: submitRes.submission.id,
    });
    expect(detailAsMgr.approval?.canCurrentUserDecide).toBe(true);
    expect(detailAsMgr.approval?.activeStage?.id).toBe(mgrTasks[0].stage.id);

    // Manager approves Stage 1 -> advances through condition to Director Sign-Off
    const dec1 = await approvalService.decideStage({
      userId: managerA,
      organizationId: orgA,
      stageInstanceId: mgrTasks[0].stage.id,
      decision: 'approved',
      comment: 'Looks good to me.',
    });
    expect(dec1.submissionStatus).toBe('pending_approval');
    expect(dec1.nextStageInstanceId).toBeTruthy();

    // Director A now has pending task
    const dirTasksAfter = await approvalService.listMyPendingApprovals({
      userId: directorA,
      organizationId: orgA,
    });
    expect(dirTasksAfter).toHaveLength(1);
    expect(dirTasksAfter[0].stage.stage_name).toBe('Director Sign-Off');

    // Stage 2 requires comment on approve
    await expect(
      approvalService.decideStage({
        userId: directorA,
        organizationId: orgA,
        stageInstanceId: dirTasksAfter[0].stage.id,
        decision: 'approved',
        comment: '   ',
      }),
    ).rejects.toThrow('COMMENT_REQUIRED');

    // Director approves with comment -> submission becomes approved
    const dec2 = await approvalService.decideStage({
      userId: directorA,
      organizationId: orgA,
      stageInstanceId: dirTasksAfter[0].stage.id,
      decision: 'approved',
      comment: 'Final budget approved.',
    });
    expect(dec2.submissionStatus).toBe('approved');
    expect(dec2.instanceStatus).toBe('approved');
    expect(dec2.nextStageInstanceId).toBeNull();

    // History preserves both stages and both append-only decisions
    const detailAfter = await submissionService.getAuthenticatedSubmissionDetail({
      userId: requesterA,
      organizationId: orgA,
      submissionId: submitRes.submission.id,
    });
    expect(detailAfter.approval?.stages).toHaveLength(2);
    expect(detailAfter.approval?.decisions).toHaveLength(2);
    expect(detailAfter.approval?.canCurrentUserDecide).toBe(false);
  });

  it('starts workflow on public form submission and supports rejection with required comment', async () => {
    seedForm('form_pub', orgA, createDefaultFlowWorkflow('Visitor Request'), {
      isPublic: true,
    });

    const pubRes = await submissionService.submitPublicForm('pub-form_pub', {
      fields: { title: 'External Guest', amount: 0 },
    });
    expect(pubRes.status).toBe('pending_approval');

    const mgrTasks = await approvalService.listMyPendingApprovals({
      userId: managerA,
      organizationId: orgA,
    });
    expect(mgrTasks).toHaveLength(1);

    // Default workflow requires comment on reject
    await expect(
      approvalService.decideStage({
        userId: managerA,
        organizationId: orgA,
        stageInstanceId: mgrTasks[0].stage.id,
        decision: 'rejected',
      }),
    ).rejects.toThrow('COMMENT_REQUIRED');

    const rejRes = await approvalService.decideStage({
      userId: managerA,
      organizationId: orgA,
      stageInstanceId: mgrTasks[0].stage.id,
      decision: 'rejected',
      comment: 'Missing host verification.',
    });
    expect(rejRes.submissionStatus).toBe('rejected');
    expect(rejRes.instanceStatus).toBe('rejected');
  });

  it('supports return-for-correction and resubmission creating cycle 2 while keeping cycle 1 history', async () => {
    const wf = createDefaultFlowWorkflow('Expense');
    seedForm('form_ret', orgA, wf);

    const sub = await submissionService.submitAuthenticatedForm({
      userId: requesterA,
      organizationId: orgA,
      formId: 'form_ret',
      payload: { fields: { title: 'Travel Claim', amount: 200 } },
    });

    const tasks1 = await approvalService.listMyPendingApprovals({
      userId: managerA,
      organizationId: orgA,
    });

    const ret = await approvalService.decideStage({
      userId: managerA,
      organizationId: orgA,
      stageInstanceId: tasks1[0].stage.id,
      decision: 'returned',
      comment: 'Please attach hotel breakdown in title.',
    });
    expect(ret.submissionStatus).toBe('returned');

    // Another user cannot resubmit requester's returned submission
    await expect(
      submissionService.resubmitSubmission({
        userId: managerA,
        organizationId: orgA,
        submissionId: sub.submission.id,
        payload: { fields: { title: 'Tampered', amount: 200 } },
      }),
    ).rejects.toThrow('Unauthorized:');

    // Requester edits & resubmits -> starts cycle 2
    const resub = await submissionService.resubmitSubmission({
      userId: requesterA,
      organizationId: orgA,
      submissionId: sub.submission.id,
      payload: { fields: { title: 'Travel Claim (Hotel Itemized)', amount: 200 } },
    });
    expect(resub.submission.status).toBe('pending_approval');
    expect(resub.approvalStarted).toBe(true);

    const tasks2 = await approvalService.listMyPendingApprovals({
      userId: managerA,
      organizationId: orgA,
    });
    expect(tasks2).toHaveLength(1);
    expect(tasks2[0].instance.cycle_number).toBe(2);

    await approvalService.decideStage({
      userId: managerA,
      organizationId: orgA,
      stageInstanceId: tasks2[0].stage.id,
      decision: 'approved',
      comment: 'Approved on cycle 2.',
    });

    const finalDetail = await submissionService.getAuthenticatedSubmissionDetail({
      userId: requesterA,
      organizationId: orgA,
      submissionId: sub.submission.id,
    });
    expect(finalDetail.submission.status).toBe('approved');
    expect(finalDetail.approval?.instances).toHaveLength(2);
    expect(finalDetail.approval?.decisions).toHaveLength(2);
  });

  it('enforces actor authorization, idempotency, and strict cross-tenant isolation', async () => {
    seedForm('form_sec', orgA, createDefaultFlowWorkflow('Security Check'));

    const sub = await submissionService.submitAuthenticatedForm({
      userId: requesterA,
      organizationId: orgA,
      formId: 'form_sec',
      payload: { fields: { title: 'Access Request', amount: 10 } },
    });

    const mgrTasks = await approvalService.listMyPendingApprovals({
      userId: managerA,
      organizationId: orgA,
    });
    const stageId = mgrTasks[0].stage.id;

    // 1. Unauthorized employee in same org cannot approve manager stage
    await expect(
      approvalService.decideStage({
        userId: requesterA,
        organizationId: orgA,
        stageInstanceId: stageId,
        decision: 'approved',
      }),
    ).rejects.toThrow('Unauthorized:');

    // 2. Cross-tenant manager in Org B cannot access or decide Org A stage
    await expect(
      approvalService.decideStage({
        userId: managerB,
        organizationId: orgB,
        stageInstanceId: stageId,
        decision: 'approved',
      }),
    ).rejects.toThrow('not found');

    const orgBTasks = await approvalService.listMyPendingApprovals({
      userId: managerB,
      organizationId: orgB,
    });
    expect(orgBTasks).toHaveLength(0);

    // 3. First approval succeeds; second concurrent/duplicate decision fails idempotently
    await approvalService.decideStage({
      userId: managerA,
      organizationId: orgA,
      stageInstanceId: stageId,
      decision: 'approved',
    });

    await expect(
      approvalService.decideStage({
        userId: managerA,
        organizationId: orgA,
        stageInstanceId: stageId,
        decision: 'approved',
      }),
    ).rejects.toThrow('APPROVAL_STAGE_ALREADY_DECIDED');

    // Cannot resubmit an already approved submission
    await expect(
      submissionService.resubmitSubmission({
        userId: requesterA,
        organizationId: orgA,
        submissionId: sub.submission.id,
        payload: { fields: { title: 'Changed' } },
      }),
    ).rejects.toThrow('SUBMISSION_NOT_RETURNED');
  });
});
