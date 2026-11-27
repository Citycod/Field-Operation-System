"use client";

import React, { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Inbox,
  Search,
  RefreshCw,
  Filter,
  Eye,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  Calendar,
  X,
  FileSpreadsheet,
  Download,
} from "lucide-react";
import { Badge, Button, Input, EmptyState } from "@field/ui";
import { useAuth } from "@/lib/auth/auth-context";
import { SubmissionDetailDrawer } from "@/components/submissions/submission-detail-drawer";
import type { FormSubmissionEntity } from "@/lib/repositories/submission-repository";
import type { FormListItem } from "@/lib/repositories/form-repository";

type SortField = "created_at" | "submitted_at" | "reference_number" | "status";
type SortOrder = "asc" | "desc";

function SubmissionsContent() {
  const searchParams = useSearchParams();
  const initialFormId = searchParams.get("formId") || "";

  const { activeOrganization, isLoading: authLoading } = useAuth();
  const activeOrganizationId = activeOrganization?.id ?? null;

  // Forms lookup list
  const [formsList, setFormsList] = useState<FormListItem[]>([]);
  const [formsLoading, setFormsLoading] = useState(false);

  // Filter & pagination state
  const [formFilter, setFormFilter] = useState<string>(initialFormId);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [referenceQuery, setReferenceQuery] = useState<string>("");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(20);
  const [sortBy, setSortBy] = useState<SortField>("created_at");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");

  // Submissions data
  const [submissions, setSubmissions] = useState<FormSubmissionEntity[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [totalPages, setTotalPages] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Drawer state
  const [selectedSubmissionId, setSelectedSubmissionId] = useState<string | null>(null);
  const [exportingCsv, setExportingCsv] = useState(false);

  // Sync initialFormId from URL param if changed
  useEffect(() => {
    if (initialFormId) {
      setFormFilter(initialFormId);
    }
  }, [initialFormId]);

  // Load forms list for filtering
  useEffect(() => {
    if (authLoading || !activeOrganizationId) return;

    const controller = new AbortController();
    setFormsLoading(true);

    fetch(
      `/api/forms?organizationId=${encodeURIComponent(activeOrganizationId)}`,
      { signal: controller.signal },
    )
      .then(async (res) => {
        if (!res.ok) return;
        const body = await res.json();
        setFormsList(body.forms || []);
      })
      .catch(() => {})
      .finally(() => setFormsLoading(false));

    return () => controller.abort();
  }, [activeOrganizationId, authLoading]);

  // Load submissions
  const loadSubmissions = useCallback(async () => {
    if (authLoading) return;
    if (!activeOrganizationId) {
      setError("Select an organization to view submissions.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const controller = new AbortController();
    const query = new URLSearchParams({
      organizationId: activeOrganizationId,
      page: String(page),
      pageSize: String(pageSize),
      sortBy,
      sortOrder,
    });

    if (statusFilter) query.set("status", statusFilter);
    if (referenceQuery.trim()) query.set("referenceNumber", referenceQuery.trim());
    if (dateFrom) query.set("dateFrom", dateFrom);
    if (dateTo) query.set("dateTo", dateTo);

    const endpoint = formFilter.trim()
      ? `/api/forms/${encodeURIComponent(formFilter.trim())}/submissions?${query.toString()}`
      : `/api/submissions?${query.toString()}`;

    try {
      const response = await fetch(endpoint, { signal: controller.signal });
      const body = await response.json();

      if (!response.ok) {
        throw new Error(body.error || "Failed to load submissions.");
      }

      setSubmissions(body.submissions || []);
      setTotalCount(body.totalCount || 0);
      setTotalPages(body.totalPages || 0);
    } catch (err) {
      if ((err as Error)?.name !== "AbortError") {
        setError(err instanceof Error ? err.message : "Unable to load submissions.");
      }
    } finally {
      setLoading(false);
    }

    return () => controller.abort();
  }, [
    activeOrganizationId,
    authLoading,
    formFilter,
    statusFilter,
    referenceQuery,
    dateFrom,
    dateTo,
    page,
    pageSize,
    sortBy,
    sortOrder,
  ]);

  useEffect(() => {
    loadSubmissions();
  }, [loadSubmissions]);

  const handleSort = (field: SortField) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortBy(field);
      setSortOrder("desc");
    }
    setPage(1);
  };

  const clearFilters = () => {
    setFormFilter("");
    setStatusFilter("");
    setReferenceQuery("");
    setDateFrom("");
    setDateTo("");
    setPage(1);
  };

  const handleExportCsv = async () => {
    if (!activeOrganizationId || !formFilter.trim() || exportingCsv) return;
    setExportingCsv(true);
    setError(null);
    try {
      const query = new URLSearchParams({
        organizationId: activeOrganizationId,
        sortBy,
        sortOrder,
      });
      if (statusFilter) query.set("status", statusFilter);
      if (referenceQuery.trim()) query.set("referenceNumber", referenceQuery.trim());
      if (dateFrom) query.set("dateFrom", dateFrom);
      if (dateTo) query.set("dateTo", dateTo);

      const response = await fetch(
        `/api/forms/${encodeURIComponent(formFilter.trim())}/submissions/export.csv?${query.toString()}`,
      );
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || "Failed to export CSV.");
      }

      const csvText = await response.text();
      const blob = new Blob([csvText], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${getFormTitle(formFilter.trim()).toLowerCase().replace(/[^a-z0-9]+/g, "_")}_submissions.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to export submissions CSV.");
    } finally {
      setExportingCsv(false);
    }
  };

  const hasActiveFilters = Boolean(
    formFilter || statusFilter || referenceQuery || dateFrom || dateTo,
  );

  const getFormTitle = (formId: string) => {
    const found = formsList.find((f) => f.id === formId);
    return found?.title || formId;
  };

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
        return "warning";
      case "rejected":
        return "error";
      default:
        return "outline";
    }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      {/* Page Header */}
      <header className="flex flex-col gap-3 border-b border-slate-200 pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Inbox className="h-5 w-5 text-emerald-700" />
            <h1 className="text-xl font-bold text-slate-900">Form Submissions</h1>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Review, inspect, and track submissions for{" "}
            <span className="font-medium text-slate-700">
              {activeOrganization?.name ?? "the active organization"}
            </span>.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void handleExportCsv()}
            disabled={!formFilter.trim() || exportingCsv || loading}
            title={
              formFilter.trim()
                ? "Export filtered submissions to CSV"
                : "Select a specific form below to export submissions CSV"
            }
            className="flex items-center gap-1.5 text-xs text-slate-700 hover:bg-slate-50"
          >
            <Download className="h-3.5 w-3.5" />
            {exportingCsv ? "Exporting…" : "Export CSV"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => loadSubmissions()}
            disabled={loading}
            className="flex items-center gap-1.5 text-xs text-slate-700 hover:bg-slate-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Link
            href="/forms"
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            <FileSpreadsheet className="h-3.5 w-3.5 text-slate-500" />
            Forms Library
          </Link>
        </div>
      </header>

      {/* Command Bar / Filter Bar */}
      <div className="flex flex-wrap items-center gap-2.5 rounded-md border border-slate-200 bg-white p-3 shadow-2xs">
        {/* Search input */}
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={referenceQuery}
            onChange={(e) => {
              setReferenceQuery(e.target.value);
              setPage(1);
            }}
            placeholder="Search reference number..."
            className="w-full rounded border border-slate-300 bg-white py-1.5 pl-8 pr-3 text-xs text-slate-900 placeholder:text-slate-400 focus:border-emerald-600 focus:outline-hidden focus:ring-1 focus:ring-emerald-600"
          />
        </div>

        {/* Form filter */}
        <div className="min-w-[160px]">
          <select
            value={formFilter}
            onChange={(e) => {
              setFormFilter(e.target.value);
              setPage(1);
            }}
            className="w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-700 focus:border-emerald-600 focus:outline-hidden focus:ring-1 focus:ring-emerald-600"
          >
            <option value="">All Forms</option>
            {formsList.map((f) => (
              <option key={f.id} value={f.id}>
                {f.title}
              </option>
            ))}
          </select>
        </div>

        {/* Status filter */}
        <div className="min-w-[130px]">
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-700 focus:border-emerald-600 focus:outline-hidden focus:ring-1 focus:ring-emerald-600"
          >
            <option value="">All Statuses</option>
            <option value="submitted">Submitted</option>
            <option value="pending_approval">Pending Approval</option>
            <option value="returned">Returned</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="completed">Completed</option>
            <option value="draft">Draft</option>
          </select>
        </div>

        {/* Date range filter */}
        <div className="flex items-center gap-1.5">
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => {
              setDateFrom(e.target.value);
              setPage(1);
            }}
            className="rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 focus:border-emerald-600 focus:outline-hidden focus:ring-1 focus:ring-emerald-600"
            title="Date from"
          />
          <span className="text-xs text-slate-400">to</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => {
              setDateTo(e.target.value);
              setPage(1);
            }}
            className="rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 focus:border-emerald-600 focus:outline-hidden focus:ring-1 focus:ring-emerald-600"
            title="Date to"
          />
        </div>

        {/* Clear Filters */}
        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={clearFilters}
            className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800"
          >
            <X className="h-3.5 w-3.5" />
            Clear
          </Button>
        )}
      </div>

      {/* Error Banner */}
      {error && (
        <div role="alert" className="border border-red-200 bg-red-50 p-4 text-xs text-red-800 rounded">
          <strong>Submissions unavailable:</strong> {error}
        </div>
      )}

      {/* Table Container */}
      <div className="overflow-hidden rounded-md border border-slate-200 bg-white shadow-2xs">
        <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Submissions table">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-100 text-slate-600 border-b border-slate-200">
              <tr>
                <th scope="col" className="px-4 py-3 font-semibold">
                  <button
                    type="button"
                    onClick={() => handleSort("reference_number")}
                    className="flex items-center gap-1 hover:text-slate-900"
                  >
                    Reference #
                    <ArrowUpDown className="h-3 w-3 text-slate-400" />
                  </button>
                </th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Form Title
                </th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  <button
                    type="button"
                    onClick={() => handleSort("status")}
                    className="flex items-center gap-1 hover:text-slate-900"
                  >
                    Status
                    <ArrowUpDown className="h-3 w-3 text-slate-400" />
                  </button>
                </th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Submitted By
                </th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  <button
                    type="button"
                    onClick={() => handleSort("created_at")}
                    className="flex items-center gap-1 hover:text-slate-900"
                  >
                    Submitted At
                    <ArrowUpDown className="h-3 w-3 text-slate-400" />
                  </button>
                </th>
                <th scope="col" className="px-4 py-3 text-right font-semibold">
                  Action
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {loading && submissions.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-slate-500">
                    <RefreshCw className="mx-auto h-5 w-5 animate-spin text-emerald-700 mb-2" />
                    Loading submissions…
                  </td>
                </tr>
              )}

              {!loading && submissions.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-12 text-center">
                    <EmptyState
                      icon={<Inbox className="w-8 h-8 text-slate-400" />}
                      title={hasActiveFilters ? "No matching submissions found" : "No submissions recorded yet"}
                      description={
                        hasActiveFilters
                          ? "Try clearing or adjusting your search filters above."
                          : "Submissions will appear here once published forms are completed by users."
                      }
                      action={
                        hasActiveFilters ? (
                          <Button variant="outline" size="sm" onClick={clearFilters} className="mt-2 text-xs">
                            Clear Filters
                          </Button>
                        ) : undefined
                      }
                    />
                  </td>
                </tr>
              )}

              {submissions.map((sub) => {
                const dateStr = sub.submitted_at || sub.created_at;
                const formattedDate = dateStr
                  ? new Date(dateStr).toLocaleString(undefined, {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  : "—";

                return (
                  <tr
                    key={sub.id}
                    onClick={() => setSelectedSubmissionId(sub.id)}
                    className="hover:bg-slate-50 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3 font-mono font-medium text-slate-900">
                      {sub.reference_number || (
                        <span className="text-slate-400 italic">No Ref ({sub.id.slice(0, 8)})</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-700 font-medium">
                      {getFormTitle(sub.form_id)}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={statusVariant(sub.status)}>
                        {sub.status.toUpperCase()}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-slate-500">
                      {sub.submitted_by ? `${sub.submitted_by.slice(0, 8)}…` : "Public / Guest"}
                    </td>
                    <td className="px-4 py-3 text-slate-500">
                      {formattedDate}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedSubmissionId(sub.id);
                        }}
                        className="inline-flex items-center gap-1 rounded border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 hover:border-emerald-300"
                        title="View submission details"
                      >
                        <Eye className="h-3 w-3" />
                        View
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        {totalCount > 0 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
            <div className="flex items-center gap-2">
              <span>
                Showing <strong className="text-slate-900">{(page - 1) * pageSize + 1}</strong> to{" "}
                <strong className="text-slate-900">{Math.min(page * pageSize, totalCount)}</strong> of{" "}
                <strong className="text-slate-900">{totalCount}</strong> submissions
              </span>
              <span className="text-slate-300">|</span>
              <label className="flex items-center gap-1 text-slate-500">
                Per page:
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setPage(1);
                  }}
                  className="rounded border border-slate-300 bg-white px-2 py-0.5 text-xs text-slate-700 focus:border-emerald-600 focus:outline-hidden"
                >
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </label>
            </div>

            <div className="flex items-center gap-2">
              <span>
                Page <strong className="text-slate-900">{page}</strong> of{" "}
                <strong className="text-slate-900">{totalPages || 1}</strong>
              </span>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="h-7 w-7 p-0"
                  title="Previous page"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="h-7 w-7 p-0"
                  title="Next page"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Submission Detail Drawer */}
      {selectedSubmissionId && activeOrganizationId && (
        <SubmissionDetailDrawer
          submissionId={selectedSubmissionId}
          organizationId={activeOrganizationId}
          onClose={() => setSelectedSubmissionId(null)}
          onDecisionComplete={() => void loadSubmissions()}
        />
      )}
    </div>
  );
}

export default function SubmissionsPage() {
  return (
    <Suspense
      fallback={
        <div className="p-8 text-center text-sm text-slate-500">
          Loading submissions…
        </div>
      }
    >
      <SubmissionsContent />
    </Suspense>
  );
}
