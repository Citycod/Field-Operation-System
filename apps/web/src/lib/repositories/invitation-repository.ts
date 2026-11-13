import {
  OrganizationInvitation,
  InvitationPreview,
  CreateInvitationInput,
  AcceptInvitationResult,
} from '@field/types';

export interface InvitationRepository {
  /**
   * Creates an invitation row via create_organization_invitation RPC.
   * Note: tokenHash must be pre-hashed SHA-256 hex string.
   */
  createInvitation(
    organizationId: string,
    input: CreateInvitationInput,
    tokenHash: string,
  ): Promise<OrganizationInvitation>;

  /**
   * Lists invitations for an organization via list_organization_invitations RPC.
   * Note: token_hash is never exposed.
   */
  listInvitations(organizationId: string): Promise<OrganizationInvitation[]>;

  /**
   * Revokes a pending invitation via revoke_organization_invitation RPC.
   */
  revokeInvitation(organizationId: string, invitationId: string): Promise<void>;

  /**
   * Resends an invitation with a new token hash via resend_organization_invitation RPC.
   */
  resendInvitation(
    organizationId: string,
    invitationId: string,
    newTokenHash: string,
    newExpiresAt?: string,
  ): Promise<void>;

  /**
   * Fetches preview details for an invitation via get_invitation_preview RPC.
   */
  getPreview(tokenHash: string): Promise<InvitationPreview>;

  /**
   * Accepts an invitation via accept_organization_invitation RPC.
   */
  acceptInvitation(tokenHash: string): Promise<AcceptInvitationResult>;
}

