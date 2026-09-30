"use client";
import React, { useState } from "react";
import { Button } from "@field/ui";
import type {
  DetailsTabDefinition,
  NotesTabDefinition,
  DocumentsTabDefinition,
} from "@field/form-engine";
import type {
  RendererMode,
  RendererValue,
  ValueError,
  LookupProvider,
  LocalFile,
} from "./types";
import {
  changeRows,
  columnField,
  ordered,
  filesFromList,
  fileError,
  entriesFor,
} from "./model";
import { FieldControl } from "./fields";
interface TabProps {
  value: RendererValue;
  mode: RendererMode;
  onChange: (value: RendererValue) => void;
  errors: ValueError[];
  prefix: string;
  lookupProvider?: LookupProvider;
}
export function DetailsTab({
  tab,
  ...p
}: TabProps & { tab: DetailsTabDefinition }) {
  const rows = entriesFor(p.value.details, tab.key);
  const c = tab.configuration;
  const readonly = p.mode === "readOnly";
  const update: (action: Parameters<typeof changeRows>[2]) => void = (
    action,
  ) => {
    const next = changeRows(tab, rows, action, p.mode);
    if (next !== rows)
      p.onChange({
        ...p.value,
        details: { ...p.value.details, [tab.key]: next },
      });
  };
  const columns = ordered(c.columns);
  return (
    <section className="fr-details" aria-label={tab.title}>
      <div className="fr-section-heading">
        <h3>{tab.title}</h3>
        <span>
          {rows.length} row{rows.length === 1 ? "" : "s"}
        </span>
        {!readonly && c.allowAdd === true && (
          <Button
            type="button"
            size="sm"
            disabled={c.maxRows !== undefined && rows.length >= c.maxRows}
            onClick={() => update({ type: "add", id: crypto.randomUUID() })}
          >
            + Add row
          </Button>
        )}
      </div>
      {!columns.length ? (
        <p className="fr-empty">No columns configured.</p>
      ) : (
        <div
          className="fr-table-scroll"
          tabIndex={0}
          role="region"
          aria-label={`${tab.title} grid`}
        >
          <table>
            <thead>
              <tr>
                {columns.map((col) => (
                  <th key={col.id} scope="col">
                    {col.label}
                    {col.required ? " *" : ""}
                  </th>
                ))}
                {!readonly && c.allowDelete === true && (
                  <th scope="col">Actions</th>
                )}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={row.id}>
                  {columns.map((col) => (
                    <td key={col.id}>
                      <FieldControl
                        field={columnField(col)}
                        validationPath={`details.${tab.key}.${row.id}.${col.key}`}
                        id={`${p.prefix}-${row.id}-${col.id}`}
                        value={row.values[col.key]}
                        disabled={readonly || c.allowEdit !== true}
                        lookupProvider={p.lookupProvider}
                        error={
                          p.errors.find(
                            (e) =>
                              e.path ===
                              `details.${tab.key}.${row.id}.${col.key}`,
                          )?.message
                        }
                        onChange={(value) =>
                          update({
                            type: "edit",
                            id: row.id,
                            key: col.key,
                            value,
                          })
                        }
                      />
                    </td>
                  ))}
                  {!readonly && c.allowDelete === true && (
                    <td>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        aria-label={`Delete row ${i + 1}`}
                        disabled={rows.length <= (c.minRows ?? 0)}
                        onClick={() => update({ type: "delete", id: row.id })}
                      >
                        Delete
                      </Button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          {!rows.length && (
            <p className="fr-empty">
              No rows yet.
              {c.allowAdd === true && !readonly
                ? " Add a row to get started."
                : ""}
            </p>
          )}
        </div>
      )}
      <p className="fr-error">
        {p.errors.find((e) => e.path === `details.${tab.key}`)?.message}
      </p>
    </section>
  );
}
export function NotesTab({
  tab,
  author,
  ...p
}: TabProps & { tab: NotesTabDefinition; author: string }) {
  const [text, setText] = useState("");
  const [attachments, setAttachments] = useState<LocalFile[]>([]);
  const notes = entriesFor(p.value.notes, tab.key);
  return (
    <section aria-label={tab.title}>
      <div className="fr-section-heading">
        <h3>{tab.title}</h3>
        <span>Append-only history</span>
      </div>
      <p className="fr-muted">
        Audience: {tab.defaultVisibility.replaceAll("_", " ")} · Local session
        only
      </p>
      {!notes.length && <p className="fr-empty">No notes yet.</p>}
      <ol className="fr-notes">
        {notes.map((note) => (
          <li key={note.id}>
            <div className="fr-note-meta">
              {tab.showAuthor && <strong>{note.author}</strong>}
              {tab.showTimestamp && (
                <time dateTime={note.createdAt}>
                  {new Date(note.createdAt).toLocaleString()}
                </time>
              )}
            </div>
            <p>{note.text}</p>
            {note.attachments.map((f) => (
              <small key={f.id}>{f.name}</small>
            ))}
          </li>
        ))}
      </ol>
      {p.mode !== "readOnly" && (
        <div className="fr-note-composer">
          <label htmlFor={`${p.prefix}-note`}>Add a note</label>
          <textarea
            id={`${p.prefix}-note`}
            rows={3}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Write a note…"
          />
          {tab.allowAttachments && (
            <>
              <label htmlFor={`${p.prefix}-note-files`}>Note attachments</label>
              <input
                id={`${p.prefix}-note-files`}
                type="file"
                multiple
                onChange={(e) => {
                  setAttachments(
                    e.target.files ? filesFromList(e.target.files) : [],
                  );
                  e.target.value = "";
                }}
              />
              {attachments.map((f) => (
                <small key={f.id}>{f.name}</small>
              ))}
            </>
          )}
          <Button
            type="button"
            size="sm"
            disabled={!text.trim()}
            onClick={() => {
              if (p.mode === "readOnly" || !text.trim()) return;
              p.onChange({
                ...p.value,
                notes: {
                  ...p.value.notes,
                  [tab.key]: [
                    ...notes,
                    {
                      id: crypto.randomUUID(),
                      text: text.trim(),
                      author,
                      createdAt: new Date().toISOString(),
                      visibility: tab.defaultVisibility,
                      attachments,
                    },
                  ],
                },
              });
              setText("");
              setAttachments([]);
            }}
          >
            Add note
          </Button>
        </div>
      )}
    </section>
  );
}
export function DocumentsTab({
  tab,
  ...p
}: TabProps & { tab: DocumentsTabDefinition }) {
  const [error, setError] = useState<string>();
  const files = entriesFor(p.value.documents, tab.key);
  const maxCount = tab.allowMultiple ? tab.maxFiles : 1;
  const update = (next: LocalFile[]) =>
    p.onChange({
      ...p.value,
      documents: { ...p.value.documents, [tab.key]: next },
    });
  return (
    <section aria-label={tab.title}>
      <div className="fr-section-heading">
        <h3>
          {tab.title}
          {tab.required ? " *" : ""}
        </h3>
        <span>{files.length} file(s)</span>
      </div>
      <p className="fr-muted">
        {tab.allowedExtensions?.length
          ? tab.allowedExtensions.join(", ").toUpperCase()
          : "All file types"}
        {tab.maxFileSizeMb ? ` · Up to ${tab.maxFileSizeMb} MB each` : ""}
        {maxCount ? ` · Maximum ${maxCount}` : ""}. Files stay in this local
        session.
      </p>
      {p.mode !== "readOnly" && (
        <div className="fr-upload">
          <label htmlFor={`${p.prefix}-documents`}>Choose documents</label>
          <input
            id={`${p.prefix}-documents`}
            type="file"
            multiple={tab.allowMultiple}
            accept={tab.allowedExtensions
              ?.map((x) => "." + x.replace(/^\./, ""))
              .join(",")}
            onChange={(e) => {
              if (!e.target.files?.length) return;
              const next = [...files, ...filesFromList(e.target.files)];
              const issue = fileError(
                next,
                tab.allowedExtensions,
                tab.maxFileSizeMb,
                maxCount,
              );
              setError(issue);
              if (!issue) update(next);
              e.target.value = "";
            }}
          />
        </div>
      )}
      {!files.length && <p className="fr-empty">No documents selected.</p>}
      {files.map((f) => (
        <div className="fr-file" key={f.id}>
          <span>
            {f.name} <small>{Math.ceil(f.size / 1024)} KB</small>
          </span>
          {p.mode !== "readOnly" && tab.allowDeleteBeforeSubmit === true && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                update(files.filter((x) => x.id !== f.id));
                setError(undefined);
              }}
            >
              Remove {f.name}
            </Button>
          )}
        </div>
      ))}
      {(error || p.errors.find((e) => e.path === `documents.${tab.key}`)) && (
        <p className="fr-error" role="alert">
          {error ||
            p.errors.find((e) => e.path === `documents.${tab.key}`)?.message}
        </p>
      )}
    </section>
  );
}
