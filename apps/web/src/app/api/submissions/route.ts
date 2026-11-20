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

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const organizationId = searchParams.get("organizationId")?.trim();
    if (!organizationId) {
      return NextResponse.json(
        { error: "Organization ID is required.", code: "INVALID_REQUEST" },
        { status: 400 },
      );
    }

    const formId = searchParams.get("formId")?.trim() || undefined;
    const status = searchParams.get("status")?.trim() || undefined;
    const referenceNumber =
      searchParams.get("referenceNumber")?.trim() || undefined;
    const dateFrom = searchParams.get("dateFrom")?.trim() || undefined;
    const dateTo = searchParams.get("dateTo")?.trim() || undefined;

    const rawPage = searchParams.get("page");
    const page =
      rawPage && !Number.isNaN(Number(rawPage))
        ? Math.max(1, parseInt(rawPage, 10))
        : undefined;

    const rawPageSize = searchParams.get("pageSize");
    const pageSize =
      rawPageSize && !Number.isNaN(Number(rawPageSize))
        ? Math.max(1, Math.min(100, parseInt(rawPageSize, 10)))
        : undefined;

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
    const result = await service.listAuthenticatedSubmissions({
      userId,
      organizationId,
      formId,
      status,
      referenceNumber,
      dateFrom,
      dateTo,
      page,
      pageSize,
      sortBy,
      sortOrder,
    });

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    return submissionApiError(error);
  }
}

