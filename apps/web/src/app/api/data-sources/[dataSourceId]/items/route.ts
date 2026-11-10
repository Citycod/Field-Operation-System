import { NextRequest, NextResponse } from "next/server";
import { authenticatedDataSourceService } from "@/lib/services/server-data-source-service";
import { dataSourceApiError } from "@/lib/forms/api-response";
import type {
  DataSourceItemData,
  DataSourceItemStatus,
} from "@/lib/repositories/data-source-repository";

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
    const { dataSourceId } = await context.params;
    const { service, userId } = await authenticatedDataSourceService();
    const detail = await service.getDataSource({
      userId,
      organizationId,
      dataSourceId,
    });
    if (!detail) {
      return NextResponse.json(
        { error: "Data source not found.", code: "NOT_FOUND" },
        { status: 404 },
      );
    }
    return NextResponse.json({ items: detail.items });
  } catch (error) {
    return dataSourceApiError(error);
  }
}

export async function POST(request: NextRequest, context: Context) {
  try {
    const body = (await request.json()) as {
      organizationId?: string;
      data?: DataSourceItemData;
      status?: DataSourceItemStatus;
    };
    const organizationId = body.organizationId?.trim();
    if (!organizationId || !body.data || typeof body.data !== "object") {
      return NextResponse.json(
        {
          error: "Organization and item data are required.",
          code: "INVALID_REQUEST",
        },
        { status: 400 },
      );
    }
    const { dataSourceId } = await context.params;
    const { service, userId } = await authenticatedDataSourceService();
    const item = await service.createItem({
      userId,
      organizationId,
      dataSourceId,
      data: body.data,
      status: body.status,
    });
    return NextResponse.json({ item }, { status: 201 });
  } catch (error) {
    return dataSourceApiError(error);
  }
}
