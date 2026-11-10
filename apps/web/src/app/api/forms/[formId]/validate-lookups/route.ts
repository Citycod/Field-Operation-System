import { NextRequest, NextResponse } from "next/server";
import type { FormSchemaV1 } from "@field/form-engine";
import { authenticatedFormService } from "@/lib/services/server-form-service";
import { authenticatedDataSourceService } from "@/lib/services/server-data-source-service";
import { dataSourceApiError } from "@/lib/forms/api-response";
import type { SubmissionLookupPayload } from "@/lib/services/data-source-service";

type Context = { params: Promise<{ formId: string }> };

export async function POST(request: NextRequest, context: Context) {
  try {
    const body = (await request.json()) as {
      organizationId?: string;
      payload?: SubmissionLookupPayload;
    };
    const organizationId = body.organizationId?.trim();
    if (!organizationId || !body.payload || typeof body.payload !== "object") {
      return NextResponse.json(
        {
          error: "Organization and submission payload are required.",
          code: "INVALID_REQUEST",
        },
        { status: 400 },
      );
    }
    const { formId } = await context.params;
    const { service: formService, userId } = await authenticatedFormService();
    const draftContext = await formService.getEditableDraft({
      userId,
      organizationId,
      formId,
    });
    if (!draftContext) {
      return NextResponse.json(
        { error: "Form is unavailable.", code: "NOT_FOUND" },
        { status: 404 },
      );
    }

    const activeVersion = draftContext.draft;
    if (!activeVersion) {
      return NextResponse.json(
        {
          error: "No form version is available for lookup validation.",
          code: "NOT_FOUND",
        },
        { status: 404 },
      );
    }

    const { service: dataSourceService } =
      await authenticatedDataSourceService();
    const validation = await dataSourceService.validateSubmissionLookups({
      userId,
      organizationId,
      schema: activeVersion.schema_jsonb as FormSchemaV1,
      payload: body.payload,
    });

    if (!validation.valid) {
      return NextResponse.json(
        {
          valid: false,
          errors: validation.errors,
          code: "LOOKUP_VALIDATION_FAILED",
        },
        { status: 422 },
      );
    }

    return NextResponse.json({ valid: true, errors: [] });
  } catch (error) {
    return dataSourceApiError(error);
  }
}
