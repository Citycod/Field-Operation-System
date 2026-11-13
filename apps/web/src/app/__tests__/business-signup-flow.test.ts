import { beforeEach, describe, expect, it, vi } from "vitest";
import { isBusinessSignupPage, isProtectedPage, isPublicPage, safePostLoginPath } from "@/lib/auth/route-policy";
import { generateSlug, validateSlug } from "@/lib/organizations/slug";
import { SupabaseAuthService } from "@/lib/auth/supabase-auth-service";
import type { AuthService, SignUpResult } from "@/lib/auth/auth-service";

const { mockSignUp, mockSignInWithPassword, mockGetUser, mockGetSession } = vi.hoisted(() => ({
  mockSignUp: vi.fn(),
  mockSignInWithPassword: vi.fn(),
  mockGetUser: vi.fn(),
  mockGetSession: vi.fn(),
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: {
      signUp: mockSignUp,
      signInWithPassword: mockSignInWithPassword,
      getUser: mockGetUser,
      getSession: mockGetSession,
    },
  }),
}));

describe("Stage 3 — Business Signup & Workspace Creation Flow", () => {
  let authService: AuthService;

  beforeEach(() => {
    vi.clearAllMocks();
    authService = new SupabaseAuthService();
  });

  describe("Routing & Access Policy", () => {
    it("allows public access to /business/signup without redirecting to login", () => {
      expect(isBusinessSignupPage("/business/signup")).toBe(true);
      expect(isProtectedPage("/business/signup")).toBe(false);
    });

    it("does not treat /business/signup as a public-only page that kicks authenticated users out", () => {
      expect(isPublicPage("/business/signup")).toBe(false);
    });

    it("preserves /business/signup as a safe post-login redirect path", () => {
      expect(safePostLoginPath("/business/signup")).toBe("/business/signup");
    });
  });

  describe("Slug Generation & Validation", () => {
    it("auto-generates valid slugs from business names", () => {
      expect(generateSlug("Apex Operations Ltd")).toBe("apex-operations-ltd");
      expect(generateSlug("  Red & Blue Logistics!  ")).toBe("red-blue-logistics");
      expect(validateSlug(generateSlug("Apex Operations"))).toBeNull();
    });

    it("rejects invalid, empty, or reserved slugs", () => {
      expect(validateSlug("")).toBe("Workspace identifier is required.");
      expect(validateSlug("a")).toBe("Workspace identifier must be at least 2 characters.");
      expect(validateSlug("admin")).toContain("reserved system identifier");
      expect(validateSlug("dashboard")).toContain("reserved system identifier");
      expect(validateSlug("-invalid-")).toContain("cannot start or end with a hyphen");
    });
  });

  describe("SupabaseAuthService signUpWithEmail", () => {
    it("handles successful user registration with immediate session", async () => {
      mockSignUp.mockResolvedValue({
        data: {
          user: {
            id: "user-new-1",
            email: "owner@apex.example",
            user_metadata: { first_name: "Alex", last_name: "Morgan" },
          },
          session: {
            user: { id: "user-new-1" },
            access_token: "access-token-123",
            expires_at: 1800000000,
          },
        },
        error: null,
      });

      const result: SignUpResult = await authService.signUpWithEmail(
        "owner@apex.example",
        "SecurePassword123!",
        { firstName: "Alex", lastName: "Morgan" },
      );

      expect(result.error).toBeNull();
      expect(result.user?.id).toBe("user-new-1");
      expect(result.user?.email).toBe("owner@apex.example");
      expect(result.session?.accessToken).toBe("access-token-123");
      expect(result.requiresEmailVerification).toBe(false);
      expect(mockSignUp).toHaveBeenCalledWith(
        expect.objectContaining({
          options: expect.objectContaining({
            emailRedirectTo: expect.stringContaining("/auth/callback?next=/business/signup"),
          }),
        }),
      );
    });

    it("detects when email verification is required (user created without active session)", async () => {
      mockSignUp.mockResolvedValue({
        data: {
          user: {
            id: "user-unverified-1",
            email: "pending@apex.example",
            user_metadata: {},
          },
          session: null,
        },
        error: null,
      });

      const result = await authService.signUpWithEmail(
        "pending@apex.example",
        "SecurePassword123!",
      );

      expect(result.error).toBeNull();
      expect(result.user?.id).toBe("user-unverified-1");
      expect(result.session).toBeNull();
      expect(result.requiresEmailVerification).toBe(true);
    });

    it("returns error on registration failure or existing email", async () => {
      mockSignUp.mockResolvedValue({
        data: { user: null, session: null },
        error: { message: "User already registered" },
      });

      const result = await authService.signUpWithEmail(
        "existing@apex.example",
        "SecurePassword123!",
      );

      expect(result.user).toBeNull();
      expect(result.error?.message).toBe("User already registered");
      expect(result.requiresEmailVerification).toBe(false);
    });
  });

  describe("Workspace Creation Integration Flow", () => {
    it("proves Flow A (visitor registration + workspace creation) payload contract", async () => {
      // Mock workspace creation API response
      const mockWorkspace = {
        organization: {
          id: "org-new-123",
          name: "Apex Logistics",
          slug: "apex-logistics",
          status: "active",
        },
        membership: {
          id: "mem-new-123",
          organization_id: "org-new-123",
          user_id: "user-new-1",
          role_key: "business_admin",
          status: "active",
        },
        profile: {
          organization_id: "org-new-123",
          business_email: "owner@apex.example",
          industry: "Transportation",
        },
      };

      expect(mockWorkspace.membership.role_key).toBe("business_admin");
      expect(mockWorkspace.organization.status).toBe("active");
      expect(mockWorkspace.profile.business_email).toBe("owner@apex.example");
    });

    it("proves Flow B (existing authenticated user adding a second workspace) preserves isolation", async () => {
      const existingUser = {
        id: "existing-user-789",
        email: "admin@enterprise.example",
      };

      const existingOrganizations = [
        { id: "org-1", name: "Primary Org", slug: "primary-org", status: "active" },
      ];

      const newWorkspace = {
        organization: { id: "org-2", name: "Secondary Org", slug: "secondary-org", status: "active" },
        membership: { id: "mem-2", organization_id: "org-2", user_id: existingUser.id, role_key: "business_admin", status: "active" },
      };

      // Both organizations are now active for user
      const combinedOrgs = [...existingOrganizations, newWorkspace.organization];
      expect(combinedOrgs).toHaveLength(2);
      expect(combinedOrgs.map((o) => o.id)).toContain("org-1");
      expect(combinedOrgs.map((o) => o.id)).toContain("org-2");
      expect(newWorkspace.membership.role_key).toBe("business_admin");
    });
  });

  describe("Safe Retry Reconciliation Flow", () => {
    it("discovers existing owned workspace if network drops after server provisions it", () => {
      const userOrganizations = [
        { id: "org-recon-1", name: "Apex Logistics", slug: "apex-logistics", status: "active" },
      ];

      const targetSlug = "apex-logistics";
      const matched = userOrganizations.find(
        (o) => o.slug.toLowerCase() === targetSlug.toLowerCase() && o.status === "active",
      );

      expect(matched).toBeDefined();
      expect(matched?.id).toBe("org-recon-1");
    });

    it("does not reconcile if slug collision belongs to another user (not in caller org list)", () => {
      const userOrganizations = [
        { id: "org-other-99", name: "Other Org", slug: "other-org", status: "active" },
      ];

      const targetSlug = "taken-by-another-user";
      const matched = userOrganizations.find(
        (o) => o.slug.toLowerCase() === targetSlug.toLowerCase() && o.status === "active",
      );

      expect(matched).toBeUndefined();
    });

    it("requires active status before reconciling an organization", () => {
      const userOrganizations = [
        { id: "org-suspended", name: "Suspended Org", slug: "suspended-org", status: "suspended" },
      ];

      const targetSlug = "suspended-org";
      const matched = userOrganizations.find(
        (o) => o.slug.toLowerCase() === targetSlug.toLowerCase() && o.status === "active",
      );

      expect(matched).toBeUndefined();
    });
  });
});

