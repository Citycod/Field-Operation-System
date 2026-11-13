import { NextRequest, NextResponse } from "next/server";
import { authenticatedOrganizationService } from "@/lib/services/server-organization-service";
import { organizationApiError } from "@/lib/forms/api-response";
import type { UpdateOrganizationProfileInput } from "@field/types";

type Context = { params: Promise<{ organizationId: string }> };

export async function PATCH(request: NextRequest, context: Context) {
  try {
    const { organizationId } = await context.params;
    if (!organizationId) {
      return NextResponse.json(
        { error: "Organization ID is required.", code: "INVALID_REQUEST" },
        { status: 400 },
      );
    }

    const body = (await request.json()) as UpdateOrganizationProfileInput;
    const { service, userId } = await authenticatedOrganizationService();
    const updatedProfile = await service.updateOrganizationProfile(
      userId,
      organizationId,
      body,
    );

    return NextResponse.json({ profile: updatedProfile });
  } catch (error) {
    return organizationApiError(error);
  }
}

