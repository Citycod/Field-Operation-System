import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  authenticatedOrganizationService,
  authenticatedAuditLogService,
} = vi.hoisted(() => ({
  authenticatedOrganizationService: vi.fn(),
  authenticatedAuditLogService: vi.fn(),
}));

vi.mock("@/lib/services/server-organization-service", () => ({
  authenticatedOrganizationService,
  authenticatedAuditLogService,
}));

import { GET as GET_MEMBERS } from "../[organizationId]/members/route";
import {
  PATCH as PATCH_MEMBER,
  DELETE as DELETE_MEMBER,
} from "../[organizationId]/members/[userId]/route";
import { POST as LIFECYCLE } from "../[organizationId]/lifecycle/route";
import { GET as GET_AUDIT_LOGS } from "../[organizationId]/audit-logs/route";

describe("Stage 5 API Endpoints: Tenant Management", () => {
  const orgService = {
    getMembersRoster: vi.fn(),
    manageMembership: vi.fn(),
    manageLifecycle: vi.fn(),
    reactivateVoluntarySuspension: vi.fn(),
  };

  const auditService = {
    listAuditLogs: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    authenticatedOrganizationService.mockResolvedValue({
      service: orgService,
      userId: "user-admin-1",
    });
    authenticatedAuditLogService.mockResolvedValue({
      service: auditService,
      userId: "user-admin-1",
    });
  });

  describe("GET /api/organizations/[orgId]/members", () => {
    it("returns roster items successfully", async () => {
      orgService.getMembersRoster.mockResolvedValue([
        {
          membership_id: "mem-1",
          organization_id: "org-1",
          user_id: "user-admin-1",
          role_key: "super_admin",
          status: "active",
          email: "admin@example.com",
        },
      ]);

      const req = new NextRequest("http://localhost/api/organizations/org-1/members");
      const res = await GET_MEMBERS(req, {
        params: Promise.resolve({ organizationId: "org-1" }),
      });
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.members).toHaveLength(1);
      expect(data.members[0].role_key).toBe("super_admin");
    });
  });

  describe("PATCH /api/organizations/[orgId]/members/[userId]", () => {
    it("updates member role successfully", async () => {
      orgService.manageMembership.mockResolvedValue({
        success: true,
        action: "update_role",
        membership_id: "mem-2",
        organization_id: "org-1",
        user_id: "user-target-2",
        role_key: "manager",
        status: "active",
        updated_at: new Date().toISOString(),
      });

      const req = new NextRequest("http://localhost/api/organizations/org-1/members/user-target-2", {
        method: "PATCH",
        body: JSON.stringify({ role: "manager" }),
      });
      const res = await PATCH_MEMBER(req, {
        params: Promise.resolve({ organizationId: "org-1", userId: "user-target-2" }),
      });
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.role_key).toBe("manager");
    });

    it("rejects invalid role with 400", async () => {
      const req = new NextRequest("http://localhost/api/organizations/org-1/members/user-target-2", {
        method: "PATCH",
        body: JSON.stringify({ role: "invalid_hacker_role" }),
      });
      const res = await PATCH_MEMBER(req, {
        params: Promise.resolve({ organizationId: "org-1", userId: "user-target-2" }),
      });
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.code).toBe("INVALID_ROLE");
    });
  });

  describe("DELETE /api/organizations/[orgId]/members/[userId]", () => {
    it("removes member or handles self-leave", async () => {
      orgService.manageMembership.mockResolvedValue({
        success: true,
        action: "remove",
        membership_id: "mem-2",
        organization_id: "org-1",
        user_id: "user-target-2",
        status: "disabled",
        updated_at: new Date().toISOString(),
      });

      const req = new NextRequest("http://localhost/api/organizations/org-1/members/user-target-2", {
        method: "DELETE",
      });
      const res = await DELETE_MEMBER(req, {
        params: Promise.resolve({ organizationId: "org-1", userId: "user-target-2" }),
      });
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.status).toBe("disabled");
    });

    it("returns 400 when attempting to remove the last admin", async () => {
      orgService.manageMembership.mockRejectedValue(
        new Error("CANNOT_REMOVE_LAST_ADMIN: Organization must retain at least one active administrator"),
      );

      const req = new NextRequest("http://localhost/api/organizations/org-1/members/user-admin-1", {
        method: "DELETE",
      });
      const res = await DELETE_MEMBER(req, {
        params: Promise.resolve({ organizationId: "org-1", userId: "user-admin-1" }),
      });
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.code).toBe("CANNOT_REMOVE_LAST_ADMIN");
    });
  });

  describe("POST /api/organizations/[orgId]/lifecycle", () => {
    it("voluntarily suspends workspace", async () => {
      orgService.manageLifecycle.mockResolvedValue({
        success: true,
        organization_id: "org-1",
        new_status: "suspended",
        suspension_type: "voluntary",
        updated_at: new Date().toISOString(),
      });

      const req = new NextRequest("http://localhost/api/organizations/org-1/lifecycle", {
        method: "POST",
        body: JSON.stringify({ action: "suspend", reason: "Scheduled maintenance" }),
      });
      const res = await LIFECYCLE(req, {
        params: Promise.resolve({ organizationId: "org-1" }),
      });
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.new_status).toBe("suspended");
      expect(data.suspension_type).toBe("voluntary");
    });

    it("reactivates voluntarily suspended workspace", async () => {
      orgService.reactivateVoluntarySuspension.mockResolvedValue({
        success: true,
        organization_id: "org-1",
        status: "active",
        reactivated_at: new Date().toISOString(),
      });

      const req = new NextRequest("http://localhost/api/organizations/org-1/lifecycle", {
        method: "POST",
        body: JSON.stringify({ action: "reactivate" }),
      });
      const res = await LIFECYCLE(req, {
        params: Promise.resolve({ organizationId: "org-1" }),
      });
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.status).toBe("active");
    });
  });

  describe("GET /api/organizations/[orgId]/audit-logs", () => {
    it("retrieves audit logs with pagination", async () => {
      auditService.listAuditLogs.mockResolvedValue([
        {
          id: "audit-1",
          organization_id: "org-1",
          actor_email: "admin@example.com",
          actor_role: "super_admin",
          event_type: "member.role_updated",
          entity_type: "organization_membership",
          entity_id: "mem-2",
          action: "update_role",
          metadata: { new_role: "manager" },
          created_at: new Date().toISOString(),
        },
      ]);

      const req = new NextRequest("http://localhost/api/organizations/org-1/audit-logs?limit=25&offset=0");
      const res = await GET_AUDIT_LOGS(req, {
        params: Promise.resolve({ organizationId: "org-1" }),
      });
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.logs).toHaveLength(1);
      expect(data.logs[0].event_type).toBe("member.role_updated");
    });
  });
});

