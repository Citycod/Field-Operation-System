import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DataSourceService, isSafeExternalApiUrl } from "../data-source-service";
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
import type { OrganizationMembership, OrganizationMemberRosterItem, PlatformRole } from "@field/types";
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
  private rosters = new Map<string, OrganizationMemberRosterItem[]>();

  setMembership(
    userId: string,
    orgId: string,
    role: PlatformRole = "business_admin",
    status: "active" | "disabled" = "active",
  ) {
    this.memberships.set(`${userId}:${orgId}`, { role, status });
  }

  setRoster(orgId: string, roster: OrganizationMemberRosterItem[]) {
    this.rosters.set(orgId, roster);
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

  async getRoster(orgId: string): Promise<OrganizationMemberRosterItem[]> {
    return this.rosters.get(orgId) ?? [];
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

  it("resolves active member roster lookups for tenant organizations", async () => {
    const admin = "usr_admin_1";
    const org = "org_roster_test";
    membershipRepo.setMembership(admin, org, "business_admin", "active");

    membershipRepo.setRoster(org, [
      {
        membership_id: "mem_1",
        organization_id: org,
        user_id: "usr_alice",
        role_key: "employee",
        status: "active",
        display_name: "Alice Smith",
        email: "alice@example.com",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        membership_id: "mem_2",
        organization_id: org,
        user_id: "usr_bob",
        role_key: "employee",
        status: "disabled",
        display_name: "Bob Jones",
        email: "bob@example.com",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        membership_id: "mem_3",
        organization_id: org,
        user_id: "usr_charlie",
        role_key: "manager",
        status: "active",
        display_name: null,
        first_name: "Charlie",
        last_name: "Brown",
        email: "charlie@example.com",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ]);

    const options = await service.resolveLookupOptions({
      userId: admin,
      organizationId: org,
      targetEntity: "members",
      sourceType: "table",
    });

    expect(options).toHaveLength(2);
    expect(options).toEqual([
      { key: "usr_alice", value: "usr_alice", label: "Alice Smith" },
      { key: "usr_charlie", value: "usr_charlie", label: "Charlie Brown" },
    ]);
  });

  describe("SSRF guard validation", () => {
    it("blocks private, local, and metadata endpoints", () => {
      expect(isSafeExternalApiUrl("http://localhost:3000/api").safe).toBe(false);
      expect(isSafeExternalApiUrl("http://127.0.0.1:8080/data").safe).toBe(false);
      expect(isSafeExternalApiUrl("http://10.0.0.1/api").safe).toBe(false);
      expect(isSafeExternalApiUrl("http://172.16.5.1/api").safe).toBe(false);
      expect(isSafeExternalApiUrl("http://192.168.1.100/api").safe).toBe(false);
      expect(isSafeExternalApiUrl("http://169.254.169.254/latest/meta-data").safe).toBe(false);
      expect(isSafeExternalApiUrl("http://metadata.google.internal/computeMetadata").safe).toBe(false);
      expect(isSafeExternalApiUrl("ftp://example.com/api").safe).toBe(false);
    });

    it("allows valid public https endpoints", () => {
      expect(isSafeExternalApiUrl("https://api.example.com/v1/items").safe).toBe(true);
      expect(isSafeExternalApiUrl("https://jsonplaceholder.typicode.com/users").safe).toBe(true);
    });

    it("blocks IPv6 loopback, link-local, and IPv4-mapped addresses", () => {
      expect(isSafeExternalApiUrl("http://[::1]/api").safe).toBe(false);
      expect(isSafeExternalApiUrl("http://[fe80::1]/api").safe).toBe(false);
      expect(isSafeExternalApiUrl("http://[fc00::1]/api").safe).toBe(false);
      expect(isSafeExternalApiUrl("http://[fd00::1]/api").safe).toBe(false);
      expect(isSafeExternalApiUrl("http://[::ffff:127.0.0.1]/api").safe).toBe(false);
      expect(isSafeExternalApiUrl("http://[::ffff:7f00:1]/api").safe).toBe(false);
    });

    it("rejects SSRF endpoint when resolving api lookup", async () => {
      const admin = "usr_admin_ssrf";
      const org = "org_ssrf_test";
      membershipRepo.setMembership(admin, org, "business_admin", "active");

      await expect(
        service.resolveLookupOptions({
          userId: admin,
          organizationId: org,
          targetEntity: "external_inventory",
          sourceType: "api",
          apiEndpoint: "http://127.0.0.1:3000/secret",
        }),
      ).rejects.toThrow(/SSRF validation blocked request/);
    });
  });

  describe("External API lookup security and streaming bounds", () => {
    const admin = "usr_admin_api_test";
    const org = "org_api_test";
    const originalFetch = globalThis.fetch;

    beforeEach(() => {
      membershipRepo.setMembership(admin, org, "business_admin", "active");
    });

    afterEach(() => {
      globalThis.fetch = originalFetch;
      vi.restoreAllMocks();
    });

    it("rejects redirect responses when redirect: 'error' aborts redirection", async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(
        new TypeError("Failed to fetch: redirect mode is set to error"),
      );

      await expect(
        service.resolveLookupOptions({
          userId: admin,
          organizationId: org,
          targetEntity: "inventory",
          sourceType: "api",
          apiEndpoint: "https://api.example.com/redirect",
        }),
      ).rejects.toThrow(/redirect mode is set to error/);

      expect(globalThis.fetch).toHaveBeenCalledWith(
        "https://api.example.com/redirect",
        expect.objectContaining({ redirect: "error" }),
      );
    });

    it("rejects response when Content-Length header claims > 1 MB", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: "OK",
        headers: new Headers({ "content-length": "2000000" }),
      } as any);

      await expect(
        service.resolveLookupOptions({
          userId: admin,
          organizationId: org,
          targetEntity: "large_data",
          sourceType: "api",
          apiEndpoint: "https://api.example.com/oversized-header",
        }),
      ).rejects.toThrow(/Response size exceeds maximum allowed limit/);
    });

    it("rejects oversized streamed response (> 1 MB) while consuming stream even without Content-Length", async () => {
      const chunk = new Uint8Array(600 * 1024); // 600 KB chunk
      let emitted = 0;
      let cancelled = false;

      const stream = new ReadableStream({
        pull(controller) {
          if (emitted >= 3) {
            controller.close();
            return;
          }
          emitted++;
          controller.enqueue(chunk);
        },
        cancel() {
          cancelled = true;
        },
      });

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: "OK",
        headers: new Headers(),
        body: stream,
      } as any);

      await expect(
        service.resolveLookupOptions({
          userId: admin,
          organizationId: org,
          targetEntity: "stream_data",
          sourceType: "api",
          apiEndpoint: "https://api.example.com/stream-bomb",
        }),
      ).rejects.toThrow(/Response size exceeds maximum allowed limit/);

      expect(cancelled).toBe(true);
    });

    it("rejects malformed or non-JSON responses safely", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: "OK",
        headers: new Headers({ "content-type": "text/html" }),
        text: async () => "<html><head><title>500 Internal</title></head><body>Error</body></html>",
      } as any);

      await expect(
        service.resolveLookupOptions({
          userId: admin,
          organizationId: org,
          targetEntity: "bad_json",
          sourceType: "api",
          apiEndpoint: "https://api.example.com/not-json",
        }),
      ).rejects.toThrow(/malformed or non-JSON response/);
    });

    it("caps returned lookup options at 500 records when upstream returns more", async () => {
      const largeArray = Array.from({ length: 650 }, (_, i) => ({
        sku: `SKU_${i}`,
        title: `Product Title ${i}`,
      }));

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: "OK",
        headers: new Headers({ "content-type": "application/json" }),
        text: async () => JSON.stringify(largeArray),
      } as any);

      const options = await service.resolveLookupOptions({
        userId: admin,
        organizationId: org,
        targetEntity: "catalog",
        sourceType: "api",
        apiEndpoint: "https://api.example.com/products",
        valueField: "sku",
        displayField: "title",
      });

      expect(options).toHaveLength(500);
      expect(options[0]).toEqual({
        key: "SKU_0",
        value: "SKU_0",
        label: "Product Title 0",
      });
      expect(options[499]).toEqual({
        key: "SKU_499",
        value: "SKU_499",
        label: "Product Title 499",
      });
    });

    it("handles timeout or network abort failures cleanly", async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(
        new DOMException("The operation was aborted due to timeout", "AbortError"),
      );

      await expect(
        service.resolveLookupOptions({
          userId: admin,
          organizationId: org,
          targetEntity: "slow_api",
          sourceType: "api",
          apiEndpoint: "https://api.example.com/slow",
        }),
      ).rejects.toThrow(/The operation was aborted/);
    });

    it("successfully parses wrapped data object from external REST API", async () => {
      const payload = {
        data: [
          { code: "DEPT_HR", name: "Human Resources" },
          { code: "DEPT_ENG", name: "Engineering" },
        ],
      };

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: "OK",
        headers: new Headers({ "content-type": "application/json" }),
        text: async () => JSON.stringify(payload),
      } as any);

      const options = await service.resolveLookupOptions({
        userId: admin,
        organizationId: org,
        targetEntity: "departments",
        sourceType: "api",
        apiEndpoint: "https://api.example.com/departments",
        valueField: "code",
        displayField: "name",
      });

      expect(options).toEqual([
        { key: "DEPT_HR", value: "DEPT_HR", label: "Human Resources" },
        { key: "DEPT_ENG", value: "DEPT_ENG", label: "Engineering" },
      ]);
    });
  });
});
