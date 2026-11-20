"use client";

import React, { useCallback, useEffect, useState } from "react";
import { X, RefreshCw, Calendar, User, Hash, AlertCircle } from "lucide-react";
import { Badge, Button, LoadingState } from "@field/ui";
import { FormRenderer, type LookupProvider, type RendererValue } from "@field/form-renderer";
import type { OptionItem } from "@field/form-engine";
import type { AuthenticatedSubmissionDetailResult } from "@/lib/services/submission-service";
import "@field/form-renderer/styles.css";

export interface SubmissionDetailDrawerProps {
  submissionId: string | null;
  organizationId: string;
  onClose: () => void;
}

export function SubmissionDetailDrawer({
  submissionId,
  organizationId,
  onClose,
}: SubmissionDetailDrawerProps) {
  const [data, setData] = useState<AuthenticatedSubmissionDetailResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchDetail = useCallback(async (id: string, orgId: string, signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/submissions/${encodeURIComponent(id)}?organizationId=${encodeURIComponent(orgId)}`,
        { signal },
      );
      const body = await response.json();
      if (!response.ok) {
        throw new Error(body.error || "Failed to load submission detail.");
      }
      setData(body as AuthenticatedSubmissionDetailResult);
    } catch (err) {
      if ((err as Error)?.name !== "AbortError") {
        setError(err instanceof Error ? err.message : "Unable to load submission.");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!submissionId || !organizationId) {
      setData(null);
      setError(null);
      return;
    }

    const controller = new AbortController();
    fetchDetail(submissionId, organizationId, controller.signal);

    return () => controller.abort();
  }, [submissionId, organizationId, fetchDetail]);

  // Handle escape key
  useEffect(() => {
    if (!submissionId) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [submissionId, onClose]);

  const lookupProvider = useCallback<LookupProvider>(
    async (config, context) => {
      if (!organizationId || !config.targetEntity) return [];
      const queryParams = new URLSearchParams({
        organizationId,
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
    [organizationId],
  );

  if (!submissionId) return null;

  const statusVariant = (status: string) => {
    switch (status.toLowerCase()) {
      case "approved":
      case "completed":
        return "success";
      case "submitted":
        return "default";
      case "draft":
      case "pending":
        return "warning";
      case "rejected":
        return "error";
      default:
        return "outline";
    }
  };

  const formattedDate = data?.submission.submitted_at
    ? new Date(data.submission.submitted_at).toLocaleString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : data?.submission.created_at
      ? new Date(data.submission.created_at).toLocaleString(undefined, {
          year: "numeric",
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })
      : "—";

  return (
    <div className="fixed inset-0 z-50 overflow-hidden" role="dialog" aria-modal="true" aria-labelledby="drawer-title">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      <div className="fixed inset-y-0 right-0 flex max-w-full pl-10">
        <div className="w-screen max-w-3xl bg-white shadow-2xl flex flex-col border-l border-slate-200">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 bg-slate-50">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Submission Detail
                </span>
                {data && (
                  <Badge variant={statusVariant(data.submission.status)}>
                    {data.submission.status.toUpperCase()}
                  </Badge>
                )}
              </div>
              <h2 id="drawer-title" className="mt-1 truncate text-lg font-bold text-slate-900">
                {data?.submission.reference_number || (data ? `Submission ${data.submission.id.slice(0, 8)}` : "Loading...")}
              </h2>
              {data && (
                <p className="mt-0.5 text-xs text-slate-500">
                  Form: <span className="font-medium text-slate-700">{data.form.title}</span> (v{data.formVersion.version_number})
                </p>
              )}
            </div>

            <div className="flex items-center gap-2 ml-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => fetchDetail(submissionId, organizationId)}
                disabled={loading}
                title="Refresh submission"
                className="h-8 w-8 p-0"
              >
                <RefreshCw className={`h-4 w-4 text-slate-600 ${loading ? "animate-spin" : ""}`} />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={onClose}
                title="Close drawer"
                className="h-8 w-8 p-0 text-slate-500 hover:text-slate-900"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Metadata bar */}
          {data && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 border-b border-slate-200 bg-white px-6 py-3 text-xs text-slate-600">
              <div className="flex items-center gap-1.5">
                <Hash className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                <span className="truncate" title={data.submission.id}>
                  ID: <span className="font-mono text-slate-700">{data.submission.id.slice(0, 8)}…</span>
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                <span className="truncate">{formattedDate}</span>
              </div>
              <div className="flex items-center gap-1.5 col-span-2 sm:col-span-1">
                <User className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                <span className="truncate" title={data.submission.submitted_by || data.submission.created_by || "Anonymous"}>
                  By: {data.submission.submitted_by ? `${data.submission.submitted_by.slice(0, 8)}…` : "Public / Guest"}
                </span>
              </div>
            </div>
          )}

          {/* Drawer Body */}
          <div className="flex-1 overflow-y-auto p-6 bg-slate-50/50">
            {loading && !data && (
              <div className="py-20 text-center">
                <LoadingState label="Loading submission data..." />
              </div>
            )}

            {error && (
              <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800" role="alert">
                <div className="flex items-start gap-2">
                  <AlertCircle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <strong className="block font-semibold">Unable to load submission</strong>
                    <p className="mt-1 text-xs">{error}</p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => fetchDetail(submissionId, organizationId)}
                      className="mt-3 border-red-300 bg-white text-xs text-red-800 hover:bg-red-50"
                    >
                      Try Again
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {!loading && !error && data && (
              <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-xs">
                <FormRenderer
                  schema={data.formVersion.schema_jsonb}
                  mode="readOnly"
                  value={data.rendererValue as unknown as RendererValue}
                  lookupProvider={lookupProvider}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

