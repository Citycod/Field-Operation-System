import { AuditLogRepository, AuditLogQueryOptions } from '../repositories/audit-log-repository';
import { MembershipRepository } from '../repositories/membership-repository';
import { AuditLogEntry, PlatformRole } from '@field/types';
import { UnauthorizedOrganizationAccessError } from './organization-service';

export class AuditLogService {
  constructor(
    private readonly auditLogRepository: AuditLogRepository,
    private readonly membershipRepository: MembershipRepository,
  ) {}

  async listAuditLogs(
    userId: string,
    organizationId: string,
    options?: AuditLogQueryOptions,
  ): Promise<AuditLogEntry[]> {
    const membership = await this.membershipRepository.findUserMembershipInOrg(userId, organizationId);
    if (!membership || membership.status !== 'active') {
      throw new UnauthorizedOrganizationAccessError(
        `User ${userId} does not have active access to organization ${organizationId}`,
      );
    }

    const allowedRoles: PlatformRole[] = ['business_admin', 'super_admin'];
    if (!allowedRoles.includes(membership.role_key)) {
      throw new UnauthorizedOrganizationAccessError(
        `Only organization administrators can view security and audit records.`,
      );
    }

    return this.auditLogRepository.listByOrganization(organizationId, options);
  }
}

