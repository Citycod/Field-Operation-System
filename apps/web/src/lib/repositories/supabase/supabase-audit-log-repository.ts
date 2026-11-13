import { AuditLogRepository, AuditLogQueryOptions } from '../audit-log-repository';
import { AuditLogEntry } from '@field/types';
import { createClient } from '@/lib/supabase/client';
import type { Database, Json } from '@field/types';
import type { SupabaseClient } from '@supabase/supabase-js';

export class SupabaseAuditLogRepository implements AuditLogRepository {
  constructor(private readonly injectedClient?: SupabaseClient<Database>) {}

  private client(): SupabaseClient<Database> {
    return this.injectedClient ?? createClient();
  }

  async listByOrganization(
    organizationId: string,
    options?: AuditLogQueryOptions,
  ): Promise<AuditLogEntry[]> {
    const supabase = this.client();
    const limit = options?.limit ?? 50;
    const offset = options?.offset ?? 0;

    const { data, error } = await supabase
      .from('audit_logs')
      .select('*')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      throw new Error(`Failed to load audit logs: ${error.message}`);
    }

    if (!data) return [];

    return (data as Array<{
      id: string;
      organization_id: string | null;
      actor_id: string | null;
      actor_email: string;
      actor_role: string;
      actor_display_name: string | null;
      event_type: string;
      entity_type: string;
      entity_id: string;
      action: string;
      metadata: Json;
      ip_address: string | null;
      user_agent: string | null;
      created_at: string;
    }>).map((row) => ({
      id: row.id,
      organization_id: row.organization_id,
      actor_id: row.actor_id,
      actor_email: row.actor_email,
      actor_role: row.actor_role,
      actor_display_name: row.actor_display_name,
      event_type: row.event_type,
      entity_type: row.entity_type,
      entity_id: row.entity_id,
      action: row.action,
      metadata: (row.metadata ?? {}) as Record<string, unknown>,
      ip_address: row.ip_address,
      user_agent: row.user_agent,
      created_at: row.created_at,
    }));
  }
}

