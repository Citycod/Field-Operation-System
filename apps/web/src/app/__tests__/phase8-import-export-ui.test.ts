import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const source = (relative: string) =>
  readFileSync(path.resolve(process.cwd(), relative), "utf8");

describe("Phase 8 Import / Export / CSV UI Wiring", () => {
  it("wires Import Form dialog in Form Library page", () => {
    const formsPage = source("src/app/(platform)/forms/page.tsx");
    expect(formsPage).toContain("Import Form");
    expect(formsPage).toContain("Import Form Definition");
    expect(formsPage).toContain("/api/forms/import");
    expect(formsPage).toContain("Import as Draft");
  });

  it("wires Export JSON in FormBuilder page and FormBuilder Versions tab", () => {
    const builderPage = source("src/app/(platform)/forms/[formId]/builder/page.tsx");
    const builderPkg = source("../../packages/form-builder/src/form-builder.tsx");

    expect(builderPage).toContain("handleExportVersion");
    expect(builderPage).toContain("/export?organizationId=");
    expect(builderPage).toContain("onExportVersion={handleExportVersion}");
    expect(builderPkg).toContain("onExportVersion");
    expect(builderPkg).toContain("Export JSON");
  });

  it("wires Export CSV in Submissions page", () => {
    const submissionsPage = source("src/app/(platform)/submissions/page.tsx");
    expect(submissionsPage).toContain("Export CSV");
    expect(submissionsPage).toContain("export.csv?");
  });
});
