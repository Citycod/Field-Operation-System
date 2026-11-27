import { NextRequest, NextResponse } from "next/server";
import { authenticatedFormService } from "@/lib/services/server-form-service";
import { formApiError } from "@/lib/forms/api-response";

type Context = { params: Promise<{ formId: string; versionId: string }> };

export async function GET(request: NextRequest, context: Context) {
  try {
    const organizationId = request.nextUrl.searchParams
      .get("organizationId")
      ?.trim();
    if (!organizationId) {
      return NextResponse.json(
        { error: "Organization ID is required.", code: "INVALID_REQUEST" },
        { status: 400 },
      );
    }

    const { formId, versionId } = await context.params;
    if (!formId?.trim() || !versionId?.trim()) {
      return NextResponse.json(
        { error: "Form ID and Version ID are required.", code: "INVALID_REQUEST" },
        { status: 400 },
      );
    }

    const { userId, service } = await authenticatedFormService();
    const { fileName, envelope } = await service.exportFormVersion({
      userId,
      organizationId,
      formId: formId.trim(),
      versionId: versionId.trim(),
    });

    return new NextResponse(JSON.stringify(envelope, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch (error) {
    return formApiError(error);
  }
}
