import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import type { FormSchemaV1 } from "@field/form-engine";
import { FormBuilder } from "../form-builder";

afterEach(cleanup);

const createTestSchema = (): FormSchemaV1 => ({
  schemaVersion: 1,
  form: { id: "form_test_mgt", key: "test_mgt", title: "Management Features Test", schemaVersion: 1 },
  header: {
    columns: 2,
    sections: [
      {
        id: "sec_header",
        key: "sec_header",
        title: "Header Section",
        order: 0,
        fields: [
          {
            id: "f_dropdown",
            key: "category",
            label: "Category",
            type: "dropdown",
            order: 0,
            options: [
              { key: "office_supplies", value: "office_supplies", label: "Office Supplies" },
              { key: "computers", value: "computers", label: "Computers" },
            ],
          },
          {
            id: "f_principal",
            key: "principal_amount",
            label: "Principal Amount",
            type: "currency",
            order: 1,
          },
          {
            id: "f_rate",
            key: "interest_rate",
            label: "Interest Rate",
            type: "number",
            order: 2,
          },
          {
            id: "f_tenor",
            key: "tenor_days",
            label: "Tenor Days",
            type: "number",
            order: 3,
          },
          {
            id: "f_calc",
            key: "interest_payable",
            label: "Interest Payable",
            type: "calculated",
            order: 4,
            calculationConfig: {
              operation: "custom",
              formula: "(principal_amount * interest_rate * tenor_days) / 36500",
              operands: ["principal_amount", "interest_rate", "tenor_days"],
            },
          },
          {
            id: "f_lookup",
            key: "assigned_worker",
            label: "Assigned Worker",
            type: "lookup",
            order: 5,
            lookupConfig: {
              sourceType: "table",
              targetEntity: "members",
              displayField: "name",
              valueField: "id",
            },
          },
        ],
      },
    ],
  },
  tabs: [
    {
      id: "tab_general",
      key: "general",
      title: "General",
      type: "form",
      order: 0,
      columns: 2,
      sections: [],
    },
  ],
  rules: [],
  workflow: null,
  listView: { columns: [] },
  permissions: {},
  settings: {},
});

describe("Form Builder - Dropdown, Formula, and Lookup Improvements", () => {
  it("Requirement A: supports dropdown key/name separation where editing display name preserves the key", () => {
    const schema = createTestSchema();
    const handleSave = vi.fn();

    render(
      <FormBuilder
        initialSchema={schema}
        onSave={handleSave}
      />
    );

    // Select the category dropdown field in the canvas
    const categoryField = screen.getByRole("button", { name: /Category/i });
    fireEvent.click(categoryField);

    // Verify Option 1 has Display Name "Office Supplies" and lock badge "office_supplies"
    const nameInput = screen.getByLabelText("Option 1 display name") as HTMLInputElement;
    expect(nameInput.value).toBe("Office Supplies");
    expect(screen.getByText(/🔒 office_supplies/i)).toBeDefined();

    // Change display name from "Office Supplies" -> "Office Supply"
    fireEvent.change(nameInput, { target: { value: "Office Supply" } });
    expect(nameInput.value).toBe("Office Supply");
    // Verify the immutable key badge still shows "office_supplies"
    expect(screen.getByText(/🔒 office_supplies/i)).toBeDefined();

    // Add a new option: "Maintenance 24/7"
    const newOptionInput = screen.getByLabelText("New option display name");
    fireEvent.change(newOptionInput, { target: { value: "Maintenance 24/7" } });
    expect(screen.getByText(/→ maintenance_24_7/i)).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    // Verify newly added option exists in the list
    expect(screen.getByDisplayValue("Maintenance 24/7")).toBeDefined();
    expect(screen.getByText(/🔒 maintenance_24_7/i)).toBeDefined();
  });

  it("Requirement B: supports custom formula editor with live sample evaluation", () => {
    const schema = createTestSchema();
    const handleSave = vi.fn();

    render(
      <FormBuilder
        initialSchema={schema}
        onSave={handleSave}
      />
    );

    // Select the calculated field "Interest Payable"
    const calcField = screen.getByRole("button", { name: /Interest Payable/i });
    fireEvent.click(calcField);

    // Check that Custom Formula mode is active
    expect(screen.getByRole("button", { name: "Custom Formula" })).toBeDefined();

    const formulaInput = screen.getByLabelText("Calculation formula") as HTMLInputElement;
    expect(formulaInput.value).toBe("(principal_amount * interest_rate * tenor_days) / 36500");

    // Live syntax validation passes
    expect(screen.getByText(/✓ Valid syntax/i)).toBeDefined();
    expect(screen.getByText(/principal_amount, interest_rate, tenor_days/i)).toBeDefined();

    // Enter test values in the live tester:
    // principal_amount = 1000000, interest_rate = 18, tenor_days = 60
    const testerInputs = screen.getAllByRole("spinbutton");
    // Enter 1000000 into principal_amount
    fireEvent.change(testerInputs[0]!, { target: { value: "1000000" } });
    // Enter 18 into interest_rate
    fireEvent.change(testerInputs[1]!, { target: { value: "18" } });
    // Enter 60 into tenor_days
    fireEvent.change(testerInputs[2]!, { target: { value: "60" } });

    // Live preview must evaluate (1000000 * 18 * 60) / 36500 = 29589.0411
    expect(screen.getByText("29589.0411")).toBeDefined();
  });

  it("Requirement C: supports configuring multi-source lookups (Tenant Data Source, Member Roster, REST API)", () => {
    const schema = createTestSchema();
    const handleSave = vi.fn();

    render(
      <FormBuilder
        initialSchema={schema}
        onSave={handleSave}
      />
    );

    // Select the lookup field "Assigned Worker"
    const lookupField = screen.getByRole("button", { name: /Assigned Worker/i });
    fireEvent.click(lookupField);

    // Verify source type selector is present
    const sourceTypeSelect = screen.getByLabelText("Lookup source type") as HTMLSelectElement;
    expect(sourceTypeSelect.value).toBe("table");
    expect(screen.getByText(/Platform Member Roster:/i)).toBeDefined();

    // Switch to External REST API
    fireEvent.change(sourceTypeSelect, { target: { value: "api" } });
    expect(screen.getByLabelText("Lookup API endpoint")).toBeDefined();
    expect(screen.getByLabelText("Lookup API method")).toBeDefined();
    expect(screen.getByText(/External APIs are protected against SSRF/i)).toBeDefined();

    // Switch to Tenant Data Source
    fireEvent.change(sourceTypeSelect, { target: { value: "data_source" } });
    expect(screen.getByLabelText("Lookup entity")).toBeDefined();
  });

  it("Raw-text editor enforces key immutability and rejects duplicate keys", () => {
    const schema = createTestSchema();
    const handleSave = vi.fn();

    render(<FormBuilder initialSchema={schema} onSave={handleSave} />);

    // Select category dropdown field
    const categoryField = screen.getByRole("button", { name: /Category/i });
    fireEvent.click(categoryField);

    // Switch to Bulk / Raw View
    const toggleBtn = screen.getByRole("button", { name: /Bulk \/ Raw View/i });
    fireEvent.click(toggleBtn);

    const textarea = screen.getByLabelText("Dropdown options") as HTMLTextAreaElement;
    expect(textarea.value).toContain("Office Supplies = office_supplies");

    // Attempt to change existing key for "Office Supplies"
    fireEvent.change(textarea, {
      target: { value: "Office Supplies = brand_new_key\nComputers = computers" },
    });
    expect(
      screen.getByText(/Existing key "office_supplies" cannot be changed/i),
    ).toBeDefined();

    // Attempt to input duplicate keys
    fireEvent.change(textarea, {
      target: { value: "Supplies A = supplies\nSupplies B = supplies" },
    });
    expect(
      screen.getByText(/Duplicate option key "supplies" is not allowed/i),
    ).toBeDefined();

    // Valid edit: changing display label while keeping key identical
    fireEvent.change(textarea, {
      target: { value: "Office Supply Store = office_supplies\nComputers = computers" },
    });
    // Error should be cleared
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("Field key renaming cascades across custom formulas automatically", () => {
    const schema = createTestSchema();
    const handleSave = vi.fn();

    render(<FormBuilder initialSchema={schema} onSave={handleSave} />);

    // Select "Tenor Days" field
    const tenorField = screen.getByRole("button", { name: /Tenor Days/i });
    fireEvent.click(tenorField);

    // Rename key from "tenor_days" to "tenor_period"
    const keyInput = screen.getByLabelText("Field key") as HTMLInputElement;
    expect(keyInput.value).toBe("tenor_days");
    fireEvent.change(keyInput, { target: { value: "tenor_period" } });

    // Now select the calculated field "Interest Payable"
    const calcField = screen.getByRole("button", { name: /Interest Payable/i });
    fireEvent.click(calcField);

    // Verify the formula was updated to use tenor_period instead of tenor_days
    const formulaInput = screen.getByLabelText("Calculation formula") as HTMLInputElement;
    expect(formulaInput.value).toBe(
      "(principal_amount * interest_rate * tenor_period) / 36500",
    );
  });

  it("supports configurable calculation precision with live sample rounding", () => {
    const schema = createTestSchema();
    const handleSave = vi.fn();

    render(<FormBuilder initialSchema={schema} onSave={handleSave} />);

    // Select calculated field "Interest Payable"
    const calcField = screen.getByRole("button", { name: /Interest Payable/i });
    fireEvent.click(calcField);

    // Select Decimal Precision dropdown and change to 2 decimals
    const precisionSelect = screen.getByLabelText("Decimal Precision") as HTMLSelectElement;
    expect(precisionSelect.value).toBe("default");

    fireEvent.change(precisionSelect, { target: { value: "2" } });
    expect(precisionSelect.value).toBe("2");

    // Enter test values: 1000000, 18, 60
    const testerInputs = screen.getAllByRole("spinbutton");
    fireEvent.change(testerInputs[0]!, { target: { value: "1000000" } });
    fireEvent.change(testerInputs[1]!, { target: { value: "18" } });
    fireEvent.change(testerInputs[2]!, { target: { value: "60" } });

    // With precision 2, 29589.04109589... rounds to 29589.04 instead of 29589.0411!
    expect(screen.getByText("29589.04")).toBeDefined();
  });
});
