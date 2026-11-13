import { NextRequest, NextResponse } from "next/server";
import { authenticatedInvitationService } from "@/lib/services/server-organization-service";
import { invitationApiError } from "@/lib/forms/api-response";

type Context = { params: Promise<{ organizationId: string; invitationId: string }> };

export async function POST(_request: NextRequest, context: Context) {
  try {
    const { organizationId, invitationId } = await context.params;
    if (!organizationId || !invitationId) {
      return NextResponse.json(
        { error: "Organization ID and Invitation ID are required.", code: "INVALID_REQUEST" },
        { status: 400 },
      );
    }

    const { service, userId } = await authenticatedInvitationService();
    const result = await service.resendInvitation(userId, organizationId, invitationId);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return invitationApiError(error);
  }
}

