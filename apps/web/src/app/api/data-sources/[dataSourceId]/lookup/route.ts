import { NextRequest, NextResponse } from "next/server";
import { authenticatedDataSourceService } from "@/lib/services/server-data-source-service";
import { dataSourceApiError } from "@/lib/forms/api-response";

type Context = { params: Promise<{ dataSourceId: string }> };

export async function GET(request: NextRequest, context: Context) {
  try {
    const organizationId = request.nextUrl.searchParams.get("organizationId");
    if (!organizationId) {
      return NextResponse.json(
        { error: "Organization is required.", code: "INVALID_REQUEST" },
        { status: 400 },
      );
    }
    const displayField =
      request.nextUrl.searchParams.get("displayField") ?? undefined;
    const valueField =
      request.nextUrl.searchParams.get("valueField") ?? undefined;
    const query = request.nextUrl.searchParams.get("q") ?? undefined;
    const { dataSourceId } = await context.params;
    const { service, userId } = await authenticatedDataSourceService();
    const options = await service.resolveLookupOptions({
      userId,
      organizationId,
      targetEntity: dataSourceId,
      displayField,
      valueField,
      query,
    });
    return NextResponse.json({ options });
  } catch (error) {
    return dataSourceApiError(error);
  }
}
