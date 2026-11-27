import type {
  DetailsColumnDefinition,
  FieldDefinition,
  FieldType,
  FormSchemaV1,
  FormSectionDefinition,
  FormTabUnion,
  HeaderSectionDefinition,
  TabType,
} from "@field/form-engine";

export const FIELD_TYPES: readonly FieldType[] = [
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
];

export const TAB_TYPES: readonly TabType[] = [
  "form",
  "details",
  "notes",
  "documents",
];

export const FIELD_LABELS: Record<FieldType, string> = {
  text: "Text",
  textarea: "Long Text",
  number: "Number",
  currency: "Currency",
  date: "Date",
  dropdown: "Dropdown",
  checkbox: "Checkbox",
  lookup: "Lookup",
  file: "File",
  calculated: "Calculated",
};

export const FIELD_DESCRIPTIONS: Record<FieldType, string> = {
  text: "Short single-line answer",
  textarea: "Multi-line notes or comments",
  number: "Whole or decimal count",
  currency: "Money amount with precision",
  date: "Calendar date picker",
  dropdown: "Pick one from a fixed list",
  checkbox: "Yes / No toggle check",
  lookup: "Pick from a connected list",
  file: "Upload document or photo",
  calculated: "Auto-computed total or score",
};

export const FIELD_EXAMPLES: Record<FieldType, string> = {
  text: "e.g. Request Title, Department",
  textarea: "e.g. Justification or delivery notes",
  number: "e.g. Quantity, Units",
  currency: "e.g. Unit Cost, Total Amount",
  date: "e.g. Needed By, Inspection Date",
  dropdown: "e.g. Priority (Low, Medium, High)",
  checkbox: "e.g. Urgent request, Safety check",
  lookup: "e.g. Supplier, Site, Asset",
  file: "e.g. Quote PDF, Inspection photo",
  calculated: "e.g. Quantity × Unit Cost",
};

export const TAB_LABELS: Record<TabType, string> = {
  form: "Form / Fields",
  details: "Details / Grid",
  notes: "Notes",
  documents: "Documents",
};

export const TAB_DESCRIPTIONS: Record<TabType, string> = {
  form: "Organize extra fields into grouped sections",
  details: "Repeatable line-item table for quantities, costs, or checklist rows",
  notes: "Chronological activity notes and comments",
  documents: "Supporting file attachments and required uploads",
};

export function defaultId(prefix: string): string {
  const value =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  return `${prefix}_${value}`;
}

export function slugify(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
  return slug || "item";
}

export function uniqueKey(base: string, used: Iterable<string>): string {
  const keys = new Set(used);
  if (!keys.has(base)) return base;
  let index = 2;
  while (keys.has(`${base}_${index}`)) index += 1;
  return `${base}_${index}`;
}

export function normalizeOrder<T extends { order: number }>(
  items: readonly T[],
): T[] {
  return items.map((item, order) => ({ ...item, order }));
}

export function moveItem<T extends { order: number }>(
  items: readonly T[],
  id: string,
  direction: -1 | 1,
): T[] {
  const index = items.findIndex((item) => "id" in item && item.id === id);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= items.length) return [...items];
  const next = [...items];
  [next[index], next[target]] = [next[target], next[index]];
  return normalizeOrder(next);
}

export function createField(
  type: FieldType,
  id: string,
  key: string,
  order: number,
): FieldDefinition {
  const common = {
    id,
    key,
    label: FIELD_LABELS[type],
    type,
    order,
    width: "full" as const,
  };
  switch (type) {
    case "dropdown":
      return {
        ...common,
        type,
        options: [{ label: "Option 1", value: "option_1" }],
      };
    case "lookup":
      return {
        ...common,
        type,
        lookupConfig: {
          targetEntity: "local_options",
          displayField: "label",
          valueField: "value",
        },
      };
    case "calculated":
      return {
        ...common,
        type,
        readOnly: true,
        calculationConfig: { operation: "sum", operands: [] },
      };
    case "currency":
      return { ...common, type, currencyCode: "USD" };
    default:
      return { ...common, type } as FieldDefinition;
  }
}

export function createDetailColumn(
  type: FieldType,
  id: string,
  key: string,
  order: number,
): DetailsColumnDefinition {
  const column: DetailsColumnDefinition = {
    id,
    key,
    label: FIELD_LABELS[type],
    type,
    order,
  };
  if (type === "dropdown")
    column.options = [{ label: "Option 1", value: "option_1" }];
  if (type === "lookup")
    column.lookupConfig = {
      targetEntity: "local_options",
      displayField: "label",
      valueField: "value",
    };
  if (type === "calculated") {
    column.readOnly = true;
    column.calculationConfig = { operation: "sum", operands: [] };
  }
  return column;
}

export function createSection(
  area: "header" | "tab",
  id: string,
  key: string,
  order: number,
): HeaderSectionDefinition | FormSectionDefinition {
  if (area === "header")
    return { id, key, title: "New section", order, width: "full", fields: [] };
  return { id, key, title: "New section", order, columns: 2, fields: [] };
}

export function createTab(
  type: TabType,
  title: string,
  id: string,
  key: string,
  order: number,
): FormTabUnion {
  const base = { id, key, title, type, order };
  switch (type) {
    case "form":
      return { ...base, type, columns: 2, sections: [] };
    case "details":
      return {
        ...base,
        type,
        configuration: {
          allowAdd: true,
          allowEdit: true,
          allowDelete: true,
          columns: [],
        },
      };
    case "notes":
      return {
        ...base,
        type,
        appendOnly: true,
        showAuthor: true,
        showTimestamp: true,
        allowAttachments: false,
        defaultVisibility: "internal",
      };
    case "documents":
      return {
        ...base,
        type,
        allowMultiple: true,
        required: false,
        maxFiles: 10,
        maxFileSizeMb: 10,
        allowedExtensions: ["pdf", "docx", "png", "jpg"],
        allowDeleteBeforeSubmit: true,
      };
  }
}

export function updateSection(
  schema: FormSchemaV1,
  area: "header" | "tab",
  sectionId: string,
  update: (
    section: HeaderSectionDefinition | FormSectionDefinition,
  ) => HeaderSectionDefinition | FormSectionDefinition,
  tabId?: string,
): FormSchemaV1 {
  if (area === "header") {
    return {
      ...schema,
      header: {
        ...schema.header,
        sections: schema.header.sections.map((s) =>
          s.id === sectionId ? (update(s) as HeaderSectionDefinition) : s,
        ),
      },
    };
  }
  return {
    ...schema,
    tabs: schema.tabs.map((tab) =>
      tab.id === tabId && tab.type === "form"
        ? {
            ...tab,
            sections: tab.sections.map((s) =>
              s.id === sectionId ? (update(s) as FormSectionDefinition) : s,
            ),
          }
        : tab,
    ),
  };
}

export function collectFieldKeys(schema: FormSchemaV1): string[] {
  const keys = schema.header.sections.flatMap((section) =>
    section.fields.map((field) => field.key),
  );
  for (const tab of schema.tabs) {
    if (tab.type === "form")
      keys.push(
        ...tab.sections.flatMap((section) =>
          section.fields.map((field) => field.key),
        ),
      );
    if (tab.type === "details")
      keys.push(...tab.configuration.columns.map((column) => column.key));
  }
  return keys;
}

export function cloneSchema(schema: FormSchemaV1): FormSchemaV1 {
  return structuredClone(schema);
}

export function reorderFieldById<T extends { id: string; order: number }>(
  items: T[],
  draggedId: string,
  targetId: string,
): T[] {
  const fromIdx = items.findIndex((item) => item.id === draggedId);
  const toIdx = items.findIndex((item) => item.id === targetId);
  if (fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) return items;
  const next = [...items];
  const [moved] = next.splice(fromIdx, 1);
  next.splice(toIdx, 0, moved);
  return next.map((item, idx) => ({ ...item, order: idx + 1 }));
}

export function moveFieldBetweenSections(
  schema: FormSchemaV1,
  source: { area: "header" | "tab"; tabId?: string; sectionId: string; fieldId: string },
  target: { area: "header" | "tab"; tabId?: string; sectionId: string; beforeFieldId?: string },
): FormSchemaV1 {
  if (
    source.area === target.area &&
    source.tabId === target.tabId &&
    source.sectionId === target.sectionId
  ) {
    if (!target.beforeFieldId) return schema;
    return updateSection(
      schema,
      source.area,
      source.sectionId,
      (sec) => ({
        ...sec,
        fields: reorderFieldById(sec.fields, source.fieldId, target.beforeFieldId!),
      }),
      source.tabId,
    );
  }

  let movedField: FieldDefinition | undefined;
  const findSectionFields = (sec: HeaderSectionDefinition | FormSectionDefinition) => {
    movedField = sec.fields.find((f) => f.id === source.fieldId);
    return {
      ...sec,
      fields: sec.fields
        .filter((f) => f.id !== source.fieldId)
        .map((f, idx) => ({ ...f, order: idx + 1 })),
    };
  };

  let next = updateSection(schema, source.area, source.sectionId, findSectionFields, source.tabId);
  if (!movedField) return schema;

  next = updateSection(
    next,
    target.area,
    target.sectionId,
    (sec) => {
      const copy = [...sec.fields];
      const insertAt = target.beforeFieldId
        ? copy.findIndex((f) => f.id === target.beforeFieldId)
        : copy.length;
      const idx = insertAt < 0 ? copy.length : insertAt;
      copy.splice(idx, 0, movedField!);
      return {
        ...sec,
        fields: copy.map((f, i) => ({ ...f, order: i + 1 })),
      };
    },
    target.tabId,
  );
  return next;
}
