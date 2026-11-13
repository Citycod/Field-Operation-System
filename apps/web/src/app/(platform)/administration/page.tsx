"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/lib/auth/auth-context";
import { Badge, Button } from "@field/ui";
import {
  Users,
  Shield,
  Building,
  History,
  AlertTriangle,
  UserCheck,
  UserMinus,
  RefreshCw,
  Lock,
  Unlock,
  Archive,
} from "lucide-react";
import type {
  OrganizationMemberRosterItem,
  AuditLogEntry,
  PlatformRole,
} from "@field/types";

export default function AdministrationPage() {
  const { activeOrganization, user } = useAuth();
  const [activeTab, setActiveTab] = useState<"members" | "audit" | "settings">("members");

  // Roster state
  const [roster, setRoster] = useState<OrganizationMemberRosterItem[]>([]);
  const [rosterLoading, setRosterLoading] = useState(true);
  const [rosterError, setRosterError] = useState<string | null>(null);

  // Audit state
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditError, setAuditError] = useState<string | null>(null);

  // Action state
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const organizationId = activeOrganization?.id;

  // Active admin count
  const activeAdminCount = roster.filter(
    (m) =>
      ["super_admin", "business_admin"].includes(m.role_key) &&
      m.status === "active",
  ).length;

  // Current user's membership in active org
  const currentUserMembership = roster.find((m) => m.user_id === user?.id);
  const isSuperAdmin = currentUserMembership?.role_key === "super_admin";
  const isBusinessAdmin = currentUserMembership?.role_key === "business_admin";
  const canManageTeam = isSuperAdmin || isBusinessAdmin;

  const fetchRoster = useCallback(async () => {
    if (!organizationId) return;
    setRosterLoading(true);
    setRosterError(null);
    try {
      const res = await fetch(`/api/organizations/${organizationId}/members`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to load team members");
      }
      setRoster(data.members || []);
    } catch (err) {
      setRosterError(err instanceof Error ? err.message : "Error loading roster");
    } finally {
      setRosterLoading(false);
    }
  }, [organizationId]);

  const fetchAuditLogs = useCallback(async () => {
    if (!organizationId) return;
    setAuditLoading(true);
    setAuditError(null);
    try {
      const res = await fetch(`/api/organizations/${organizationId}/audit-logs?limit=50`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to load audit logs");
      }
      setAuditLogs(data.logs || []);
    } catch (err) {
      setAuditError(err instanceof Error ? err.message : "Error loading audit records");
    } finally {
      setAuditLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    fetchRoster();
  }, [fetchRoster]);

  useEffect(() => {
    if (activeTab === "audit") {
      fetchAuditLogs();
    }
  }, [activeTab, fetchAuditLogs]);

  const handleRoleChange = async (targetUserId: string, newRole: PlatformRole) => {
    if (!organizationId) return;
    setActionLoading(targetUserId);
    setActionError(null);
    setActionSuccess(null);

    try {
      const res = await fetch(
        `/api/organizations/${organizationId}/members/${targetUserId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "update_role", role: newRole }),
        },
      );
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to update member role");
      }
      setActionSuccess("Member role successfully updated.");
      await fetchRoster();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Role update failed");
    } finally {
      setActionLoading(null);
    }
  };

  const handleRemoveMember = async (targetUserId: string, isSelf: boolean) => {
    if (!organizationId) return;
    const confirmMessage = isSelf
      ? "Are you sure you want to leave this workspace?"
      : "Are you sure you want to remove this member from the workspace?";

    if (!window.confirm(confirmMessage)) return;

    setActionLoading(targetUserId);
    setActionError(null);
    setActionSuccess(null);

    try {
      const res = await fetch(
        `/api/organizations/${organizationId}/members/${targetUserId}`,
        {
          method: "DELETE",
        },
      );
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to remove member");
      }
      setActionSuccess(isSelf ? "You have left the workspace." : "Member removed.");
      await fetchRoster();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Member removal failed");
    } finally {
      setActionLoading(null);
    }
  };

  const handleVoluntarySuspension = async () => {
    if (!organizationId) return;
    const confirmText = window.prompt(
      'Type "SUSPEND" to confirm voluntary suspension (maintenance mode) of this workspace:',
    );
    if (confirmText !== "SUSPEND") return;

    setActionLoading("lifecycle");
    setActionError(null);
    try {
      const res = await fetch(`/api/organizations/${organizationId}/lifecycle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "suspend", reason: "Tenant voluntary maintenance" }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Lifecycle update failed");
      }
      window.location.reload();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Suspension failed");
    } finally {
      setActionLoading(null);
    }
  };

  const handleReactivation = async () => {
    if (!organizationId) return;
    setActionLoading("lifecycle");
    setActionError(null);
    try {
      const res = await fetch(`/api/organizations/${organizationId}/lifecycle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reactivate" }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Reactivation failed");
      }
      window.location.reload();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Reactivation failed");
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header Command Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between bg-white dark:bg-slate-900 p-6 rounded-lg border border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="min-w-0">
          <div className="flex items-center space-x-2">
            <Building className="w-5 h-5 text-emerald-600 shrink-0" />
            <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100 truncate">
              {activeOrganization?.name || "Workspace Administration"}
            </h1>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Enterprise Tenant Administration • Workspace ID: {activeOrganization?.id}
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <Badge
            variant={activeOrganization?.status === "active" ? "success" : "error"}
            className="capitalize text-xs font-semibold"
          >
            Status: {activeOrganization?.status || "active"}
          </Badge>
          <Button
            variant="outline"
            size="sm"
            onClick={fetchRoster}
            disabled={rosterLoading}
            className="flex items-center space-x-1.5 text-xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${rosterLoading ? "animate-spin" : ""}`} />
            <span>Refresh</span>
          </Button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex border-b border-slate-200 dark:border-slate-800 space-x-6 text-xs font-medium">
        <button
          type="button"
          onClick={() => setActiveTab("members")}
          className={`pb-3 flex items-center space-x-2 border-b-2 transition-colors ${
            activeTab === "members"
              ? "border-emerald-600 text-emerald-600 font-bold"
              : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300"
          }`}
        >
          <Users className="w-4 h-4" />
          <span>Team Roster ({roster.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("audit")}
          className={`pb-3 flex items-center space-x-2 border-b-2 transition-colors ${
            activeTab === "audit"
              ? "border-emerald-600 text-emerald-600 font-bold"
              : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300"
          }`}
        >
          <History className="w-4 h-4" />
          <span>Audit Logs</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("settings")}
          className={`pb-3 flex items-center space-x-2 border-b-2 transition-colors ${
            activeTab === "settings"
              ? "border-emerald-600 text-emerald-600 font-bold"
              : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300"
          }`}
        >
          <Shield className="w-4 h-4" />
          <span>Lifecycle & Governance</span>
        </button>
      </div>

      {/* Feedback Alerts */}
      {actionError && (
        <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-md text-xs text-red-700 dark:text-red-300 flex items-center space-x-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{actionError}</span>
        </div>
      )}
      {actionSuccess && (
        <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-md text-xs text-emerald-700 dark:text-emerald-300 flex items-center space-x-2">
          <UserCheck className="w-4 h-4 shrink-0" />
          <span>{actionSuccess}</span>
        </div>
      )}

      {/* Tab Content: Team Roster */}
      {activeTab === "members" && (
        <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center">
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                Organization Members
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Active Administrators:{" "}
                <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                  {activeAdminCount}
                </span>{" "}
                {activeAdminCount <= 1 && (
                  <span className="text-amber-600 dark:text-amber-400 font-medium">
                    (Last Administrator Protection Active)
                  </span>
                )}
              </p>
            </div>
          </div>

          {rosterLoading ? (
            <div className="p-8 text-center text-xs text-slate-500">
              Loading member roster...
            </div>
          ) : rosterError ? (
            <div className="p-8 text-center text-xs text-red-500">{rosterError}</div>
          ) : roster.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500">
              No members found in this organization.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 text-slate-500">
                    <th className="py-3 px-4 font-semibold">User</th>
                    <th className="py-3 px-4 font-semibold">Email</th>
                    <th className="py-3 px-4 font-semibold">Role</th>
                    <th className="py-3 px-4 font-semibold">Status</th>
                    <th className="py-3 px-4 font-semibold">Joined Date</th>
                    <th className="py-3 px-4 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {roster.map((member) => {
                    const isTargetLastAdmin =
                      ["super_admin", "business_admin"].includes(member.role_key) &&
                      activeAdminCount <= 1;
                    const isSelf = member.user_id === user?.id;
                    const canEditThisMember =
                      canManageTeam &&
                      !(member.role_key === "super_admin" && !isSuperAdmin);

                    return (
                      <tr
                        key={member.membership_id}
                        className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors"
                      >
                        <td className="py-3 px-4 font-medium text-slate-900 dark:text-slate-100">
                          {member.display_name ||
                            [member.first_name, member.last_name]
                              .filter(Boolean)
                              .join(" ") ||
                            "User"}
                          {isSelf && (
                            <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                              You
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-slate-500">{member.email || "—"}</td>
                        <td className="py-3 px-4">
                          {canEditThisMember && !isTargetLastAdmin ? (
                            <select
                              aria-label={`Role for ${member.display_name || member.email || 'user'}`}
                              value={member.role_key}
                              onChange={(e) =>
                                handleRoleChange(
                                  member.user_id,
                                  e.target.value as PlatformRole,
                                )
                              }
                              disabled={actionLoading === member.user_id}
                              className="text-xs bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded px-2 py-1"
                            >
                              {isSuperAdmin && (
                                <option value="super_admin">Super Admin</option>
                              )}
                              <option value="business_admin">Business Admin</option>
                              <option value="manager">Manager</option>
                              <option value="employee">Employee</option>
                            </select>
                          ) : (
                            <Badge variant="outline" className="capitalize text-[11px]">
                              {member.role_key.replace("_", " ")}
                            </Badge>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium capitalize ${
                              member.status === "active"
                                ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300"
                                : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                            }`}
                          >
                            {member.status}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-slate-500">
                          {new Date(member.created_at).toLocaleDateString()}
                        </td>
                        <td className="py-3 px-4 text-right">
                          {isTargetLastAdmin ? (
                            <span className="text-[11px] text-amber-600 dark:text-amber-400 font-medium">
                              Sole Administrator
                            </span>
                          ) : (
                            (canEditThisMember || isSelf) && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() =>
                                  handleRemoveMember(member.user_id, isSelf)
                                }
                                disabled={actionLoading === member.user_id}
                                className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30 text-xs px-2 py-1 h-7"
                              >
                                <UserMinus className="w-3.5 h-3.5 mr-1" />
                                {isSelf ? "Leave" : "Remove"}
                              </Button>
                            )
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Tab Content: Audit Logs */}
      {activeTab === "audit" && (
        <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center">
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                Security & Administrative Audit Logs
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Append-only forensic event trail for compliance and accountability.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={fetchAuditLogs}
              disabled={auditLoading}
              className="text-xs"
            >
              <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${auditLoading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>

          {auditLoading ? (
            <div className="p-8 text-center text-xs text-slate-500">
              Loading audit logs...
            </div>
          ) : auditError ? (
            <div className="p-8 text-center text-xs text-red-500">{auditError}</div>
          ) : auditLogs.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500">
              No audit events recorded yet for this organization.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 text-slate-500">
                    <th className="py-3 px-4 font-semibold">Timestamp</th>
                    <th className="py-3 px-4 font-semibold">Actor</th>
                    <th className="py-3 px-4 font-semibold">Action</th>
                    <th className="py-3 px-4 font-semibold">Event Type</th>
                    <th className="py-3 px-4 font-semibold">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {auditLogs.map((log) => (
                    <tr
                      key={log.id}
                      className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors"
                    >
                      <td className="py-3 px-4 text-slate-500 whitespace-nowrap">
                        {new Date(log.created_at).toLocaleString()}
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-medium text-slate-900 dark:text-slate-100">
                          {log.actor_display_name || log.actor_email}
                        </div>
                        <div className="text-[10px] text-slate-500 capitalize">
                          {log.actor_role}
                        </div>
                      </td>
                      <td className="py-3 px-4 font-semibold text-slate-800 dark:text-slate-200">
                        {log.action}
                      </td>
                      <td className="py-3 px-4 font-mono text-[11px] text-emerald-700 dark:text-emerald-400">
                        {log.event_type}
                      </td>
                      <td className="py-3 px-4 text-slate-500 font-mono text-[11px] max-w-xs truncate">
                        {JSON.stringify(log.metadata)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Tab Content: Lifecycle & Governance */}
      {activeTab === "settings" && (
        <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 p-6 shadow-sm space-y-6">
          <div>
            <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              Workspace Lifecycle Governance
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Governed state transitions and maintenance mode controls.
            </p>
          </div>

          <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-md border border-slate-200 dark:border-slate-700 space-y-3">
            <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200">
              Workspace Status:{" "}
              <span className="capitalize text-emerald-600 dark:text-emerald-400">
                {activeOrganization?.status}
              </span>
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-300">
              When an organization is suspended, member sessions are temporarily disabled,
              forms cease accepting submissions, and external API requests are blocked.
            </p>

            {activeOrganization?.status === "suspended" ? (
              isSuperAdmin && (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleReactivation}
                  disabled={actionLoading === "lifecycle"}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs flex items-center space-x-1.5"
                >
                  <Unlock className="w-3.5 h-3.5" />
                  <span>Reactivate Workspace</span>
                </Button>
              )
            ) : (
              isSuperAdmin && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleVoluntarySuspension}
                  disabled={actionLoading === "lifecycle"}
                  className="border-amber-500 text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/30 text-xs flex items-center space-x-1.5"
                >
                  <Lock className="w-3.5 h-3.5" />
                  <span>Voluntarily Suspend (Maintenance Mode)</span>
                </Button>
              )
            )}
          </div>
        </div>
      )}
    </div>
  );
}
