"use client";

import React from "react";
import { useAuth } from "@/lib/auth/auth-context";
import { Badge } from "@field/ui";
import { Users, Shield, Building } from "lucide-react";

export default function AdministrationPage() {
  const { activeOrganization, memberships } = useAuth();

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">
            Tenant Administration
          </h1>
          <p className="text-xs text-slate-500">
            Managing organization structure, users, and roles for{" "}
            {activeOrganization?.name}
          </p>
        </div>
        <Badge variant="success" className="max-w-full break-all">
          Tenant ID: {activeOrganization?.id}
        </Badge>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 p-6 shadow-sm space-y-4">
        <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center space-x-2">
          <Users className="w-4 h-4 text-emerald-600" />
          <span>Organization Memberships</span>
        </h2>

        <div className="divide-y divide-slate-200 dark:divide-slate-800">
          {memberships.map((mem) => (
            <div
              key={mem.id}
              className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="break-all text-xs font-semibold text-slate-900 dark:text-slate-100">
                  User ID: {mem.user_id}
                </p>
                <p className="break-all text-[11px] text-slate-500">
                  Tenant: {mem.organization_id}
                </p>
              </div>
              <Badge variant="outline" className="capitalize">
                {mem.role_key.replace("_", " ")}
              </Badge>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
