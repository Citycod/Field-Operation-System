import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { authenticatedFormService, authenticatedSubmissionService } =
  vi.hoisted(() => ({
    authenticatedFormService: vi.fn(),
    authenticatedSubmissionService: vi.fn(),
  }));

vi.mock("@/lib/services/server-form-service", () => ({
  authenticatedFormService,
  authenticatedSubmissionService,
}));

import { POST as POST_IMPORT_FORM } from "../import/route";
import { GET as GET_EXPORT_VERSION } from "../[formId]/versions/[versionId]/export/route";
import { GET as GET_EXPORT_CSV } from "../[formId]/submissions/export.csv/route";

describe("Phase 8 Import / Export / CSV API Routes", () => {
  const mockFormService = {
    importFormDefinition: vi.fn(),
    exportFormVersion: vi.fn(),
  };
  const mockSubmissionService = {
    exportSubmissionsCsv: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    authenticatedFormService.mockResolvedValue({
      userId: "user-admin-1",
      service: mockFormService,
    });
    authenticatedSubmissionService.mockResolvedValue({
      userId: "user-admin-1",
      service: mockSubmissionService,
    });
  });

  it("POST /api/forms/import creates draft (201) and rejects oversized or malformed payloads", async () => {
    mockFormService.importFormDefinition.mockResolvedValue({
      form: { id: "form-new-1", key: "imported_1", title: "Imported Form" },
      version: { id: "ver-1", version_number: 1, status: "draft" },
    });

    const okRes = await POST_IMPORT_FORM(
      new NextRequest("http://localhost/api/forms/import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          organizationId: "org-1",
          definition: { schemaVersion: 1, form: { id: "x", key: "k", title: "Imported Form" } },
        }),
      }),
    );
    expect(okRes.status).toBe(201);

    const malformedRes = await POST_IMPORT_FORM(
      new NextRequest("http://localhost/api/forms/import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{bad json",
      }),
    );
    expect(malformedRes.status).toBe(400);

    const oversizedRes = await POST_IMPORT_FORM(
      new NextRequest("http://localhost/api/forms/import", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "content-length": String(2 * 1024 * 1024),
        },
        body: "{}",
      }),
    );
    expect(oversizedRes.status).toBe(413);
  });

  it("GET /api/forms/[formId]/versions/[versionId]/export returns attachment JSON", async () => {
    mockFormService.exportFormVersion.mockResolvedValue({
      fileName: "expense_v1.form.json",
      envelope: {
        exportFormatVersion: 1,
        exportedAt: "2026-11-27T05:00:00Z",
        form: { key: "expense", title: "Expense", description: null },
        version: { versionNumber: 1, schemaVersion: 1, status: "published" },
        schema: { schemaVersion: 1 },
      },
    });

    const res = await GET_EXPORT_VERSION(
      new NextRequest(
        "http://localhost/api/forms/form-1/versions/ver-1/export?organizationId=org-1",
      ),
      { params: Promise.resolve({ formId: "form-1", versionId: "ver-1" }) },
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toContain("expense_v1.form.json");
    expect(res.headers.get("content-type")).toContain("application/json");
  });

  it("GET /api/forms/[formId]/submissions/export.csv returns CSV attachment", async () => {
    mockSubmissionService.exportSubmissionsCsv.mockResolvedValue({
      csv: "Reference #,Status\r\nREF-001,approved",
      fileName: "expense_submissions.csv",
      rowCount: 1,
    });

    const res = await GET_EXPORT_CSV(
      new NextRequest(
        "http://localhost/api/forms/form-1/submissions/export.csv?organizationId=org-1&status=approved",
      ),
      { params: Promise.resolve({ formId: "form-1" }) },
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/csv");
    expect(res.headers.get("content-disposition")).toContain("expense_submissions.csv");
    expect(await res.text()).toContain("REF-001,approved");
  });
});
