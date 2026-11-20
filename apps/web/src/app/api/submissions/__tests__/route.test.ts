import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { authenticatedSubmissionService } = vi.hoisted(() => ({
  authenticatedSubmissionService: vi.fn(),
}));

vi.mock("@/lib/services/server-form-service", () => ({
  authenticatedSubmissionService,
}));

import { GET as GET_FORM_SUBMISSIONS } from "../../forms/[formId]/submissions/route";
import { GET as GET_CROSS_FORM_SUBMISSIONS } from "../route";
import { GET as GET_SUBMISSION_DETAIL } from "../[submissionId]/route";

describe("Authenticated Submissions API Routes", () => {
  const mockService = {
    listAuthenticatedSubmissions: vi.fn(),
    getAuthenticatedSubmissionDetail: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    authenticatedSubmissionService.mockResolvedValue({
      service: mockService,
      userId: "session-user-123",
    });
  });

  describe("GET /api/forms/[formId]/submissions", () => {
    it("returns 400 when organizationId is missing", async () => {
      const response = await GET_FORM_SUBMISSIONS(
        new NextRequest("http://localhost/api/forms/synth-form-1/submissions"),
        { params: Promise.resolve({ formId: "synth-form-1" }) },
      );

      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json).toEqual({
        error: "Organization ID is required.",
        code: "INVALID_REQUEST",
      });
      expect(mockService.listAuthenticatedSubmissions).not.toHaveBeenCalled();
    });

    it("returns 400 when formId is blank", async () => {
      const response = await GET_FORM_SUBMISSIONS(
        new NextRequest("http://localhost/api/forms/%20/submissions?organizationId=org-synth-1"),
        { params: Promise.resolve({ formId: "   " }) },
      );

      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json).toEqual({
        error: "Form ID is required.",
        code: "INVALID_REQUEST",
      });
      expect(mockService.listAuthenticatedSubmissions).not.toHaveBeenCalled();
    });

    it("returns 401 when user is not authenticated", async () => {
      authenticatedSubmissionService.mockRejectedValue(
        new Error("AUTHENTICATION_REQUIRED"),
      );

      const response = await GET_FORM_SUBMISSIONS(
        new NextRequest(
          "http://localhost/api/forms/synth-form-1/submissions?organizationId=org-synth-1",
        ),
        { params: Promise.resolve({ formId: "synth-form-1" }) },
      );

      expect(response.status).toBe(401);
      const json = await response.json();
      expect(json).toEqual({
        error: "Sign in is required.",
        code: "UNAUTHENTICATED",
      });
    });

    it("returns 403 when role is forbidden or unauthorized", async () => {
      mockService.listAuthenticatedSubmissions.mockRejectedValue(
        new Error('Unauthorized: Role "guest" is not permitted to view submissions for this form.'),
      );

      const response = await GET_FORM_SUBMISSIONS(
        new NextRequest(
          "http://localhost/api/forms/synth-form-1/submissions?organizationId=org-synth-1",
        ),
        { params: Promise.resolve({ formId: "synth-form-1" }) },
      );

      expect(response.status).toBe(403);
      const json = await response.json();
      expect(json.code).toBe("FORBIDDEN");
      expect(json.error).toContain("is not permitted");
    });

    it("returns 200 with paginated submissions and parses query parameters", async () => {
      const mockResult = {
        submissions: [
          {
            id: "sub-synth-1",
            organization_id: "org-synth-1",
            form_id: "synth-form-1",
            form_version_id: "v-synth-1",
            reference_number: "REF-00100",
            status: "submitted",
            data_jsonb: { fields: { title: "Test" } },
            created_by: "session-user-123",
            submitted_by: "session-user-123",
            created_at: "2026-11-20T10:00:00Z",
            updated_at: "2026-11-20T10:00:00Z",
            submitted_at: "2026-11-20T10:00:00Z",
            completed_at: null,
          },
        ],
        totalCount: 1,
        page: 2,
        pageSize: 10,
        totalPages: 1,
      };

      mockService.listAuthenticatedSubmissions.mockResolvedValue(mockResult);

      const url =
        "http://localhost/api/forms/synth-form-1/submissions?organizationId=org-synth-1&status=submitted&referenceNumber=REF-00100&dateFrom=2026-11-01&dateTo=2026-11-20&page=2&pageSize=10&sortBy=created_at&sortOrder=desc";
      const response = await GET_FORM_SUBMISSIONS(new NextRequest(url), {
        params: Promise.resolve({ formId: "synth-form-1" }),
      });

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json).toEqual(mockResult);

      expect(mockService.listAuthenticatedSubmissions).toHaveBeenCalledWith({
        userId: "session-user-123",
        organizationId: "org-synth-1",
        formId: "synth-form-1",
        status: "submitted",
        referenceNumber: "REF-00100",
        dateFrom: "2026-11-01",
        dateTo: "2026-11-20",
        page: 2,
        pageSize: 10,
        sortBy: "created_at",
        sortOrder: "desc",
      });
    });
  });

  describe("GET /api/submissions (cross-form tenant inbox)", () => {
    it("returns 400 when organizationId is missing", async () => {
      const response = await GET_CROSS_FORM_SUBMISSIONS(
        new NextRequest("http://localhost/api/submissions"),
      );

      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json).toEqual({
        error: "Organization ID is required.",
        code: "INVALID_REQUEST",
      });
      expect(mockService.listAuthenticatedSubmissions).not.toHaveBeenCalled();
    });

    it("returns 401 when user is not authenticated", async () => {
      authenticatedSubmissionService.mockRejectedValue(
        new Error("AUTHENTICATION_REQUIRED"),
      );

      const response = await GET_CROSS_FORM_SUBMISSIONS(
        new NextRequest("http://localhost/api/submissions?organizationId=org-synth-1"),
      );

      expect(response.status).toBe(401);
      const json = await response.json();
      expect(json.code).toBe("UNAUTHENTICATED");
    });

    it("returns 200 with cross-form submissions and handles optional formId", async () => {
      const mockResult = {
        submissions: [],
        totalCount: 0,
        page: 1,
        pageSize: 20,
        totalPages: 0,
      };

      mockService.listAuthenticatedSubmissions.mockResolvedValue(mockResult);

      const response = await GET_CROSS_FORM_SUBMISSIONS(
        new NextRequest(
          "http://localhost/api/submissions?organizationId=org-synth-1&formId=synth-form-2&page=1&pageSize=20",
        ),
      );

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json).toEqual(mockResult);

      expect(mockService.listAuthenticatedSubmissions).toHaveBeenCalledWith({
        userId: "session-user-123",
        organizationId: "org-synth-1",
        formId: "synth-form-2",
        status: undefined,
        referenceNumber: undefined,
        dateFrom: undefined,
        dateTo: undefined,
        page: 1,
        pageSize: 20,
        sortBy: undefined,
        sortOrder: undefined,
      });
    });
  });

  describe("GET /api/submissions/[submissionId]", () => {
    it("returns 400 when organizationId is missing", async () => {
      const response = await GET_SUBMISSION_DETAIL(
        new NextRequest("http://localhost/api/submissions/sub-synth-1"),
        { params: Promise.resolve({ submissionId: "sub-synth-1" }) },
      );

      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json).toEqual({
        error: "Organization ID is required.",
        code: "INVALID_REQUEST",
      });
      expect(mockService.getAuthenticatedSubmissionDetail).not.toHaveBeenCalled();
    });

    it("returns 401 when user is not authenticated", async () => {
      authenticatedSubmissionService.mockRejectedValue(
        new Error("AUTHENTICATION_REQUIRED"),
      );

      const response = await GET_SUBMISSION_DETAIL(
        new NextRequest(
          "http://localhost/api/submissions/sub-synth-1?organizationId=org-synth-1",
        ),
        { params: Promise.resolve({ submissionId: "sub-synth-1" }) },
      );

      expect(response.status).toBe(401);
      const json = await response.json();
      expect(json.code).toBe("UNAUTHENTICATED");
    });

    it("returns 403 when user is not authorized to view the submission", async () => {
      mockService.getAuthenticatedSubmissionDetail.mockRejectedValue(
        new Error(
          "Unauthorized: User is not authorized to view submissions submitted by other users.",
        ),
      );

      const response = await GET_SUBMISSION_DETAIL(
        new NextRequest(
          "http://localhost/api/submissions/sub-synth-1?organizationId=org-synth-1",
        ),
        { params: Promise.resolve({ submissionId: "sub-synth-1" }) },
      );

      expect(response.status).toBe(403);
      const json = await response.json();
      expect(json.code).toBe("FORBIDDEN");
      expect(json.error).toContain("Unauthorized");
    });

    it("returns 404 when submission is not found", async () => {
      mockService.getAuthenticatedSubmissionDetail.mockRejectedValue(
        new Error("Submission not found or inaccessible in organization org-synth-1"),
      );

      const response = await GET_SUBMISSION_DETAIL(
        new NextRequest(
          "http://localhost/api/submissions/sub-synth-missing?organizationId=org-synth-1",
        ),
        { params: Promise.resolve({ submissionId: "sub-synth-missing" }) },
      );

      expect(response.status).toBe(404);
      const json = await response.json();
      expect(json.code).toBe("NOT_FOUND");
      expect(json.error).toContain("Submission not found");
    });

    it("returns 200 with complete submission detail, form, version, detailRows, and rendererValue", async () => {
      const mockDetail = {
        submission: {
          id: "sub-synth-1",
          organization_id: "org-synth-1",
          form_id: "synth-form-1",
          form_version_id: "v-synth-1",
          reference_number: "REF-00100",
          status: "submitted",
          data_jsonb: {
            fields: { amount: 150 },
            notes: [{ id: "n1", text: "synthetic note" }],
            documents: [{ id: "d1", name: "invoice.pdf" }],
          },
          created_by: "session-user-123",
          submitted_by: "session-user-123",
          created_at: "2026-11-20T10:00:00Z",
          updated_at: "2026-11-20T10:00:00Z",
          submitted_at: "2026-11-20T10:00:00Z",
          completed_at: null,
        },
        form: {
          id: "synth-form-1",
          organization_id: "org-synth-1",
          key: "synth_form",
          title: "Synthetic Form",
          description: null,
          is_active: true,
          created_at: "2026-11-20T09:00:00Z",
          updated_at: "2026-11-20T09:00:00Z",
        },
        formVersion: {
          id: "v-synth-1",
          form_id: "synth-form-1",
          version_number: 1,
          schema_version: 1,
          schema_jsonb: { schemaVersion: 1 },
          status: "published",
          change_note: null,
          created_by: "session-user-123",
          created_at: "2026-11-20T09:00:00Z",
        },
        detailRows: [
          {
            id: "row-1",
            organization_id: "org-synth-1",
            submission_id: "sub-synth-1",
            tab_id: "items-tab",
            row_order: 1,
            data_jsonb: { item: "Widget", qty: 2 },
            created_by: "session-user-123",
            created_at: "2026-11-20T10:00:00Z",
            updated_at: "2026-11-20T10:00:00Z",
            deleted_at: null,
          },
        ],
        rendererValue: {
          fields: { amount: 150 },
          details: {
            "items-tab": [{ id: "row-1", values: { item: "Widget", qty: 2 } }],
          },
          notes: [{ id: "n1", text: "synthetic note" }],
          documents: [{ id: "d1", name: "invoice.pdf" }],
        },
      };

      mockService.getAuthenticatedSubmissionDetail.mockResolvedValue(mockDetail);

      const response = await GET_SUBMISSION_DETAIL(
        new NextRequest(
          "http://localhost/api/submissions/sub-synth-1?organizationId=org-synth-1",
        ),
        { params: Promise.resolve({ submissionId: "sub-synth-1" }) },
      );

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json).toEqual(mockDetail);

      expect(mockService.getAuthenticatedSubmissionDetail).toHaveBeenCalledWith({
        userId: "session-user-123",
        organizationId: "org-synth-1",
        submissionId: "sub-synth-1",
      });
    });
  });
});

