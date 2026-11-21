import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { FormSchemaV1 } from "@field/form-engine";
import { FormRenderer } from "@field/form-renderer";
import { FormBuilder } from "../form-builder";

afterEach(cleanup);

const createTestSchema = (): FormSchemaV1 => ({
  schemaVersion: 1,
  form: {
    id: "form_requisition_test",
    key: "requisition_test",
    title: "Requisition Test",
    schemaVersion: 1,
  },
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
            id: "f_qty",
            key: "quantity",
            label: "Quantity",
            type: "number",
            order: 0,
          },
          {
            id: "f_cost",
            key: "estimated_cost",
            label: "Estimated Cost",
            type: "currency",
            order: 1,
          },
          {
            id: "f_total",
            key: "total_amount",
            label: "Total Amount",
            type: "calculated",
            order: 2,
            calculationConfig: {
              operation: "custom",
              formula: "quantity * estimated_cost",
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
      sections: [],
    },
  ],
  rules: [],
  workflow: null,
  listView: {
    columns: [],
  },
  permissions: {},
  settings: {},
});

describe("Form Builder Field Key Locking and Behavior", () => {
  it("keeps key unchanged when label is renamed after creation", () => {
    const onChange = vi.fn();
    render(
      <FormBuilder
        initialSchema={createTestSchema()}
        onChange={onChange}
      />,
    );

    // Select the "Estimated Cost" field
    fireEvent.click(screen.getByText("Estimated Cost"));

    const labelInput = screen.getByLabelText("Field label") as HTMLInputElement;
    expect(labelInput.value).toBe("Estimated Cost");

    // Rename the label to "Unit Price (USD)" and blur
    fireEvent.change(labelInput, { target: { value: "Unit Price (USD)" } });
    fireEvent.blur(labelInput);

    const updatedSchema = onChange.mock.lastCall?.[0] as FormSchemaV1;
    const costField = updatedSchema.header.sections[0].fields.find(
      (f) => f.id === "f_cost",
    );

    // Label changed, but key remained strictly "estimated_cost"
    expect(costField?.label).toBe("Unit Price (USD)");
    expect(costField?.key).toBe("estimated_cost");
  });

  it("formula using quantity * estimated_cost continues to evaluate correctly after label rename", () => {
    const onChange = vi.fn();
    render(
      <FormBuilder
        initialSchema={createTestSchema()}
        onChange={onChange}
      />,
    );

    // Select "Estimated Cost" and rename label to "Unit Price (USD)"
    fireEvent.click(screen.getByText("Estimated Cost"));
    const labelInput = screen.getByLabelText("Field label") as HTMLInputElement;
    fireEvent.change(labelInput, { target: { value: "Unit Price (USD)" } });
    fireEvent.blur(labelInput);

    const updatedSchema = onChange.mock.lastCall?.[0] as FormSchemaV1;
    expect(updatedSchema.header.sections[0].fields[1].key).toBe("estimated_cost");

    cleanup();

    // Render using FormRenderer with existing submission data
    // Field values reference the machine keys "quantity" and "estimated_cost"
    render(
      <FormRenderer
        schema={updatedSchema}
        value={{
          fields: { quantity: 5, estimated_cost: 200 },
          details: {},
          notes: {},
          documents: {},
        }}
      />,
    );

    // The calculated field formula "quantity * estimated_cost" evaluates 5 * 200 = 1000
    // and displays 1000, while the label renders the updated label "Unit Price (USD)"
    expect(screen.getByText("Unit Price (USD)")).toBeTruthy();
    const totalInput = screen.getByLabelText(/Total Amount/i) as HTMLInputElement;
    expect(totalInput.value).toBe("1000");
    expect(totalInput.disabled).toBe(true);
  });

  it("shows lock badge in Advanced Settings when form is locked (published or has submissions)", () => {
    render(
      <FormBuilder
        initialSchema={createTestSchema()}
        isLocked={true}
      />,
    );

    // Select the "Quantity" field
    fireEvent.click(screen.getByText("Quantity"));

    // Check Advanced / Developer Settings section
    expect(screen.getByText("Advanced / Developer Settings")).toBeTruthy();

    // In locked mode, a lock badge is shown and key input is not editable
    expect(screen.getByText(/🔒 Key:/)).toBeTruthy();
    expect(screen.getByText("quantity")).toBeTruthy();
    expect(
      screen.getByText(/Key is immutable because this form has been published or has recorded submissions/),
    ).toBeTruthy();
    expect(screen.queryByLabelText("Field key")).toBeNull();
  });

  it("allows editing field key with live validation when form is unlocked (draft with zero submissions)", () => {
    const onChange = vi.fn();
    render(
      <FormBuilder
        initialSchema={createTestSchema()}
        isLocked={false}
        onChange={onChange}
      />,
    );

    // Select the "Quantity" field
    fireEvent.click(screen.getByText("Quantity"));

    // Key input is available
    const keyInput = screen.getByLabelText("Field key") as HTMLInputElement;
    expect(keyInput.value).toBe("quantity");

    // 1. Try editing to a collision (already in use: "estimated_cost")
    fireEvent.change(keyInput, { target: { value: "estimated_cost" } });
    expect(
      screen.getByText('Field key "estimated_cost" is already in use on this form.'),
    ).toBeTruthy();

    // 2. Try editing to a reserved word ("delete")
    fireEvent.change(keyInput, { target: { value: "delete" } });
    expect(
      screen.getByText('"delete" is a reserved word and cannot be used as a field key.'),
    ).toBeTruthy();

    // 3. Edit to a valid unique key ("req_quantity")
    fireEvent.change(keyInput, { target: { value: "req_quantity" } });
    expect(screen.queryByRole("alert")).toBeNull();

    const updatedSchema = onChange.mock.lastCall?.[0] as FormSchemaV1;
    const qtyField = updatedSchema.header.sections[0].fields.find(
      (f) => f.id === "f_qty",
    );
    expect(qtyField?.key).toBe("req_quantity");
  });

  it("keeps section key unchanged when section title is renamed after creation", () => {
    const onChange = vi.fn();
    render(
      <FormBuilder
        initialSchema={createTestSchema()}
        onChange={onChange}
      />,
    );

    // Click on the Section header to select it
    fireEvent.click(screen.getByText("Header Section"));

    const titleInput = screen.getByLabelText("Section title") as HTMLInputElement;
    expect(titleInput.value).toBe("Header Section");

    // Rename the section title and blur
    fireEvent.change(titleInput, { target: { value: "Requisition Details" } });
    fireEvent.blur(titleInput);

    const updatedSchema = onChange.mock.lastCall?.[0] as FormSchemaV1;
    const headerSec = updatedSchema.header.sections[0];

    // Title updated, but section key stayed immutable ("sec_header")
    expect(headerSec.title).toBe("Requisition Details");
    expect(headerSec.key).toBe("sec_header");
  });

  it("shows lock badge for section key in Advanced Settings when form is locked", () => {
    render(
      <FormBuilder
        initialSchema={createTestSchema()}
        isLocked={true}
      />,
    );

    // Select the section
    fireEvent.click(screen.getByText("Header Section"));

    // Check Advanced Settings
    expect(screen.getByText("Advanced / Developer Settings")).toBeTruthy();
    expect(screen.getByText(/🔒 Key:/)).toBeTruthy();
    expect(screen.getByText("sec_header")).toBeTruthy();
    expect(screen.queryByLabelText("Section key")).toBeNull();
  });

  it("allows editing section key with live validation when form is unlocked", () => {
    const onChange = vi.fn();
    render(
      <FormBuilder
        initialSchema={createTestSchema()}
        isLocked={false}
        onChange={onChange}
      />,
    );

    // Select the section
    fireEvent.click(screen.getByText("Header Section"));

    const keyInput = screen.getByLabelText("Section key") as HTMLInputElement;
    expect(keyInput.value).toBe("sec_header");

    // 1. Try editing to a reserved word
    fireEvent.change(keyInput, { target: { value: "break" } });
    expect(
      screen.getByText('"break" is a reserved word and cannot be used as a field key.'),
    ).toBeTruthy();

    // 2. Edit to a valid unique key
    fireEvent.change(keyInput, { target: { value: "requisition_header" } });
    expect(screen.queryByRole("alert")).toBeNull();

    const updatedSchema = onChange.mock.lastCall?.[0] as FormSchemaV1;
    expect(updatedSchema.header.sections[0].key).toBe("requisition_header");
  });
});
