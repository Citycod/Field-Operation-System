import { createHash, randomBytes } from 'node:crypto';
import type {
  OrganizationInvitation,
  InvitationPreview,
  CreateInvitationInput,
  AcceptInvitationResult,
  PlatformRole,
} from '@field/types';
import type { InvitationRepository } from '../repositories/invitation-repository';
import type { MembershipRepository } from '../repositories/membership-repository';

export class InvalidInvitationRoleError extends Error {
  readonly code = 'INVALID_INVITATION_ROLE';
  constructor(role: string) {
    super(`Role "${role}" is not permitted for team invitations. Only "manager" and "employee" invitations are allowed.`);
    this.name = 'InvalidInvitationRoleError';
  }
}

export class InvalidInvitationInputError extends Error {
  readonly code = 'INVALID_INPUT';
  constructor(message: string) {
    super(message);
    this.name = 'InvalidInvitationInputError';
  }
}

export class UnauthorizedInvitationAccessError extends Error {
  readonly code = 'UNAUTHORIZED';
  constructor(message: string) {
    super(message);
    this.name = 'UnauthorizedInvitationAccessError';
  }
}

export function hashInvitationToken(token: string): string {
  return createHash('sha256').update(token.trim()).digest('hex');
}

export function generateInvitationToken(): string {
  return randomBytes(32).toString('hex');
}

const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export class OrganizationInvitationService {
  constructor(
    private readonly invitationRepository: InvitationRepository,
    private readonly membershipRepository: MembershipRepository,
    private readonly baseUrl: string = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
  ) {}

  private async assertAdminAccess(userId: string, organizationId: string): Promise<void> {
    if (!userId || !userId.trim()) {
      throw new UnauthorizedInvitationAccessError('Authentication required.');
    }

    const membership = await this.membershipRepository.findUserMembershipInOrg(userId, organizationId);
    if (!membership || membership.status !== 'active') {
      throw new UnauthorizedInvitationAccessError('User does not have active access to this organization.');
    }

    const allowedRoles: PlatformRole[] = ['business_admin', 'super_admin'];
    if (!allowedRoles.includes(membership.role_key)) {
      throw new UnauthorizedInvitationAccessError('Only organization administrators can manage invitations.');
    }
  }

  async createInvitation(
    userId: string,
    organizationId: string,
    input: CreateInvitationInput,
  ): Promise<{ invitation: OrganizationInvitation; rawToken: string; inviteUrl: string }> {
    await this.assertAdminAccess(userId, organizationId);

    const email = input.email?.trim().toLowerCase();
    if (!email || !EMAIL_PATTERN.test(email) || email.length > 255) {
      throw new InvalidInvitationInputError('A valid email address is required.');
    }

    if (input.role !== 'manager' && input.role !== 'employee') {
      throw new InvalidInvitationRoleError(input.role);
    }

    const rawToken = generateInvitationToken();
    const tokenHash = hashInvitationToken(rawToken);

    const invitation = await this.invitationRepository.createInvitation(
      organizationId,
      {
        email,
        role: input.role,
        expires_at: input.expires_at,
      },
      tokenHash,
    );

    const inviteUrl = `${this.baseUrl}/business/invitations/accept#token=${rawToken}`;
    return { invitation, rawToken, inviteUrl };
  }

  async listInvitations(userId: string, organizationId: string): Promise<OrganizationInvitation[]> {
    await this.assertAdminAccess(userId, organizationId);
    return this.invitationRepository.listInvitations(organizationId);
  }

  async revokeInvitation(
    userId: string,
    organizationId: string,
    invitationId: string,
  ): Promise<void> {
    await this.assertAdminAccess(userId, organizationId);
    if (!invitationId) {
      throw new InvalidInvitationInputError('Invitation ID is required.');
    }
    return this.invitationRepository.revokeInvitation(organizationId, invitationId);
  }

  async resendInvitation(
    userId: string,
    organizationId: string,
    invitationId: string,
  ): Promise<{ rawToken: string; inviteUrl: string }> {
    await this.assertAdminAccess(userId, organizationId);
    if (!invitationId) {
      throw new InvalidInvitationInputError('Invitation ID is required.');
    }

    const rawToken = generateInvitationToken();
    const tokenHash = hashInvitationToken(rawToken);

    await this.invitationRepository.resendInvitation(organizationId, invitationId, tokenHash);

    const inviteUrl = `${this.baseUrl}/business/invitations/accept#token=${rawToken}`;
    return { rawToken, inviteUrl };
  }

  async getPreview(tokenHashOrRaw: string): Promise<InvitationPreview> {
    const clean = tokenHashOrRaw?.trim();
    if (!clean) {
      throw new InvalidInvitationInputError('Invitation token is required.');
    }

    const tokenHash = clean.length === 64 && /^[0-9a-f]{64}$/i.test(clean)
      ? clean.toLowerCase()
      : hashInvitationToken(clean);

    return this.invitationRepository.getPreview(tokenHash);
  }

  async acceptInvitation(
    userId: string,
    rawToken: string,
  ): Promise<AcceptInvitationResult> {
    if (!userId || !userId.trim()) {
      throw new UnauthorizedInvitationAccessError('Authentication required to accept an invitation.');
    }

    const cleanToken = rawToken?.trim();
    if (!cleanToken) {
      throw new InvalidInvitationInputError('Invitation token is required.');
    }

    const tokenHash = hashInvitationToken(cleanToken);
    return this.invitationRepository.acceptInvitation(tokenHash);
  }
}

