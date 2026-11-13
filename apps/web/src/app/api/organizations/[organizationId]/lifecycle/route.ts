import { NextRequest, NextResponse } from "next/server";
import { authenticatedOrganizationService } from "@/lib/services/server-organization-service";
import { tenantManagementApiError } from "@/lib/forms/api-response";

type Context = { params: Promise<{ organizationId: string }> };

export async function POST(request: NextRequest, context: Context) {
  try {
    const { organizationId } = await context.params;
    if (!organizationId) {
      return NextResponse.json(
        { error: "Organization ID is required.", code: "INVALID_REQUEST" },
        { status: 400 },
      );
    }

    const body = await request.json();
    const action = body?.action as 'suspend' | 'archive' | 'reactivate' | undefined;
    const reason = body?.reason as string | undefined;

    if (!action || !['suspend', 'archive', 'reactivate'].includes(action)) {
      return NextResponse.json(
        { error: "Action must be suspend, archive, or reactivate.", code: "INVALID_ACTION" },
        { status: 400 },
      );
    }

    const { service, userId } = await authenticatedOrganizationService();

    if (action === 'reactivate') {
      const result = await service.reactivateVoluntarySuspension(userId, organizationId);
      return NextResponse.json(result);
    }

    const result = await service.manageLifecycle(userId, organizationId, {
      new_status: action === 'suspend' ? 'suspended' : 'archived',
      reason,
    });

    return NextResponse.json(result);
  } catch (error) {
    return tenantManagementApiError(error);
  }
}

