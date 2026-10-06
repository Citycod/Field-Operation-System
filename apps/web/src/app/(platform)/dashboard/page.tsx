"use client";

import React from "react";
import { useAuth } from "@/lib/auth/auth-context";
import { Badge, Button } from "@field/ui";
import { Activity, ShieldCheck, Layers, ArrowRight } from "lucide-react";
import Link from "next/link";

export default function DashboardPage() {
  const { activeOrganization, currentRole } = useAuth();

  return (
    <div className="mx-auto max-w-6xl space-y-4 sm:space-y-6">
      {/* Overview Banner */}
      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">
                Platform Operations Workspace
              </h1>
              <Badge variant="success">Multi-Tenant Isolated</Badge>
            </div>
            <p className="mt-1 break-words text-xs text-slate-500 dark:text-slate-400">
              Active Tenant:{" "}
              <strong className="text-slate-700 dark:text-slate-200">
                {activeOrganization?.name}
              </strong>{" "}
              ({activeOrganization?.slug})
            </p>
          </div>
          <Link href="/forms" className="w-full sm:w-auto">
            <Button
              variant="primary"
              size="sm"
              className="w-full whitespace-nowrap sm:w-auto"
            >
              <span>Open Form Builder Shell</span>
              <ArrowRight className="w-3.5 h-3.5 ml-2" />
            </Button>
          </Link>
        </div>
      </div>

      {/* Domain Status Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="bg-white dark:bg-slate-900 p-5 rounded-lg border border-slate-200 dark:border-slate-800 shadow-sm space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">
              Tenant Identity Context
            </span>
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-lg font-bold text-slate-900 dark:text-slate-100 capitalize">
            {currentRole?.replace("_", " ")}
          </div>
          <p className="break-words text-[11px] text-slate-500">
            Tenant ID:{" "}
            <span className="break-all font-mono text-slate-700 dark:text-slate-300">
              {activeOrganization?.id}
            </span>
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 p-5 rounded-lg border border-slate-200 dark:border-slate-800 shadow-sm space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">
              Integrated Modules
            </span>
            <Layers className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-lg font-bold text-slate-900 dark:text-slate-100">
            Form Builder (Module)
          </div>
          <p className="text-[11px] text-slate-500">
            Status:{" "}
            <span className="text-amber-600 font-semibold">
              Phase 0 Shell Ready
            </span>
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 p-5 rounded-lg border border-slate-200 dark:border-slate-800 shadow-sm space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">
              Backend API Layer
            </span>
            <Activity className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-lg font-bold text-slate-900 dark:text-slate-100">
            Supabase Platform
          </div>
          <p className="text-[11px] text-slate-500">
            Storage:{" "}
            <span className="text-slate-700 dark:text-slate-300 font-mono">
              S3-Compatible (R2/AWS)
            </span>
          </p>
        </div>
      </div>
    </div>
  );
}
