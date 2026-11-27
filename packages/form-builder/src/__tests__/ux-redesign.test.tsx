// @vitest-environment jsdom

import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { FormSchemaV1 } from "@field/form-engine";
import { FormBuilder } from "../form-builder";

afterEach(cleanup);

function makeBlankSchema(id: string, title: string, key: string): FormSchemaV1 {
  return {
    schemaVersion: 1,
    form: { id, key, title, schemaVersion: 1 },
    header: {
      columns: 2,
      sections: [
        {
          id: "sec_general",
          key: "general_information",
          title: "General Information",
          order: 1,
          fields: [],
        },
      ],
    },
    tabs: [
      {
        id: "tab_general",
        key: "general",
        title: "General",
        type: "form",
        order: 1,
        sections: [],
      },
    ],
    rules: [],
    workflow: null,
    listView: { columns: [] },
    permissions: {},
    settings: {},
  };
}

function makeSampleSchema(): FormSchemaV1 {
  const schema = makeBlankSchema("opt-req-1", "Equipment Request", "equipment_request");
  schema.header.sections[0]!.fields = [
    {
      id: "fld_qty",
      key: "quantity",
      type: "number",
      label: "Quantity",
      order: 1,
      required: true,
      width: "half",
    },
    {
      id: "fld_total",
      key: "total_estimated_cost",
      type: "calculated",
      label: "Total Estimated Cost",
      order: 2,
      readOnly: true,
      width: "half",
      calculationConfig: {
        operation: "custom",
        formula: "quantity * estimated_cost",
        operands: ["quantity", "estimated_cost"],
        precision: 2,
      },
    },
  ];
  return schema;
}

describe("FormBuilder UX/UI Redesign", () => {
  it("renders the 3 guided stages while preserving locked top-level builder modules", () => {
    render(<FormBuilder initialSchema={makeBlankSchema("f-1", "Safety Inspection", "safety_inspection")} />);

    const stageNav = screen.getByRole("navigation", { name: "Guided form creation stages" });
    expect(stageNav.textContent).toContain("Build Form");
    expect(stageNav.textContent).toContain("Configure Workflow");
    expect(stageNav.textContent).toContain("Publish & Share");

    const moduleNav = screen.getByRole("navigation", { name: "Builder modules" });
    expect(moduleNav.textContent).toContain("Design");
    expect(moduleNav.textContent).toContain("Form Settings");
    expect(moduleNav.textContent).toContain("Workflow");
    expect(moduleNav.textContent).toContain("Rules");
    expect(moduleNav.textContent).toContain("List View");
    expect(moduleNav.textContent).toContain("Versions");
  });

  it("displays non-technical terminology with progressive disclosure and preserves key accessibility", () => {
    const schema = makeSampleSchema();
    render(<FormBuilder initialSchema={schema} />);

    fireEvent.click(screen.getByRole("button", { name: /Quantity/i }));

    expect(screen.getByText("Must Be Completed")).toBeTruthy();
    expect(screen.getByLabelText("Required")).toBeTruthy();
    expect(screen.getByText("More Options (Display & Limits)")).toBeTruthy();
    expect(screen.getByText("Advanced / Developer Settings")).toBeTruthy();
    expect(screen.getByLabelText("Field key")).toBeTruthy();
  });

  it("detects broken calculation field references, offers friendly actionable guidance, and jumps via Fix This", () => {
    const schema = makeSampleSchema();
    render(<FormBuilder initialSchema={schema} />);

    // Real-time validation pill identifies issue immediately
    const pill = screen.getByRole("button", { name: /issues? to fix/i });
    fireEvent.click(pill);

    // Friendly message instead of raw error code only
    expect(
      screen.getByText(/Your "Total Estimated Cost" calculation needs a Estimated Cost field/i),
    ).toBeTruthy();

    // Clicking "Fix Calculation" selects the broken calculated field
    fireEvent.click(screen.getByRole("button", { name: "Fix Calculation" }));

    // Visual Calculation Builder offers missing-field creator and updates formula validation when fixed
    const createBtn = screen.getByRole("button", { name: /\+ Create "Estimated Cost"/i });
    fireEvent.click(createBtn);

    expect(screen.getByText(/✓ Valid syntax/i)).toBeTruthy();
  });

  it("switches smoothly into Stage 2 (Workflow templates) and Stage 3 (Publish & Share readiness)", () => {
    const schema = makeSampleSchema();
    const handlePublish = vi.fn();
    render(
      <FormBuilder
        initialSchema={schema}
        onPublish={handlePublish}
        versions={[
          {
            id: "v1",
            version_number: 1,
            status: "published",
            schema_version: 1,
            schema_jsonb: schema,
            created_at: new Date().toISOString(),
            published_at: new Date().toISOString(),
          },
        ]}
      />,
    );

    // Stage 2: Configure Workflow shows 2-Stage template option
    fireEvent.click(screen.getByRole("button", { name: /Configure Workflow/i }));
    expect(screen.getByRole("button", { name: /\+ 2-Stage Approval Template/i })).toBeTruthy();

    // Stage 3: Publish & Share shows Readiness Check, Fix This, and Share URL
    fireEvent.click(screen.getByRole("button", { name: /Publish & Share/i }));
    const publishStage = screen.getByRole("region", { name: "Publish and Share workspace" });
    expect(publishStage.textContent).toContain("Form Readiness Check");
    expect(publishStage.textContent).toContain("Share & Access Link");
    expect(screen.getByLabelText("Published form link")).toBeTruthy();
  });

  it("supports drag-and-drop field addition from palette into a section and toggles inline Live Preview", () => {
    const schema = makeBlankSchema("f-2", "Site Checklist", "site_checklist");
    render(<FormBuilder initialSchema={schema} />);

    // Toggle Live Preview split pane
    const livePreviewBtn = screen.getByRole("button", { name: "Live Preview" });
    fireEvent.click(livePreviewBtn);
    expect(screen.getByRole("complementary", { name: "Live form preview" })).toBeTruthy();

    // Simulate dragging Currency field from palette and dropping on the header section
    const currencyPaletteBtn = screen.getByRole("button", { name: "Add Currency field" });
    const dropTarget = screen.getAllByText("General Information")[0]!.closest("article")!;

    const store: Record<string, string> = {};
    const mockDataTransfer = {
      setData: (type: string, val: string) => {
        store[type] = val;
      },
      getData: (type: string) => store[type] ?? "",
    };

    fireEvent.dragStart(currencyPaletteBtn, { dataTransfer: mockDataTransfer });
    fireEvent.dragOver(dropTarget, { dataTransfer: mockDataTransfer });
    fireEvent.drop(dropTarget, { dataTransfer: mockDataTransfer });

    expect(screen.getByLabelText("Field label")).toHaveProperty("value", "Currency");
  });
});
