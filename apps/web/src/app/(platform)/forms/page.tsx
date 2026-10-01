"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { FileSpreadsheet, Plus, Search } from "lucide-react";
import { useAuth } from "@/lib/auth/auth-context";
import type { FormListItem } from "@/lib/repositories/form-repository";

export default function FormLibraryPage() {
  const { activeOrganization, isLoading: authLoading } = useAuth();
  const [forms, setForms] = useState<FormListItem[]>([]);
  const [query, setQuery] = useState("");
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  useEffect(() => {
    if (authLoading) return;
    if (!activeOrganization) {
      setError("Select an organization where you can manage forms.");
      setState("error");
      return;
    }
    const controller = new AbortController();
    setState("loading");
    fetch(
      `/api/forms?organizationId=${encodeURIComponent(activeOrganization.id)}`,
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
  }, [activeOrganization, authLoading]);
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
      <header className="flex items-center justify-between border-b border-slate-200 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-emerald-700" />
            <h1 className="text-xl font-bold">Form Library</h1>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Forms available to{" "}
            {activeOrganization?.name ?? "the active organization"}.
          </p>
        </div>
        <Link
          href="/forms/new"
          className="inline-flex h-9 items-center gap-2 rounded bg-emerald-700 px-4 text-xs font-semibold text-white"
        >
          <Plus className="h-4 w-4" />
          Create Form
        </Link>
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
          <label className="relative block max-w-sm">
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
          <div className="overflow-hidden border border-slate-200 bg-white">
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
                      <Link
                        className="font-semibold text-emerald-700"
                        href={`/forms/${form.id}/builder`}
                      >
                        {form.draft_version_number
                          ? "Open builder"
                          : "View form"}
                      </Link>
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
        </>
      )}
    </div>
  );
}
