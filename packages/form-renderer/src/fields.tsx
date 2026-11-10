"use client";
import React, { useEffect, useState } from "react";
import type {
  FieldDefinition,
  FieldType,
  OptionItem,
} from "@field/form-engine";
import { Input, Button } from "@field/ui";
import type { FieldValue, LookupProvider, LocalFile } from "./types";
import { filesFromList, fileError } from "./model";

export interface FieldProps {
  field: FieldDefinition;
  id: string;
  value?: FieldValue;
  disabled: boolean;
  error?: string;
  validationPath?: string;
  onChange: (value: FieldValue) => void;
  lookupProvider?: LookupProvider;
  onLookupOptionsLoaded?: (
    fieldId: string,
    options: readonly OptionItem[],
  ) => void;
}
const text = (value: FieldValue | undefined) =>
  typeof value === "string" || typeof value === "number" ? String(value) : "";
function attrs(p: FieldProps) {
  return {
    id: p.id,
    disabled: p.disabled,
    required: p.field.required,
    "aria-invalid": !!p.error,
    "aria-describedby": `${p.id}-help ${p.id}-error`,
    placeholder: p.field.placeholder,
  };
}
function TextField(p: FieldProps) {
  return (
    <Input
      {...attrs(p)}
      value={text(p.value)}
      onChange={(e) => p.onChange(e.target.value)}
    />
  );
}
function TextareaField(p: FieldProps) {
  return (
    <textarea
      {...attrs(p)}
      rows={4}
      value={text(p.value)}
      onChange={(e) => p.onChange(e.target.value)}
    />
  );
}
function NumericField(p: FieldProps) {
  return (
    <Input
      {...attrs(p)}
      type="number"
      step="any"
      value={text(p.value)}
      onChange={(e) =>
        p.onChange(e.target.value === "" ? "" : e.target.valueAsNumber)
      }
    />
  );
}
function CurrencyField(p: FieldProps) {
  return (
    <div className="fr-currency">
      {p.field.type === "currency" &&
        typeof p.field.currencyCode === "string" && (
          <span>{p.field.currencyCode}</span>
        )}
      <NumericField {...p} />
    </div>
  );
}
function DateField(p: FieldProps) {
  return (
    <Input
      {...attrs(p)}
      type="date"
      value={text(p.value)}
      onChange={(e) => p.onChange(e.target.value)}
    />
  );
}
function DropdownField(p: FieldProps) {
  const options = p.field.type === "dropdown" ? p.field.options : [];
  return (
    <select
      {...attrs(p)}
      value={text(p.value)}
      onChange={(e) => p.onChange(e.target.value)}
    >
      <option value="">Select an option</option>
      {options.map((o, i) => (
        <option key={`${i}-${o.value}`} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
function CheckboxField(p: FieldProps) {
  return (
    <input
      {...attrs(p)}
      type="checkbox"
      checked={p.value === true}
      onChange={(e) => p.onChange(e.target.checked)}
    />
  );
}
function CalculatedField(p: FieldProps) {
  return (
    <>
      <Input
        {...attrs(p)}
        value={text(p.value)}
        readOnly
        disabled
        placeholder="Not calculated"
      />
      <small>Provided value · read only</small>
    </>
  );
}
function FileField(p: FieldProps) {
  const files: LocalFile[] = Array.isArray(p.value) ? p.value : [];
  const config = p.field.type === "file" ? p.field.validation : undefined;
  const error = fileError(
    files,
    config?.allowedFileExtensions,
    config?.maxFileSizeMb,
    1,
  );
  return (
    <>
      <input
        {...attrs(p)}
        type="file"
        accept={config?.allowedFileExtensions
          ?.map((x) => "." + x.replace(/^\./, ""))
          .join(",")}
        onChange={(e) => {
          if (e.target.files?.length) p.onChange(filesFromList(e.target.files));
          e.target.value = "";
        }}
      />
      {files.map((f) => (
        <div className="fr-file" key={f.id}>
          <span>
            {f.name} <small>{Math.ceil(f.size / 1024)} KB</small>
          </span>
          {!p.disabled && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => p.onChange([])}
            >
              Remove {f.name}
            </Button>
          )}
        </div>
      ))}
      {error && (
        <p role="alert" className="fr-error">
          {error}
        </p>
      )}
    </>
  );
}
function LookupField(p: FieldProps) {
  const [options, setOptions] = useState<readonly OptionItem[]>([]);
  const [status, setStatus] = useState<
    "loading" | "ready" | "error" | "unavailable"
  >("loading");
  const [retry, setRetry] = useState(0);
  const config = p.field.type === "lookup" ? p.field.lookupConfig : undefined;
  useEffect(() => {
    const controller = new AbortController();
    setOptions([]);
    if (!p.lookupProvider || !config) {
      setStatus("unavailable");
      return () => controller.abort();
    }
    setStatus("loading");
    Promise.resolve()
      .then(() =>
        p.lookupProvider!(config, {
          fieldId: p.field.id,
          signal: controller.signal,
        }),
      )
      .then((items) => {
        if (controller.signal.aborted) return;
        if (
          !Array.isArray(items) ||
          items.some(
            (o) =>
              !o || typeof o.label !== "string" || typeof o.value !== "string",
          )
        )
          throw new Error("Invalid options");
        setOptions(items);
        p.onLookupOptionsLoaded?.(p.field.id, items);
        setStatus("ready");
      })
      .catch(() => {
        if (!controller.signal.aborted) setStatus("error");
      });
    return () => controller.abort();
  }, [p.lookupProvider, config, p.field.id, retry]);
  return (
    <>
      <select
        {...attrs(p)}
        disabled={p.disabled || status !== "ready"}
        value={text(p.value)}
        onChange={(e) => p.onChange(e.target.value)}
      >
        <option value="">
          {status === "loading" ? "Loading options…" : "Select an option"}
        </option>
        {text(p.value) && !options.some((o) => o.value === p.value) && (
          <option value={text(p.value)}>{text(p.value)}</option>
        )}
        {options.map((o, i) => (
          <option key={`${i}-${o.value}`} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {status === "error" && (
        <div role="alert" className="fr-error">
          Options could not be loaded.{" "}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setRetry((r) => r + 1)}
          >
            Retry
          </Button>
        </div>
      )}
      {status === "unavailable" && (
        <small>No lookup provider is connected.</small>
      )}
      {status === "ready" && !options.length && (
        <small>No options available.</small>
      )}
    </>
  );
}
export const FIELD_REGISTRY: Record<
  FieldType,
  React.ComponentType<FieldProps>
> = {
  text: TextField,
  textarea: TextareaField,
  number: NumericField,
  currency: CurrencyField,
  date: DateField,
  dropdown: DropdownField,
  checkbox: CheckboxField,
  lookup: LookupField,
  file: FileField,
  calculated: CalculatedField,
};
export function FieldControl(props: FieldProps) {
  const { field, id, error } = props;
  if (field.hidden) return null;
  const Component = FIELD_REGISTRY[field.type];
  if (!Component) return <p role="alert">Unsupported field configuration.</p>;
  return (
    <div
      className="fr-field"
      data-error-path={props.validationPath ?? `fields.${field.key}`}
      data-field-type={field.type}
      data-width={field.width}
    >
      <label htmlFor={id}>
        {field.label}
        {field.required && (
          <span aria-hidden="true" className="fr-required">
            {" "}
            *
          </span>
        )}
      </label>
      <Component
        {...props}
        disabled={
          props.disabled || !!field.readOnly || field.type === "calculated"
        }
      />
      <small id={`${id}-help`}>{field.helpText}</small>
      <span id={`${id}-error`} className="fr-error">
        {error}
      </span>
    </div>
  );
}
