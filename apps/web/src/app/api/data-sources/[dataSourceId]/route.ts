import { NextRequest, NextResponse } from "next/server";
import { authenticatedDataSourceService } from "@/lib/services/server-data-source-service";
import { dataSourceApiError } from "@/lib/forms/api-response";
import type {
  DataSourceFieldInput,
  DataSourceStatus,
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
    const dataSource = await service.getDataSource({
      userId,
      organizationId,
      dataSourceId,
    });
    if (!dataSource) {
      return NextResponse.json(
        { error: "Data source not found.", code: "NOT_FOUND" },
        { status: 404 },
      );
    }
    return NextResponse.json({ dataSource });
  } catch (error) {
    return dataSourceApiError(error);
  }
}

export async function PUT(request: NextRequest, context: Context) {
  try {
    const body = (await request.json()) as {
      organizationId?: string;
      name?: string;
      description?: string | null;
      displayFieldKey?: string;
      valueFieldKey?: string;
      status?: DataSourceStatus;
      fields?: DataSourceFieldInput[];
    };
    const organizationId = body.organizationId?.trim();
    if (!organizationId) {
      return NextResponse.json(
        { error: "Organization is required.", code: "INVALID_REQUEST" },
        { status: 400 },
      );
    }
    const { dataSourceId } = await context.params;
    const { service, userId } = await authenticatedDataSourceService();
    const dataSource = await service.updateDataSource({
      userId,
      organizationId,
      dataSourceId,
      name: body.name,
      description: body.description,
      displayFieldKey: body.displayFieldKey,
      valueFieldKey: body.valueFieldKey,
      status: body.status,
      fields: body.fields,
    });
    return NextResponse.json({ dataSource });
  } catch (error) {
    return dataSourceApiError(error);
  }
}
