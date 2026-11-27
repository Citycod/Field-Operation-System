"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  X,
  RefreshCw,
  Calendar,
  User,
  Hash,
  AlertCircle,
  CheckCircle2,
  XCircle,
  RotateCcw,
  Clock,
  ShieldCheck,
} from "lucide-react";
import { Badge, Button, LoadingState } from "@field/ui";
import { FormRenderer, type LookupProvider, type RendererValue } from "@field/form-renderer";
import type { OptionItem } from "@field/form-engine";
import { useAuth } from "@/lib/auth/auth-context";
import type { AuthenticatedSubmissionDetailResult } from "@/lib/services/submission-service";
import type { ApprovalDecisionValue } from "@/lib/repositories/approval-repository";
import "@field/form-renderer/styles.css";

export interface SubmissionDetailDrawerProps {
  submissionId: string | null;
  organizationId: string;
  onClose: () => void;
  onDecisionComplete?: () => void;
}

export function SubmissionDetailDrawer({
  submissionId,
  organizationId,
  onClose,
  onDecisionComplete,
}: SubmissionDetailDrawerProps) {
  const { user } = useAuth();
  const [data, setData] = useState<AuthenticatedSubmissionDetailResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Approval decision state
  const [comment, setComment] = useState("");
  const [submittingDecision, setSubmittingDecision] = useState<ApprovalDecisionValue | null>(null);
  const [decisionError, setDecisionError] = useState<string | null>(null);
  const [decisionNotice, setDecisionNotice] = useState<string | null>(null);

  // Resubmit state (for returned submissions)
  const [isEditingReturned, setIsEditingReturned] = useState(false);
  const [resubmitting, setResubmitting] = useState(false);
  const [resubmitError, setResubmitError] = useState<string | null>(null);

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
    setComment("");
    setDecisionError(null);
    setDecisionNotice(null);
    setIsEditingReturned(false);
    setResubmitError(null);

    if (!submissionId || !organizationId) {
      setData(null);
      setError(null);
      return;
    }

    const controller = new AbortController();
    fetchDetail(submissionId, organizationId, controller.signal);

    return () => controller.abort();
  }, [submissionId, organizationId, fetchDetail]);

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

  const handleDecision = async (decision: ApprovalDecisionValue) => {
    const activeStage = data?.approval?.activeStage;
    if (!activeStage || submittingDecision) return;

    const reqs = data?.approval?.commentRequirements;
    const trimmed = comment.trim();
    if (
      (decision === "approved" && reqs?.approve && !trimmed) ||
      (decision === "rejected" && reqs?.reject && !trimmed) ||
      (decision === "returned" && reqs?.return && !trimmed)
    ) {
      setDecisionError("A comment is required for this decision.");
      return;
    }

    setSubmittingDecision(decision);
    setDecisionError(null);
    setDecisionNotice(null);

    const endpointSlug =
      decision === "approved"
        ? "approve"
        : decision === "rejected"
          ? "reject"
          : "return";

    try {
      const response = await fetch(
        `/api/approval-stages/${encodeURIComponent(activeStage.id)}/${endpointSlug}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            organizationId,
            comment: trimmed || undefined,
          }),
        },
      );

      const body = await response.json();
      if (!response.ok) {
        throw new Error(body.error || "Failed to submit approval decision.");
      }

      setComment("");
      setDecisionNotice(
        decision === "approved"
          ? "Stage approved successfully."
          : decision === "rejected"
            ? "Submission rejected."
            : "Submission returned for correction.",
      );
      if (submissionId) {
        await fetchDetail(submissionId, organizationId);
      }
      onDecisionComplete?.();
    } catch (err) {
      setDecisionError(
        err instanceof Error ? err.message : "Unable to record decision.",
      );
    } finally {
      setSubmittingDecision(null);
    }
  };

  const handleResubmit = async (values: RendererValue) => {
    if (!data?.submission || resubmitting) return;
    setResubmitting(true);
    setResubmitError(null);

    try {
      const response = await fetch(
        `/api/submissions/${encodeURIComponent(data.submission.id)}/resubmit`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            organizationId,
            fields: values.fields,
            details: values.details,
            notes: values.notes,
            documents: values.documents,
          }),
        },
      );
      const body = await response.json();
      if (!response.ok) {
        throw new Error(body.error || "Failed to resubmit form.");
      }

      setIsEditingReturned(false);
      setDecisionNotice("Submission updated and resubmitted into workflow.");
      await fetchDetail(data.submission.id, organizationId);
      onDecisionComplete?.();
    } catch (err) {
      setResubmitError(
        err instanceof Error ? err.message : "Unable to resubmit form.",
      );
    } finally {
      setResubmitting(false);
    }
  };

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
      case "pending_approval":
      case "returned":
      case "active":
        return "warning";
      case "rejected":
        return "error";
      default:
        return "outline";
    }
  };

  const formatDateTime = (iso?: string | null) =>
    iso
      ? new Date(iso).toLocaleString(undefined, {
          year: "numeric",
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })
      : "—";

  const formattedDate = formatDateTime(
    data?.submission.submitted_at || data?.submission.created_at,
  );

  const approval = data?.approval;
  const isReturnedRequester =
    Boolean(data?.submission) &&
    data?.submission.status === "returned" &&
    Boolean(user?.id) &&
    (data?.submission.submitted_by === user?.id ||
      data?.submission.created_by === user?.id);

  return (
    <div
      className="fixed inset-0 z-50 overflow-hidden"
      role="dialog"
      aria-modal="true"
      aria-labelledby="drawer-title"
    >
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
                    {data.submission.status.replace(/_/g, " ").toUpperCase()}
                  </Badge>
                )}
              </div>
              <h2
                id="drawer-title"
                className="mt-1 truncate text-lg font-bold text-slate-900"
              >
                {data?.submission.reference_number ||
                  (data ? `Submission ${data.submission.id.slice(0, 8)}` : "Loading...")}
              </h2>
              {data && (
                <p className="mt-0.5 text-xs text-slate-500">
                  Form:{" "}
                  <span className="font-medium text-slate-700">
                    {data.form.title}
                  </span>{" "}
                  (v{data.formVersion.version_number})
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
                <RefreshCw
                  className={`h-4 w-4 text-slate-600 ${loading ? "animate-spin" : ""}`}
                />
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
                  ID:{" "}
                  <span className="font-mono text-slate-700">
                    {data.submission.id.slice(0, 8)}…
                  </span>
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                <span className="truncate">{formattedDate}</span>
              </div>
              <div className="flex items-center gap-1.5 col-span-2 sm:col-span-1">
                <User className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                <span
                  className="truncate"
                  title={
                    data.submission.submitted_by ||
                    data.submission.created_by ||
                    "Anonymous"
                  }
                >
                  By:{" "}
                  {data.submission.submitted_by
                    ? `${data.submission.submitted_by.slice(0, 8)}…`
                    : "Public / Guest"}
                </span>
              </div>
            </div>
          )}

          {/* Drawer Body */}
          <div className="flex-1 overflow-y-auto p-6 space-y-5 bg-slate-50/50">
            {loading && !data && (
              <div className="py-20 text-center">
                <LoadingState label="Loading submission data..." />
              </div>
            )}

            {error && (
              <div
                className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800"
                role="alert"
              >
                <div className="flex items-start gap-2">
                  <AlertCircle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <strong className="block font-semibold">
                      Unable to load submission
                    </strong>
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

            {decisionNotice && (
              <div
                role="status"
                className="rounded border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-medium text-emerald-900 flex items-center gap-2"
              >
                <CheckCircle2 className="h-4 w-4 text-emerald-700 shrink-0" />
                <span>{decisionNotice}</span>
              </div>
            )}

            {/* Approval Action Card */}
            {!error && data && approval?.activeStage && approval.canCurrentUserDecide && (
              <section
                aria-label="Approval decision panel"
                className="rounded-md border border-emerald-200 bg-white p-4 shadow-2xs space-y-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-emerald-700" />
                    <h3 className="text-xs font-bold uppercase tracking-wide text-slate-900">
                      Action Required: {approval.activeStage.stage_name}
                    </h3>
                  </div>
                  <span className="text-[11px] font-medium text-slate-500">
                    Cycle #{approval.activeInstance?.cycle_number ?? 1} ·{" "}
                    {approval.activeStage.assigned_approver_id
                      ? "Direct Assignee"
                      : `Role: ${approval.activeStage.assigned_role_key ?? "assigned"}`}
                  </span>
                </div>

                <div>
                  <label
                    htmlFor="approval-decision-comment"
                    className="block text-xs font-medium text-slate-700 mb-1"
                  >
                    Review Comment
                    {(approval.commentRequirements.approve ||
                      approval.commentRequirements.reject ||
                      approval.commentRequirements.return) && (
                      <span className="ml-1.5 text-[11px] font-normal text-slate-500">
                        (Required on:{" "}
                        {[
                          approval.commentRequirements.approve ? "Approve" : null,
                          approval.commentRequirements.return ? "Return" : null,
                          approval.commentRequirements.reject ? "Reject" : null,
                        ]
                          .filter(Boolean)
                          .join(", ")}
                        )
                      </span>
                    )}
                  </label>
                  <textarea
                    id="approval-decision-comment"
                    rows={2}
                    value={comment}
                    onChange={(e) => {
                      setComment(e.target.value);
                      if (decisionError) setDecisionError(null);
                    }}
                    disabled={submittingDecision !== null}
                    placeholder="Enter review notes, feedback, or rejection reason..."
                    className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:border-emerald-600 focus:outline-hidden focus:ring-1 focus:ring-emerald-600"
                  />
                </div>

                {decisionError && (
                  <div
                    role="alert"
                    className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800"
                  >
                    {decisionError}
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <Button
                    type="button"
                    size="sm"
                    disabled={submittingDecision !== null}
                    onClick={() => handleDecision("approved")}
                    className="bg-emerald-700 hover:bg-emerald-800 text-white text-xs h-8 px-3 inline-flex items-center gap-1.5"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    {submittingDecision === "approved"
                      ? "Approving..."
                      : approval.actionLabels.approve}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={submittingDecision !== null}
                    onClick={() => handleDecision("returned")}
                    className="border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100 text-xs h-8 px-3 inline-flex items-center gap-1.5"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    {submittingDecision === "returned"
                      ? "Returning..."
                      : approval.actionLabels.return}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={submittingDecision !== null}
                    onClick={() => handleDecision("rejected")}
                    className="border-red-300 bg-red-50 text-red-800 hover:bg-red-100 text-xs h-8 px-3 inline-flex items-center gap-1.5"
                  >
                    <XCircle className="h-3.5 w-3.5" />
                    {submittingDecision === "rejected"
                      ? "Rejecting..."
                      : approval.actionLabels.reject}
                  </Button>
                </div>
              </section>
            )}

            {/* Returned for Correction Banner */}
            {!error && data && isReturnedRequester && (
              <section className="rounded-md border border-amber-300 bg-amber-50 p-4 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <RotateCcw className="h-4 w-4 text-amber-800" />
                    <span className="text-xs font-semibold text-amber-900">
                      This submission was returned for correction.
                    </span>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setIsEditingReturned((prev) => !prev)}
                    className="border-amber-400 bg-white text-xs text-amber-900 hover:bg-amber-100 h-7 px-2.5"
                  >
                    {isEditingReturned ? "Cancel Editing" : "Edit & Resubmit"}
                  </Button>
                </div>
                {resubmitError && (
                  <p role="alert" className="text-xs text-red-700 font-medium">
                    {resubmitError}
                  </p>
                )}
              </section>
            )}

            {/* Form Renderer */}
            {!loading && !error && data && (
              <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-xs">
                {isEditingReturned ? (
                  <FormRenderer
                    schema={data.formVersion.schema_jsonb}
                    mode="edit"
                    initialValue={data.rendererValue as unknown as RendererValue}
                    lookupProvider={lookupProvider}
                    onSubmit={handleResubmit}
                  />
                ) : (
                  <FormRenderer
                    schema={data.formVersion.schema_jsonb}
                    mode="readOnly"
                    value={data.rendererValue as unknown as RendererValue}
                    lookupProvider={lookupProvider}
                  />
                )}
              </div>
            )}

            {/* Immutable Approval History Timeline */}
            {!error && data && approval && approval.instances.length > 0 && (
              <section
                aria-label="Approval history timeline"
                className="rounded-md border border-slate-200 bg-white p-4 shadow-2xs space-y-3"
              >
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-slate-500" />
                    <h3 className="text-xs font-bold uppercase tracking-wide text-slate-800">
                      Approval History
                    </h3>
                  </div>
                  <span className="text-[11px] text-slate-500">
                    {approval.decisions.length} decision
                    {approval.decisions.length === 1 ? "" : "s"} recorded
                  </span>
                </div>

                <div className="space-y-4">
                  {[...approval.instances]
                    .sort((a, b) => b.cycle_number - a.cycle_number)
                    .map((inst) => {
                      const stages = approval.stages
                        .filter((s) => s.approval_instance_id === inst.id)
                        .sort((a, b) => a.stage_order - b.stage_order);

                      return (
                        <div key={inst.id} className="space-y-2">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-semibold text-slate-700">
                              Workflow Cycle #{inst.cycle_number}
                            </span>
                            <Badge variant={statusVariant(inst.status)}>
                              {inst.status.toUpperCase()}
                            </Badge>
                          </div>

                          <ol className="space-y-2 border-l-2 border-slate-200 pl-3 ml-1">
                            {stages.map((stage) => {
                              const stageDecisions = approval.decisions.filter(
                                (d) => d.stage_instance_id === stage.id,
                              );
                              return (
                                <li key={stage.id} className="text-xs space-y-1">
                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                    <span className="font-semibold text-slate-900">
                                      {stage.stage_order + 1}. {stage.stage_name}
                                    </span>
                                    <Badge variant={statusVariant(stage.status)}>
                                      {stage.status.toUpperCase()}
                                    </Badge>
                                  </div>
                                  <div className="text-[11px] text-slate-500 flex flex-wrap gap-3">
                                    <span>
                                      Assignee:{" "}
                                      {stage.assigned_approver_id
                                        ? `User ${stage.assigned_approver_id.slice(0, 8)}…`
                                        : `Role (${stage.assigned_role_key ?? "unassigned"})`}
                                    </span>
                                    <span>Started: {formatDateTime(stage.started_at)}</span>
                                    {stage.completed_at && (
                                      <span>
                                        Completed: {formatDateTime(stage.completed_at)}
                                      </span>
                                    )}
                                  </div>

                                  {stageDecisions.map((dec) => (
                                    <div
                                      key={dec.id}
                                      className="mt-1 rounded border border-slate-100 bg-slate-50 px-2.5 py-2 text-[11px]"
                                    >
                                      <div className="flex items-center justify-between gap-2">
                                        <span className="font-semibold text-slate-800">
                                          {dec.decision.toUpperCase()} by{" "}
                                          <span className="font-mono">
                                            {dec.approver_id.slice(0, 8)}…
                                          </span>
                                        </span>
                                        <span className="text-slate-400">
                                          {formatDateTime(dec.created_at)}
                                        </span>
                                      </div>
                                      {dec.comment && (
                                        <p className="mt-1 text-slate-700 whitespace-pre-wrap">
                                          “{dec.comment}”
                                        </p>
                                      )}
                                    </div>
                                  ))}
                                </li>
                              );
                            })}
                          </ol>
                        </div>
                      );
                    })}
                </div>
              </section>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
