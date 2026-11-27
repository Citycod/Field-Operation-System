"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  CheckSquare,
  RefreshCw,
  Search,
  Eye,
  Inbox,
  Clock,
  ShieldCheck,
} from "lucide-react";
import { Badge, Button, EmptyState } from "@field/ui";
import { useAuth } from "@/lib/auth/auth-context";
import { SubmissionDetailDrawer } from "@/components/submissions/submission-detail-drawer";
import type { PendingApprovalTask } from "@/lib/repositories/approval-repository";

export default function ApprovalsPage() {
  const { activeOrganization, isLoading: authLoading } = useAuth();
  const activeOrganizationId = activeOrganization?.id ?? null;

  const [tasks, setTasks] = useState<PendingApprovalTask[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedSubmissionId, setSelectedSubmissionId] = useState<string | null>(null);

  const loadTasks = useCallback(async () => {
    if (authLoading) return;
    if (!activeOrganizationId) {
      setError("Select an organization to view pending approvals.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/approvals/tasks?organizationId=${encodeURIComponent(activeOrganizationId)}`,
      );
      const body = await response.json();
      if (!response.ok) {
        throw new Error(body.error || "Failed to load approval tasks.");
      }
      setTasks(Array.isArray(body.tasks) ? body.tasks : []);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to load pending approvals.",
      );
    } finally {
      setLoading(false);
    }
  }, [activeOrganizationId, authLoading]);

  useEffect(() => {
    void loadTasks();
  }, [loadTasks]);

  const filteredTasks = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return tasks;
    return tasks.filter((task) => {
      const ref = task.submission.reference_number?.toLowerCase() ?? "";
      const formTitle = task.formTitle.toLowerCase();
      const stageName = task.stage.stage_name.toLowerCase();
      return ref.includes(q) || formTitle.includes(q) || stageName.includes(q);
    });
  }, [tasks, searchQuery]);

  const formatDate = (iso?: string | null) =>
    iso
      ? new Date(iso).toLocaleString(undefined, {
          year: "numeric",
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })
      : "—";

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      {/* Header */}
      <header className="flex flex-col gap-3 border-b border-slate-200 pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <CheckSquare className="h-5 w-5 text-emerald-700" />
            <h1 className="text-xl font-bold text-slate-900">
              Approvals Workflow
            </h1>
            {!loading && (
              <Badge variant={tasks.length > 0 ? "warning" : "outline"}>
                {tasks.length} pending
              </Badge>
            )}
          </div>
          <p className="mt-1 text-xs text-slate-500">
            My Pending Approvals assigned to you in{" "}
            <span className="font-medium text-slate-700">
              {activeOrganization?.name ?? "the active organization"}
            </span>
            .
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void loadTasks()}
            disabled={loading}
            className="flex items-center gap-1.5 text-xs text-slate-700 hover:bg-slate-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Link
            href="/submissions"
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            <Inbox className="h-3.5 w-3.5 text-slate-500" />
            All Submissions
          </Link>
        </div>
      </header>

      {/* Command Bar */}
      <div className="flex flex-wrap items-center gap-2.5 rounded-md border border-slate-200 bg-white p-3 shadow-2xs">
        <div className="relative min-w-[220px] flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filter by reference #, form title, or stage..."
            aria-label="Filter pending approvals"
            className="w-full rounded border border-slate-300 bg-white py-1.5 pl-8 pr-3 text-xs text-slate-900 placeholder:text-slate-400 focus:border-emerald-600 focus:outline-hidden focus:ring-1 focus:ring-emerald-600"
          />
        </div>
      </div>

      {/* Error State */}
      {error && (
        <div
          role="alert"
          className="rounded border border-red-200 bg-red-50 p-4 text-xs text-red-800 flex items-center justify-between gap-3"
        >
          <span>
            <strong>Approvals unavailable:</strong> {error}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void loadTasks()}
            className="border-red-300 bg-white text-xs text-red-800 hover:bg-red-50"
          >
            Retry
          </Button>
        </div>
      )}

      {/* Loading State */}
      {loading && tasks.length === 0 && (
        <div
          role="status"
          className="rounded-md border border-slate-200 bg-white p-12 text-center text-xs text-slate-500"
        >
          <RefreshCw className="mx-auto mb-2 h-5 w-5 animate-spin text-emerald-700" />
          Loading pending approval tasks…
        </div>
      )}

      {/* Empty State */}
      {!loading && !error && filteredTasks.length === 0 && (
        <EmptyState
          icon={<CheckSquare className="w-8 h-8 text-slate-400" />}
          title={
            searchQuery.trim()
              ? "No matching pending approvals"
              : "No pending approvals"
          }
          description={
            searchQuery.trim()
              ? "Try adjusting your search filter above."
              : "Assigned form submissions requiring your review or multi-stage sign-off will appear in this queue."
          }
          action={
            searchQuery.trim() ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSearchQuery("")}
                className="mt-2 text-xs"
              >
                Clear Filter
              </Button>
            ) : undefined
          }
        />
      )}

      {/* Tasks Table */}
      {filteredTasks.length > 0 && (
        <div className="overflow-hidden rounded-md border border-slate-200 bg-white shadow-2xs">
          <div
            className="overflow-x-auto"
            tabIndex={0}
            role="region"
            aria-label="Pending approvals table"
          >
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-100 text-slate-600">
                <tr>
                  <th scope="col" className="px-4 py-3 font-semibold">
                    Reference #
                  </th>
                  <th scope="col" className="px-4 py-3 font-semibold">
                    Form Title
                  </th>
                  <th scope="col" className="px-4 py-3 font-semibold">
                    Approval Stage
                  </th>
                  <th scope="col" className="px-4 py-3 font-semibold">
                    Assignment
                  </th>
                  <th scope="col" className="px-4 py-3 font-semibold">
                    Submitted At
                  </th>
                  <th scope="col" className="px-4 py-3 text-right font-semibold">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredTasks.map((task) => (
                  <tr
                    key={task.stage.id}
                    onClick={() => setSelectedSubmissionId(task.submission.id)}
                    className="cursor-pointer transition-colors hover:bg-slate-50"
                  >
                    <td className="px-4 py-3 font-mono font-medium text-slate-900">
                      {task.submission.reference_number || (
                        <span className="italic text-slate-400">
                          No Ref ({task.submission.id.slice(0, 8)})
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-800">
                      {task.formTitle}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <Clock className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                        <span className="font-semibold text-slate-800">
                          {task.stage.stage_name}
                        </span>
                        <span className="text-[11px] text-slate-400">
                          (Cycle #{task.instance.cycle_number})
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700">
                        <ShieldCheck className="h-3 w-3 text-emerald-700" />
                        {task.stage.assigned_approver_id
                          ? "Assigned to You"
                          : `Role: ${task.stage.assigned_role_key ?? "assigned"}`}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-500">
                      {formatDate(
                        task.submission.submitted_at || task.submission.created_at,
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedSubmissionId(task.submission.id);
                        }}
                        className="inline-flex items-center gap-1 rounded border border-emerald-700 bg-emerald-700 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-800"
                      >
                        <Eye className="h-3 w-3" />
                        Review & Decide
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Submission Review & Approval Drawer */}
      {selectedSubmissionId && activeOrganizationId && (
        <SubmissionDetailDrawer
          submissionId={selectedSubmissionId}
          organizationId={activeOrganizationId}
          onClose={() => setSelectedSubmissionId(null)}
          onDecisionComplete={() => void loadTasks()}
        />
      )}
    </div>
  );
}
