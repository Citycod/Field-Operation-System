import { NextRequest, NextResponse } from "next/server";
import { authenticatedSubmissionService } from "@/lib/services/server-form-service";
import { submissionApiError } from "@/lib/forms/api-response";

export async function GET(
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

    const { searchParams } = request.nextUrl;
    const organizationId = searchParams.get("organizationId")?.trim();
    if (!organizationId) {
      return NextResponse.json(
        { error: "Organization ID is required.", code: "INVALID_REQUEST" },
        { status: 400 },
      );
    }

    const { userId, service } = await authenticatedSubmissionService();
    const result = await service.getAuthenticatedSubmissionDetail({
      userId,
      organizationId,
      submissionId: submissionId.trim(),
    });

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    return submissionApiError(error);
  }
}

