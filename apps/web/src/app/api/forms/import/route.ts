import { NextRequest, NextResponse } from "next/server";
import { authenticatedFormService } from "@/lib/services/server-form-service";
import { formApiError } from "@/lib/forms/api-response";
import { MAX_FORM_IMPORT_BYTES } from "@/lib/forms/portability";

export async function POST(request: NextRequest) {
  try {
    const contentLength = request.headers.get("content-length");
    if (contentLength && parseInt(contentLength, 10) > MAX_FORM_IMPORT_BYTES) {
      return NextResponse.json(
        { error: "Import payload exceeds 1MB limit.", code: "PAYLOAD_TOO_LARGE" },
        { status: 413 },
      );
    }

    const contentType = request.headers.get("content-type") || "";
    let organizationId =
      request.nextUrl.searchParams.get("organizationId")?.trim() || "";
    let title: string | undefined;
    let description: string | undefined;
    let rawPayload: unknown;

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const orgField = formData.get("organizationId");
      if (typeof orgField === "string" && orgField.trim()) {
        organizationId = orgField.trim();
      }
      const titleField = formData.get("title");
      if (typeof titleField === "string" && titleField.trim()) {
        title = titleField.trim();
      }
      const descField = formData.get("description");
      if (typeof descField === "string") {
        description = descField;
      }
      const file = formData.get("file");
      if (file instanceof File) {
        if (file.size > MAX_FORM_IMPORT_BYTES) {
          return NextResponse.json(
            { error: "Import file exceeds 1MB limit.", code: "PAYLOAD_TOO_LARGE" },
            { status: 413 },
          );
        }
        rawPayload = await file.text();
      } else {
        const defField = formData.get("definition");
        rawPayload = typeof defField === "string" ? defField : null;
      }
    } else {
      const rawText = await request.text();
      if (Buffer.byteLength(rawText, "utf8") > MAX_FORM_IMPORT_BYTES) {
        return NextResponse.json(
          { error: "Import payload exceeds 1MB limit.", code: "PAYLOAD_TOO_LARGE" },
          { status: 413 },
        );
      }

      let parsedBody: Record<string, unknown>;
      try {
        const parsed = rawText ? JSON.parse(rawText) : null;
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          return NextResponse.json(
            { error: "Request body must be a JSON object.", code: "INVALID_REQUEST" },
            { status: 400 },
          );
        }
        parsedBody = parsed as Record<string, unknown>;
      } catch {
        return NextResponse.json(
          { error: "Malformed JSON request body.", code: "MALFORMED_JSON" },
          { status: 400 },
        );
      }

      if (typeof parsedBody.organizationId === "string" && parsedBody.organizationId.trim()) {
        organizationId = parsedBody.organizationId.trim();
      }
      if (typeof parsedBody.title === "string" && parsedBody.title.trim()) {
        title = parsedBody.title.trim();
      }
      if (typeof parsedBody.description === "string") {
        description = parsedBody.description;
      }

      rawPayload =
        "definition" in parsedBody
          ? parsedBody.definition
          : "schema" in parsedBody
            ? parsedBody
            : null;
    }

    if (!organizationId) {
      return NextResponse.json(
        { error: "Organization ID is required.", code: "INVALID_REQUEST" },
        { status: 400 },
      );
    }

    if (rawPayload === null || rawPayload === undefined) {
      return NextResponse.json(
        { error: "Form definition JSON is required.", code: "INVALID_REQUEST" },
        { status: 400 },
      );
    }

    const { userId, service } = await authenticatedFormService();
    const result = await service.importFormDefinition({
      userId,
      organizationId,
      rawPayload,
      title,
      description,
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return formApiError(error);
  }
}
