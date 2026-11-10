"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth/auth-context";
import { Badge, Button } from "@field/ui";
import {
  ArrowRight,
  Building2,
  CheckSquare,
  Database,
  FileSpreadsheet,
  Plus,
  ShieldCheck,
  Users,
} from "lucide-react";
import type { FormListItem } from "@/lib/repositories/form-repository";

type LoadState = "loading" | "ready" | "error";

export default function DashboardPage() {
  const { activeOrganization, currentRole, isLoading: authLoading } = useAuth();
  const activeOrganizationId = activeOrganization?.id ?? null;
  const [forms, setForms] = useState<FormListItem[]>([]);
  const [state, setState] = useState<LoadState>("loading");
  const [error, setError] = useState("");

  useEffect(() => {
    if (authLoading) return;
    if (!activeOrganizationId) {
      setForms([]);
      setError("Select an active organization to view workspace operations.");
      setState("error");
      return;
    }

    const controller = new AbortController();
    setState("loading");
    setError("");

    fetch(
      `/api/forms?organizationId=${encodeURIComponent(activeOrganizationId)}`,
      { signal: controller.signal },
    )
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) {
          throw new Error(body.error || "Unable to load workspace forms.");
        }
        setForms(body.forms ?? []);
        setState("ready");
      })
      .catch((reason: unknown) => {
        if (reason instanceof Error && reason.name === "AbortError") return;
        setError(
          reason instanceof Error
            ? reason.message
            : "Unable to load workspace forms.",
        );
        setState("error");
      });

    return () => controller.abort();
  }, [activeOrganizationId, authLoading]);

  const metrics = useMemo(() => {
    const total = forms.length;
    const drafts = forms.filter(
      (form) => form.draft_version_number !== null,
    ).length;
    const published = forms.filter(
      (form) => form.published_version_number !== null,
    ).length;
    return { total, drafts, published };
  }, [forms]);

  const recentForms = useMemo(() => forms.slice(0, 5), [forms]);

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      {/* Workspace Header */}
      <header className="rounded border border-slate-200 bg-white p-4 sm:p-5 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                Operations Dashboard
              </h1>
              {activeOrganization?.status && (
                <Badge variant="success" className="capitalize">
                  {activeOrganization.status}
                </Badge>
              )}
            </div>
            <p className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">
              {activeOrganization?.name ?? "Organization"}
              {activeOrganization?.slug ? ` · ${activeOrganization.slug}` : ""}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link href="/forms/new" className="w-full sm:w-auto">
              <Button
                variant="primary"
                size="sm"
                className="w-full whitespace-nowrap sm:w-auto"
              >
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                <span>Create Form</span>
              </Button>
            </Link>
            <Link href="/forms" className="w-full sm:w-auto">
              <Button
                variant="secondary"
                size="sm"
                className="w-full whitespace-nowrap sm:w-auto"
              >
                <span>Form Library</span>
                <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Operational Summary Metrics */}
      <section
        aria-label="Operational summary"
        className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4"
      >
        <div className="rounded border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">
              Organization
            </span>
            <Building2 className="h-4 w-4 text-emerald-700" />
          </div>
          <div className="mt-2 truncate text-base font-bold text-slate-900 dark:text-slate-100">
            {activeOrganization?.name ?? "—"}
          </div>
          <div className="mt-1 flex items-center gap-1.5 text-[11px] text-slate-500">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
            <span className="capitalize">
              {currentRole ? currentRole.replace("_", " ") : "Member"}
            </span>
          </div>
        </div>

        <div className="rounded border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">
              Total Forms
            </span>
            <FileSpreadsheet className="h-4 w-4 text-emerald-700" />
          </div>
          <div className="mt-2 text-2xl font-bold text-slate-900 dark:text-slate-100">
            {state === "ready" ? metrics.total : "—"}
          </div>
          <div className="mt-1 text-[11px] text-slate-500">
            Configured in workspace
          </div>
        </div>

        <div className="rounded border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">
              Active Drafts
            </span>
            <span className="h-2 w-2 rounded-full bg-amber-500" />
          </div>
          <div className="mt-2 text-2xl font-bold text-slate-900 dark:text-slate-100">
            {state === "ready" ? metrics.drafts : "—"}
          </div>
          <div className="mt-1 text-[11px] text-slate-500">
            Editable form versions
          </div>
        </div>

        <div className="rounded border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">
              Published Forms
            </span>
            <span className="h-2 w-2 rounded-full bg-emerald-600" />
          </div>
          <div className="mt-2 text-2xl font-bold text-slate-900 dark:text-slate-100">
            {state === "ready" ? metrics.published : "—"}
          </div>
          <div className="mt-1 text-[11px] text-slate-500">
            Live versioned schemas
          </div>
        </div>
      </section>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* Recent Forms Table / List */}
        <section
          aria-label="Recent forms"
          className="rounded border border-slate-200 bg-white lg:col-span-2 dark:border-slate-800 dark:bg-slate-900"
        >
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-800">
            <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              Forms
            </h2>
            <Link
              href="/forms"
              className="text-xs font-semibold text-emerald-700 hover:underline"
            >
              View all
            </Link>
          </div>

          {state === "loading" && (
            <div
              role="status"
              className="p-8 text-center text-xs text-slate-500"
            >
              Loading forms…
            </div>
          )}

          {state === "error" && (
            <div
              role="alert"
              className="m-4 rounded border border-red-200 bg-red-50 p-3 text-xs text-red-800"
            >
              {error}
            </div>
          )}

          {state === "ready" && recentForms.length === 0 && (
            <div className="p-8 text-center">
              <p className="text-xs font-medium text-slate-600">
                No forms have been created for this organization yet.
              </p>
              <Link
                href="/forms/new"
                className="mt-3 inline-flex rounded bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white"
              >
                Create Form
              </Link>
            </div>
          )}

          {state === "ready" && recentForms.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 dark:bg-slate-950 dark:text-slate-400">
                  <tr>
                    <th className="px-4 py-2.5 font-semibold">Form</th>
                    <th className="px-4 py-2.5 font-semibold">Status</th>
                    <th className="px-4 py-2.5 font-semibold">Version</th>
                    <th className="px-4 py-2.5 font-semibold">Updated</th>
                    <th className="px-4 py-2.5 text-right font-semibold">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {recentForms.map((form) => (
                    <tr key={form.id}>
                      <td className="px-4 py-3">
                        <div className="font-semibold text-slate-900 dark:text-slate-100">
                          {form.title}
                        </div>
                        <div className="line-clamp-1 text-[11px] text-slate-500">
                          {form.description || form.key}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded px-2 py-0.5 text-[11px] font-semibold ${
                            form.draft_version_number
                              ? "bg-amber-100 text-amber-800"
                              : "bg-emerald-100 text-emerald-800"
                          }`}
                        >
                          {form.draft_version_number
                            ? "Draft"
                            : form.published_version_number
                              ? "Published"
                              : form.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                        v
                        {Math.max(
                          form.draft_version_number ?? 0,
                          form.published_version_number ?? 0,
                        ) || 1}
                      </td>
                      <td className="px-4 py-3 text-slate-500">
                        {new Date(form.updated_at).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          href={`/forms/${form.id}/builder`}
                          className="font-semibold text-emerald-700 hover:underline"
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
            </div>
          )}
        </section>

        {/* Workspace Navigation Shortcuts */}
        <section
          aria-label="Workspace modules"
          className="rounded border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
        >
          <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-800">
            <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              Modules
            </h2>
          </div>
          <div className="divide-y divide-slate-200 dark:divide-slate-800">
            <Link
              href="/forms"
              className="flex items-center justify-between px-4 py-3 text-xs transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50"
            >
              <div className="flex items-center gap-2.5">
                <FileSpreadsheet className="h-4 w-4 text-emerald-700" />
                <span className="font-semibold text-slate-900 dark:text-slate-100">
                  Form Builder
                </span>
              </div>
              <ArrowRight className="h-3.5 w-3.5 text-slate-400" />
            </Link>

            <Link
              href="/data-sources"
              className="flex items-center justify-between px-4 py-3 text-xs transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50"
            >
              <div className="flex items-center gap-2.5">
                <Database className="h-4 w-4 text-emerald-700" />
                <span className="font-semibold text-slate-900 dark:text-slate-100">
                  Data Sources
                </span>
              </div>
              <ArrowRight className="h-3.5 w-3.5 text-slate-400" />
            </Link>

            <Link
              href="/approvals"
              className="flex items-center justify-between px-4 py-3 text-xs transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50"
            >
              <div className="flex items-center gap-2.5">
                <CheckSquare className="h-4 w-4 text-emerald-700" />
                <span className="font-semibold text-slate-900 dark:text-slate-100">
                  Approvals Workflow
                </span>
              </div>
              <ArrowRight className="h-3.5 w-3.5 text-slate-400" />
            </Link>

            <Link
              href="/administration"
              className="flex items-center justify-between px-4 py-3 text-xs transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50"
            >
              <div className="flex items-center gap-2.5">
                <Users className="h-4 w-4 text-emerald-700" />
                <span className="font-semibold text-slate-900 dark:text-slate-100">
                  Users & Roles
                </span>
              </div>
              <ArrowRight className="h-3.5 w-3.5 text-slate-400" />
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
