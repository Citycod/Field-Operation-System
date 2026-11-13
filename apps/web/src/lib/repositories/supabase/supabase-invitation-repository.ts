import { InvitationRepository } from '../invitation-repository';
import {
  OrganizationInvitation,
  InvitationPreview,
  CreateInvitationInput,
  AcceptInvitationResult,
} from '@field/types';
import { createClient } from '@/lib/supabase/client';
import type { Database } from '@field/types';
import type { SupabaseClient } from '@supabase/supabase-js';

export class SupabaseInvitationRepository implements InvitationRepository {
  constructor(private readonly injectedClient?: SupabaseClient<Database>) {}

  private client(): SupabaseClient<Database> {
    return this.injectedClient ?? createClient();
  }

  async createInvitation(
    organizationId: string,
    input: CreateInvitationInput,
    tokenHash: string,
  ): Promise<OrganizationInvitation> {
    const supabase = this.client();
    const { data, error } = await supabase.rpc('create_organization_invitation', {
      p_organization_id: organizationId,
      p_email: input.email,
      p_role: input.role,
      p_token_hash: tokenHash,
      p_expires_at: input.expires_at ?? null,
    });

    if (error) {
      throw error;
    }

    return data as unknown as OrganizationInvitation;
  }

  async listInvitations(organizationId: string): Promise<OrganizationInvitation[]> {
    const supabase = this.client();
    const { data, error } = await supabase.rpc('list_organization_invitations', {
      p_organization_id: organizationId,
    });

    if (error) {
      throw error;
    }

    const rows = (data ?? []) as Array<{
      id: string;
      organization_id: string;
      email: string;
      role: string;
      status: string;
      invited_by: string;
      expires_at: string;
      accepted_at: string | null;
      revoked_at: string | null;
      created_at: string;
      updated_at: string;
    }>;

    return rows.map((row) => ({
      id: row.id,
      organization_id: row.organization_id,
      email: row.email,
      role: row.role as 'manager' | 'employee',
      status: row.status as 'pending' | 'accepted' | 'revoked' | 'expired',
      invited_by: row.invited_by,
      expires_at: row.expires_at,
      accepted_at: row.accepted_at,
      revoked_at: row.revoked_at,
      created_at: row.created_at,
      updated_at: row.updated_at,
    }));
  }

  async revokeInvitation(organizationId: string, invitationId: string): Promise<void> {
    const supabase = this.client();
    const { error } = await supabase.rpc('revoke_organization_invitation', {
      p_invitation_id: invitationId,
      p_organization_id: organizationId,
    });

    if (error) {
      throw error;
    }
  }

  async resendInvitation(
    organizationId: string,
    invitationId: string,
    newTokenHash: string,
    newExpiresAt?: string,
  ): Promise<void> {
    const supabase = this.client();
    const { error } = await supabase.rpc('resend_organization_invitation', {
      p_invitation_id: invitationId,
      p_organization_id: organizationId,
      p_new_token_hash: newTokenHash,
      p_new_expires_at: newExpiresAt ?? null,
    });

    if (error) {
      throw error;
    }
  }

  async getPreview(tokenHash: string): Promise<InvitationPreview> {
    const supabase = this.client();
    const { data, error } = await supabase.rpc('get_invitation_preview', {
      p_token_hash: tokenHash,
    });

    if (error) {
      throw error;
    }

    return data as unknown as InvitationPreview;
  }

  async acceptInvitation(tokenHash: string): Promise<AcceptInvitationResult> {
    const supabase = this.client();
    const { data, error } = await supabase.rpc('accept_organization_invitation', {
      p_token_hash: tokenHash,
    });

    if (error) {
      throw error;
    }

    return data as unknown as AcceptInvitationResult;
  }
}

