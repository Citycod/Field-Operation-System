import { NextRequest, NextResponse } from "next/server";
import { authenticatedFormService } from "@/lib/services/server-form-service";
import { formApiError } from "@/lib/forms/api-response";

function formKey(title: string) {
  const base =
    title
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "") || "form";
  return `${base}_${crypto.randomUUID().slice(0, 8)}`;
}

export async function GET(request: NextRequest) {
  try {
    const organizationId = request.nextUrl.searchParams.get("organizationId");
    if (!organizationId)
      return NextResponse.json(
        { error: "Organization is required.", code: "INVALID_REQUEST" },
        { status: 400 },
      );
    const { service, userId } = await authenticatedFormService();
    const forms = await service.listForms({ userId, organizationId });
    return NextResponse.json({ forms });
  } catch (error) {
    return formApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      organizationId?: string;
      title?: string;
      description?: string;
    };
    const organizationId = body.organizationId?.trim();
    const title = body.title?.trim();
    if (!organizationId || !title)
      return NextResponse.json(
        {
          error: "Organization and title are required.",
          code: "INVALID_REQUEST",
        },
        { status: 400 },
      );
    const { service, userId } = await authenticatedFormService();
    const created = await service.createForm({
      userId,
      organizationId,
      key: formKey(title),
      title,
      description: body.description?.trim() || undefined,
    });
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    return formApiError(error);
  }
}
