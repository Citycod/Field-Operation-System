import { NextRequest } from "next/server";
import { handleApprovalDecisionRoute } from "@/lib/forms/approval-route-handler";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ stageInstanceId: string }> },
) {
  return handleApprovalDecisionRoute(request, context, "returned");
}
