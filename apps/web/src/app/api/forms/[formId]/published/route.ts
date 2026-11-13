import { NextRequest, NextResponse } from "next/server";
import { authenticatedFormService } from "@/lib/services/server-form-service";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ formId: string }> },
) {
  try {
    const { formId } = await context.params;
    const { searchParams } = new URL(request.url);
    const organizationId = searchParams.get("organizationId");

    if (!organizationId) {
      return NextResponse.json(
        { error: "Missing required query parameter: organizationId" },
        { status: 400 },
      );
    }

    const { userId, service } = await authenticatedFormService();
    const result = await service.getPublishedVersionForPreview({
      userId,
      organizationId,
      formId,
    });

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to load published form";
    if (message === "AUTHENTICATION_REQUIRED") {
      return NextResponse.json(
        { error: "Sign in is required.", code: "UNAUTHENTICATED" },
        { status: 401 },
      );
    }
    if (message.includes("Unauthorized")) {
      return NextResponse.json({ error: message }, { status: 403 });
    }
    if (
      message.includes("not found") ||
      message.includes("does not have an active published version")
    ) {
      return NextResponse.json({ error: message }, { status: 404 });
    }
    return NextResponse.json(
      { error: "Unable to load published form." },
      { status: 500 },
    );
  }
}

