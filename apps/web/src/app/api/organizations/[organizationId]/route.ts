import { NextRequest, NextResponse } from "next/server";
import { authenticatedOrganizationService } from "@/lib/services/server-organization-service";
import { organizationApiError } from "@/lib/forms/api-response";

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

    const { service, userId } = await authenticatedOrganizationService();
    const result = await service.getOrganization(userId, organizationId);
    return NextResponse.json(result);
  } catch (error) {
    return organizationApiError(error);
  }
}

