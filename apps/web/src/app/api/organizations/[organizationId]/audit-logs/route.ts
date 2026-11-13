import { NextRequest, NextResponse } from "next/server";
import { authenticatedAuditLogService } from "@/lib/services/server-organization-service";
import { tenantManagementApiError } from "@/lib/forms/api-response";

type Context = { params: Promise<{ organizationId: string }> };

export async function GET(request: NextRequest, context: Context) {
  try {
    const { organizationId } = await context.params;
    if (!organizationId) {
      return NextResponse.json(
        { error: "Organization ID is required.", code: "INVALID_REQUEST" },
        { status: 400 },
      );
    }

    const { searchParams } = new URL(request.url);
    const limitParam = searchParams.get('limit');
    const offsetParam = searchParams.get('offset');

    const limit = limitParam ? Math.min(Math.max(parseInt(limitParam, 10) || 50, 1), 100) : 50;
    const offset = offsetParam ? Math.max(parseInt(offsetParam, 10) || 0, 0) : 0;

    const { service, userId } = await authenticatedAuditLogService();
    const logs = await service.listAuditLogs(userId, organizationId, { limit, offset });

    return NextResponse.json({ logs });
  } catch (error) {
    return tenantManagementApiError(error);
  }
}

