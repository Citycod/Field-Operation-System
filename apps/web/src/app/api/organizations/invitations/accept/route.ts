import { NextRequest, NextResponse } from "next/server";
import { authenticatedInvitationService } from "@/lib/services/server-organization-service";
import { invitationApiError } from "@/lib/forms/api-response";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const token = body?.token;
    if (!token || typeof token !== "string") {
      return NextResponse.json(
        { error: "Invitation token is required.", code: "INVALID_REQUEST" },
        { status: 400 },
      );
    }

    const { service, userId } = await authenticatedInvitationService();
    const result = await service.acceptInvitation(userId, token);
    return NextResponse.json(result);
  } catch (error) {
    return invitationApiError(error);
  }
}

