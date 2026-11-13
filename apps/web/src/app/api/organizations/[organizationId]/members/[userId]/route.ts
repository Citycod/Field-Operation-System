import { NextRequest, NextResponse } from "next/server";
import { authenticatedOrganizationService } from "@/lib/services/server-organization-service";
import { tenantManagementApiError } from "@/lib/forms/api-response";
import type { PlatformRole } from "@field/types";

type Context = { params: Promise<{ organizationId: string; userId: string }> };

export async function PATCH(request: NextRequest, context: Context) {
  try {
    const { organizationId, userId: targetUserId } = await context.params;
    if (!organizationId || !targetUserId) {
      return NextResponse.json(
        { error: "Organization ID and Target User ID are required.", code: "INVALID_REQUEST" },
        { status: 400 },
      );
    }

    const body = await request.json();
    const role = body?.role as PlatformRole | undefined;

    if (!role || !['super_admin', 'business_admin', 'manager', 'employee'].includes(role)) {
      return NextResponse.json(
        { error: "Valid role is required (super_admin, business_admin, manager, employee).", code: "INVALID_ROLE" },
        { status: 400 },
      );
    }

    const { service, userId: callerId } = await authenticatedOrganizationService();
    const result = await service.manageMembership(callerId, organizationId, {
      target_user_id: targetUserId,
      action: 'update_role',
      new_role: role,
    });

    return NextResponse.json(result);
  } catch (error) {
    return tenantManagementApiError(error);
  }
}

export async function DELETE(_request: NextRequest, context: Context) {
  try {
    const { organizationId, userId: targetUserId } = await context.params;
    if (!organizationId || !targetUserId) {
      return NextResponse.json(
        { error: "Organization ID and Target User ID are required.", code: "INVALID_REQUEST" },
        { status: 400 },
      );
    }

    const { service, userId: callerId } = await authenticatedOrganizationService();
    const result = await service.manageMembership(callerId, organizationId, {
      target_user_id: targetUserId,
      action: 'remove',
    });

    return NextResponse.json(result);
  } catch (error) {
    return tenantManagementApiError(error);
  }
}

