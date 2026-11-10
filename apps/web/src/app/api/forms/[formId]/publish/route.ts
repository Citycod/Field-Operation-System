import { NextRequest, NextResponse } from "next/server";
import { authenticatedFormService } from "@/lib/services/server-form-service";
import { formApiError } from "@/lib/forms/api-response";

type Context = { params: Promise<{ formId: string }> };

export async function POST(request: NextRequest, context: Context) {
  try {
    const body = (await request.json()) as {
      organizationId?: string;
      versionId?: string;
      changeNote?: string;
    };

    if (!body.organizationId || !body.versionId) {
      return NextResponse.json(
        {
          error: "Organization ID and Version ID are required.",
          code: "INVALID_REQUEST",
        },
        { status: 400 },
      );
    }

    const { formId } = await context.params;
    const { service, userId } = await authenticatedFormService();

    await service.publishForm({
      userId,
      organizationId: body.organizationId,
      formId,
      versionId: body.versionId,
      changeNote: body.changeNote?.trim() || undefined,
    });

    return NextResponse.json({
      success: true,
      formId,
      versionId: body.versionId,
    });
  } catch (error) {
    return formApiError(error);
  }
}
