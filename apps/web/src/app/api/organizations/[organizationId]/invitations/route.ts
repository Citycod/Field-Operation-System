import { NextRequest, NextResponse } from "next/server";
import { authenticatedInvitationService } from "@/lib/services/server-organization-service";
import { invitationApiError } from "@/lib/forms/api-response";
import type { CreateInvitationInput } from "@field/types";

type Context = { params: Promise<{ organizationId: string }> };

export async function GET(_request: NextRequest, context: Context) {
  try {
    const { organizationId } = await context.params;
    if (!organizationId) {
      return NextResponse.json(
        { error: "Organization ID is required.", code: "INVALID_REQUEST" },
        { status: 400 },
      );
    }

    const { service, userId } = await authenticatedInvitationService();
    const invitations = await service.listInvitations(userId, organizationId);
    return NextResponse.json({ invitations });
  } catch (error) {
    return invitationApiError(error);
  }
}

export async function POST(request: NextRequest, context: Context) {
  try {
    const { organizationId } = await context.params;
    if (!organizationId) {
      return NextResponse.json(
        { error: "Organization ID is required.", code: "INVALID_REQUEST" },
        { status: 400 },
      );
    }

    const body = (await request.json()) as CreateInvitationInput;
    if (!body || !body.email || !body.role) {
      return NextResponse.json(
        { error: "Email and role are required.", code: "INVALID_REQUEST" },
        { status: 400 },
      );
    }

    const { service, userId } = await authenticatedInvitationService();
    const result = await service.createInvitation(userId, organizationId, body);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return invitationApiError(error);
  }
}

