import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@field/types';
import { createClient } from '@/lib/supabase/client';
import type { FormSubmissionEntity } from '../submission-repository';
import {
  ApprovalDecisionEntity,
  ApprovalInstanceEntity,
  ApprovalRepository,
  ApprovalStageContext,
  ApprovalStageInstanceEntity,
  DecideApprovalStageParams,
  DecideApprovalStageResult,
  PendingApprovalTask,
  SubmissionApprovalHistory,
} from '../approval-repository';

export class SupabaseApprovalRepository implements ApprovalRepository {
  constructor(private readonly injectedClient?: SupabaseClient<Database>) {}

  private client(): SupabaseClient<Database> {
    return this.injectedClient ?? createClient();
  }

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
    const supabase = this.client();
    const now = new Date().toISOString();

    const { data: instanceData, error: instError } = await (supabase as any)
      .from('approval_instances')
      .insert({
        organization_id: params.organizationId,
        submission_id: params.submissionId,
        form_version_id: params.formVersionId,
        workflow_id: params.workflowId,
        status: 'active',
        current_stage_order: 0,
        current_step_id: params.firstStage.stepId,
        cycle_number: params.cycleNumber,
        started_at: now,
        created_at: now,
      })
      .select('*')
      .single();

    if (instError || !instanceData) {
      throw new Error(
        `Failed to create approval instance: ${instError?.message || 'Unknown error'}`,
      );
    }

    const { data: stageData, error: stageError } = await (supabase as any)
      .from('approval_stage_instances')
      .insert({
        organization_id: params.organizationId,
        approval_instance_id: instanceData.id,
        stage_definition_id: params.firstStage.stepId,
        stage_order: 0,
        assignee_index: params.firstStage.assigneeIndex,
        stage_name: params.firstStage.stageName,
        status: 'active',
        assigned_approver_id: params.firstStage.assignedApproverId,
        assigned_role_key: params.firstStage.assignedRoleKey,
        started_at: now,
        created_at: now,
      })
      .select('*')
      .single();

    if (stageError || !stageData) {
      throw new Error(
        `Failed to create initial approval stage: ${stageError?.message || 'Unknown error'}`,
      );
    }

    return {
      instance: instanceData as ApprovalInstanceEntity,
      stage: stageData as ApprovalStageInstanceEntity,
    };
  }

  async getSubmissionApprovalHistory(
    submissionId: string,
    organizationId: string,
  ): Promise<SubmissionApprovalHistory> {
    const supabase = this.client();

    const { data: instances, error: instErr } = await (supabase as any)
      .from('approval_instances')
      .select('*')
      .eq('submission_id', submissionId)
      .eq('organization_id', organizationId)
      .order('cycle_number', { ascending: true });

    if (instErr) {
      throw new Error(`Failed to load approval instances: ${instErr.message}`);
    }

    const instanceList = (instances as ApprovalInstanceEntity[]) ?? [];
    if (instanceList.length === 0) {
      return { instances: [], stages: [], decisions: [] };
    }

    const instanceIds = instanceList.map((i) => i.id);
    const { data: stages, error: stageErr } = await (supabase as any)
      .from('approval_stage_instances')
      .select('*')
      .eq('organization_id', organizationId)
      .in('approval_instance_id', instanceIds)
      .order('stage_order', { ascending: true });

    if (stageErr) {
      throw new Error(`Failed to load approval stage instances: ${stageErr.message}`);
    }

    const stageList = (stages as ApprovalStageInstanceEntity[]) ?? [];
    if (stageList.length === 0) {
      return { instances: instanceList, stages: [], decisions: [] };
    }

    const stageIds = stageList.map((s) => s.id);
    const { data: decisions, error: decErr } = await (supabase as any)
      .from('approval_decisions')
      .select('*')
      .eq('organization_id', organizationId)
      .in('stage_instance_id', stageIds)
      .order('created_at', { ascending: true });

    if (decErr) {
      throw new Error(`Failed to load approval decisions: ${decErr.message}`);
    }

    return {
      instances: instanceList,
      stages: stageList,
      decisions: (decisions as ApprovalDecisionEntity[]) ?? [],
    };
  }

  async getStageInstanceContext(
    stageInstanceId: string,
    organizationId: string,
  ): Promise<ApprovalStageContext | null> {
    const supabase = this.client();

    const { data: stageData, error: stageErr } = await (supabase as any)
      .from('approval_stage_instances')
      .select('*')
      .eq('id', stageInstanceId)
      .eq('organization_id', organizationId)
      .maybeSingle();

    if (stageErr) {
      throw new Error(`Failed to load approval stage: ${stageErr.message}`);
    }
    if (!stageData) return null;

    const stage = stageData as ApprovalStageInstanceEntity;

    const { data: instData, error: instErr } = await (supabase as any)
      .from('approval_instances')
      .select('*')
      .eq('id', stage.approval_instance_id)
      .eq('organization_id', organizationId)
      .maybeSingle();

    if (instErr) {
      throw new Error(`Failed to load approval instance: ${instErr.message}`);
    }
    if (!instData) return null;

    const instance = instData as ApprovalInstanceEntity;

    const { data: subData, error: subErr } = await (supabase as any)
      .from('form_submissions')
      .select('*')
      .eq('id', instance.submission_id)
      .eq('organization_id', organizationId)
      .maybeSingle();

    if (subErr) {
      throw new Error(`Failed to load submission for approval stage: ${subErr.message}`);
    }
    if (!subData) return null;

    return {
      stage,
      instance,
      submission: subData as FormSubmissionEntity,
    };
  }

  async listPendingTasksForUser(params: {
    organizationId: string;
    userId: string;
    roleKey: string;
  }): Promise<PendingApprovalTask[]> {
    const supabase = this.client();
    const safeUserId = params.userId.replace(/[^a-zA-Z0-9_-]/g, '');
    const safeRoleKey = params.roleKey.replace(/[^a-zA-Z0-9_-]/g, '');

    if (!safeUserId) return [];

    const assigneeFilter = safeRoleKey
      ? `assigned_approver_id.eq.${safeUserId},and(assigned_approver_id.is.null,assigned_role_key.eq.${safeRoleKey})`
      : `assigned_approver_id.eq.${safeUserId}`;

    const { data: stages, error: stageErr } = await (supabase as any)
      .from('approval_stage_instances')
      .select('*')
      .eq('organization_id', params.organizationId)
      .eq('status', 'active')
      .or(assigneeFilter)
      .order('created_at', { ascending: false })
      .limit(100);

    if (stageErr) {
      throw new Error(`Failed to list pending approval tasks: ${stageErr.message}`);
    }

    const stageList = (stages as ApprovalStageInstanceEntity[]) ?? [];
    if (stageList.length === 0) return [];

    const instanceIds = Array.from(new Set(stageList.map((s) => s.approval_instance_id)));
    const { data: instances, error: instErr } = await (supabase as any)
      .from('approval_instances')
      .select('*')
      .eq('organization_id', params.organizationId)
      .eq('status', 'active')
      .in('id', instanceIds);

    if (instErr) {
      throw new Error(`Failed to load approval instances for tasks: ${instErr.message}`);
    }

    const instanceMap = new Map<string, ApprovalInstanceEntity>();
    for (const inst of (instances as ApprovalInstanceEntity[]) ?? []) {
      instanceMap.set(inst.id, inst);
    }

    const submissionIds = Array.from(new Set(Array.from(instanceMap.values()).map((i) => i.submission_id)));
    if (submissionIds.length === 0) return [];

    const { data: submissions, error: subErr } = await (supabase as any)
      .from('form_submissions')
      .select('id, form_id, form_version_id, reference_number, status, submitted_by, submitted_at, created_at')
      .eq('organization_id', params.organizationId)
      .in('id', submissionIds);

    if (subErr) {
      throw new Error(`Failed to load submissions for approval tasks: ${subErr.message}`);
    }

    const subMap = new Map<string, PendingApprovalTask['submission']>();
    const formIds = new Set<string>();
    for (const sub of (submissions as PendingApprovalTask['submission'][]) ?? []) {
      subMap.set(sub.id, sub);
      formIds.add(sub.form_id);
    }

    const formMap = new Map<string, { title: string; key: string }>();
    if (formIds.size > 0) {
      const { data: forms, error: formErr } = await (supabase as any)
        .from('forms')
        .select('id, title, key')
        .eq('organization_id', params.organizationId)
        .in('id', Array.from(formIds));

      if (formErr) {
        throw new Error(`Failed to load forms for approval tasks: ${formErr.message}`);
      }
      for (const f of (forms as Array<{ id: string; title: string; key: string }>) ?? []) {
        formMap.set(f.id, { title: f.title, key: f.key });
      }
    }

    const tasks: PendingApprovalTask[] = [];
    for (const stage of stageList) {
      const instance = instanceMap.get(stage.approval_instance_id);
      if (!instance) continue;
      const submission = subMap.get(instance.submission_id);
      if (!submission) continue;
      const formMeta = formMap.get(submission.form_id);

      tasks.push({
        stage,
        instance,
        submission,
        formTitle: formMeta?.title ?? 'Untitled Form',
        formKey: formMeta?.key ?? submission.form_id,
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
    return history.stages.some((stage) => {
      if (stage.assigned_approver_id) {
        return stage.assigned_approver_id === params.userId;
      }
      return Boolean(stage.assigned_role_key && stage.assigned_role_key === params.roleKey);
    });
  }

  async decideApprovalStage(
    params: DecideApprovalStageParams,
  ): Promise<DecideApprovalStageResult> {
    const supabase = this.client();

    const { data, error } = await (supabase as any).rpc('decide_approval_stage', {
      p_organization_id: params.organizationId,
      p_stage_instance_id: params.stageInstanceId,
      p_decision: params.decision,
      p_comment: params.comment ?? null,
      p_next_step_id: params.nextStage?.stepId ?? null,
      p_next_stage_name: params.nextStage?.stageName ?? null,
      p_next_assignee_index: params.nextStage?.assigneeIndex ?? 0,
      p_next_assigned_approver_id: params.nextStage?.assignedApproverId ?? null,
      p_next_assigned_role_key: params.nextStage?.assignedRoleKey ?? null,
      p_terminal_submission_status: params.terminalSubmissionStatus ?? null,
      p_updated_fields_jsonb: params.updatedFields ?? null,
    });

    if (error || !data) {
      throw new Error(error?.message || 'Failed to process approval decision.');
    }

    const row = data as {
      decision_id: string;
      stage_instance_id: string;
      approval_instance_id: string;
      submission_id: string;
      submission_status: string;
      instance_status: string;
      next_stage_instance_id: string | null;
    };

    return {
      decisionId: row.decision_id,
      stageInstanceId: row.stage_instance_id,
      approvalInstanceId: row.approval_instance_id,
      submissionId: row.submission_id,
      submissionStatus: row.submission_status,
      instanceStatus: row.instance_status,
      nextStageInstanceId: row.next_stage_instance_id,
    };
  }
}
