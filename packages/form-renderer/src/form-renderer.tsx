"use client";
import React, {
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { Button } from "@field/ui";
import type {
  FieldDefinition,
  FormSchemaV1,
  FormSectionDefinition,
  HeaderSectionDefinition,
} from "@field/form-engine";
import type { FormRendererProps, RendererValue, ValueError } from "./types";
import {
  allFields,
  initialValue,
  inspectSchema,
  ordered,
  validateValue,
} from "./model";
import { FieldControl } from "./fields";
import { DetailsTab, NotesTab, DocumentsTab } from "./tabs";

export function FormRenderer(props: FormRendererProps) {
  const inspected = useMemo(() => inspectSchema(props.schema), [props.schema]);
  if (!inspected.schema)
    return (
      <div className="fr-root fr-invalid" role="alert">
        <h2>This form cannot be displayed</h2>
        <p>The configuration is invalid or unsupported.</p>
        <ul>
          {inspected.errors.map((e, i) => (
            <li key={i}>{e}</li>
          ))}
        </ul>
      </div>
    );
  // Schema replacement resets uncontrolled state and any transient uploads/drafts.
  let key: string;
  try {
    key = JSON.stringify(inspected.schema);
  } catch {
    return <p role="alert">The form configuration must be serializable.</p>;
  }
  return <ValidForm key={key} {...props} schema={inspected.schema} />;
}
function ValidForm({
  schema,
  mode = "edit",
  ...props
}: FormRendererProps & { schema: FormSchemaV1 }) {
  const prefix = useId();
  const defaults = useMemo(() => initialValue(schema), [schema]);
  const [local, setLocal] = useState<RendererValue>(
    () => props.initialValue ?? defaults,
  );
  const supplied = props.value ?? local;
  const value: RendererValue = {
    ...defaults,
    ...supplied,
    fields: { ...defaults.fields, ...supplied.fields },
  };
  const tabs = ordered(schema.tabs);
  const [active, setActive] = useState(tabs[0]?.id);
  const [errors, setErrors] = useState<ValueError[]>([]);
  const [checked, setChecked] = useState(false);
  const [message, setMessage] = useState("");
  const summary = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const readonly = mode === "readOnly";
  function update(next: RendererValue) {
    if (readonly) return;
    setLocal(next);
    props.onChange?.(next);
    setMessage("");
    if (checked) setErrors(validateValue(schema, next));
  }
  function fields(items: FieldDefinition[], columns = 2) {
    return (
      <div
        className="fr-fields"
        style={
          {
            "--fr-columns": columns,
            "--fr-span": 12 / columns,
          } as CSSProperties
        }
      >
        {ordered(items).map((field) => (
          <FieldControl
            key={field.id}
            field={field}
            id={`${prefix}-${field.id}`}
            value={value.fields[field.key]}
            disabled={readonly}
            lookupProvider={props.lookupProvider}
            error={
              errors.find((e) => e.path === `fields.${field.key}`)?.message
            }
            onChange={(v) =>
              update({ ...value, fields: { ...value.fields, [field.key]: v } })
            }
          />
        ))}
      </div>
    );
  }
  function section(
    s: HeaderSectionDefinition | FormSectionDefinition,
    columns: number,
  ) {
    return (
      <section
        className="fr-section"
        data-width={"width" in s ? s.width : undefined}
        key={s.id}
        aria-label={s.title}
      >
        <div className="fr-section-heading">
          <span className="fr-section-mark" aria-hidden="true">
            ▤
          </span>
          <h3>{s.title}</h3>
        </div>
        {s.fields.length ? (
          fields(s.fields, "columns" in s ? (s.columns ?? columns) : columns)
        ) : (
          <p className="fr-empty">No fields configured.</p>
        )}
      </section>
    );
  }
  const deferred =
    schema.rules.length > 0 ||
    allFields(schema).some((f) => f.type === "calculated") ||
    schema.tabs.some(
      (t) =>
        t.type === "details" &&
        t.configuration.columns.some((c) => c.type === "calculated"),
    );
  return (
    <form
      ref={formRef}
      className="fr-root"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        if (readonly) return;
        const nextErrors = validateValue(schema, value);
        setErrors(nextErrors);
        setChecked(true);
        if (nextErrors.length) {
          setMessage("");
          if (nextErrors[0].tabId) setActive(nextErrors[0].tabId);
          setTimeout(() => summary.current?.focus(), 0);
          return;
        }
        if (mode === "preview") {
          setMessage("Preview validation passed. Nothing was saved.");
          props.onPreview?.(value);
        } else {
          setMessage("Validation passed. Local form data is ready.");
          props.onSubmit?.(value);
        }
      }}
    >
      <header className="fr-title">
        <div className="fr-title-icon" aria-hidden="true">
          ▤
        </div>
        <div>
          <h1>{schema.form.title}</h1>
          {schema.form.description && <p>{schema.form.description}</p>}
        </div>
        <span className="fr-badge">
          {mode === "preview"
            ? "Preview"
            : readonly
              ? "Read only"
              : "Local form"}
        </span>
      </header>
      {mode === "preview" && (
        <p className="fr-notice">
          Preview only. Entries, notes and selected files are not saved.
        </p>
      )}
      {deferred && (
        <p className="fr-notice">
          Rules and calculations are not applied in this renderer version.
          Calculated fields display provided values.
        </p>
      )}
      {!!errors.length && (
        <div
          ref={summary}
          role="alert"
          tabIndex={-1}
          className="fr-error-summary"
        >
          <strong>
            Review {errors.length} field{errors.length === 1 ? "" : "s"}
          </strong>
          <ul>
            {errors.map((e) => (
              <li key={e.path}>
                <button
                  type="button"
                  onClick={() => {
                    if (e.tabId) setActive(e.tabId);
                    setTimeout(() => {
                      const target = [
                        ...(formRef.current?.querySelectorAll<HTMLElement>(
                          "[data-error-path]",
                        ) ?? []),
                      ].find((el) => el.dataset.errorPath === e.path);
                      target
                        ?.querySelector<HTMLElement>("input,select,textarea")
                        ?.focus();
                    }, 0);
                  }}
                >
                  {e.label}: {e.message}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="fr-header" aria-label="Main information">
        {schema.header.sections.length ? (
          ordered(schema.header.sections).map((s) =>
            section(s, schema.header.columns ?? 2),
          )
        ) : (
          <p className="fr-empty">No header fields configured.</p>
        )}
      </div>
      {!!tabs.length && (
        <div className="fr-tabs" role="tablist" aria-label="Form sections">
          {tabs.map((t, i) => (
            <button
              key={t.id}
              id={`${prefix}-tab-${t.id}`}
              type="button"
              role="tab"
              aria-selected={active === t.id}
              tabIndex={active === t.id ? 0 : -1}
              aria-controls={`${prefix}-panel-${t.id}`}
              onClick={() => setActive(t.id)}
              onKeyDown={(e) => {
                let next = i;
                if (e.key === "ArrowRight") next = (i + 1) % tabs.length;
                else if (e.key === "ArrowLeft")
                  next = (i + tabs.length - 1) % tabs.length;
                else if (e.key === "Home") next = 0;
                else if (e.key === "End") next = tabs.length - 1;
                else return;
                e.preventDefault();
                setActive(tabs[next].id);
                document
                  .getElementById(`${prefix}-tab-${tabs[next].id}`)
                  ?.focus();
              }}
            >
              {t.title}
              {errors.some((e) => e.tabId === t.id) && (
                <span className="fr-required" aria-hidden="true">
                  {" "}
                  •
                </span>
              )}
            </button>
          ))}
        </div>
      )}
      {tabs.map((t) => (
        <div
          key={t.id}
          className="fr-panel"
          role="tabpanel"
          id={`${prefix}-panel-${t.id}`}
          aria-labelledby={`${prefix}-tab-${t.id}`}
          hidden={active !== t.id}
          tabIndex={0}
        >
          {t.type === "form" &&
            (t.sections.length ? (
              ordered(t.sections).map((s) => section(s, t.columns ?? 2))
            ) : (
              <p className="fr-empty">No sections configured.</p>
            ))}
          {t.type === "details" && (
            <DetailsTab
              tab={t}
              value={value}
              mode={mode}
              onChange={update}
              errors={errors}
              prefix={`${prefix}-${t.id}`}
              lookupProvider={props.lookupProvider}
            />
          )}
          {t.type === "notes" && (
            <NotesTab
              tab={t}
              value={value}
              mode={mode}
              onChange={update}
              errors={errors}
              prefix={`${prefix}-${t.id}`}
              author={props.noteAuthor ?? "Local user"}
            />
          )}
          {t.type === "documents" && (
            <DocumentsTab
              tab={t}
              value={value}
              mode={mode}
              onChange={update}
              errors={errors}
              prefix={`${prefix}-${t.id}`}
            />
          )}
        </div>
      ))}
      {!tabs.length && <p className="fr-empty">No tabs configured.</p>}
      <footer className="fr-actions">
        <p role="status">
          {message ||
            (readonly
              ? "Viewing local form data."
              : "Changes stay in this session.")}
        </p>
        {!readonly && (
          <Button type="submit" size="sm">
            {mode === "preview" ? "Validate preview" : "Validate form"}
          </Button>
        )}
      </footer>
    </form>
  );
}
