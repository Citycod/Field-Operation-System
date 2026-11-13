"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  FormBuilder,
  type BuilderDataSourceOption,
  type BuilderMemberOption,
  type FormVersionSummary,
} from "@field/form-builder";
import type { FormSchemaV1, OptionItem } from "@field/form-engine";
import type { LookupProvider } from "@field/form-renderer";
import { useAuth } from "@/lib/auth/auth-context";
import type { FormDraftResponse } from "@/lib/forms/contracts";
import type { DataSourceSummary } from "@/lib/repositories/data-source-repository";
import "@field/form-builder/styles.css";
import "@field/form-renderer/styles.css";

type LoadState = "loading" | "ready" | "error";

export default function ProductionFormBuilderPage() {
  const params = useParams<{ formId: string }>();
  const formId = params.formId;
  const { activeOrganization, isLoading: authLoading } = useAuth();
  const activeOrganizationId = activeOrganization?.id ?? null;
  const [data, setData] = useState<FormDraftResponse | null>(null);
  const [dataSources, setDataSources] = useState<BuilderDataSourceOption[]>([]);
  const [organizationMembers, setOrganizationMembers] = useState<BuilderMemberOption[]>([]);
  const [state, setState] = useState<LoadState>("loading");
  const [error, setError] = useState("");
  const [creatingDraft, setCreatingDraft] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [versions, setVersions] = useState<FormVersionSummary[]>([]);
  const [viewingSchema, setViewingSchema] =
    useState<FormVersionSummary | null>(null);
  const loadedDraftContextRef = useRef<string | null>(null);
  const latestSchemaRef = useRef<FormSchemaV1 | null>(null);
  const isPublishingRef = useRef(false);

  const lookupProvider = useCallback<LookupProvider>(
    async (config, context) => {
      if (!activeOrganizationId || !config.targetEntity) return [];
      const params = new URLSearchParams({
        organizationId: activeOrganizationId,
        displayField: config.displayField,
        valueField: config.valueField,
      });
      const response = await fetch(
        `/api/data-sources/${encodeURIComponent(config.targetEntity)}/lookup?${params.toString()}`,
        { signal: context.signal },
      );
      if (!response.ok) {
        throw new Error("Failed to load lookup options.");
      }
      const body = (await response.json()) as { options?: OptionItem[] };
      return body.options ?? [];
    },
    [activeOrganizationId],
  );

  const loadDraft = useCallback(
    async (options?: { force?: boolean }) => {
      if (authLoading) return;
      if (!activeOrganizationId) {
        loadedDraftContextRef.current = null;
        setError("Select an organization where you can manage forms.");
        setState("error");
        return;
      }

      const contextKey = `${activeOrganizationId}:${formId}`;
      if (!options?.force && loadedDraftContextRef.current === contextKey) {
        return;
      }

      setState("loading");
      setError("");
      try {
        const response = await fetch(
          `/api/forms/${encodeURIComponent(formId)}/draft?organizationId=${encodeURIComponent(activeOrganizationId)}`,
        );
        const body = await response.json();
        if (!response.ok)
          throw new Error(body.error || "Unable to load the form draft.");
        loadedDraftContextRef.current = contextKey;
        setHasUnsavedChanges(false);
        setData(body as FormDraftResponse);
        setState("ready");

        fetch(
          `/api/data-sources?organizationId=${encodeURIComponent(activeOrganizationId)}`,
        )
          .then(async (dsRes) => {
            if (!dsRes.ok) return;
            const dsBody = (await dsRes.json()) as {
              dataSources?: DataSourceSummary[];
            };
            const list = dsBody.dataSources ?? [];
            setDataSources(
              list.map((ds) => ({
                id: ds.id,
                key: ds.key,
                name: ds.name,
                status: ds.status,
                displayFieldKey: ds.display_field_key,
                valueFieldKey: ds.value_field_key,
                fields: ds.fields.map((f) => ({
                  key: f.key,
                  label: f.label,
                })),
              })),
            );
          })
          .catch(() => {
            // Non-blocking: draft authoring continues even if data sources fail to load
          });

        fetch(
          `/api/forms/${encodeURIComponent(formId)}/versions?organizationId=${encodeURIComponent(activeOrganizationId)}`,
        )
          .then(async (vRes) => {
            if (!vRes.ok) return;
            const vBody = (await vRes.json()) as {
              versions?: FormVersionSummary[];
            };
            setVersions(vBody.versions ?? []);
          })
          .catch(() => {
            // Non-blocking: version list will be retried on tab select
          });

        fetch(
          `/api/organizations/${encodeURIComponent(activeOrganizationId)}/members`,
        )
          .then(async (mRes) => {
            if (!mRes.ok) return;
            const mBody = (await mRes.json()) as {
              members?: Array<{
                user_id: string;
                role_key: string;
                status: string;
                display_name?: string | null;
                first_name?: string | null;
                last_name?: string | null;
                email?: string | null;
              }>;
            };
            const active = (mBody.members ?? [])
              .filter((m) => m.status === "active")
              .map((m) => ({
                userId: m.user_id,
                roleKey: m.role_key,
                email: m.email,
                displayName:
                  m.display_name ||
                  [m.first_name, m.last_name].filter(Boolean).join(" ") ||
                  m.email ||
                  m.user_id,
              }));
            setOrganizationMembers(active);
          })
          .catch(() => {
            // Non-blocking: user picker falls back to role/deferred assignments
          });
      } catch (reason) {
        loadedDraftContextRef.current = null;
        setError(
          reason instanceof Error
            ? reason.message
            : "Unable to load the form draft.",
        );
        setState("error");
      }
    },
    [activeOrganizationId, authLoading, formId],
  );

  useEffect(() => {
    void loadDraft();
  }, [loadDraft]);

  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasUnsavedChanges]);

  async function createDraft() {
    if (!activeOrganizationId) return;
    setCreatingDraft(true);
    setError("");
    try {
      const response = await fetch(
        `/api/forms/${encodeURIComponent(formId)}/draft`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ organizationId: activeOrganizationId }),
        },
      );
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error || "Unable to create a new draft.");
      await loadDraft({ force: true });
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to create a new draft.",
      );
    } finally {
      setCreatingDraft(false);
    }
  }

  const loadVersions = useCallback(async (): Promise<FormVersionSummary[]> => {
    if (!activeOrganizationId) return [];
    try {
      const response = await fetch(
        `/api/forms/${encodeURIComponent(formId)}/versions?organizationId=${encodeURIComponent(activeOrganizationId)}`,
      );
      if (!response.ok) {
        throw new Error("Failed to load form version history.");
      }
      const body = (await response.json()) as {
        versions?: FormVersionSummary[];
      };
      const list = body.versions ?? [];
      setVersions(list);
      return list;
    } catch {
      return [];
    }
  }, [activeOrganizationId, formId]);

  async function saveDraft(schema: FormSchemaV1) {
    if (!activeOrganizationId || !data?.draft)
      throw new Error("No editable draft is available.");
    const response = await fetch(
      `/api/forms/${encodeURIComponent(formId)}/draft`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId: activeOrganizationId,
          versionId: data.draft.id,
          schema,
        }),
      },
    );
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "Draft save failed.");
    setHasUnsavedChanges(false);
    latestSchemaRef.current = null;
    setData((current) =>
      current ? { ...current, draft: body.version } : current,
    );
    return body.version as FormVersionSummary;
  }

  async function publishDraft(
    changeNote?: string,
    builderSchema?: FormSchemaV1,
  ) {
    if (!activeOrganizationId || !data?.draft)
      throw new Error("No editable draft is available to publish.");
    if (isPublishingRef.current) return;

    isPublishingRef.current = true;
    try {
      const targetSchema = builderSchema ?? latestSchemaRef.current;
      let targetVersionId = data.draft.id;

      // Always save the latest in-memory builder schema before issuing the publish request.
      // If saving fails, publishDraft throws and the publish request is never sent.
      if (targetSchema) {
        const savedDraft = await saveDraft(targetSchema);
        if (savedDraft?.id) {
          targetVersionId = savedDraft.id;
        }
      }

      const response = await fetch(
        `/api/forms/${encodeURIComponent(formId)}/publish`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            organizationId: activeOrganizationId,
            versionId: targetVersionId,
            changeNote,
          }),
        },
      );
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Publish failed.");
      setHasUnsavedChanges(false);
      latestSchemaRef.current = null;
      await Promise.all([
        loadDraft({ force: true }),
        loadVersions(),
      ]);
    } finally {
      isPublishingRef.current = false;
    }
  }

  return (
    <div className="space-y-3">
      <nav className="text-xs text-slate-500">
        <Link href="/forms" className="font-semibold text-emerald-700">
          Form Library
        </Link>
        {" / Builder"}
      </nav>

      {state === "loading" && (
        <div
          role="status"
          className="border border-slate-200 bg-white p-12 text-center text-sm text-slate-500"
        >
          Loading editable draft…
        </div>
      )}

      {state === "error" && (
        <div
          role="alert"
          className="border border-red-200 bg-red-50 p-5 text-sm text-red-800"
        >
          <strong>Builder unavailable</strong>
          <p className="mt-1">{error}</p>
          <button
            type="button"
            onClick={() => void loadDraft({ force: true })}
            className="mt-3 rounded border border-red-300 px-3 py-2 text-xs font-semibold"
          >
            Try again
          </button>
        </div>
      )}

      {state === "ready" && data && !data.draft && (
        <div className="space-y-4">
          <div className="border border-slate-200 bg-white p-8 text-center">
            <h1 className="text-lg font-bold">{data.form.title}</h1>
            <p className="mt-2 text-sm text-slate-500">
              This form has no active draft. Create one from its latest published
              version to continue editing.
            </p>
            {error && (
              <p role="alert" className="mt-3 text-sm text-red-700">
                {error}
              </p>
            )}
            <button
              type="button"
              disabled={creatingDraft}
              onClick={() => void createDraft()}
              className="mt-4 rounded bg-emerald-700 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
            >
              {creatingDraft ? "Creating draft…" : "Create Draft from Published"}
            </button>
          </div>

          {versions.length > 0 && (
            <div className="border border-slate-200 bg-white p-6">
              <h2 className="text-base font-bold text-slate-900">
                Version History
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                Published releases for this form. Published versions are permanent and immutable.
              </p>
              <div className="mt-4 overflow-x-auto border border-slate-200 rounded">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                    <tr>
                      <th className="p-3">Version</th>
                      <th className="p-3">Status</th>
                      <th className="p-3">Release Date</th>
                      <th className="p-3">Author</th>
                      <th className="p-3">Change Note</th>
                      <th className="p-3">Schema</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {versions.map((v) => (
                      <tr key={v.id} className="hover:bg-slate-50">
                        <td className="p-3 font-mono font-bold">
                          v{v.version_number}
                        </td>
                        <td className="p-3">
                          <span
                            className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                              v.status === "published"
                                ? "bg-emerald-100 text-emerald-800"
                                : v.status === "draft"
                                  ? "bg-amber-100 text-amber-800"
                                  : "bg-slate-100 text-slate-700"
                            }`}
                          >
                            {v.status}
                          </span>
                        </td>
                        <td className="p-3 text-slate-500">
                          {v.published_at
                            ? new Date(v.published_at).toLocaleString()
                            : v.created_at
                              ? new Date(v.created_at).toLocaleString()
                              : "—"}
                        </td>
                        <td className="p-3 text-slate-500">
                          {v.published_by || v.created_by || "System"}
                        </td>
                        <td className="p-3 text-slate-700">
                          {v.change_note || "—"}
                        </td>
                        <td className="p-3">
                          <button
                            type="button"
                            onClick={() => setViewingSchema(v)}
                            className="rounded border border-slate-300 px-2.5 py-1 text-xs font-semibold hover:bg-slate-100"
                          >
                            View
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {state === "ready" && data?.draft && (
        <FormBuilder
          key={data.draft.id}
          initialSchema={data.draft.schema_jsonb as FormSchemaV1}
          dataSources={dataSources}
          organizationMembers={organizationMembers}
          lookupProvider={lookupProvider}
          onChange={(nextSchema) => {
            latestSchemaRef.current = nextSchema;
            setHasUnsavedChanges(true);
          }}
          onSave={async (schema) => {
            await saveDraft(schema);
          }}
          onPublish={publishDraft}
          versions={versions}
          onLoadVersions={loadVersions}
        />
      )}

      {viewingSchema && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-3xl rounded bg-white p-6 shadow-xl max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <h3 className="text-base font-bold text-slate-800">
                Form Schema — v{viewingSchema.version_number} ({viewingSchema.status})
              </h3>
              <button
                type="button"
                onClick={() => setViewingSchema(null)}
                className="text-slate-400 hover:text-slate-600 text-lg font-bold"
              >
                ×
              </button>
            </div>
            <div className="my-4 flex-1 overflow-auto rounded bg-slate-950 p-4 font-mono text-xs text-slate-200">
              <pre>
                <code>
                  {JSON.stringify(viewingSchema.schema_jsonb, null, 2)}
                </code>
              </pre>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard?.writeText(
                    JSON.stringify(viewingSchema.schema_jsonb, null, 2),
                  );
                }}
                className="rounded border border-slate-300 px-3 py-1.5 text-xs font-semibold hover:bg-slate-50"
              >
                Copy JSON
              </button>
              <button
                type="button"
                onClick={() => setViewingSchema(null)}
                className="rounded bg-emerald-700 px-4 py-1.5 text-xs font-semibold text-white"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
