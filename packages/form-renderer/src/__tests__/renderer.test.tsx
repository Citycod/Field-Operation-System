import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import {
  ALL_FIELD_TYPES_SCHEMA,
  MINIMAL_VALID_SCHEMA,
  type FormSchemaV1,
  type DetailsTabDefinition,
} from "@field/form-engine";
import { FormRenderer } from "../form-renderer";
import { FIELD_REGISTRY } from "../fields";
import {
  changeRows,
  initialValue,
  inspectSchema,
  toOutputPayload,
  validateValue,
} from "../model";
import type { RendererValue } from "../types";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

afterEach(cleanup);
const fixture = (): FormSchemaV1 => structuredClone(ALL_FIELD_TYPES_SCHEMA);
const tab = (name: string) =>
  fireEvent.click(screen.getByRole("tab", { name }));
const details = (s = fixture()) =>
  s.tabs.find((t) => t.type === "details") as DetailsTabDefinition;

it("renders configured header, form sections and every approved registry entry", () => {
  render(<FormRenderer schema={fixture()} />);
  expect(screen.getByRole("heading", { name: "Header Details" })).toBeTruthy();
  expect(screen.getByLabelText("Header Text")).toBeTruthy();
  expect(
    screen.getByRole("heading", { name: "Main Fields Section" }),
  ).toBeTruthy();
  expect(Object.keys(FIELD_REGISTRY)).toEqual([
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
  for (const label of [
    "Text",
    "Textarea",
    "Number",
    "Currency",
    "Date",
    "Dropdown",
    "Checkbox",
    "Lookup",
    "File",
    "Calculated",
  ])
    expect(screen.getByLabelText(label)).toBeTruthy();
  expect(
    (screen.getByLabelText("Calculated") as HTMLInputElement).disabled,
  ).toBe(true);
});
it("retains values across tab changes and emits typed local state", () => {
  const change = vi.fn();
  render(<FormRenderer schema={fixture()} onChange={change} />);
  fireEvent.change(screen.getByLabelText("Number"), {
    target: { value: "12.5" },
  });
  fireEvent.click(screen.getByLabelText("Checkbox"));
  tab("Line Items");
  tab("All Fields");
  expect((screen.getByLabelText("Number") as HTMLInputElement).value).toBe(
    "12.5",
  );
  expect(change.mock.lastCall?.[0].fields.number_field).toBe(12.5);
  expect(change.mock.lastCall?.[0].fields.checkbox_field).toBe(true);
});
it("supports controlled values and schema replacement without stale state", () => {
  const schema = fixture();
  const value = initialValue(schema);
  value.fields.text_field = "Controlled";
  const change = vi.fn();
  const { rerender } = render(
    <FormRenderer schema={schema} value={value} onChange={change} />,
  );
  fireEvent.change(screen.getByLabelText("Text"), {
    target: { value: "Next" },
  });
  expect(change.mock.lastCall?.[0].fields.text_field).toBe("Next");
  expect((screen.getByLabelText("Text") as HTMLInputElement).value).toBe(
    "Controlled",
  );
  rerender(<FormRenderer schema={MINIMAL_VALID_SCHEMA} />);
  expect(screen.queryByLabelText("Text")).toBeNull();
});
it("renders unlimited configured tabs including repeated instances of all four types", () => {
  const s = fixture();
  for (let i = 0; i < 12; i++)
    s.tabs.push({
      id: `extra${i}`,
      key: `extra${i}`,
      title: `Custom ${i}`,
      order: i + 4,
      type: "form",
      sections: [],
    });
  s.tabs.push({
    ...details(s),
    id: "d2",
    key: "d2",
    title: "Second grid",
    order: 16,
    configuration: { columns: [] },
  });
  s.tabs.push({
    ...s.tabs[2],
    id: "n2",
    key: "n2",
    title: "Second notes",
    order: 17,
  });
  s.tabs.push({
    ...s.tabs[3],
    id: "f2",
    key: "f2",
    title: "Second documents",
    order: 18,
  });
  render(<FormRenderer schema={s} />);
  expect(screen.getAllByRole("tab")).toHaveLength(19);
  tab("Second grid");
  expect(screen.getByText("No columns configured.")).toBeTruthy();
  tab("Second notes");
  expect(screen.getByRole("textbox", { name: "Add a note" })).toBeTruthy();
  tab("Second documents");
  expect(
    screen.getByRole("tabpanel", { name: "Second documents" }),
  ).toBeTruthy();
});
it("implements keyboard tab navigation and associated panels", () => {
  render(<FormRenderer schema={fixture()} />);
  const first = screen.getByRole("tab", { name: "All Fields" });
  first.focus();
  fireEvent.keyDown(first, { key: "ArrowRight" });
  expect(document.activeElement).toBe(
    screen.getByRole("tab", { name: "Line Items" }),
  );
  expect(screen.getByRole("tabpanel", { name: "Line Items" })).toBeTruthy();
  fireEvent.keyDown(document.activeElement!, { key: "End" });
  expect(document.activeElement).toBe(
    screen.getByRole("tab", { name: "Attachments" }),
  );
});
it("renders grid columns and adds, edits, deletes stable rows", () => {
  const change = vi.fn();
  render(<FormRenderer schema={fixture()} onChange={change} />);
  tab("Line Items");
  expect(screen.getByRole("columnheader", { name: "Item" })).toBeTruthy();
  expect(screen.getByRole("columnheader", { name: "Qty" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "+ Add row" }));
  const rowId = change.mock.lastCall?.[0].details.line_items[0].id;
  fireEvent.change(screen.getByLabelText("Item"), {
    target: { value: "Generic resource" },
  });
  expect(change.mock.lastCall?.[0].details.line_items[0]).toMatchObject({
    id: rowId,
    values: { item_name: "Generic resource" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Delete row 1" }));
  expect(change.mock.lastCall?.[0].details.line_items).toEqual([]);
});
it("honors grid add/edit/delete restrictions in UI", () => {
  const s = fixture();
  details(s).configuration = {
    ...details(s).configuration,
    allowAdd: false,
    allowEdit: false,
    allowDelete: false,
  };
  const v = initialValue(s);
  v.details.line_items = [{ id: "r1", values: { item_name: "Locked" } }];
  render(<FormRenderer schema={s} initialValue={v} />);
  tab("Line Items");
  expect(screen.queryByRole("button", { name: "+ Add row" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Delete row 1" })).toBeNull();
  expect((screen.getByLabelText("Item") as HTMLInputElement).disabled).toBe(
    true,
  );
});
it("validates required fields across inactive tabs and prevents output", () => {
  const s = fixture();
  s.header.sections[0].fields[0].required = true;
  const formTab = s.tabs[0];
  if (formTab.type === "form") formTab.sections[0].fields[0].required = true;
  const submit = vi.fn();
  render(<FormRenderer schema={s} onSubmit={submit} />);
  tab("Audit Notes");
  fireEvent.click(screen.getByRole("button", { name: "Validate form" }));
  expect(screen.getByRole("alert").textContent).toContain("Header Text");
  expect(submit).not.toHaveBeenCalled();
  fireEvent.change(screen.getByRole("textbox", { name: "Header Text" }), {
    target: { value: "Header" },
  });
  tab("All Fields");
  fireEvent.change(screen.getByRole("textbox", { name: "Text", exact: true }), {
    target: { value: "Body" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Validate form" }));
  expect(submit).toHaveBeenCalledOnce();
});
it("preview is interactive but cannot invoke the submission callback", () => {
  const submit = vi.fn(),
    preview = vi.fn();
  render(
    <FormRenderer
      schema={fixture()}
      mode="preview"
      onSubmit={submit}
      onPreview={preview}
    />,
  );
  fireEvent.change(screen.getByLabelText("Text"), {
    target: { value: "Preview text" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Validate preview" }));
  expect(submit).not.toHaveBeenCalled();
  expect(preview.mock.lastCall?.[0].fields.text_field).toBe("Preview text");
  expect(screen.getByRole("status").textContent).toContain("Nothing was saved");
});
it("read-only disables every field and removes all mutating actions", () => {
  render(<FormRenderer schema={fixture()} mode="readOnly" />);
  for (const el of document.querySelectorAll("input,textarea,select"))
    expect((el as HTMLInputElement).disabled).toBe(true);
  expect(screen.queryByRole("button", { name: "Validate form" })).toBeNull();
  tab("Line Items");
  expect(screen.queryByRole("button", { name: "+ Add row" })).toBeNull();
  tab("Audit Notes");
  expect(screen.queryByRole("button", { name: "Add note" })).toBeNull();
  tab("Attachments");
  expect(screen.queryByLabelText("Choose documents")).toBeNull();
});
it.each([
  null,
  { schemaVersion: 42 },
  { ...MINIMAL_VALID_SCHEMA, header: null },
])("fails safely on invalid input %#", (schema) => {
  render(<FormRenderer schema={schema} />);
  expect(screen.getByRole("alert").textContent).toContain(
    "cannot be displayed",
  );
});
it("rejects unknown field/tab types safely", () => {
  const s = fixture();
  Object.assign(s.header.sections[0].fields[0], { type: "script" });
  const { rerender } = render(<FormRenderer schema={s} />);
  expect(screen.getByRole("alert").textContent).toContain(
    "Unsupported field type",
  );
  const t = fixture();
  Object.assign(t.tabs[0], { type: "unknown" });
  rerender(<FormRenderer schema={t} />);
  expect(screen.getByRole("alert").textContent).toContain(
    "Unsupported tab type",
  );
});
it("empty header, sections, fields and tabs are safe", () => {
  const { rerender } = render(<FormRenderer schema={MINIMAL_VALID_SCHEMA} />);
  expect(screen.getByText("No header fields configured.")).toBeTruthy();
  expect(screen.getByText("No sections configured.")).toBeTruthy();
  rerender(<FormRenderer schema={{ ...MINIMAL_VALID_SCHEMA, tabs: [] }} />);
  expect(screen.getByText("No tabs configured.")).toBeTruthy();
});
it("lookup provider supports loading, failure, retry and selecting local options", async () => {
  const provider = vi
    .fn()
    .mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValue([{ label: "Team A", value: "a" }]);
  render(<FormRenderer schema={fixture()} lookupProvider={provider} />);
  await screen.findByText("Options could not be loaded.");
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  await screen.findByRole("option", { name: "Team A" });
  fireEvent.change(screen.getByLabelText("Lookup"), { target: { value: "a" } });
  expect((screen.getByLabelText("Lookup") as HTMLSelectElement).value).toBe(
    "a",
  );
});
it("notes append without overwriting and honor the local author contract", () => {
  const change = vi.fn();
  render(
    <FormRenderer
      schema={fixture()}
      onChange={change}
      noteAuthor="Test author"
    />,
  );
  tab("Audit Notes");
  for (const text of ["First note", "Second note"]) {
    fireEvent.change(screen.getByLabelText("Add a note"), {
      target: { value: text },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add note" }));
  }
  expect(
    change.mock.lastCall?.[0].notes.notes_tab.map(
      (n: { text: string }) => n.text,
    ),
  ).toEqual(["First note", "Second note"]);
  expect(screen.getAllByText("Test author")).toHaveLength(2);
});
it("documents enforce extensions, size/count and deletion flags without uploading", () => {
  const s = fixture();
  const d = s.tabs[3];
  if (d.type !== "documents") throw new Error();
  Object.assign(d, {
    allowedExtensions: ["txt"],
    maxFiles: 1,
    maxFileSizeMb: 1,
    allowDeleteBeforeSubmit: true,
  });
  const change = vi.fn();
  render(<FormRenderer schema={s} onChange={change} />);
  tab("Attachments");
  fireEvent.change(screen.getByLabelText("Choose documents"), {
    target: { files: [new File(["bad"], "bad.exe")] },
  });
  expect(screen.getByRole("alert").textContent).toContain(
    "unsupported file extension",
  );
  expect(change).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText("Choose documents"), {
    target: { files: [new File(["ok"], "brief.txt")] },
  });
  expect(change.mock.lastCall?.[0].documents.docs_tab).toHaveLength(1);
  fireEvent.change(screen.getByLabelText("Choose documents"), {
    target: { files: [new File(["ok"], "second.txt")] },
  });
  expect(screen.getByRole("alert").textContent).toContain("no more than 1");
  fireEvent.click(screen.getByRole("button", { name: "Remove brief.txt" }));
  expect(change.mock.lastCall?.[0].documents.docs_tab).toEqual([]);
});
it("selected files yield metadata without binary objects in output", () => {
  const change = vi.fn();
  render(<FormRenderer schema={fixture()} onChange={change} />);
  fireEvent.change(screen.getByLabelText("File"), {
    target: { files: [new File(["data"], "file.txt")] },
  });
  const v = change.mock.lastCall?.[0] as RendererValue;
  expect(JSON.stringify(toOutputPayload(v))).toContain("file.txt");
  expect((toOutputPayload(v) as RendererValue).fields.file_field).toEqual([
    expect.objectContaining({ name: "file.txt" }),
  ]);
  expect(JSON.stringify(toOutputPayload(v))).not.toContain('"file":');
});
it("does not hardcode business process labels or infrastructure imports in core", () => {
  const dir = resolve(__dirname, "..");
  for (const file of readdirSync(dir).filter((f) => /\.(ts|tsx)$/.test(f))) {
    const code = readFileSync(resolve(dir, file), "utf8");
    expect(code).not.toMatch(
      /Purchase Requisition|Visitor|@supabase|next\/server/,
    );
  }
});

describe("local state and validation contracts", () => {
  it("guards row permissions, read-only/calculated columns and row bounds", () => {
    const t = details();
    t.configuration.maxRows = 1;
    t.configuration.minRows = 1;
    const rows = changeRows(t, [], { type: "add", id: "a" }, "edit");
    expect(changeRows(t, rows, { type: "add", id: "b" }, "edit")).toBe(rows);
    expect(changeRows(t, rows, { type: "delete", id: "a" }, "edit")).toBe(rows);
    expect(
      changeRows(
        t,
        rows,
        { type: "edit", id: "a", key: "item_name", value: "x" },
        "readOnly",
      ),
    ).toBe(rows);
    t.configuration.columns[0].readOnly = true;
    expect(
      changeRows(
        t,
        rows,
        { type: "edit", id: "a", key: "item_name", value: "x" },
        "edit",
      ),
    ).toBe(rows);
  });
  it("required checkbox, row cells, documents and zero-valued numbers validate correctly", () => {
    const s = fixture();
    const t = s.tabs[0];
    if (t.type !== "form") throw new Error();
    t.sections[0].fields.find((f) => f.type === "number")!.required = true;
    t.sections[0].fields.find((f) => f.type === "checkbox")!.required = true;
    details(s).configuration.columns[0].required = true;
    const d = s.tabs[3];
    if (d.type === "documents") d.required = true;
    const v = initialValue(s);
    v.fields.number_field = 0;
    v.details.line_items = [{ id: "r", values: {} }];
    const errors = validateValue(s, v);
    expect(errors.map((e) => e.path)).toEqual([
      "fields.checkbox_field",
      "details.line_items.r.item_name",
      "documents.docs_tab",
    ]);
  });
  it("validates malformed dates and numeric limits", () => {
    const s = fixture();
    const t = s.tabs[0];
    if (t.type !== "form") throw new Error();
    const f = t.sections[0].fields.find((f) => f.type === "number");
    if (f?.type === "number") f.validation = { min: 1 };
    const v = initialValue(s);
    v.fields.number_field = -1;
    v.fields.date_field = "2026-02-31";
    expect(validateValue(s, v).map((e) => e.path)).toEqual([
      "fields.number_field",
      "fields.date_field",
    ]);
  });
  it("does not mutate schema or seed values during validation", () => {
    const s = fixture(),
      before = JSON.stringify(s);
    const v = initialValue(s);
    validateValue(s, v);
    expect(JSON.stringify(s)).toBe(before);
    expect(inspectSchema(s).errors).toEqual([]);
  });
});

it("rejects malformed optional file configuration without a render crash", () => {
  const s = fixture();
  const t = s.tabs[0];
  if (t.type !== "form") throw new Error();
  Object.assign(
    t.sections[0].fields.find((f) => f.type === "file")!,
    { validation: { allowedFileExtensions: {} } },
  );
  render(<FormRenderer schema={s} />);
  expect(screen.getByRole("alert").textContent).toContain(
    "Invalid file extensions",
  );
});
it("treats object-prototype names as ordinary configured tab keys", () => {
  const s = fixture();
  details(s).key = "__proto__";
  render(<FormRenderer schema={s} />);
  tab("Line Items");
  fireEvent.click(screen.getByRole("button", { name: "+ Add row" }));
  expect(screen.getByLabelText("Item")).toBeTruthy();
});
