import {
  validateDraftSchema,
  type FormSchemaV1,
  type FieldDefinition,
  type DetailsColumnDefinition,
  type DetailsTabDefinition,
  type OptionItem,
} from "@field/form-engine";
import type {
  RendererValue,
  FieldValue,
  ValueError,
  LocalFile,
  DetailRow,
  RendererMode,
} from "./types";

export const entriesFor = <T>(record: Record<string, T[]>, key: string): T[] =>
  Object.hasOwn(record, key) ? record[key] : [];
export const ordered = <T extends { order: number }>(
  items: readonly T[],
): T[] => [...items].sort((a, b) => a.order - b.order);
export const allFields = (schema: FormSchemaV1): FieldDefinition[] => [
  ...schema.header.sections.flatMap((s) => s.fields),
  ...schema.tabs.flatMap((t) =>
    t.type === "form" ? t.sections.flatMap((s) => s.fields) : [],
  ),
];
/** Extra defensive guard for optional presentation properties not checked in v1. */
export function inspectSchema(schema: unknown): {
  schema?: FormSchemaV1;
  errors: string[];
} {
  try {
    const result = validateDraftSchema(schema);
    if (!result.valid)
      return { errors: result.errors.map((e) => `${e.path}: ${e.message}`) };
    const s = schema as FormSchemaV1;
    const fields = [
      ...allFields(s),
      ...s.tabs.flatMap((t) =>
        t.type === "details" ? t.configuration.columns.map(columnField) : [],
      ),
    ];
    const sections = [
      ...s.header.sections,
      ...s.tabs.flatMap((t) => (t.type === "form" ? t.sections : [])),
    ];
    const errors: string[] = [];
    if (
      s.form.description !== undefined &&
      typeof s.form.description !== "string"
    )
      errors.push("Invalid form description.");
    if (sections.some((x) => typeof x.title !== "string"))
      errors.push("Invalid section title.");
    for (const f of fields) {
      for (const key of ["placeholder", "helpText"] as const)
        if (f[key] !== undefined && typeof f[key] !== "string")
          errors.push(`Invalid ${key}: ${f.key}`);
      if (
        f.width !== undefined &&
        !["full", "half", "third", "quarter"].includes(f.width)
      )
        errors.push(`Invalid width: ${f.key}`);
      if (f.validation !== undefined) {
        if (
          !f.validation ||
          typeof f.validation !== "object" ||
          Array.isArray(f.validation)
        )
          errors.push(`Invalid validation: ${f.key}`);
        else {
          const config = f.validation as Record<string, unknown>;
          for (const key of [
            "min",
            "max",
            "minLength",
            "maxLength",
            "maxFileSizeMb",
          ])
            if (
              config[key] !== undefined &&
              (typeof config[key] !== "number" || !Number.isFinite(config[key]))
            )
              errors.push(`Invalid ${key}: ${f.key}`);
          for (const key of ["customMessage", "pattern"])
            if (config[key] !== undefined && typeof config[key] !== "string")
              errors.push(`Invalid ${key}: ${f.key}`);
          const extensions = config.allowedFileExtensions;
          if (
            extensions !== undefined &&
            (!Array.isArray(extensions) ||
              extensions.some((x) => typeof x !== "string"))
          )
            errors.push(`Invalid file extensions: ${f.key}`);
        }
      }
    }
    return errors.length ? { errors } : { schema: s, errors: [] };
  } catch {
    return { errors: ["The form configuration could not be read."] };
  }
}
export function initialValue(schema: FormSchemaV1): RendererValue {
  const fields = Object.fromEntries(
    allFields(schema).map((f) => {
      const d = f.defaultValue;
      const value: FieldValue =
        typeof d === "string" || typeof d === "number" || typeof d === "boolean"
          ? d
          : f.type === "checkbox"
            ? false
            : f.type === "file"
              ? []
              : "";
      return [f.key, value];
    }),
  );
  return { fields, details: {}, notes: {}, documents: {} };
}
export function filesFromList(files: FileList | readonly File[]): LocalFile[] {
  return Array.from(files).map((file) => ({
    id: crypto.randomUUID(),
    name: file.name,
    size: file.size,
    type: file.type,
    file,
  }));
}
export function fileError(
  files: readonly LocalFile[],
  extensions?: string[],
  maxMb?: number,
  maxCount?: number,
): string | undefined {
  if (maxCount !== undefined && files.length > maxCount)
    return `Choose no more than ${maxCount} file(s).`;
  for (const file of files) {
    if (maxMb !== undefined && file.size > maxMb * 1024 * 1024)
      return `${file.name} exceeds ${maxMb} MB.`;
    if (
      extensions?.length &&
      !extensions.some((ext) =>
        file.name
          .toLowerCase()
          .endsWith("." + ext.replace(/^\./, "").toLowerCase()),
      )
    )
      return `${file.name} has an unsupported file extension.`;
  }
  return undefined;
}
export function columnField(column: DetailsColumnDefinition): FieldDefinition {
  // Draft schema validation already checks the configuration for specialized columns.
  return column as FieldDefinition;
}
export function validateValue(
  schema: FormSchemaV1,
  value: RendererValue,
  lookupOptionsByFieldId?: Readonly<Record<string, readonly OptionItem[]>>,
): ValueError[] {
  const errors: ValueError[] = [];
  function field(
    f: FieldDefinition,
    v: FieldValue | undefined,
    path: string,
    tabId?: string,
  ) {
    if (f.hidden) return;
    let message: string | undefined;
    const empty =
      v === undefined ||
      v === null ||
      v === "" ||
      (typeof v === "string" && !v.trim()) ||
      (Array.isArray(v) && !v.length);
    if (f.required && (empty || (f.type === "checkbox" && v !== true)))
      message = "This field is required.";
    if (!empty) {
      if (["number", "currency"].includes(f.type)) {
        if (typeof v !== "number" || !Number.isFinite(v))
          message = "Enter a valid number.";
        else if (f.type === "number" || f.type === "currency") {
          if (f.validation?.min !== undefined && v < f.validation.min)
            message = `Minimum value is ${f.validation.min}.`;
          if (f.validation?.max !== undefined && v > f.validation.max)
            message = `Maximum value is ${f.validation.max}.`;
        }
      }
      if (f.type === "text" || f.type === "textarea") {
        if (typeof v !== "string") message = "Enter text.";
        else {
          if (
            f.validation?.minLength !== undefined &&
            v.length < f.validation.minLength
          )
            message = `Use at least ${f.validation.minLength} characters.`;
          if (
            f.validation?.maxLength !== undefined &&
            v.length > f.validation.maxLength
          )
            message = `Use no more than ${f.validation.maxLength} characters.`;
          // Arbitrary user-configured regex execution is deliberately deferred.
        }
      }
      if (f.type === "dropdown" && !f.options.some((o) => o.value === v))
        message = "Choose an available option.";
      if (
        f.type === "lookup" &&
        lookupOptionsByFieldId &&
        Object.hasOwn(lookupOptionsByFieldId, f.id) &&
        !lookupOptionsByFieldId[f.id].some((o) => o.value === String(v))
      )
        message = "Choose an available option.";
      if (f.type === "checkbox" && typeof v !== "boolean")
        message = "Choose a checkbox value.";
      if (
        f.type === "date" &&
        (typeof v !== "string" ||
          !/^\d{4}-\d{2}-\d{2}$/.test(v) ||
          !Number.isFinite(Date.parse(v)) ||
          new Date(v).toISOString().slice(0, 10) !== v)
      )
        message = "Enter a valid date.";
      if (f.type === "file")
        message = Array.isArray(v)
          ? fileError(
              v,
              f.validation?.allowedFileExtensions,
              f.validation?.maxFileSizeMb,
              1,
            )
          : "Choose a file.";
    }
    if (message)
      errors.push({
        path,
        label: f.label,
        message:
          typeof f.validation?.customMessage === "string"
            ? f.validation.customMessage
            : message,
        tabId,
      });
  }
  for (const section of schema.header.sections)
    for (const f of section.fields)
      field(f, value.fields[f.key], `fields.${f.key}`);
  for (const tab of schema.tabs) {
    if (tab.type === "form")
      for (const section of tab.sections)
        for (const f of section.fields)
          field(f, value.fields[f.key], `fields.${f.key}`, tab.id);
    if (tab.type === "details") {
      const rows = entriesFor(value.details, tab.key);
      const c = tab.configuration;
      if (
        (c.minRows !== undefined && rows.length < c.minRows) ||
        (c.maxRows !== undefined && rows.length > c.maxRows)
      )
        errors.push({
          path: `details.${tab.key}`,
          label: tab.title,
          message: `Use ${c.minRows ?? 0}–${c.maxRows ?? "any number of"} rows.`,
          tabId: tab.id,
        });
      for (const row of rows)
        for (const col of c.columns)
          field(
            columnField(col),
            row.values[col.key],
            `details.${tab.key}.${row.id}.${col.key}`,
            tab.id,
          );
    }
    if (tab.type === "documents") {
      const files = entriesFor(value.documents, tab.key);
      const message =
        tab.required && !files.length
          ? "Add at least one document."
          : fileError(
              files,
              tab.allowedExtensions,
              tab.maxFileSizeMb,
              tab.allowMultiple ? tab.maxFiles : 1,
            );
      if (message)
        errors.push({
          path: `documents.${tab.key}`,
          label: tab.title,
          message,
          tabId: tab.id,
        });
    }
  }
  return errors;
}
export type RowAction =
  | { type: "add"; id: string }
  | { type: "delete"; id: string }
  | { type: "edit"; id: string; key: string; value: FieldValue };
/** Enforce local controls in the reducer as well as the UI; not server authorization. */
export function changeRows(
  tab: DetailsTabDefinition,
  rows: DetailRow[],
  action: RowAction,
  mode: RendererMode,
): DetailRow[] {
  if (mode === "readOnly") return rows;
  const c = tab.configuration;
  if (action.type === "add") {
    if (
      c.allowAdd !== true ||
      (c.maxRows !== undefined && rows.length >= c.maxRows) ||
      rows.some((r) => r.id === action.id)
    )
      return rows;
    return [
      ...rows,
      {
        id: action.id,
        values: Object.fromEntries(
          c.columns.map((f) => [f.key, f.type === "checkbox" ? false : ""]),
        ),
      },
    ];
  }
  if (action.type === "delete")
    return c.allowDelete === true && rows.length > (c.minRows ?? 0)
      ? rows.filter((r) => r.id !== action.id)
      : rows;
  const column = c.columns.find((f) => f.key === action.key);
  if (
    c.allowEdit !== true ||
    !column ||
    column.readOnly ||
    column.type === "calculated"
  )
    return rows;
  return rows.map((r) =>
    r.id === action.id
      ? { ...r, values: { ...r.values, [action.key]: action.value } }
      : r,
  );
}
/** A JSON-safe preview payload. File bytes stay in local handles, never in JSON. */
export function toOutputPayload(value: RendererValue): unknown {
  return JSON.parse(
    JSON.stringify(value, (key, item) =>
      key === "file" && typeof File !== "undefined" && item instanceof File
        ? undefined
        : item,
    ),
  );
}
