import { NextRequest, NextResponse } from "next/server";
import { authenticatedApprovalService } from "@/lib/services/server-form-service";
import { approvalApiError } from "@/lib/forms/api-response";

export async function GET(request: NextRequest) {
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

    const { userId, service } = await authenticatedApprovalService();
    const tasks = await service.listMyPendingApprovals({
      userId,
      organizationId,
    });

    return NextResponse.json({ tasks }, { status: 200 });
  } catch (error) {
    return approvalApiError(error);
  }
}
