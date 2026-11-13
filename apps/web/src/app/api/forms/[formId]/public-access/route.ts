import { NextRequest, NextResponse } from "next/server";
import { authenticatedFormService } from "@/lib/services/server-form-service";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ formId: string }> },
) {
  try {
    const { formId } = await context.params;
    const body = await request.json();
    const { organizationId, isPublic, publicSlug } = body || {};

    if (!organizationId) {
      return NextResponse.json(
        { error: "Missing required field: organizationId" },
        { status: 400 },
      );
    }
    if (typeof isPublic !== "boolean") {
      return NextResponse.json(
        { error: "isPublic must be a boolean" },
        { status: 400 },
      );
    }

    const { userId, service } = await authenticatedFormService();
    const updatedForm = await service.setPublicAccess({
      userId,
      organizationId,
      formId,
      isPublic,
      publicSlug: typeof publicSlug === "string" ? publicSlug : undefined,
    });

    return NextResponse.json({ form: updatedForm }, { status: 200 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to update public access";
    if (message === "AUTHENTICATION_REQUIRED") {
      return NextResponse.json(
        { error: "Sign in is required.", code: "UNAUTHENTICATED" },
        { status: 401 },
      );
    }
    if (message.includes("Unauthorized")) {
      return NextResponse.json({ error: message }, { status: 403 });
    }
    if (message.includes("not found")) {
      return NextResponse.json({ error: "Form not found." }, { status: 404 });
    }
    if (
      message.includes("duplicate") ||
      message.includes("idx_forms_public_slug") ||
      message.includes("23505") ||
      message.includes("unique")
    ) {
      return NextResponse.json(
        { error: "That public URL slug is already in use. Please choose another." },
        { status: 409 },
      );
    }
    if (
      error instanceof SyntaxError ||
      message.includes("Cannot enable") ||
      message.includes("Public slug")
    ) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    return NextResponse.json(
      { error: "Failed to update public access settings." },
      { status: 500 },
    );
  }
}

