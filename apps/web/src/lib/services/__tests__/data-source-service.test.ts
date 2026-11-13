import { beforeEach, describe, expect, it } from "vitest";
import { DataSourceService } from "../data-source-service";
import type {
  DataSourceDetail,
  DataSourceEntity,
  DataSourceFieldEntity,
  DataSourceFieldInput,
  DataSourceItemData,
  DataSourceItemEntity,
  DataSourceItemInput,
  DataSourceItemStatus,
  DataSourceRepository,
  DataSourceStatus,
  DataSourceSummary,
} from "../../repositories/data-source-repository";
import type { MembershipRepository } from "../../repositories/membership-repository";
import type { OrganizationMembership, PlatformRole } from "@field/types";
import {
  MINIMAL_VALID_SCHEMA,
  validatePublishableSchema,
  type FormSchemaV1,
} from "@field/form-engine";

class MockMembershipRepository implements MembershipRepository {
  private memberships = new Map<
    string,
    { role: PlatformRole; status: "active" | "disabled" }
  >();

  setMembership(
    userId: string,
    orgId: string,
    role: PlatformRole = "business_admin",
    status: "active" | "disabled" = "active",
  ) {
    this.memberships.set(`${userId}:${orgId}`, { role, status });
  }

  async findByUserId(): Promise<OrganizationMembership[]> {
    return [];
  }

  async findUserMembershipInOrg(
    userId: string,
    organizationId: string,
  ): Promise<OrganizationMembership | null> {
    const found = this.memberships.get(`${userId}:${organizationId}`);
    if (!found) return null;
    return {
      id: `mem_${userId}_${organizationId}`,
      organization_id: organizationId,
      user_id: userId,
      role_key: found.role,
      status: found.status,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  }

  async getRoster(): Promise<any> {
    return [];
  }

  async manageMembership(): Promise<any> {
    return { success: true };
  }
}

class InMemoryDataSourceRepository implements DataSourceRepository {
  private sources = new Map<string, DataSourceEntity>();
  private fields = new Map<string, DataSourceFieldEntity[]>();
  private items = new Map<string, DataSourceItemEntity[]>();
  private seq = 0;

  private hydrate(source: DataSourceEntity): DataSourceDetail {
    const f = this.fields.get(source.id) ?? [];
    const it = this.items.get(source.id) ?? [];
    return {
      ...source,
      fields: f,
      items: it,
      item_count: it.length,
      active_item_count: it.filter((x) => x.status === "active").length,
    };
  }

  async listDataSources(organizationId: string): Promise<DataSourceSummary[]> {
    return [...this.sources.values()]
      .filter(
        (s) => s.organization_id === organizationId && s.status !== "archived",
      )
      .map((s) => {
        const detail = this.hydrate(s);
        return {
          ...s,
          fields: detail.fields,
          item_count: detail.item_count,
          active_item_count: detail.active_item_count,
        };
      });
  }

  async getDataSourceById(
    id: string,
    organizationId: string,
  ): Promise<DataSourceDetail | null> {
    const s = this.sources.get(id);
    if (!s || s.organization_id !== organizationId) return null;
    return this.hydrate(s);
  }

  async getDataSourceByKeyOrId(
    target: string,
    organizationId: string,
  ): Promise<DataSourceDetail | null> {
    const byId = await this.getDataSourceById(target, organizationId);
    if (byId) return byId;
    for (const s of this.sources.values()) {
      if (s.organization_id === organizationId && s.key === target) {
        return this.hydrate(s);
      }
    }
    return null;
  }

  async createDataSource(params: {
    organizationId: string;
    key: string;
    name: string;
    description?: string;
    displayFieldKey: string;
    valueFieldKey: string;
    createdBy: string;
    fields: DataSourceFieldInput[];
    items?: DataSourceItemInput[];
  }): Promise<DataSourceDetail> {
    const id = `ds_${++this.seq}`;
    const now = new Date().toISOString();
    const entity: DataSourceEntity = {
      id,
      organization_id: params.organizationId,
      key: params.key,
      name: params.name,
      description: params.description ?? null,
      display_field_key: params.displayFieldKey,
      value_field_key: params.valueFieldKey,
      status: "active",
      created_by: params.createdBy,
      created_at: now,
      updated_at: now,
    };
    this.sources.set(id, entity);
    this.fields.set(
      id,
      params.fields.map((f, index) => ({
        id: `dsf_${++this.seq}`,
        organization_id: params.organizationId,
        data_source_id: id,
        key: f.key,
        label: f.label,
        field_type: f.field_type ?? "text",
        required: f.required ?? false,
        order_index: f.order_index ?? index,
        config_jsonb: {},
        created_at: now,
      })),
    );
    this.items.set(
      id,
      (params.items ?? []).map((item) => ({
        id: `dsi_${++this.seq}`,
        organization_id: params.organizationId,
        data_source_id: id,
        data_jsonb: item.data,
        status: item.status ?? "active",
        created_by: params.createdBy,
        created_at: now,
        updated_at: now,
      })),
    );
    return this.hydrate(entity);
  }

  async updateDataSource(params: {
    id: string;
    organizationId: string;
    name?: string;
    description?: string | null;
    displayFieldKey?: string;
    valueFieldKey?: string;
    status?: DataSourceStatus;
    fields?: DataSourceFieldInput[];
  }): Promise<DataSourceDetail> {
    const existing = this.sources.get(params.id);
    if (!existing || existing.organization_id !== params.organizationId) {
      throw new Error("Data source not found");
    }
    const updated: DataSourceEntity = {
      ...existing,
      name: params.name ?? existing.name,
      description:
        params.description !== undefined
          ? params.description
          : existing.description,
      display_field_key: params.displayFieldKey ?? existing.display_field_key,
      value_field_key: params.valueFieldKey ?? existing.value_field_key,
      status: params.status ?? existing.status,
      updated_at: new Date().toISOString(),
    };
    this.sources.set(params.id, updated);
    if (params.fields) {
      this.fields.set(
        params.id,
        params.fields.map((f, idx) => ({
          id: `dsf_${++this.seq}`,
          organization_id: params.organizationId,
          data_source_id: params.id,
          key: f.key,
          label: f.label,
          field_type: f.field_type ?? "text",
          required: f.required ?? false,
          order_index: f.order_index ?? idx,
          config_jsonb: {},
          created_at: new Date().toISOString(),
        })),
      );
    }
    return this.hydrate(updated);
  }

  async listItems(params: {
    dataSourceId: string;
    organizationId: string;
    status?: DataSourceItemStatus;
  }): Promise<DataSourceItemEntity[]> {
    const s = this.sources.get(params.dataSourceId);
    if (!s || s.organization_id !== params.organizationId) return [];
    const list = this.items.get(params.dataSourceId) ?? [];
    return params.status
      ? list.filter((i) => i.status === params.status)
      : list;
  }

  async createItem(params: {
    dataSourceId: string;
    organizationId: string;
    data: DataSourceItemData;
    status?: DataSourceItemStatus;
    createdBy: string;
  }): Promise<DataSourceItemEntity> {
    const list = this.items.get(params.dataSourceId) ?? [];
    const now = new Date().toISOString();
    const item: DataSourceItemEntity = {
      id: `dsi_${++this.seq}`,
      organization_id: params.organizationId,
      data_source_id: params.dataSourceId,
      data_jsonb: params.data,
      status: params.status ?? "active",
      created_by: params.createdBy,
      created_at: now,
      updated_at: now,
    };
    this.items.set(params.dataSourceId, [...list, item]);
    return item;
  }

  async updateItem(params: {
    itemId: string;
    dataSourceId: string;
    organizationId: string;
    data?: DataSourceItemData;
    status?: DataSourceItemStatus;
  }): Promise<DataSourceItemEntity> {
    const list = this.items.get(params.dataSourceId) ?? [];
    const idx = list.findIndex(
      (i) =>
        i.id === params.itemId && i.organization_id === params.organizationId,
    );
    if (idx === -1) throw new Error("Item not found");
    const updated: DataSourceItemEntity = {
      ...list[idx],
      data_jsonb: params.data ?? list[idx].data_jsonb,
      status: params.status ?? list[idx].status,
      updated_at: new Date().toISOString(),
    };
    const next = [...list];
    next[idx] = updated;
    this.items.set(params.dataSourceId, next);
    return updated;
  }

  async deleteItem(params: {
    itemId: string;
    dataSourceId: string;
    organizationId: string;
  }): Promise<void> {
    await this.updateItem({
      itemId: params.itemId,
      dataSourceId: params.dataSourceId,
      organizationId: params.organizationId,
      status: "inactive",
    });
  }
}

describe("DataSourceService & Phase 4 Lookups", () => {
  let membershipRepo: MockMembershipRepository;
  let dataSourceRepo: InMemoryDataSourceRepository;
  let service: DataSourceService;

  const orgA = "org_a";
  const orgB = "org_b";
  const adminA = "admin_a";
  const employeeA = "employee_a";
  const adminB = "admin_b";

  beforeEach(() => {
    membershipRepo = new MockMembershipRepository();
    dataSourceRepo = new InMemoryDataSourceRepository();
    service = new DataSourceService(dataSourceRepo, membershipRepo);

    membershipRepo.setMembership(adminA, orgA, "business_admin", "active");
    membershipRepo.setMembership(employeeA, orgA, "employee", "active");
    membershipRepo.setMembership(adminB, orgB, "business_admin", "active");
  });

  it("creates a data source with fields and items, and resolves active lookup options", async () => {
    const created = await service.createDataSource({
      userId: adminA,
      organizationId: orgA,
      name: "Site Locations",
      key: "site_locations",
      displayFieldKey: "name",
      valueFieldKey: "code",
      fields: [
        { key: "code", label: "Site Code", field_type: "text", required: true },
        { key: "name", label: "Site Name", field_type: "text", required: true },
      ],
      items: [
        { data: { code: "head_office", name: "Head Office" } },
        { data: { code: "warehouse", name: "Central Warehouse" } },
      ],
    });

    expect(created.key).toBe("site_locations");
    expect(created.active_item_count).toBe(2);

    // Employee in Org A can resolve lookup options
    const options = await service.resolveLookupOptions({
      userId: employeeA,
      organizationId: orgA,
      targetEntity: "site_locations",
    });
    expect(options).toEqual([
      { label: "Head Office", value: "head_office" },
      { label: "Central Warehouse", value: "warehouse" },
    ]);

    // Deactivating an item excludes it from resolved lookup options
    await service.deleteItem({
      userId: adminA,
      organizationId: orgA,
      dataSourceId: created.id,
      itemId: created.items[1].id,
    });

    const afterDeactivate = await service.resolveLookupOptions({
      userId: employeeA,
      organizationId: orgA,
      targetEntity: "site_locations",
    });
    expect(afterDeactivate).toEqual([
      { label: "Head Office", value: "head_office" },
    ]);
  });

  it("enforces role permissions and cross-tenant isolation across all operations", async () => {
    const sourceA = await service.createDataSource({
      userId: adminA,
      organizationId: orgA,
      name: "Departments",
      key: "departments",
      displayFieldKey: "name",
      valueFieldKey: "code",
      fields: [
        { key: "code", label: "Code" },
        { key: "name", label: "Name" },
      ],
      items: [{ data: { code: "ops", name: "Operations" } }],
    });

    // Employee cannot create or mutate data sources
    await expect(
      service.createDataSource({
        userId: employeeA,
        organizationId: orgA,
        name: "Unauthorized Source",
        displayFieldKey: "name",
        valueFieldKey: "code",
        fields: [
          { key: "code", label: "Code" },
          { key: "name", label: "Name" },
        ],
      }),
    ).rejects.toThrow(/Unauthorized/);

    // Admin from Org B cannot list, view, mutate, or resolve lookup options in Org A
    await expect(
      service.listDataSources({ userId: adminB, organizationId: orgA }),
    ).rejects.toThrow(/Unauthorized/);

    await expect(
      service.resolveLookupOptions({
        userId: adminB,
        organizationId: orgA,
        targetEntity: "departments",
      }),
    ).rejects.toThrow(/Unauthorized/);

    // Querying Org B with Org A's data source key returns not found
    await expect(
      service.resolveLookupOptions({
        userId: adminB,
        organizationId: orgB,
        targetEntity: sourceA.id,
      }),
    ).rejects.toThrow(/not found or is inactive/);
  });

  it("validates submitted lookup values on the server across header, form tabs, and details rows", async () => {
    const source = await service.createDataSource({
      userId: adminA,
      organizationId: orgA,
      name: "Cost Centers",
      key: "cost_centers",
      displayFieldKey: "name",
      valueFieldKey: "code",
      fields: [
        { key: "code", label: "Code" },
        { key: "name", label: "Name" },
      ],
      items: [
        { data: { code: "cc_100", name: "Operations" }, status: "active" },
        { data: { code: "cc_999", name: "Retired" }, status: "inactive" },
      ],
    });

    const schema: FormSchemaV1 = structuredClone(MINIMAL_VALID_SCHEMA);
    schema.header.sections = [
      {
        id: "sec_h",
        key: "sec_h",
        title: "Header",
        order: 0,
        fields: [
          {
            id: "f_cc",
            key: "primary_cost_center",
            label: "Primary Cost Center",
            type: "lookup",
            order: 0,
            required: true,
            lookupConfig: {
              targetEntity: "cost_centers",
              displayField: "name",
              valueField: "code",
            },
          },
        ],
      },
    ];
    schema.tabs = [
      {
        id: "tab_lines",
        key: "line_items",
        title: "Line Items",
        type: "details",
        order: 0,
        configuration: {
          allowAdd: true,
          allowEdit: true,
          allowDelete: true,
          columns: [
            {
              id: "col_cc",
              key: "line_cost_center",
              label: "Line Cost Center",
              type: "lookup",
              order: 0,
              required: true,
              lookupConfig: {
                targetEntity: "cost_centers",
                displayField: "name",
                valueField: "code",
              },
            },
          ],
        },
      },
    ];

    // Publish validation with dataSources context passes when active source and fields match
    const publishResult = validatePublishableSchema(schema, {
      dataSources: [
        {
          id: source.id,
          key: source.key,
          status: source.status,
          fields: source.fields.map((f) => ({ key: f.key })),
        },
      ],
    });
    expect(publishResult.valid).toBe(true);

    // Valid active lookup values pass server validation
    const validCheck = await service.validateSubmissionLookups({
      userId: employeeA,
      organizationId: orgA,
      schema,
      payload: {
        fields: { primary_cost_center: "cc_100" },
        details: {
          line_items: [{ id: "r1", values: { line_cost_center: "cc_100" } }],
        },
      },
    });
    expect(validCheck.valid).toBe(true);

    // Forged or inactive lookup values fail server validation
    const invalidCheck = await service.validateSubmissionLookups({
      userId: employeeA,
      organizationId: orgA,
      schema,
      payload: {
        fields: { primary_cost_center: "forged_value" },
        details: {
          line_items: [{ id: "r1", values: { line_cost_center: "cc_999" } }],
        },
      },
    });
    expect(invalidCheck.valid).toBe(false);
    expect(invalidCheck.errors.map((e) => e.path)).toEqual([
      "fields.primary_cost_center",
      "details.line_items.r1.line_cost_center",
    ]);
  });
});
