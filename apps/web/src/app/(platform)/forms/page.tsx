"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FileSpreadsheet, Plus, Search, Upload, X } from "lucide-react";
import { useAuth } from "@/lib/auth/auth-context";
import type { FormListItem } from "@/lib/repositories/form-repository";

export default function FormLibraryPage() {
  const router = useRouter();
  const { activeOrganization, isLoading: authLoading } = useAuth();
  const activeOrganizationId = activeOrganization?.id ?? null;
  const [forms, setForms] = useState<FormListItem[]>([]);
  const [query, setQuery] = useState("");
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const [importJson, setImportJson] = useState("");
  const [importTitle, setImportTitle] = useState("");
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  useEffect(() => {
    if (authLoading) return;
    if (!activeOrganizationId) {
      setError("Select an organization where you can manage forms.");
      setState("error");
      return;
    }
    const controller = new AbortController();
    setState("loading");
    fetch(
      `/api/forms?organizationId=${encodeURIComponent(activeOrganizationId)}`,
      { signal: controller.signal },
    )
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok)
          throw new Error(body.error || "Unable to load forms.");
        setForms(body.forms);
        setState("ready");
      })
      .catch((reason) => {
        if (reason.name !== "AbortError") {
          setError(reason.message);
          setState("error");
        }
      });
    return () => controller.abort();
  }, [activeOrganizationId, authLoading]);
  const visible = useMemo(
    () =>
      forms.filter((form) =>
        `${form.title} ${form.description ?? ""} ${form.key}`
          .toLowerCase()
          .includes(query.toLowerCase()),
      ),
    [forms, query],
  );
  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <header className="flex flex-col gap-3 border-b border-slate-200 pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-emerald-700" />
            <h1 className="text-xl font-bold">Form Library</h1>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Forms available to{" "}
            {activeOrganization?.name ?? "the active organization"}.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <button
            type="button"
            onClick={() => {
              setImportError(null);
              setImportOpen(true);
            }}
            disabled={!activeOrganizationId}
            className="inline-flex h-10 w-full items-center justify-center gap-2 rounded border border-slate-300 bg-white px-4 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 sm:h-9 sm:w-auto"
          >
            <Upload className="h-4 w-4 text-slate-500" />
            Import Form
          </button>
          <Link
            href="/forms/new"
            className="inline-flex h-10 w-full items-center justify-center gap-2 rounded bg-emerald-700 px-4 text-xs font-semibold text-white sm:h-9 sm:w-auto"
          >
            <Plus className="h-4 w-4" />
            Create Form
          </Link>
        </div>
      </header>
      {state === "loading" && (
        <div
          role="status"
          className="border border-slate-200 bg-white p-10 text-center text-sm text-slate-500"
        >
          Loading form library…
        </div>
      )}
      {state === "error" && (
        <div
          role="alert"
          className="border border-red-200 bg-red-50 p-5 text-sm text-red-800"
        >
          <strong>Form library unavailable</strong>
          <p>{error}</p>
        </div>
      )}
      {state === "ready" && forms.length === 0 && (
        <div className="border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
          <FileSpreadsheet className="mx-auto h-9 w-9 text-emerald-700" />
          <h2 className="mt-3 font-semibold">No forms yet</h2>
          <p className="mt-1 text-xs text-slate-500">
            Create the first draft form for this organization.
          </p>
          <Link
            href="/forms/new"
            className="mt-4 inline-flex rounded bg-emerald-700 px-4 py-2 text-xs font-semibold text-white"
          >
            Create Form
          </Link>
        </div>
      )}
      {state === "ready" && forms.length > 0 && (
        <>
          <label className="relative block w-full max-w-sm">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <span className="sr-only">Search forms</span>
            <input
              aria-label="Search forms"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="h-9 w-full rounded border border-slate-300 bg-white pl-9 pr-3 text-xs"
              placeholder="Search forms"
            />
          </label>
          <div
            className="hidden overflow-x-auto border border-slate-200 bg-white md:block"
            tabIndex={0}
            role="region"
            aria-label="Forms table"
          >
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100 text-slate-600">
                <tr>
                  <th className="px-4 py-3">Form</th>
                  <th className="px-4 py-3">Lifecycle</th>
                  <th className="px-4 py-3">Latest version</th>
                  <th className="px-4 py-3">Updated</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {visible.map((form) => (
                  <tr key={form.id} className="border-t border-slate-200">
                    <td className="px-4 py-3">
                      <strong className="block text-sm">{form.title}</strong>
                      <span className="text-slate-500">
                        {form.description || form.key}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded px-2 py-1 font-semibold ${form.draft_version_number ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"}`}
                      >
                        {form.draft_version_number
                          ? "Draft"
                          : form.published_version_number
                            ? "Published"
                            : form.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {Math.max(
                        form.draft_version_number ?? 0,
                        form.published_version_number ?? 0,
                      ) || "—"}
                    </td>
                    <td className="px-4 py-3 text-slate-500">
                      {new Date(form.updated_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-3">
                        <Link
                          className="font-medium text-slate-600 hover:text-slate-900"
                          href={`/submissions?formId=${form.id}`}
                          title="View form submissions"
                        >
                          Submissions
                        </Link>
                        {Boolean(form.published_version_number) && (
                          <>
                            <Link
                              className="font-medium text-slate-600 hover:text-slate-900"
                              href={`/forms/${form.id}/preview`}
                              title="Preview published form"
                            >
                              ▷ Preview
                            </Link>
                            <Link
                              className="font-medium text-emerald-700 hover:underline"
                              href={`/forms/${form.id}/builder`}
                              title="Open builder & sharing"
                            >
                              Share
                            </Link>
                          </>
                        )}
                        <Link
                          className="font-semibold text-emerald-700"
                          href={`/forms/${form.id}/builder`}
                        >
                          {form.draft_version_number
                            ? "Open builder"
                            : "View form"}
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!visible.length && (
              <p className="p-8 text-center text-sm text-slate-500">
                No forms match your search.
              </p>
            )}
          </div>
          <div className="space-y-3 md:hidden">
            {visible.map((form) => (
              <article
                key={form.id}
                className="border border-slate-200 bg-white p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="break-words text-sm font-semibold">
                      {form.title}
                    </h2>
                    <p className="mt-1 break-words text-xs text-slate-500">
                      {form.description || form.key}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded px-2 py-1 text-[11px] font-semibold ${form.draft_version_number ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"}`}
                  >
                    {form.draft_version_number
                      ? "Draft"
                      : form.published_version_number
                        ? "Published"
                        : form.status}
                  </span>
                </div>
                <dl className="mt-4 grid grid-cols-2 gap-3 border-y border-slate-100 py-3 text-xs">
                  <div>
                    <dt className="text-slate-500">Latest version</dt>
                    <dd className="mt-1 font-semibold">
                      {Math.max(
                        form.draft_version_number ?? 0,
                        form.published_version_number ?? 0,
                      ) || "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Updated</dt>
                    <dd className="mt-1 font-semibold">
                      {new Date(form.updated_at).toLocaleDateString()}
                    </dd>
                  </div>
                </dl>
                <div className="mt-3 flex gap-2">
                  {Boolean(form.published_version_number) && (
                    <Link
                      className="inline-flex min-h-10 flex-1 items-center justify-center rounded border border-slate-300 bg-white font-semibold text-slate-700 text-xs"
                      href={`/forms/${form.id}/preview`}
                    >
                      ▷ Preview
                    </Link>
                  )}
                  <Link
                    className="inline-flex min-h-10 flex-1 items-center justify-center rounded border border-emerald-700 font-semibold text-emerald-700 text-xs"
                    href={`/forms/${form.id}/builder`}
                  >
                    {form.draft_version_number ? "Open builder" : "View form"}
                  </Link>
                </div>
              </article>
            ))}
            {!visible.length && (
              <p className="border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
                No forms match your search.
              </p>
            )}
          </div>
        </>
      )}

      {importOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="import-form-title"
        >
          <div className="w-full max-w-xl rounded-md border border-slate-200 bg-white p-5 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <h2 id="import-form-title" className="text-base font-bold text-slate-900">
                  Import Form Definition
                </h2>
                <p className="text-xs text-slate-500">
                  Imported forms are validated and created as Draft v1 in {activeOrganization?.name ?? "the active organization"}.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setImportOpen(false)}
                className="rounded p-1 text-slate-400 hover:text-slate-700"
                aria-label="Close import dialog"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1" htmlFor="import-form-file">
                  Upload JSON File (.json)
                </label>
                <input
                  id="import-form-file"
                  type="file"
                  accept=".json,application/json"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const text = await file.text();
                    setImportJson(text);
                    setImportError(null);
                  }}
                  className="block w-full text-xs text-slate-600 file:mr-3 file:rounded file:border file:border-slate-300 file:bg-slate-50 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-slate-700 hover:file:bg-slate-100"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1" htmlFor="import-title-override">
                  Form Title Override (optional)
                </label>
                <input
                  id="import-title-override"
                  type="text"
                  value={importTitle}
                  onChange={(e) => setImportTitle(e.target.value)}
                  placeholder="Leave blank to use title from JSON"
                  className="h-9 w-full rounded border border-slate-300 bg-white px-3 text-xs text-slate-900 focus:border-emerald-600 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1" htmlFor="import-json-text">
                  Or Paste Form Definition JSON
                </label>
                <textarea
                  id="import-json-text"
                  rows={8}
                  value={importJson}
                  onChange={(e) => {
                    setImportJson(e.target.value);
                    if (importError) setImportError(null);
                  }}
                  placeholder='{"exportFormatVersion": 1, "schema": { ... }}'
                  className="w-full rounded border border-slate-300 bg-slate-50 p-2.5 font-mono text-xs text-slate-900 focus:border-emerald-600 focus:outline-hidden"
                />
              </div>

              {importError && (
                <div role="alert" className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
                  {importError}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-200 pt-3">
              <button
                type="button"
                onClick={() => setImportOpen(false)}
                disabled={importing}
                className="rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={importing || !importJson.trim() || !activeOrganizationId}
                onClick={async () => {
                  if (!activeOrganizationId) return;
                  setImporting(true);
                  setImportError(null);
                  try {
                    const response = await fetch("/api/forms/import", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        organizationId: activeOrganizationId,
                        title: importTitle.trim() || undefined,
                        definition: importJson,
                      }),
                    });
                    const body = await response.json();
                    if (!response.ok) {
                      throw new Error(body.error || "Import failed.");
                    }
                    setImportOpen(false);
                    setImportJson("");
                    setImportTitle("");
                    router.push(`/forms/${encodeURIComponent(body.form.id)}/builder`);
                  } catch (err) {
                    setImportError(err instanceof Error ? err.message : "Failed to import form.");
                  } finally {
                    setImporting(false);
                  }
                }}
                className="rounded bg-emerald-700 px-4 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
              >
                {importing ? "Importing…" : "Import as Draft"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
