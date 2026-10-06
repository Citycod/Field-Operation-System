import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import type { FormSchemaV1, FormTabUnion } from "@field/form-engine";
import { FormBuilder } from "../form-builder";
import {
  createField,
  createTab,
  FIELD_TYPES,
  moveItem,
  TAB_TYPES,
} from "../state";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

afterEach(cleanup);

const blank = (): FormSchemaV1 => ({
  schemaVersion: 1,
  form: { id: "form_test", key: "test", title: "Test form", schemaVersion: 1 },
  header: { columns: 2, sections: [] },
  tabs: [
    {
      id: "general",
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

function ids() {
  let index = 0;
  return (prefix: string) => `${prefix}_${++index}`;
}

function openAddTab() {
  fireEvent.click(screen.getByRole("button", { name: "Add tab" }));
  return screen.getByRole("dialog", { name: "Add Tab" });
}

function addTab(title: string, type: string) {
  const dialog = openAddTab();
  fireEvent.change(within(dialog).getByLabelText("Tab name"), {
    target: { value: title },
  });
  fireEvent.click(
    within(dialog).getByRole("button", { name: new RegExp(type) }),
  );
  fireEvent.click(within(dialog).getByRole("button", { name: "Add Tab" }));
}

describe("schema factories", () => {
  it("creates only the ten approved field types with valid specialized defaults", () => {
    expect(FIELD_TYPES).toEqual([
      "text",
      "textarea",
      "number",
      "currency",
      "date",
      "dropdown",
      "checkbox",
      "lookup",
      "file",
      "calculated",
    ]);
    const fields = FIELD_TYPES.map((type, order) =>
      createField(type, `id_${type}`, `key_${type}`, order),
    );
    expect(fields.map((field) => field.type)).toEqual(FIELD_TYPES);
    expect(fields.find((field) => field.type === "lookup")).toHaveProperty(
      "lookupConfig.targetEntity",
      "local_options",
    );
    expect(fields.find((field) => field.type === "calculated")).toHaveProperty(
      "calculationConfig.operation",
      "sum",
    );
  });

  it("creates only the four approved tab types and permits repeated types", () => {
    expect(TAB_TYPES).toEqual(["form", "details", "notes", "documents"]);
    const tabs = [...TAB_TYPES, "details" as const].map((type, order) =>
      createTab(type, `Tab ${order}`, `id_${order}`, `key_${order}`, order),
    );
    expect(tabs.map((tab) => tab.type)).toEqual([
      "form",
      "details",
      "notes",
      "documents",
      "details",
    ]);
  });

  it("preserves stable IDs while reordering", () => {
    const items = [
      { id: "one", order: 0 },
      { id: "two", order: 1 },
      { id: "three", order: 2 },
    ];
    const moved = moveItem(items, "three", -1);
    expect(moved.map((item) => item.id)).toEqual(["one", "three", "two"]);
    expect(moved.map((item) => item.order)).toEqual([0, 1, 2]);
  });
});

describe("visual builder", () => {
  it("exposes an intentional mobile guidance state with renderer Preview access", () => {
    render(<FormBuilder initialSchema={blank()} />);
    const guidance = screen.getByLabelText("Mobile builder guidance");
    expect(guidance.textContent).toContain(
      "Form Builder is optimized for desktop or tablet authoring.",
    );
    fireEvent.click(
      within(guidance).getByRole("button", {
        name: "▷ Preview current draft",
      }),
    );
    expect(screen.getByRole("dialog", { name: "Form preview" })).toBeTruthy();
  });

  it("creates a header section, adds fields, and edits field properties", () => {
    const change = vi.fn();
    render(
      <FormBuilder
        initialSchema={blank()}
        onChange={change}
        createId={ids()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "＋ Header section" }));
    expect(screen.getByText("New section")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Add Text field" }));
    fireEvent.change(screen.getByLabelText("Field label"), {
      target: { value: "Site name" },
    });
    fireEvent.change(screen.getByLabelText("Field key"), {
      target: { value: "site-name" },
    });
    const schema = change.mock.lastCall?.[0] as FormSchemaV1;
    expect(schema.header.sections[0].fields[0]).toMatchObject({
      id: "field_2",
      label: "Site name",
      key: "site_name",
      type: "text",
    });
  });

  it("adds, reorders, and removes fields without changing surviving IDs", () => {
    const schema = blank();
    schema.header.sections = [
      {
        id: "section",
        key: "section",
        title: "Main",
        order: 0,
        fields: [
          createField("text", "stable_a", "a", 0),
          createField("number", "stable_b", "b", 1),
        ],
      },
    ];
    const change = vi.fn();
    render(<FormBuilder initialSchema={schema} onChange={change} />);
    fireEvent.click(screen.getByRole("button", { name: /Number · b/ }));
    fireEvent.click(screen.getByRole("button", { name: "Move up" }));
    let next = change.mock.lastCall?.[0] as FormSchemaV1;
    expect(next.header.sections[0].fields.map((field) => field.id)).toEqual([
      "stable_b",
      "stable_a",
    ]);
    fireEvent.click(screen.getByRole("button", { name: "Remove field" }));
    next = change.mock.lastCall?.[0] as FormSchemaV1;
    expect(next.header.sections[0].fields.map((field) => field.id)).toEqual([
      "stable_a",
    ]);
  });

  it("adds, configures, reorders, and removes sections with controlled layouts", () => {
    const schema = blank();
    schema.header.sections = [
      { id: "section_a", key: "a", title: "First", order: 0, fields: [] },
      { id: "section_b", key: "b", title: "Second", order: 1, fields: [] },
    ];
    const change = vi.fn();
    render(
      <FormBuilder initialSchema={schema} onChange={change} createId={ids()} />,
    );
    fireEvent.click(screen.getByText("Second", { exact: true }));
    fireEvent.change(screen.getByLabelText("Section width"), {
      target: { value: "half" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Move Second up" }));
    let next = change.mock.lastCall?.[0] as FormSchemaV1;
    expect(next.header.sections.map((section) => section.id)).toEqual([
      "section_b",
      "section_a",
    ]);
    expect(next.header.sections[0].width).toBe("half");
    fireEvent.click(screen.getByRole("button", { name: "Remove section" }));
    next = change.mock.lastCall?.[0] as FormSchemaV1;
    expect(next.header.sections.map((section) => section.id)).toEqual([
      "section_a",
    ]);
    fireEvent.click(screen.getByText("Header / Main information"));
    fireEvent.change(screen.getByLabelText("Header columns"), {
      target: { value: "4" },
    });
    next = change.mock.lastCall?.[0] as FormSchemaV1;
    expect(next.header.columns).toBe(4);
  });

  it("adds every tab type, including multiple tabs of the same type", () => {
    const change = vi.fn();
    render(
      <FormBuilder
        initialSchema={blank()}
        onChange={change}
        createId={ids()}
      />,
    );
    addTab("Details A", "Details / Grid");
    addTab("Details B", "Details / Grid");
    addTab("Comments", "Notes");
    addTab("Evidence", "Documents");
    const schema = change.mock.lastCall?.[0] as FormSchemaV1;
    expect(schema.tabs.map((tab) => tab.type)).toEqual([
      "form",
      "details",
      "details",
      "notes",
      "documents",
    ]);
    expect(schema.tabs.filter((tab) => tab.type === "details")).toHaveLength(2);
  });

  it("reorders tabs and preserves tab IDs", () => {
    const schema = blank();
    schema.tabs.push(createTab("notes", "Notes", "stable_notes", "notes", 1));
    const change = vi.fn();
    render(<FormBuilder initialSchema={schema} onChange={change} />);
    fireEvent.click(screen.getByRole("tab", { name: /Notes/ }));
    fireEvent.click(screen.getByRole("button", { name: "Move tab left" }));
    const next = change.mock.lastCall?.[0] as FormSchemaV1;
    expect(next.tabs.map((tab) => tab.id)).toEqual(["stable_notes", "general"]);
  });

  it("configures Details grid permissions and approved columns", () => {
    const schema = blank();
    schema.tabs.push(createTab("details", "Lines", "lines", "lines", 1));
    const change = vi.fn();
    render(
      <FormBuilder initialSchema={schema} onChange={change} createId={ids()} />,
    );
    fireEvent.click(screen.getByRole("tab", { name: /Lines/ }));
    fireEvent.click(screen.getByLabelText("Allow deleting rows"));
    fireEvent.click(screen.getByRole("button", { name: "Add Currency field" }));
    fireEvent.change(screen.getByLabelText("Field label"), {
      target: { value: "Amount" },
    });
    const next = change.mock.lastCall?.[0] as FormSchemaV1;
    const details = next.tabs.find((tab) => tab.id === "lines") as Extract<
      FormTabUnion,
      { type: "details" }
    >;
    expect(details.configuration.allowDelete).toBe(false);
    expect(details.configuration.columns[0]).toMatchObject({
      type: "currency",
      label: "Amount",
    });
  });

  it("configures Notes and Documents tabs", () => {
    const schema = blank();
    schema.tabs.push(createTab("notes", "Notes", "notes", "notes", 1));
    schema.tabs.push(createTab("documents", "Files", "files", "files", 2));
    const change = vi.fn();
    render(<FormBuilder initialSchema={schema} onChange={change} />);
    fireEvent.click(screen.getByRole("tab", { name: /Notes/ }));
    fireEvent.click(screen.getByLabelText("Allow attachments"));
    fireEvent.change(screen.getByLabelText("Default visibility"), {
      target: { value: "all_authorized_users" },
    });
    fireEvent.click(screen.getByRole("tab", { name: /Files/ }));
    fireEvent.click(screen.getByLabelText("Require a document"));
    fireEvent.change(screen.getByLabelText("Allowed extensions"), {
      target: { value: "pdf, csv" },
    });
    const next = change.mock.lastCall?.[0] as FormSchemaV1;
    expect(next.tabs.find((tab) => tab.id === "notes")).toMatchObject({
      allowAttachments: true,
      defaultVisibility: "all_authorized_users",
    });
    expect(next.tabs.find((tab) => tab.id === "files")).toMatchObject({
      required: true,
      allowedExtensions: ["pdf", "csv"],
    });
  });

  it("uses the Phase 2 renderer for validated preview", () => {
    render(<FormBuilder initialSchema={blank()} />);
    fireEvent.click(screen.getByRole("button", { name: "▷ Preview" }));
    const preview = screen.getByRole("dialog", { name: "Form preview" });
    expect(
      within(preview).getByRole("heading", { name: "Test form" }),
    ).toBeTruthy();
    expect(
      within(preview).getByText("No header fields configured."),
    ).toBeTruthy();
  });

  it("blocks preview and save when the existing engine validator rejects the schema", () => {
    const invalid = blank();
    invalid.schemaVersion = 2 as 1;
    const save = vi.fn();
    render(<FormBuilder initialSchema={invalid} onSave={save} />);
    fireEvent.click(screen.getByRole("button", { name: "▷ Preview" }));
    expect(screen.queryByRole("dialog", { name: "Form preview" })).toBeNull();
    expect(screen.getByRole("alert").textContent).toContain(
      "Unsupported schema version",
    );
    fireEvent.click(screen.getByRole("button", { name: "Save Draft" }));
    expect(save).not.toHaveBeenCalled();
  });

  it("validates and delegates save through the host callback without backend imports", async () => {
    const save = vi.fn();
    render(<FormBuilder initialSchema={blank()} onSave={save} />);
    fireEvent.click(screen.getByRole("button", { name: "Save Draft" }));
    await vi.waitFor(() => expect(save).toHaveBeenCalledOnce());
    expect(save.mock.calls[0][0]).toMatchObject({
      schemaVersion: 1,
      form: { id: "form_test" },
    });
  });

  it("reports persistence failures instead of showing a false save success", async () => {
    const save = vi
      .fn()
      .mockRejectedValue(new Error("Hosted draft write failed"));
    render(<FormBuilder initialSchema={blank()} onSave={save} />);
    fireEvent.click(screen.getByRole("button", { name: "Save Draft" }));
    await vi.waitFor(() =>
      expect(screen.getByRole("status").textContent).toContain(
        "Save failed: Hosted draft write failed",
      ),
    );
    expect(screen.getByRole("status").textContent).not.toContain(
      "Draft save completed",
    );
  });
});

it("contains no business-specific labels or direct Supabase imports in builder core", () => {
  const root = resolve(__dirname, "..");
  const source = readdirSync(root)
    .filter((file) => file.endsWith(".ts") || file.endsWith(".tsx"))
    .map((file) => readFileSync(resolve(root, file), "utf8"))
    .join("\n");
  expect(source).not.toMatch(/Purchase Requisition|Visitor/);
  expect(source).not.toMatch(/@supabase/);
});
