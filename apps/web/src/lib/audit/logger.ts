import { AuditLogEvent } from '@field/types';

export function logAuditEvent(event: Omit<AuditLogEvent, 'id' | 'timestamp'>) {
  const auditEntry: AuditLogEvent = {
    ...event,
    id: `audit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    timestamp: new Date().toISOString(),
  };

  // Structured dev logger for audit events
  console.log('[AUDIT_EVENT]', JSON.stringify(auditEntry));
  return auditEntry;
}
