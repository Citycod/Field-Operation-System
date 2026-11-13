import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { publicFormService, publicSubmissionService } = vi.hoisted(() => ({
  publicFormService: vi.fn(),
  publicSubmissionService: vi.fn(),
}));

vi.mock("@/lib/services/server-form-service", () => ({
  publicFormService,
  publicSubmissionService,
}));

import { GET as GET_PUBLIC_FORM } from "../[slugOrId]/route";
import { POST as POST_PUBLIC_SUBMISSION } from "../[slugOrId]/submissions/route";

describe("public form API routes", () => {
  const formService = {
    getPublicPublishedForm: vi.fn(),
  };
  const submissionService = {
    submitPublicForm: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    publicFormService.mockReturnValue(formService);
    publicSubmissionService.mockReturnValue(submissionService);
  });

  it("GET /api/public/forms/[slugOrId] serves published public form with no-store cache header", async () => {
    formService.getPublicPublishedForm.mockResolvedValue({
      form: { id: "form_eqp_1", key: "equipment_inspection", title: "Equipment Inspection", is_public: true },
      publishedVersion: { id: "v1", version_number: 1, schema_version: 1, schema_jsonb: {} },
    });

    const response = await GET_PUBLIC_FORM(
      new NextRequest("http://localhost/api/public/forms/equipment-inspect-hq"),
      { params: Promise.resolve({ slugOrId: "equipment-inspect-hq" }) },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store, max-age=0");
    expect(formService.getPublicPublishedForm).toHaveBeenCalledWith("equipment-inspect-hq");
  });

  it("GET /api/public/forms/[slugOrId] returns 403 for private forms without leaking draft details", async () => {
    formService.getPublicPublishedForm.mockRejectedValue(
      new Error("This form is private and cannot be accessed publicly."),
    );

    const response = await GET_PUBLIC_FORM(
      new NextRequest("http://localhost/api/public/forms/equipment-inspect-hq"),
      { params: Promise.resolve({ slugOrId: "equipment-inspect-hq" }) },
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error).toBe("This form is private, unpublished, or does not exist.");
  });

  it("GET /api/public/forms/[slugOrId] returns 404 for invalid or unpublished forms", async () => {
    formService.getPublicPublishedForm.mockRejectedValue(
      new Error("Form not found or unavailable."),
    );

    const response = await GET_PUBLIC_FORM(
      new NextRequest("http://localhost/api/public/forms/nonexistent-slug"),
      { params: Promise.resolve({ slugOrId: "nonexistent-slug" }) },
    );

    expect(response.status).toBe(404);
  });

  it("POST /api/public/forms/[slugOrId]/submissions records valid submission (201)", async () => {
    submissionService.submitPublicForm.mockResolvedValue({
      submissionId: "sub_1",
      referenceNumber: "EQP-00001",
      status: "submitted",
      successTitle: "Thank You",
      successMessage: "Recorded.",
    });

    const response = await POST_PUBLIC_SUBMISSION(
      new NextRequest("http://localhost/api/public/forms/equipment-inspect-hq/submissions", {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": "198.51.100.10" },
        body: JSON.stringify({ fields: { inspector_name: "Jane" } }),
      }),
      { params: Promise.resolve({ slugOrId: "equipment-inspect-hq" }) },
    );

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.submissionId).toBe("sub_1");
  });

  it("POST /api/public/forms/[slugOrId]/submissions rejects oversized payload (413) and validation failures (422)", async () => {
    const oversizedResponse = await POST_PUBLIC_SUBMISSION(
      new NextRequest("http://localhost/api/public/forms/equipment-inspect-hq/submissions", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "content-length": String(2 * 1024 * 1024),
          "x-forwarded-for": "198.51.100.11",
        },
        body: JSON.stringify({ fields: {} }),
      }),
      { params: Promise.resolve({ slugOrId: "equipment-inspect-hq" }) },
    );
    expect(oversizedResponse.status).toBe(413);

    submissionService.submitPublicForm.mockRejectedValue(
      new Error('Submission validation failed: "Inspector Name" is required.'),
    );
    const validationResponse = await POST_PUBLIC_SUBMISSION(
      new NextRequest("http://localhost/api/public/forms/equipment-inspect-hq/submissions", {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": "198.51.100.12" },
        body: JSON.stringify({ fields: {} }),
      }),
      { params: Promise.resolve({ slugOrId: "equipment-inspect-hq" }) },
    );
    expect(validationResponse.status).toBe(422);
  });

  it("POST /api/public/forms/[slugOrId]/submissions enforces rate limit (429)", async () => {
    submissionService.submitPublicForm.mockResolvedValue({
      submissionId: "sub_rl",
      referenceNumber: "EQP-00002",
      status: "submitted",
      successTitle: "Thank You",
      successMessage: "Recorded.",
    });

    let lastStatus = 201;
    for (let i = 0; i < 21; i++) {
      const res = await POST_PUBLIC_SUBMISSION(
        new NextRequest("http://localhost/api/public/forms/equipment-inspect-hq/submissions", {
          method: "POST",
          headers: { "content-type": "application/json", "x-forwarded-for": "198.51.100.99" },
          body: JSON.stringify({ fields: { inspector_name: "Jane" } }),
        }),
        { params: Promise.resolve({ slugOrId: "equipment-inspect-hq" }) },
      );
      lastStatus = res.status;
    }

    expect(lastStatus).toBe(429);
  });
});

