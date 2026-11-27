import { NextRequest, NextResponse } from "next/server";
import { authenticatedApprovalService } from "@/lib/services/server-form-service";
import { approvalApiError } from "@/lib/forms/api-response";
import type { ApprovalDecisionValue } from "@/lib/repositories/approval-repository";

export async function handleApprovalDecisionRoute(
  request: NextRequest,
  context: { params: Promise<{ stageInstanceId: string }> },
  decision: ApprovalDecisionValue,
) {
  try {
    const { stageInstanceId } = await context.params;
    if (!stageInstanceId?.trim()) {
      return NextResponse.json(
        { error: "Stage instance ID is required.", code: "INVALID_REQUEST" },
        { status: 400 },
      );
    }

    let body: { organizationId?: unknown; comment?: unknown } = {};
    try {
      const raw = await request.text();
      if (raw.trim()) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") {
          body = parsed as { organizationId?: unknown; comment?: unknown };
        } else {
          return NextResponse.json(
            { error: "Request body must be a JSON object.", code: "INVALID_REQUEST" },
            { status: 400 },
          );
        }
      }
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON request body.", code: "INVALID_REQUEST" },
        { status: 400 },
      );
    }

    const queryOrgId = request.nextUrl.searchParams.get("organizationId")?.trim();
    const bodyOrgId =
      typeof body.organizationId === "string" ? body.organizationId.trim() : "";
    const organizationId = bodyOrgId || queryOrgId || "";

    if (!organizationId) {
      return NextResponse.json(
        { error: "Organization ID is required.", code: "INVALID_REQUEST" },
        { status: 400 },
      );
    }

    const comment =
      typeof body.comment === "string" ? body.comment : undefined;

    const { userId, service } = await authenticatedApprovalService();
    const result = await service.decideStage({
      userId,
      organizationId,
      stageInstanceId: stageInstanceId.trim(),
      decision,
      comment,
    });

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    return approvalApiError(error);
  }
}
