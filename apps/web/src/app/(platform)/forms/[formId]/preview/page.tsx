"use client";

import { use, useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { FormRenderer, type LookupProvider } from "@field/form-renderer";
import type { FormSchemaV1, OptionItem } from "@field/form-engine";
import { useAuth } from "@/lib/auth/auth-context";
import "@field/form-renderer/styles.css";

type DeviceViewport = "desktop" | "tablet" | "mobile";

interface PublishedFormResponse {
  form: {
    id: string;
    key: string;
    title: string;
    description?: string;
  };
  publishedVersion: {
    id: string;
    version_number: number;
    schema_version: number;
    schema_jsonb: FormSchemaV1;
  };
}

export default function PublishedFormPreviewPage({
  params,
}: {
  params: Promise<{ formId: string }>;
}) {
  const { formId } = use(params);
  const { activeOrganization, isLoading: authLoading } = useAuth();
  const activeOrganizationId = activeOrganization?.id ?? null;

  const [data, setData] = useState<PublishedFormResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewport, setViewport] = useState<DeviceViewport>("desktop");

  const lookupProvider = useCallback<LookupProvider>(
    async (config, context) => {
      if (!activeOrganizationId || !config.targetEntity) return [];
      const queryParams = new URLSearchParams({
        organizationId: activeOrganizationId,
        displayField: config.displayField,
        valueField: config.valueField,
      });
      const response = await fetch(
        `/api/data-sources/${encodeURIComponent(config.targetEntity)}/lookup?${queryParams.toString()}`,
        { signal: context.signal },
      );
      if (!response.ok) return [];
      const body = (await response.json()) as { options?: OptionItem[] };
      return body.options ?? [];
    },
    [activeOrganizationId],
  );

  useEffect(() => {
    if (authLoading) return;
    if (!activeOrganizationId) {
      setError("Select an organization to preview forms.");
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    setError(null);

    fetch(
      `/api/forms/${encodeURIComponent(formId)}/published?organizationId=${encodeURIComponent(activeOrganizationId)}`,
      { signal: controller.signal },
    )
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json();
          throw new Error(body.error || "Failed to load published version.");
        }
        const json = (await res.json()) as PublishedFormResponse;
        setData(json);
      })
      .catch((err) => {
        if (err.name !== "AbortError") {
          setError(err.message);
        }
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [formId, activeOrganizationId, authLoading]);

  return (
    <div className="space-y-4">
      {/* Navigation & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <nav className="text-xs text-slate-500 mb-1">
            <Link href="/forms" className="font-semibold text-emerald-700 hover:underline">
              Form Library
            </Link>
            {" / "}
            <Link
              href={`/forms/${formId}/builder`}
              className="font-semibold text-emerald-700 hover:underline"
            >
              Builder
            </Link>
            {" / Published Preview"}
          </nav>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-slate-900">
              {data?.form.title ?? "Published Form Preview"}
            </h1>
            {data?.publishedVersion && (
              <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-800">
                v{data.publishedVersion.version_number} Published
              </span>
            )}
          </div>
        </div>

        {/* Viewport switcher */}
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-md border border-slate-300 bg-white p-0.5 text-xs font-semibold">
            <button
              type="button"
              className={`rounded px-3 py-1.5 transition ${viewport === "desktop" ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"}`}
              onClick={() => setViewport("desktop")}
            >
              Desktop
            </button>
            <button
              type="button"
              className={`rounded px-3 py-1.5 transition ${viewport === "tablet" ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"}`}
              onClick={() => setViewport("tablet")}
            >
              Tablet (768px)
            </button>
            <button
              type="button"
              className={`rounded px-3 py-1.5 transition ${viewport === "mobile" ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"}`}
              onClick={() => setViewport("mobile")}
            >
              Mobile (375px)
            </button>
          </div>

          <Link
            href={`/forms/${formId}/builder`}
            className="rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            Back to Builder
          </Link>
        </div>
      </div>

      {/* Preview Notification Banner */}
      <div
        role="status"
        className="rounded border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 flex items-center justify-between"
      >
        <div>
          <strong>Preview Mode:</strong> You are previewing the exact published snapshot. Validations, calculations, and rules are active. Form entries are simulated locally and cannot create real database submissions.
        </div>
      </div>

      {loading && (
        <div
          role="status"
          className="border border-slate-200 bg-white p-12 text-center text-sm text-slate-500"
        >
          Loading published snapshot…
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="rounded border border-red-200 bg-red-50 p-6 text-center text-sm text-red-800"
        >
          <strong className="block text-base font-bold">Unable to Preview Form</strong>
          <p className="mt-1">{error}</p>
          <div className="mt-4">
            <Link
              href={`/forms/${formId}/builder`}
              className="inline-flex rounded bg-red-700 px-4 py-2 text-xs font-semibold text-white"
            >
              Return to Form Builder
            </Link>
          </div>
        </div>
      )}

      {!loading && !error && data && (
        <div className="flex justify-center bg-slate-100 p-4 sm:p-8 rounded-lg border border-slate-200 overflow-x-auto min-h-[600px]">
          <div
            className={`w-full transition-all duration-200 ${
              viewport === "desktop"
                ? "max-w-4xl"
                : viewport === "tablet"
                  ? "max-w-[768px]"
                  : "max-w-[375px] border-8 border-slate-800 rounded-3xl p-3 bg-white shadow-2xl"
            }`}
          >
            <div className="bg-white rounded-lg border border-slate-200 p-6 shadow-sm">
              <FormRenderer
                schema={data.publishedVersion.schema_jsonb}
                mode="preview"
                lookupProvider={lookupProvider}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

