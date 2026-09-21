export type AuditEventType =
  | 'form_created'
  | 'form_published'
  | 'submission_submitted'
  | 'approval_approved'
  | 'approval_rejected'
  | 'file_deleted'
  | 'user_login';

export interface AuditLogEvent {
  id: string;
  organization_id: string;
  user_id: string;
  event_type: AuditEventType;
  resource_type: string;
  resource_id: string;
  metadata?: Record<string, unknown>;
  ip_address?: string;
  timestamp: string;
}
