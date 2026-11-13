import { NextRequest, NextResponse } from "next/server";
import { authenticatedOrganizationService } from "@/lib/services/server-organization-service";
import { organizationApiError } from "@/lib/forms/api-response";
import type { CreateWorkspaceInput } from "@field/types";

export async function GET() {
  try {
    const { service, userId } = await authenticatedOrganizationService();
    const organizations = await service.listUserOrganizations(userId);
    return NextResponse.json({ organizations });
  } catch (error) {
    return organizationApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as CreateWorkspaceInput;
    if (!body || !body.name || !body.name.trim()) {
      return NextResponse.json(
        { error: "Business name is required.", code: "INVALID_REQUEST" },
        { status: 400 },
      );
    }

    const { service, userId } = await authenticatedOrganizationService();
    const result = await service.createWorkspace(userId, {
      name: body.name.trim(),
      slug: body.slug?.trim() || undefined,
      profile: body.profile,
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return organizationApiError(error);
  }
}

