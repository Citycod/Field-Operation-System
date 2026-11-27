import { NextRequest, NextResponse } from "next/server";
import { authenticatedSubmissionService } from "@/lib/services/server-form-service";
import { submissionApiError } from "@/lib/forms/api-response";
import type {
  SubmissionSortField,
  SubmissionSortOrder,
} from "@/lib/repositories/submission-repository";

const VALID_SORT_FIELDS: SubmissionSortField[] = [
  "created_at",
  "submitted_at",
  "reference_number",
  "status",
];

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ formId: string }> },
) {
  try {
    const { formId } = await context.params;
    if (!formId?.trim()) {
      return NextResponse.json(
        { error: "Form ID is required.", code: "INVALID_REQUEST" },
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

    const status = searchParams.get("status")?.trim() || undefined;
    const referenceNumber =
      searchParams.get("referenceNumber")?.trim() || undefined;
    const dateFrom = searchParams.get("dateFrom")?.trim() || undefined;
    const dateTo = searchParams.get("dateTo")?.trim() || undefined;

    const rawSortBy = searchParams.get("sortBy")?.trim();
    const sortBy =
      rawSortBy && (VALID_SORT_FIELDS as string[]).includes(rawSortBy)
        ? (rawSortBy as SubmissionSortField)
        : undefined;

    const rawSortOrder = searchParams.get("sortOrder")?.trim()?.toLowerCase();
    const sortOrder: SubmissionSortOrder | undefined =
      rawSortOrder === "asc" || rawSortOrder === "desc"
        ? rawSortOrder
        : undefined;

    const { userId, service } = await authenticatedSubmissionService();
    const { csv, fileName } = await service.exportSubmissionsCsv({
      userId,
      organizationId,
      formId: formId.trim(),
      status,
      referenceNumber,
      dateFrom,
      dateTo,
      sortBy,
      sortOrder,
    });

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch (error) {
    return submissionApiError(error);
  }
}
