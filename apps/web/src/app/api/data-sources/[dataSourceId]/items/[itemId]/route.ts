import { NextRequest, NextResponse } from "next/server";
import { authenticatedDataSourceService } from "@/lib/services/server-data-source-service";
import { dataSourceApiError } from "@/lib/forms/api-response";
import type {
  DataSourceItemData,
  DataSourceItemStatus,
} from "@/lib/repositories/data-source-repository";

type Context = {
  params: Promise<{ dataSourceId: string; itemId: string }>;
};

export async function PUT(request: NextRequest, context: Context) {
  try {
    const body = (await request.json()) as {
      organizationId?: string;
      data?: DataSourceItemData;
      status?: DataSourceItemStatus;
    };
    const organizationId = body.organizationId?.trim();
    if (!organizationId) {
      return NextResponse.json(
        { error: "Organization is required.", code: "INVALID_REQUEST" },
        { status: 400 },
      );
    }
    const { dataSourceId, itemId } = await context.params;
    const { service, userId } = await authenticatedDataSourceService();
    const item = await service.updateItem({
      userId,
      organizationId,
      dataSourceId,
      itemId,
      data: body.data,
      status: body.status,
    });
    return NextResponse.json({ item });
  } catch (error) {
    return dataSourceApiError(error);
  }
}

export async function DELETE(request: NextRequest, context: Context) {
  try {
    const organizationId = request.nextUrl.searchParams.get("organizationId");
    if (!organizationId) {
      return NextResponse.json(
        { error: "Organization is required.", code: "INVALID_REQUEST" },
        { status: 400 },
      );
    }
    const { dataSourceId, itemId } = await context.params;
    const { service, userId } = await authenticatedDataSourceService();
    await service.deleteItem({
      userId,
      organizationId,
      dataSourceId,
      itemId,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return dataSourceApiError(error);
  }
}
