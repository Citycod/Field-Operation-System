import { NextRequest, NextResponse } from "next/server";
import { publicInvitationService } from "@/lib/services/server-organization-service";
import { invitationApiError } from "@/lib/forms/api-response";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const token = body?.token || body?.token_hash;
    if (!token || typeof token !== "string") {
      return NextResponse.json(
        { error: "Invitation token is required.", code: "INVALID_REQUEST" },
        { status: 400 },
      );
    }

    const service = await publicInvitationService();
    const preview = await service.getPreview(token);
    return NextResponse.json({ preview });
  } catch (error) {
    return invitationApiError(error);
  }
}

