export type ApproverType = 'user' | 'role' | 'departmentRole' | 'managerOfRequester';

export interface WorkflowStageDefinition {
  id: string;
  key: string;
  name: string;
  order: number;
  approverType: ApproverType;
  approverValue?: string;
  requireCommentOnApprove?: boolean;
  requireCommentOnReject?: boolean;
  requireCommentOnReturn?: boolean;
}

export interface WorkflowDefinition {
  type: 'sequential';
  stages: WorkflowStageDefinition[];
}
