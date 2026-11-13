import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { authenticatedOrganizationService } = vi.hoisted(() => ({
  authenticatedOrganizationService: vi.fn(),
}));

vi.mock("@/lib/services/server-organization-service", () => ({
  authenticatedOrganizationService,
}));

import { GET, POST } from "../route";
import { GET as GET_ORG } from "../[organizationId]/route";
import { PATCH as PATCH_PROFILE } from "../[organizationId]/profile/route";
import { SlugAlreadyExistsError, UnauthorizedOrganizationAccessError } from "@/lib/services/organization-service";

describe("Organization API Endpoints", () => {
  const service = {
    createWorkspace: vi.fn(),
    getOrganization: vi.fn(),
    updateOrganizationProfile: vi.fn(),
    listUserOrganizations: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    authenticatedOrganizationService.mockResolvedValue({
      service,
      userId: "session-user-123",
    });
  });

  describe("POST /api/organizations", () => {
    it("creates workspace using session user identity and ignores browser-supplied identity claims", async () => {
      service.createWorkspace.mockResolvedValue({
        organization: { id: "org-new", name: "Alpha Ops", slug: "alpha-ops", status: "active" },
        membership: { id: "mem-new", organization_id: "org-new", user_id: "session-user-123", role_key: "business_admin", status: "active" },
      });

      const response = await POST(
        new NextRequest("http://localhost/api/organizations", {
          method: "POST",
          body: JSON.stringify({
            name: "Alpha Ops",
            slug: "alpha-ops",
            userId: "spoofed-user-id", // Malicious spoof attempt
            role_key: "super_admin", // Malicious role escalation attempt
          }),
        }),
      );

      expect(response.status).toBe(201);
      expect(service.createWorkspace).toHaveBeenCalledWith(
        "session-user-123",
        expect.objectContaining({
          name: "Alpha Ops",
          slug: "alpha-ops",
        }),
      );
      // Service call must NOT receive spoofed client attributes
      const callArgs = service.createWorkspace.mock.calls[0];
      expect(callArgs[0]).toBe("session-user-123");
      expect(callArgs[1]).not.toHaveProperty("userId");
      expect(callArgs[1]).not.toHaveProperty("role_key");
    });

    it("rejects request when business name is missing or empty", async () => {
      const response = await POST(
        new NextRequest("http://localhost/api/organizations", {
          method: "POST",
          body: JSON.stringify({ name: "   " }),
        }),
      );

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toMatchObject({
        code: "INVALID_REQUEST",
      });
      expect(service.createWorkspace).not.toHaveBeenCalled();
    });

    it("returns 409 status when business slug is already in use", async () => {
      service.createWorkspace.mockRejectedValue(new SlugAlreadyExistsError("taken-slug"));

      const response = await POST(
        new NextRequest("http://localhost/api/organizations", {
          method: "POST",
          body: JSON.stringify({ name: "Taken Corp", slug: "taken-slug" }),
        }),
      );

      expect(response.status).toBe(409);
      await expect(response.json()).resolves.toMatchObject({
        code: "SLUG_ALREADY_EXISTS",
      });
    });

    it("returns 401 when authentication is missing", async () => {
      authenticatedOrganizationService.mockRejectedValue(new Error("AUTHENTICATION_REQUIRED"));

      const response = await POST(
        new NextRequest("http://localhost/api/organizations", {
          method: "POST",
          body: JSON.stringify({ name: "Unauthenticated Corp" }),
        }),
      );

      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toMatchObject({
        code: "UNAUTHENTICATED",
      });
    });
  });

  describe("GET /api/organizations", () => {
    it("lists organizations for authenticated session user", async () => {
      const mockOrgs = [
        { id: "org-1", name: "Org 1", slug: "org-1", status: "active" },
        { id: "org-2", name: "Org 2", slug: "org-2", status: "active" },
      ];
      service.listUserOrganizations.mockResolvedValue(mockOrgs);

      const response = await GET();
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ organizations: mockOrgs });
      expect(service.listUserOrganizations).toHaveBeenCalledWith("session-user-123");
    });
  });

  describe("GET /api/organizations/[organizationId]", () => {
    it("returns organization details and profile for authorized member", async () => {
      const mockResult = {
        organization: { id: "org-1", name: "Org 1", slug: "org-1", status: "active" },
        profile: { organization_id: "org-1", timezone: "UTC", currency_code: "USD" },
      };
      service.getOrganization.mockResolvedValue(mockResult);

      const response = await GET_ORG(
        new NextRequest("http://localhost/api/organizations/org-1"),
        { params: Promise.resolve({ organizationId: "org-1" }) },
      );

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual(mockResult);
      expect(service.getOrganization).toHaveBeenCalledWith("session-user-123", "org-1");
    });

    it("returns 403 when user is not an active member of target organization", async () => {
      service.getOrganization.mockRejectedValue(
        new UnauthorizedOrganizationAccessError("Unauthorized: User not in org"),
      );

      const response = await GET_ORG(
        new NextRequest("http://localhost/api/organizations/org-2"),
        { params: Promise.resolve({ organizationId: "org-2" }) },
      );

      expect(response.status).toBe(403);
      await expect(response.json()).resolves.toMatchObject({
        code: "FORBIDDEN",
      });
    });
  });

  describe("PATCH /api/organizations/[organizationId]/profile", () => {
    it("updates profile fields when authorized as business administrator", async () => {
      const updatedProfile = {
        organization_id: "org-1",
        business_email: "new@org1.com",
        timezone: "Europe/London",
        currency_code: "GBP",
      };
      service.updateOrganizationProfile.mockResolvedValue(updatedProfile);

      const response = await PATCH_PROFILE(
        new NextRequest("http://localhost/api/organizations/org-1/profile", {
          method: "PATCH",
          body: JSON.stringify({
            business_email: "new@org1.com",
            timezone: "Europe/London",
            currency_code: "GBP",
          }),
        }),
        { params: Promise.resolve({ organizationId: "org-1" }) },
      );

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ profile: updatedProfile });
      expect(service.updateOrganizationProfile).toHaveBeenCalledWith(
        "session-user-123",
        "org-1",
        {
          business_email: "new@org1.com",
          timezone: "Europe/London",
          currency_code: "GBP",
        },
      );
    });

    it("returns 403 when caller lacks business administrator privileges", async () => {
      service.updateOrganizationProfile.mockRejectedValue(
        new UnauthorizedOrganizationAccessError("Only business administrators can update organization settings."),
      );

      const response = await PATCH_PROFILE(
        new NextRequest("http://localhost/api/organizations/org-1/profile", {
          method: "PATCH",
          body: JSON.stringify({ business_email: "hacked@org1.com" }),
        }),
        { params: Promise.resolve({ organizationId: "org-1" }) },
      );

      expect(response.status).toBe(403);
      await expect(response.json()).resolves.toMatchObject({
        code: "FORBIDDEN",
      });
    });
  });
});

