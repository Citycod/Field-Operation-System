import { NextRequest, NextResponse } from "next/server";
import { authenticatedSubmissionService } from "@/lib/services/server-form-service";
import { submissionApiError } from "@/lib/forms/api-response";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ submissionId: string }> },
) {
  try {
    const { submissionId } = await context.params;
    if (!submissionId?.trim()) {
      return NextResponse.json(
        { error: "Submission ID is required.", code: "INVALID_REQUEST" },
        { status: 400 },
      );
    }

    let body: {
      organizationId?: unknown;
      fields?: Record<string, unknown>;
      details?: Record<string, Array<{ id: string; values: Record<string, unknown> }>>;
      notes?: unknown[];
      documents?: unknown[];
    } | null = null;

    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON submission payload.", code: "INVALID_REQUEST" },
        { status: 400 },
      );
    }

    const queryOrgId = request.nextUrl.searchParams.get("organizationId")?.trim();
    const bodyOrgId =
      body && typeof body.organizationId === "string"
        ? body.organizationId.trim()
        : "";
    const organizationId = bodyOrgId || queryOrgId || "";

    if (!organizationId) {
      return NextResponse.json(
        { error: "Organization ID is required.", code: "INVALID_REQUEST" },
        { status: 400 },
      );
    }

    const { userId, service } = await authenticatedSubmissionService();
    const result = await service.resubmitSubmission({
      userId,
      organizationId,
      submissionId: submissionId.trim(),
      payload: {
        fields: body?.fields && typeof body.fields === "object" ? body.fields : {},
        details: body?.details,
        notes: body?.notes,
        documents: body?.documents,
      },
    });

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    return submissionApiError(error);
  }
}
