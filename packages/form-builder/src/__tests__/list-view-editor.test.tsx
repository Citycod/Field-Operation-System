import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import { ListViewEditor } from "../list-view-editor";
import { ListViewPreview } from "../list-view-preview";
import { FormBuilder } from "../form-builder";
import type { FormSchemaV1 } from "@field/form-engine";

afterEach(() => {
  cleanup();
});

const TEST_SCHEMA: FormSchemaV1 = {
  schemaVersion: 1,
  form: {
    schemaVersion: 1,
    id: "f_work_order",
    key: "maintenance_work_order",
    title: "Maintenance Work Order",
  },
  header: {
    columns: 2,
    sections: [
      {
        id: "sec_1",
        key: "sec_main",
        title: "Work Order Details",
        order: 0,
        fields: [
          {
            id: "f_asset",
            key: "asset_tag",
            type: "text",
            label: "Asset Tag",
            order: 0,
          },
          {
            id: "f_priority",
            key: "priority_level",
            type: "dropdown",
            label: "Priority Level",
            order: 1,
            options: [
              { label: "Critical", value: "critical" },
              { label: "Medium", value: "medium" },
            ],
          },
          {
            id: "f_cost",
            key: "estimated_cost",
            type: "currency",
            label: "Estimated Cost",
            order: 2,
          },
          {
            id: "f_urgent",
            key: "is_urgent",
            type: "checkbox",
            label: "Is Urgent",
            order: 3,
          },
        ],
      },
    ],
  },
  tabs: [],
  rules: [],
  workflow: null,
  listView: {
    columns: [
      {
        id: "col_1",
        sourceRef: "system.reference_number",
        label: "Ref Number",
        order: 0,
        width: 140,
        visible: true,
        sortable: true,
        filterable: true,
        searchable: true,
        format: "text",
        alignment: "left",
      },
      {
        id: "col_2",
        sourceRef: "asset_tag",
        label: "Asset",
        order: 1,
        width: 160,
        visible: true,
        sortable: true,
        filterable: true,
        searchable: true,
        format: "text",
        alignment: "left",
      },
      {
        id: "col_3",
        sourceRef: "estimated_cost",
        label: "Cost",
        order: 2,
        width: 120,
        visible: true,
        sortable: true,
        filterable: true,
        searchable: false,
        format: "currency",
        alignment: "right",
      },
    ],
    defaultSort: [{ fieldRef: "system.created_at", direction: "desc", priority: 0 }],
    defaultFilters: [],
    search: {
      enabled: true,
      searchableFields: ["asset_tag", "system.reference_number"],
      placeholder: "Search work orders...",
    },
    pageSize: 25,
  },
  permissions: {
    createRoles: ["employee", "manager", "business_admin", "super_admin"],
    readOwnRoles: ["employee", "manager", "business_admin", "super_admin"],
    readAllRoles: ["manager", "business_admin", "super_admin"],
    manageFormRoles: ["business_admin", "super_admin"],
  },
  settings: {},
};

describe("ListViewEditor Component", () => {
  it("renders all subsection tabs and active columns", () => {
    const onChange = vi.fn();
    render(<ListViewEditor schema={TEST_SCHEMA} onChange={onChange} />);

    expect(screen.getByTestId("list-view-editor")).toBeDefined();
    expect(screen.getByRole("tab", { name: /Columns \(3\)/i })).toBeDefined();
    expect(screen.getByRole("tab", { name: /Sorting \(1\)/i })).toBeDefined();
    expect(screen.getByRole("tab", { name: /Default Filters \(0\)/i })).toBeDefined();
    expect(screen.getByRole("tab", { name: /Search & Paging/i })).toBeDefined();

    // Verify rendered column labels within column list
    const colList = screen.getByRole("list", { name: "Columns" });
    expect(within(colList).getByText("Ref Number")).toBeDefined();
    expect(within(colList).getByText("Asset")).toBeDefined();
    expect(within(colList).getByText("Cost")).toBeDefined();
  });

  it("selects a column and updates label, width, alignment, and format", () => {
    const onChange = vi.fn();
    render(<ListViewEditor schema={TEST_SCHEMA} onChange={onChange} />);

    // Click on "Asset" column row within list
    const colList = screen.getByRole("list", { name: "Columns" });
    fireEvent.click(within(colList).getByText("Asset"));

    // Find Header Label input and edit it
    const labelInput = screen.getByDisplayValue("Asset");
    fireEvent.change(labelInput, { target: { value: "Asset Identifier" } });

    expect(onChange).toHaveBeenCalledTimes(1);
    const updatedSchema = onChange.mock.calls[0][0] as FormSchemaV1;
    const assetCol = updatedSchema.listView.columns.find((c) => c.sourceRef === "asset_tag");
    expect(assetCol?.label).toBe("Asset Identifier");
  });

  it("toggles column visibility when eye button is clicked", () => {
    const onChange = vi.fn();
    render(<ListViewEditor schema={TEST_SCHEMA} onChange={onChange} />);

    const toggleBtn = screen.getByLabelText("Toggle visibility of Asset");
    fireEvent.click(toggleBtn);

    expect(onChange).toHaveBeenCalledTimes(1);
    const updatedSchema = onChange.mock.calls[0][0] as FormSchemaV1;
    const assetCol = updatedSchema.listView.columns.find((c) => c.sourceRef === "asset_tag");
    expect(assetCol?.visible).toBe(false);
  });

  it("reorders columns using down button", () => {
    const onChange = vi.fn();
    render(<ListViewEditor schema={TEST_SCHEMA} onChange={onChange} />);

    // Move first column down
    const moveDownBtns = screen.getAllByLabelText("Move down");
    fireEvent.click(moveDownBtns[0]);

    expect(onChange).toHaveBeenCalledTimes(1);
    const updatedSchema = onChange.mock.calls[0][0] as FormSchemaV1;
    expect(updatedSchema.listView.columns[0].sourceRef).toBe("asset_tag");
    expect(updatedSchema.listView.columns[1].sourceRef).toBe("system.reference_number");
  });

  it("removes a column when remove button is clicked", () => {
    const onChange = vi.fn();
    render(<ListViewEditor schema={TEST_SCHEMA} onChange={onChange} />);

    const removeBtn = screen.getByLabelText("Remove Asset");
    fireEvent.click(removeBtn);

    expect(onChange).toHaveBeenCalledTimes(1);
    const updatedSchema = onChange.mock.calls[0][0] as FormSchemaV1;
    expect(updatedSchema.listView.columns.length).toBe(2);
    expect(updatedSchema.listView.columns.some((c) => c.sourceRef === "asset_tag")).toBe(false);
  });

  it("adds a new column via Add Column picker menu", () => {
    const onChange = vi.fn();
    render(<ListViewEditor schema={TEST_SCHEMA} onChange={onChange} />);

    // Open add column dropdown
    const addColBtn = screen.getByRole("button", { name: /\+ Add Column ▾/i });
    fireEvent.click(addColBtn);

    // Pick Priority Level
    const priorityPickBtn = screen.getByRole("button", { name: /Priority Level/i });
    fireEvent.click(priorityPickBtn);

    expect(onChange).toHaveBeenCalledTimes(1);
    const updatedSchema = onChange.mock.calls[0][0] as FormSchemaV1;
    expect(updatedSchema.listView.columns.length).toBe(4);
    expect(updatedSchema.listView.columns[3].sourceRef).toBe("priority_level");
    expect(updatedSchema.listView.columns[3].format).toBe("text");
  });

  it("switches to Sorting tab and manages sort rules", () => {
    const onChange = vi.fn();
    render(<ListViewEditor schema={TEST_SCHEMA} onChange={onChange} />);

    // Switch to Sorting tab
    fireEvent.click(screen.getByRole("tab", { name: /Sorting/i }));

    expect(screen.getByText("Primary Sort")).toBeDefined();

    // Add another sort rule
    const addSortBtn = screen.getByRole("button", { name: /\+ Add Sort Rule/i });
    fireEvent.click(addSortBtn);

    expect(onChange).toHaveBeenCalledTimes(1);
    const updatedSchema = onChange.mock.calls[0][0] as FormSchemaV1;
    const sortList = updatedSchema.listView.defaultSort as Array<{ fieldRef: string }>;
    expect(sortList.length).toBe(2);
  });

  it("switches to Filters tab and adds a filter condition", () => {
    const onChange = vi.fn();
    render(<ListViewEditor schema={TEST_SCHEMA} onChange={onChange} />);

    // Switch to Default Filters tab
    fireEvent.click(screen.getByRole("tab", { name: /Default Filters/i }));

    const addFilterBtn = screen.getByRole("button", { name: /\+ Add Filter Condition/i });
    fireEvent.click(addFilterBtn);

    expect(onChange).toHaveBeenCalledTimes(1);
    const updatedSchema = onChange.mock.calls[0][0] as FormSchemaV1;
    expect(updatedSchema.listView.defaultFilters?.length).toBe(1);
    expect(updatedSchema.listView.defaultFilters?.[0].conditions.length).toBe(1);
  });

  it("switches to Search & Paging tab and updates search settings and page size", () => {
    const onChange = vi.fn();
    render(<ListViewEditor schema={TEST_SCHEMA} onChange={onChange} />);

    // Switch to Search & Paging tab
    fireEvent.click(screen.getByRole("tab", { name: /Search & Paging/i }));

    // Change placeholder
    const placeholderInput = screen.getByDisplayValue("Search work orders...");
    fireEvent.change(placeholderInput, { target: { value: "Type keyword to find work order..." } });

    expect(onChange).toHaveBeenCalledTimes(1);
    const updatedSchema = onChange.mock.calls[0][0] as FormSchemaV1;
    expect(updatedSchema.listView.search?.placeholder).toBe("Type keyword to find work order...");

    // Change page size to 50
    const pageSizeSelect = screen.getByDisplayValue("25 records / page");
    fireEvent.change(pageSizeSelect, { target: { value: "50" } });

    const updatedSchema2 = onChange.mock.calls[1][0] as FormSchemaV1;
    expect(updatedSchema2.listView.pageSize).toBe(50);
  });
});

describe("ListViewPreview Component", () => {
  it("renders synthetic preview table with formatted headers and records", () => {
    render(
      <ListViewPreview
        schema={TEST_SCHEMA}
        listView={TEST_SCHEMA.listView}
        availableFields={TEST_SCHEMA.header.sections[0].fields}
      />,
    );

    expect(screen.getByTestId("list-view-preview")).toBeDefined();
    expect(screen.getByText("Synthetic Preview")).toBeDefined();
    expect(screen.getByText("3 visible columns • Page size: 25")).toBeDefined();

    // Verify table headers
    expect(screen.getByText("Ref Number")).toBeDefined();
    expect(screen.getByText("Asset")).toBeDefined();
    expect(screen.getByText("Cost")).toBeDefined();

    // Verify synthetic mock records rendered
    expect(screen.getByText("REF-2026-001")).toBeDefined();
    expect(screen.getByText("$1,250.00")).toBeDefined();
  });

  it("toggles between synthetic records and empty state preview", () => {
    render(
      <ListViewPreview
        schema={TEST_SCHEMA}
        listView={TEST_SCHEMA.listView}
        availableFields={TEST_SCHEMA.header.sections[0].fields}
      />,
    );

    const toggleBtn = screen.getByRole("button", { name: /Preview Empty State/i });
    fireEvent.click(toggleBtn);

    expect(screen.getByText("No records to display")).toBeDefined();
    expect(screen.getByText(/This preview simulates how operators see the list/i)).toBeDefined();

    // Click again to toggle back
    fireEvent.click(screen.getByRole("button", { name: /Show Records/i }));
    expect(screen.getByText("REF-2026-001")).toBeDefined();
  });
});

describe("FormBuilder Integration with List View tab", () => {
  it("switches to List View tab and mounts the ListViewEditor", () => {
    const onChange = vi.fn();
    render(<FormBuilder initialSchema={TEST_SCHEMA} onChange={onChange} />);

    // Click "List View" module tab in the top navigation
    const lvTab = screen.getByRole("button", { name: "List View" });
    fireEvent.click(lvTab);

    // Verify ListViewEditor is mounted
    expect(screen.getByTestId("list-view-editor")).toBeDefined();
    expect(screen.getByTestId("list-view-preview")).toBeDefined();
    expect(screen.getByText("Columns (3)")).toBeDefined();
  });
});
