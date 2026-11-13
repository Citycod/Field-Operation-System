import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  authenticatedOrganizationService,
  authenticatedInvitationService,
  publicInvitationService,
} = vi.hoisted(() => ({
  authenticatedOrganizationService: vi.fn(),
  authenticatedInvitationService: vi.fn(),
  publicInvitationService: vi.fn(),
}));

vi.mock("@/lib/services/server-organization-service", () => ({
  authenticatedOrganizationService,
  authenticatedInvitationService,
  publicInvitationService,
}));

import {
  GET as GET_INVITATIONS,
  POST as POST_INVITATIONS,
} from "../[organizationId]/invitations/route";
import { POST as REVOKE_INVITATION } from "../[organizationId]/invitations/[invitationId]/revoke/route";
import { POST as RESEND_INVITATION } from "../[organizationId]/invitations/[invitationId]/resend/route";
import { POST as PREVIEW_INVITATION } from "../invitations/preview/route";
import { POST as ACCEPT_INVITATION } from "../invitations/accept/route";
import { POST as COMPLETE_ONBOARDING } from "../[organizationId]/onboarding/complete/route";
import { POST as RESOLVE_LEGACY } from "../[organizationId]/profile/resolve-legacy/route";

describe("Stage 4 API Endpoints", () => {
  const orgService = {
    completeOnboarding: vi.fn(),
    resolveLegacyProfile: vi.fn(),
  };

  const inviteService = {
    createInvitation: vi.fn(),
    listInvitations: vi.fn(),
    revokeInvitation: vi.fn(),
    resendInvitation: vi.fn(),
    getPreview: vi.fn(),
    acceptInvitation: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    authenticatedOrganizationService.mockResolvedValue({
      service: orgService,
      userId: "user-admin-1",
    });
    authenticatedInvitationService.mockResolvedValue({
      service: inviteService,
      userId: "user-admin-1",
    });
    publicInvitationService.mockResolvedValue(inviteService);
  });

  describe("POST /api/organizations/[orgId]/invitations", () => {
    it("creates an invitation for manager role", async () => {
      inviteService.createInvitation.mockResolvedValue({
        invitation: { id: "inv-1", email: "manager@example.com", role: "manager", status: "pending" },
        rawToken: "token123",
        inviteUrl: "http://localhost:3000/business/invitations/accept#token=token123",
      });

      const response = await POST_INVITATIONS(
        new NextRequest("http://localhost/api/organizations/org-1/invitations", {
          method: "POST",
          body: JSON.stringify({ email: "manager@example.com", role: "manager" }),
        }),
        { params: Promise.resolve({ organizationId: "org-1" }) },
      );

      expect(response.status).toBe(201);
      expect(inviteService.createInvitation).toHaveBeenCalledWith(
        "user-admin-1",
        "org-1",
        { email: "manager@example.com", role: "manager" },
      );
    });

    it("validates missing body fields", async () => {
      const response = await POST_INVITATIONS(
        new NextRequest("http://localhost/api/organizations/org-1/invitations", {
          method: "POST",
          body: JSON.stringify({ email: "manager@example.com" }),
        }),
        { params: Promise.resolve({ organizationId: "org-1" }) },
      );

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.code).toBe("INVALID_REQUEST");
    });
  });

  describe("GET /api/organizations/[orgId]/invitations", () => {
    it("returns list of invitations for workspace admin", async () => {
      inviteService.listInvitations.mockResolvedValue([
        { id: "inv-1", email: "user1@example.com", role: "employee", status: "pending" },
      ]);

      const response = await GET_INVITATIONS(
        new NextRequest("http://localhost/api/organizations/org-1/invitations"),
        { params: Promise.resolve({ organizationId: "org-1" }) },
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.invitations).toHaveLength(1);
    });
  });

  describe("POST /api/organizations/[orgId]/invitations/[invId]/revoke", () => {
    it("revokes invitation successfully", async () => {
      inviteService.revokeInvitation.mockResolvedValue(undefined);

      const response = await REVOKE_INVITATION(
        new NextRequest("http://localhost/api/organizations/org-1/invitations/inv-1/revoke", {
          method: "POST",
        }),
        { params: Promise.resolve({ organizationId: "org-1", invitationId: "inv-1" }) },
      );

      expect(response.status).toBe(200);
      expect(inviteService.revokeInvitation).toHaveBeenCalledWith("user-admin-1", "org-1", "inv-1");
    });
  });

  describe("POST /api/organizations/[orgId]/invitations/[invId]/resend", () => {
    it("resends invitation successfully", async () => {
      inviteService.resendInvitation.mockResolvedValue({
        rawToken: "token_new",
        inviteUrl: "http://localhost:3000/business/invitations/accept#token=token_new",
      });

      const response = await RESEND_INVITATION(
        new NextRequest("http://localhost/api/organizations/org-1/invitations/inv-1/resend", {
          method: "POST",
        }),
        { params: Promise.resolve({ organizationId: "org-1", invitationId: "inv-1" }) },
      );

      expect(response.status).toBe(200);
      expect(inviteService.resendInvitation).toHaveBeenCalledWith("user-admin-1", "org-1", "inv-1");
    });
  });

  describe("POST /api/organizations/invitations/preview", () => {
    it("previews invitation without requiring authentication", async () => {
      inviteService.getPreview.mockResolvedValue({
        organization_id: "org-1",
        organization_name: "Acme Corp",
        email: "invitee@example.com",
        role: "manager",
        expires_at: "2026-12-01T00:00:00Z",
      });

      const response = await PREVIEW_INVITATION(
        new NextRequest("http://localhost/api/organizations/invitations/preview", {
          method: "POST",
          body: JSON.stringify({ token: "test_raw_token" }),
        }),
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.preview.organization_name).toBe("Acme Corp");
    });
  });

  describe("POST /api/organizations/invitations/accept", () => {
    it("accepts invitation with raw token in POST body", async () => {
      inviteService.acceptInvitation.mockResolvedValue({
        organization_id: "org-1",
        membership_id: "mem-new",
        role_key: "manager",
        status: "active",
      });

      const response = await ACCEPT_INVITATION(
        new NextRequest("http://localhost/api/organizations/invitations/accept", {
          method: "POST",
          body: JSON.stringify({ token: "test_token_secret" }),
        }),
      );

      expect(response.status).toBe(200);
      expect(inviteService.acceptInvitation).toHaveBeenCalledWith("user-admin-1", "test_token_secret");
    });
  });

  describe("POST /api/organizations/[orgId]/onboarding/complete", () => {
    it("completes organization onboarding", async () => {
      orgService.completeOnboarding.mockResolvedValue({
        success: true,
        organization_id: "org-1",
        onboarding_completed: true,
        onboarding_step: "completed",
        onboarding_status: "completed",
        onboarding_completed_at: "2026-11-11T16:00:00Z",
      });

      const response = await COMPLETE_ONBOARDING(
        new NextRequest("http://localhost/api/organizations/org-1/onboarding/complete", {
          method: "POST",
        }),
        { params: Promise.resolve({ organizationId: "org-1" }) },
      );

      expect(response.status).toBe(200);
      expect(orgService.completeOnboarding).toHaveBeenCalledWith("user-admin-1", "org-1");
    });
  });

  describe("POST /api/organizations/[orgId]/profile/resolve-legacy", () => {
    it("resolves legacy profile status", async () => {
      orgService.resolveLegacyProfile.mockResolvedValue({
        success: true,
        organization_id: "org-1",
        onboarding_status: "completed",
        resolved_at: "2026-11-11T16:00:00Z",
      });

      const response = await RESOLVE_LEGACY(
        new NextRequest("http://localhost/api/organizations/org-1/profile/resolve-legacy", {
          method: "POST",
        }),
        { params: Promise.resolve({ organizationId: "org-1" }) },
      );

      expect(response.status).toBe(200);
      expect(orgService.resolveLegacyProfile).toHaveBeenCalledWith("user-admin-1", "org-1");
    });
  });
});

