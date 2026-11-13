import { AuditLogEntry } from '@field/types';

export interface AuditLogQueryOptions {
  limit?: number;
  offset?: number;
}

export interface AuditLogRepository {
  /**
   * Retrieves chronological audit logs for an organization.
   * RLS limits access to active organization administrators.
   */
  listByOrganization(
    organizationId: string,
    options?: AuditLogQueryOptions,
  ): Promise<AuditLogEntry[]>;
}

