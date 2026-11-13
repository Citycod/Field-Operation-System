import { beforeEach, describe, expect, it } from 'vitest';
import {
  OrganizationInvitationService,
  InvalidInvitationRoleError,
  InvalidInvitationInputError,
  UnauthorizedInvitationAccessError,
  hashInvitationToken,
} from '../organization-invitation-service';
import type { InvitationRepository } from '../../repositories/invitation-repository';
import type { MembershipRepository } from '../../repositories/membership-repository';
import type {
  OrganizationInvitation,
  InvitationPreview,
  CreateInvitationInput,
  AcceptInvitationResult,
  OrganizationMembership,
} from '@field/types';

class MockInvitationRepository implements InvitationRepository {
  public invitations: OrganizationInvitation[] = [];

  async createInvitation(
    organizationId: string,
    input: CreateInvitationInput,
    tokenHash: string,
  ): Promise<OrganizationInvitation> {
    const now = new Date().toISOString();
    const invitation: OrganizationInvitation = {
      id: `inv_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      organization_id: organizationId,
      email: input.email,
      role: input.role,
      status: 'pending',
      invited_by: 'admin-user-1',
      expires_at: input.expires_at || new Date(Date.now() + 7 * 86400000).toISOString(),
      created_at: now,
      updated_at: now,
    };
    this.invitations.push(invitation);
    return invitation;
  }

  async listInvitations(organizationId: string): Promise<OrganizationInvitation[]> {
    return this.invitations.filter((i) => i.organization_id === organizationId);
  }

  async revokeInvitation(organizationId: string, invitationId: string): Promise<void> {
    const inv = this.invitations.find((i) => i.id === invitationId && i.organization_id === organizationId);
    if (!inv) throw new Error('Invitation not found');
    inv.status = 'revoked';
  }

  async resendInvitation(
    organizationId: string,
    invitationId: string,
    newTokenHash: string,
    newExpiresAt?: string,
  ): Promise<void> {
    const inv = this.invitations.find((i) => i.id === invitationId && i.organization_id === organizationId);
    if (!inv) throw new Error('Invitation not found');
    inv.status = 'pending';
    if (newExpiresAt) inv.expires_at = newExpiresAt;
  }

  async getPreview(tokenHash: string): Promise<InvitationPreview> {
    const inv = this.invitations[0];
    if (!inv || inv.status !== 'pending') throw new Error('INVITATION_UNAVAILABLE');
    return {
      organization_id: inv.organization_id,
      organization_name: 'Acme Corp',
      email: inv.email,
      role: inv.role,
      expires_at: inv.expires_at,
    };
  }

  async acceptInvitation(tokenHash: string): Promise<AcceptInvitationResult> {
    const inv = this.invitations[0];
    if (!inv || inv.status !== 'pending') throw new Error('INVITATION_INVALID');
    inv.status = 'accepted';
    return {
      organization_id: inv.organization_id,
      membership_id: 'mem_new_123',
      role_key: inv.role,
      status: 'active',
    };
  }
}

class MockMembershipRepository implements MembershipRepository {
  public memberships: OrganizationMembership[] = [];

  async findByUserId(userId: string): Promise<OrganizationMembership[]> {
    return this.memberships.filter((m) => m.user_id === userId && m.status === 'active');
  }

  async findUserMembershipInOrg(
    userId: string,
    organizationId: string,
  ): Promise<OrganizationMembership | null> {
    return (
      this.memberships.find(
        (m) =>
          m.user_id === userId &&
          m.organization_id === organizationId &&
          m.status === 'active',
      ) || null
    );
  }

  async getRoster(): Promise<any> {
    return [];
  }

  async manageMembership(): Promise<any> {
    return { success: true };
  }
}

describe('OrganizationInvitationService', () => {
  let inviteRepo: MockInvitationRepository;
  let memRepo: MockMembershipRepository;
  let service: OrganizationInvitationService;

  const ORG_ID = 'org-stage4-test';
  const ADMIN_ID = 'admin-user-1';
  const EMPLOYEE_ID = 'employee-user-1';

  beforeEach(() => {
    inviteRepo = new MockInvitationRepository();
    memRepo = new MockMembershipRepository();
    service = new OrganizationInvitationService(inviteRepo, memRepo, 'http://localhost:3000');

    // Setup Admin membership
    memRepo.memberships.push({
      id: 'mem-admin',
      organization_id: ORG_ID,
      user_id: ADMIN_ID,
      role_key: 'business_admin',
      status: 'active',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    // Setup Employee membership
    memRepo.memberships.push({
      id: 'mem-employee',
      organization_id: ORG_ID,
      user_id: EMPLOYEE_ID,
      role_key: 'employee',
      status: 'active',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  });

  describe('createInvitation', () => {
    it('creates manager invitation successfully and returns url with hash fragment', async () => {
      const result = await service.createInvitation(ADMIN_ID, ORG_ID, {
        email: 'manager@example.com',
        role: 'manager',
      });

      expect(result.invitation.email).toBe('manager@example.com');
      expect(result.invitation.role).toBe('manager');
      expect(result.invitation.status).toBe('pending');
      expect(result.rawToken).toHaveLength(64);
      expect(result.inviteUrl).toContain('#token=');
      expect(result.inviteUrl).toContain(result.rawToken);
    });

    it('creates employee invitation successfully', async () => {
      const result = await service.createInvitation(ADMIN_ID, ORG_ID, {
        email: 'employee@example.com',
        role: 'employee',
      });

      expect(result.invitation.email).toBe('employee@example.com');
      expect(result.invitation.role).toBe('employee');
    });

    it('strictly rejects role escalation for business_admin', async () => {
      await expect(
        service.createInvitation(ADMIN_ID, ORG_ID, {
          email: 'admin_attempt@example.com',
          role: 'business_admin' as any,
        }),
      ).rejects.toThrowError(InvalidInvitationRoleError);
    });

    it('strictly rejects role escalation for super_admin', async () => {
      await expect(
        service.createInvitation(ADMIN_ID, ORG_ID, {
          email: 'super_attempt@example.com',
          role: 'super_admin' as any,
        }),
      ).rejects.toThrowError(InvalidInvitationRoleError);
    });

    it('rejects invitation creation by non-admin member', async () => {
      await expect(
        service.createInvitation(EMPLOYEE_ID, ORG_ID, {
          email: 'peer@example.com',
          role: 'employee',
        }),
      ).rejects.toThrowError(UnauthorizedInvitationAccessError);
    });

    it('validates email format', async () => {
      await expect(
        service.createInvitation(ADMIN_ID, ORG_ID, {
          email: 'not-an-email',
          role: 'employee',
        }),
      ).rejects.toThrowError(InvalidInvitationInputError);
    });
  });

  describe('listInvitations', () => {
    it('lists organization invitations for administrator', async () => {
      await service.createInvitation(ADMIN_ID, ORG_ID, {
        email: 'person1@example.com',
        role: 'employee',
      });
      await service.createInvitation(ADMIN_ID, ORG_ID, {
        email: 'person2@example.com',
        role: 'manager',
      });

      const list = await service.listInvitations(ADMIN_ID, ORG_ID);
      expect(list).toHaveLength(2);
      expect(list.map((i) => i.email)).toEqual(['person1@example.com', 'person2@example.com']);
    });

    it('denies invitation listing to non-admin', async () => {
      await expect(
        service.listInvitations(EMPLOYEE_ID, ORG_ID),
      ).rejects.toThrowError(UnauthorizedInvitationAccessError);
    });
  });

  describe('revokeInvitation', () => {
    it('allows administrator to revoke pending invitation', async () => {
      const { invitation } = await service.createInvitation(ADMIN_ID, ORG_ID, {
        email: 'to_revoke@example.com',
        role: 'employee',
      });

      await service.revokeInvitation(ADMIN_ID, ORG_ID, invitation.id);
      expect(inviteRepo.invitations[0].status).toBe('revoked');
    });
  });

  describe('resendInvitation', () => {
    it('allows administrator to resend invitation and returns new token url', async () => {
      const { invitation, rawToken: oldToken } = await service.createInvitation(ADMIN_ID, ORG_ID, {
        email: 'to_resend@example.com',
        role: 'employee',
      });

      const resendResult = await service.resendInvitation(ADMIN_ID, ORG_ID, invitation.id);
      expect(resendResult.rawToken).toBeDefined();
      expect(resendResult.rawToken).not.toBe(oldToken);
      expect(resendResult.inviteUrl).toContain('#token=');
    });
  });

  describe('getPreview & acceptInvitation', () => {
    it('previews invitation using raw token', async () => {
      const { rawToken } = await service.createInvitation(ADMIN_ID, ORG_ID, {
        email: 'invitee@example.com',
        role: 'employee',
      });

      const preview = await service.getPreview(rawToken);
      expect(preview.organization_name).toBe('Acme Corp');
      expect(preview.email).toBe('invitee@example.com');
      expect(preview.role).toBe('employee');
    });

    it('accepts invitation for signed in user', async () => {
      const { rawToken } = await service.createInvitation(ADMIN_ID, ORG_ID, {
        email: 'invitee@example.com',
        role: 'manager',
      });

      const result = await service.acceptInvitation('new-user-456', rawToken);
      expect(result.organization_id).toBe(ORG_ID);
      expect(result.role_key).toBe('manager');
      expect(result.status).toBe('active');
    });
  });
});

