"use client";

import React, { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  Bell,
  Building2,
  Loader2,
  LogOut,
  Menu,
  RefreshCw,
  User,
  X,
} from "lucide-react";
import { Badge, Button } from "@field/ui";
import { Sidebar } from "../navigation/sidebar";
import { useAuth } from "@/lib/auth/auth-context";

export function PlatformLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const {
    user,
    currentRole,
    activeOrganization,
    isLoading,
    tenantStatus,
    tenantError,
    reload,
    logout,
  } = useAuth();
  const [logoutError, setLogoutError] = useState("");
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [navigationOpen, setNavigationOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("fieldops_sidebar_collapsed");
      if (saved === "true") {
        setIsSidebarCollapsed(true);
      }
    } catch {
      // ignore when localStorage is unavailable
    }
  }, []);

  const toggleSidebar = () => {
    setIsSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("fieldops_sidebar_collapsed", String(next));
      } catch {
        // ignore storage errors
      }
      return next;
    });
  };

  const handleMenuClick = () => {
    if (typeof window !== "undefined" && window.innerWidth < 1024) {
      setNavigationOpen((prev) => !prev);
    } else {
      toggleSidebar();
    }
  };

  useEffect(() => {
    if (!isLoading && !user && tenantStatus !== "error") {
      router.replace("/login");
    }
  }, [isLoading, router, tenantStatus, user]);

  useEffect(() => {
    setNavigationOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!navigationOpen) return;
    const menuButton = menuButtonRef.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setNavigationOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
      menuButton?.focus();
    };
  }, [navigationOpen]);

  async function handleLogout() {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    setLogoutError("");
    try {
      await logout();
      window.location.replace("/login");
    } catch (error) {
      setLogoutError(
        error instanceof Error
          ? error.message
          : "Sign out failed. Please try again.",
      );
      setIsLoggingOut(false);
    }
  }

  if (!isLoading && tenantStatus === "error") {
    return (
      <AccessState
        icon={<RefreshCw className="h-5 w-5" />}
        title="Workspace access could not be loaded"
        description={
          tenantError ??
          "Your session is still active, but tenant access could not be resolved."
        }
        primaryLabel="Try again"
        onPrimary={() => void reload()}
        onLogout={() => void handleLogout()}
        isLoggingOut={isLoggingOut}
        logoutError={logoutError}
      />
    );
  }

  if (!isLoading && (!activeOrganization || tenantStatus === "no-membership")) {
    return (
      <AccessState
        icon={<Building2 className="h-5 w-5" />}
        title="Organization access is required"
        description="Your account is signed in, but it has no active organization membership. Ask an administrator to add or enable your membership."
        onLogout={() => void handleLogout()}
        isLoggingOut={isLoggingOut}
        logoutError={logoutError}
        userEmail={user?.email}
      />
    );
  }

  return (
    <div className="flex h-dvh min-w-0 overflow-hidden bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      {/* Desktop Collapsible Sidebar */}
      <div
        className={`hidden lg:flex shrink-0 transition-[width] duration-300 ease-in-out overflow-hidden ${
          isSidebarCollapsed ? "w-0 border-r-0" : "w-64"
        }`}
      >
        <Sidebar
          className="w-64"
          onToggleCollapse={toggleSidebar}
        />
      </div>

      {navigationOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Close navigation"
            className="absolute inset-0 bg-slate-950/55"
            onClick={() => setNavigationOpen(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Platform navigation"
            className="relative h-dvh w-[min(18rem,86vw)] shadow-xl"
          >
            <Sidebar
              className="w-full"
              onNavigate={() => setNavigationOpen(false)}
            />
            <button
              ref={closeButtonRef}
              type="button"
              aria-label="Close navigation"
              onClick={() => setNavigationOpen(false)}
              className="absolute right-3 top-3 grid h-10 w-10 place-items-center rounded-md text-slate-300 hover:bg-slate-800 hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex min-h-14 shrink-0 items-center justify-between gap-2 border-b border-slate-200 bg-white px-3 py-2 sm:px-4 lg:px-6 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <button
              ref={menuButtonRef}
              type="button"
              aria-label={
                navigationOpen
                  ? "Close navigation"
                  : isSidebarCollapsed
                    ? "Expand sidebar"
                    : "Collapse sidebar"
              }
              aria-expanded={navigationOpen || !isSidebarCollapsed}
              title={isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              onClick={handleMenuClick}
              className="grid h-10 w-10 shrink-0 place-items-center rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 transition-colors"
            >
              <Menu className="h-5 w-5" />
            </button>
            <span className="hidden text-xs font-semibold text-slate-600 sm:inline dark:text-slate-400">
              Active Context:
            </span>
            <span className="truncate text-xs font-bold text-slate-900 dark:text-slate-100">
              {activeOrganization?.name || (isLoading ? "Loading…" : "No Organization")}
            </span>
            {currentRole && (
              <Badge
                variant="success"
                className="hidden shrink-0 px-2 py-0.5 text-[10px] capitalize sm:inline-flex"
              >
                {currentRole.replace("_", " ")}
              </Badge>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-1 sm:gap-3">
            <button
              type="button"
              aria-label="Notifications"
              className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200"
            >
              <Bell className="h-4 w-4" />
            </button>

            <div className="hidden h-4 w-px bg-slate-200 sm:block dark:bg-slate-800" />

            <div className="flex items-center space-x-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-700 text-xs font-bold text-white">
                <User className="h-4 w-4" />
              </div>
              <div className="hidden text-left xl:block">
                <div className="text-xs font-semibold leading-none">
                  {[user?.first_name, user?.last_name]
                    .filter(Boolean)
                    .join(" ") || "Signed-in user"}
                </div>
                <div className="text-[10px] leading-tight text-slate-400">
                  {user?.email}
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => void handleLogout()}
              disabled={isLoggingOut}
              aria-label="Sign out"
              className="flex items-center gap-1.5 rounded-md border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              {isLoggingOut ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <LogOut className="h-3.5 w-3.5" />
              )}
              <span className="hidden sm:inline">Sign out</span>
            </button>
          </div>
        </header>

        {logoutError && (
          <div
            role="alert"
            className="border-b border-red-200 bg-red-50 px-6 py-2 text-xs text-red-800"
          >
            {logoutError}
          </div>
        )}

        <main className="min-w-0 flex-1 overflow-x-hidden overflow-y-auto bg-slate-50 p-3 sm:p-4 lg:p-6 dark:bg-slate-950">
          {children}
        </main>
      </div>
    </div>
  );
}

interface AccessStateProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  primaryLabel?: string;
  onPrimary?: () => void;
  onLogout: () => void;
  isLoggingOut: boolean;
  logoutError: string;
  userEmail?: string;
}

function AccessState({
  icon,
  title,
  description,
  primaryLabel,
  onPrimary,
  onLogout,
  isLoggingOut,
  logoutError,
  userEmail,
}: AccessStateProps) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-md bg-emerald-50 text-emerald-700">
          {icon}
        </div>
        <h1 className="text-lg font-bold text-slate-900">{title}</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
        {userEmail && (
          <p className="mt-3 text-xs text-slate-500">
            Signed in as {userEmail}
          </p>
        )}
        {logoutError && (
          <p role="alert" className="mt-3 text-xs text-red-700">
            {logoutError}
          </p>
        )}
        <div className="mt-6 flex gap-2">
          {primaryLabel && onPrimary && (
            <Button
              type="button"
              onClick={onPrimary}
              variant="primary"
              size="sm"
            >
              {primaryLabel}
            </Button>
          )}
          <Button
            type="button"
            onClick={onLogout}
            disabled={isLoggingOut}
            variant="secondary"
            size="sm"
          >
            {isLoggingOut ? "Signing out…" : "Sign out"}
          </Button>
        </div>
      </div>
    </div>
  );
}
