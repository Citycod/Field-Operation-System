import { NextRequest, NextResponse } from "next/server";
import type { FormSchemaV1 } from "@field/form-engine";
import { authenticatedFormService } from "@/lib/services/server-form-service";
import { formApiError } from "@/lib/forms/api-response";

type Context = { params: Promise<{ formId: string }> };

export async function GET(request: NextRequest, context: Context) {
  try {
    const organizationId = request.nextUrl.searchParams.get("organizationId");
    if (!organizationId)
      return NextResponse.json(
        { error: "Organization is required.", code: "INVALID_REQUEST" },
        { status: 400 },
      );
    const { formId } = await context.params;
    const { service, userId } = await authenticatedFormService();
    const result = await service.getEditableDraft({
      userId,
      organizationId,
      formId,
    });
    if (!result)
      return NextResponse.json(
        { error: "Form is unavailable.", code: "NOT_FOUND" },
        { status: 404 },
      );
    return NextResponse.json(result);
  } catch (error) {
    return formApiError(error);
  }
}

export async function PUT(request: NextRequest, context: Context) {
  try {
    const body = (await request.json()) as {
      organizationId?: string;
      versionId?: string;
      schema?: unknown;
    };
    if (!body.organizationId || !body.versionId || !body.schema)
      return NextResponse.json(
        {
          error: "Organization, version, and schema are required.",
          code: "INVALID_REQUEST",
        },
        { status: 400 },
      );
    const { formId } = await context.params;
    const { service, userId } = await authenticatedFormService();
    const version = await service.saveDraft({
      userId,
      organizationId: body.organizationId,
      formId,
      versionId: body.versionId,
      schema: body.schema as FormSchemaV1,
    });
    return NextResponse.json({ version });
  } catch (error) {
    return formApiError(error);
  }
}

export async function POST(request: NextRequest, context: Context) {
  try {
    const body = (await request.json()) as { organizationId?: string };
    if (!body.organizationId)
      return NextResponse.json(
        { error: "Organization is required.", code: "INVALID_REQUEST" },
        { status: 400 },
      );
    const { formId } = await context.params;
    const { service, userId } = await authenticatedFormService();
    const draft = await service.createDraftFromPublished({
      userId,
      organizationId: body.organizationId,
      formId,
    });
    return NextResponse.json({ draft }, { status: 201 });
  } catch (error) {
    return formApiError(error);
  }
}
