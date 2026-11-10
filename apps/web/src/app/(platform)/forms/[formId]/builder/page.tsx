"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  FormBuilder,
  type BuilderDataSourceOption,
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
  const [state, setState] = useState<LoadState>("loading");
  const [error, setError] = useState("");
  const [creatingDraft, setCreatingDraft] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const loadedDraftContextRef = useRef<string | null>(null);

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
    setData((current) =>
      current ? { ...current, draft: body.version } : current,
    );
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
      )}

      {state === "ready" && data?.draft && (
        <FormBuilder
          key={data.draft.id}
          initialSchema={data.draft.schema_jsonb as FormSchemaV1}
          dataSources={dataSources}
          lookupProvider={lookupProvider}
          onChange={() => setHasUnsavedChanges(true)}
          onSave={saveDraft}
        />
      )}
    </div>
  );
}
