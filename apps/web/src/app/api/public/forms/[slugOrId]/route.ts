import { NextRequest, NextResponse } from "next/server";
import { publicFormService } from "@/lib/services/server-form-service";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ slugOrId: string }> },
) {
  try {
    const { slugOrId } = await context.params;
    if (!slugOrId) {
      return NextResponse.json(
        { error: "Missing form identifier" },
        { status: 400 },
      );
    }

    const service = publicFormService();
    const result = await service.getPublicPublishedForm(slugOrId);

    return NextResponse.json(result, {
      status: 200,
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch (error) {
    const raw = error instanceof Error ? error.message : "Form not found or private";
    const status = raw.includes("private") ? 403 : 404;
    return NextResponse.json(
      { error: "This form is private, unpublished, or does not exist." },
      { status },
    );
  }
}
