import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { authenticatedFormService } = vi.hoisted(() => ({
  authenticatedFormService: vi.fn(),
}));

vi.mock("@/lib/services/server-form-service", () => ({
  authenticatedFormService,
}));

import { GET, POST } from "../route";
import { GET as GET_DRAFT, PUT as PUT_DRAFT } from "../[formId]/draft/route";

describe("production form API identity and service boundary", () => {
  const service = {
    listForms: vi.fn(),
    createForm: vi.fn(),
    getEditableDraft: vi.fn(),
    saveDraft: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    authenticatedFormService.mockResolvedValue({
      service,
      userId: "session-user",
    });
  });

  it("lists forms for the requested tenant through the authorized service", async () => {
    service.listForms.mockResolvedValue([{ id: "form-a" }]);
    const response = await GET(
      new NextRequest("http://localhost/api/forms?organizationId=org-a"),
    );
    expect(response.status).toBe(200);
    expect(service.listForms).toHaveBeenCalledWith({
      userId: "session-user",
      organizationId: "org-a",
    });
  });

  it("ignores spoofed browser identity while creating and returns the real form", async () => {
    service.createForm.mockResolvedValue({
      form: { id: "form-a" },
      version: { id: "draft-a" },
    });
    const response = await POST(
      new NextRequest("http://localhost/api/forms", {
        method: "POST",
        body: JSON.stringify({
          organizationId: "org-a",
          title: "Inspection",
          userId: "spoofed-user",
        }),
      }),
    );
    expect(response.status).toBe(201);
    expect(service.createForm).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "session-user",
        organizationId: "org-a",
        title: "Inspection",
      }),
    );
    expect(service.createForm.mock.calls[0][0]).not.toHaveProperty(
      "userId",
      "spoofed-user",
    );
  });

  it("does not expose an inaccessible or cross-tenant draft", async () => {
    service.getEditableDraft.mockResolvedValue(null);
    const response = await GET_DRAFT(
      new NextRequest(
        "http://localhost/api/forms/form-b/draft?organizationId=org-a",
      ),
      { params: Promise.resolve({ formId: "form-b" }) },
    );
    expect(response.status).toBe(404);
    expect(service.getEditableDraft).toHaveBeenCalledWith({
      userId: "session-user",
      organizationId: "org-a",
      formId: "form-b",
    });
  });

  it("reports a failed draft persistence operation honestly", async () => {
    service.saveDraft.mockRejectedValue(new Error("Hosted write rejected"));
    const response = await PUT_DRAFT(
      new NextRequest("http://localhost/api/forms/form-a/draft", {
        method: "PUT",
        body: JSON.stringify({
          organizationId: "org-a",
          versionId: "draft-a",
          schema: { schemaVersion: 1 },
        }),
      }),
      { params: Promise.resolve({ formId: "form-a" }) },
    );
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "Hosted write rejected",
    });
  });
});
