import { NextRequest, NextResponse } from "next/server";
import { authenticatedFormService } from "@/lib/services/server-form-service";
import { formApiError } from "@/lib/forms/api-response";

type Context = { params: Promise<{ formId: string }> };

export async function GET(request: NextRequest, context: Context) {
  try {
    const organizationId = request.nextUrl.searchParams.get("organizationId");
    if (!organizationId) {
      return NextResponse.json(
        { error: "Organization is required.", code: "INVALID_REQUEST" },
        { status: 400 },
      );
    }

    const { formId } = await context.params;
    const { service, userId } = await authenticatedFormService();

    const versions = await service.listVersions({
      userId,
      organizationId,
      formId,
    });

    return NextResponse.json({ versions });
  } catch (error) {
    return formApiError(error);
  }
}
