import { NextRequest, NextResponse } from "next/server";
import { authenticatedDataSourceService } from "@/lib/services/server-data-source-service";
import { dataSourceApiError } from "@/lib/forms/api-response";
import type {
  DataSourceFieldInput,
  DataSourceItemInput,
} from "@/lib/repositories/data-source-repository";

export async function GET(request: NextRequest) {
  try {
    const organizationId = request.nextUrl.searchParams.get("organizationId");
    if (!organizationId) {
      return NextResponse.json(
        { error: "Organization is required.", code: "INVALID_REQUEST" },
        { status: 400 },
      );
    }
    const { service, userId } = await authenticatedDataSourceService();
    const dataSources = await service.listDataSources({
      userId,
      organizationId,
    });
    return NextResponse.json({ dataSources });
  } catch (error) {
    return dataSourceApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      organizationId?: string;
      key?: string;
      name?: string;
      description?: string;
      displayFieldKey?: string;
      valueFieldKey?: string;
      fields?: DataSourceFieldInput[];
      items?: DataSourceItemInput[];
    };
    const organizationId = body.organizationId?.trim();
    const name = body.name?.trim();
    if (!organizationId || !name) {
      return NextResponse.json(
        {
          error: "Organization and data source name are required.",
          code: "INVALID_REQUEST",
        },
        { status: 400 },
      );
    }
    const fields: DataSourceFieldInput[] =
      body.fields && body.fields.length > 0
        ? body.fields
        : [
            { key: "code", label: "Code", field_type: "text", required: true },
            { key: "name", label: "Name", field_type: "text", required: true },
          ];
    const { service, userId } = await authenticatedDataSourceService();
    const dataSource = await service.createDataSource({
      userId,
      organizationId,
      key: body.key,
      name,
      description: body.description,
      displayFieldKey: body.displayFieldKey || fields[0].key,
      valueFieldKey: body.valueFieldKey || fields[0].key,
      fields,
      items: body.items,
    });
    return NextResponse.json({ dataSource }, { status: 201 });
  } catch (error) {
    return dataSourceApiError(error);
  }
}
