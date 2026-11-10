import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const source = (relative: string) =>
  readFileSync(path.resolve(process.cwd(), relative), "utf8");

describe("production Form Library and Builder wiring", () => {
  it("replaces the Phase 1 shell with a tenant-scoped production library", () => {
    const page = source("src/app/(platform)/forms/page.tsx");
    expect(page).toContain("Form Library");
    expect(page).toContain("/api/forms?organizationId=");
    expect(page).not.toContain("Codex Phase 1 Shell");
    expect(page).not.toContain("@supabase");
  });

  it("creates forms and persists builder drafts only through server APIs", () => {
    const createPage = source("src/app/(platform)/forms/new/page.tsx");
    const builderPage = source(
      "src/app/(platform)/forms/[formId]/builder/page.tsx",
    );
    expect(createPage).toMatch(/fetch\(["']\/api\/forms["']/);
    expect(createPage).toContain(
      "router.push(`/forms/${body.form.id}/builder`)",
    );
    expect(builderPage).toMatch(/from ["']@field\/form-builder["']/);
    expect(builderPage).toMatch(/method: ["']PUT["']/);
    expect(builderPage).not.toContain("@supabase");
  });

  it("derives the user in the server service instead of accepting a browser user id", () => {
    const serverService = source("src/lib/services/server-form-service.ts");
    const formsRoute = source("src/app/api/forms/route.ts");
    expect(serverService).toContain("client.auth.getUser()");
    expect(formsRoute).toContain("authenticatedFormService()");
    expect(formsRoute).not.toMatch(/body\.userId/);
  });

  it("presents an operational Dashboard free of developer placeholder remarks", () => {
    const dashboard = source("src/app/(platform)/dashboard/page.tsx");
    expect(dashboard).toContain("Operations Dashboard");
    expect(dashboard).toContain("/api/forms?organizationId=");
    expect(dashboard).toContain("/data-sources");
    expect(dashboard).not.toContain("Phase 0 Shell Ready");
    expect(dashboard).not.toContain("Open Form Builder Shell");
    expect(dashboard).not.toContain("Multi-Tenant Isolated");
    expect(dashboard).not.toContain("S3-Compatible");
  });

  it("wires Data Sources management and lookup resolution through server APIs without direct Supabase client imports in UI", () => {
    const dsPage = source("src/app/(platform)/data-sources/page.tsx");
    const builderPage = source(
      "src/app/(platform)/forms/[formId]/builder/page.tsx",
    );
    const dsRoute = source("src/app/api/data-sources/route.ts");
    const lookupRoute = source(
      "src/app/api/data-sources/[dataSourceId]/lookup/route.ts",
    );
    expect(dsPage).toContain("/api/data-sources");
    expect(dsPage).not.toContain("@supabase");
    expect(builderPage).toContain("/api/data-sources/");
    expect(builderPage).toContain("lookupProvider={lookupProvider}");
    expect(dsRoute).toContain("authenticatedDataSourceService()");
    expect(lookupRoute).toContain("resolveLookupOptions");
  });
});
