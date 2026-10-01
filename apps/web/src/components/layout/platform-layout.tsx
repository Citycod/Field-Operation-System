'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, Building2, Loader2, LogOut, RefreshCw, User } from 'lucide-react';
import { Badge, Button } from '@field/ui';
import { Sidebar } from '../navigation/sidebar';
import { useAuth } from '@/lib/auth/auth-context';

export function PlatformLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
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
  const [logoutError, setLogoutError] = useState('');
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  useEffect(() => {
    if (!isLoading && !user && tenantStatus !== 'error') {
      router.replace('/login');
    }
  }, [isLoading, router, tenantStatus, user]);

  async function handleLogout() {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    setLogoutError('');
    try {
      await logout();
      window.location.replace('/login');
    } catch (error) {
      setLogoutError(error instanceof Error ? error.message : 'Sign out failed. Please try again.');
      setIsLoggingOut(false);
    }
  }

  if (isLoading || (!user && tenantStatus !== 'error')) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 text-slate-700">
        <div className="flex items-center gap-2 text-sm" role="status">
          <Loader2 className="h-4 w-4 animate-spin" />
          Verifying your session…
        </div>
      </div>
    );
  }

  if (tenantStatus === 'error') {
    return (
      <AccessState
        icon={<RefreshCw className="h-5 w-5" />}
        title="Workspace access could not be loaded"
        description={tenantError ?? 'Your session is still active, but tenant access could not be resolved.'}
        primaryLabel="Try again"
        onPrimary={() => void reload()}
        onLogout={() => void handleLogout()}
        isLoggingOut={isLoggingOut}
        logoutError={logoutError}
      />
    );
  }

  if (!activeOrganization || tenantStatus === 'no-membership') {
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
    <div className="flex h-screen overflow-hidden bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <Sidebar />

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-6 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center space-x-3">
            <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">
              Active Context:
            </span>
            <span className="text-xs font-bold text-slate-900 dark:text-slate-100">
              {activeOrganization.name}
            </span>
            {currentRole && (
              <Badge variant="success" className="px-2 py-0.5 text-[10px] capitalize">
                {currentRole.replace('_', ' ')}
              </Badge>
            )}
          </div>

          <div className="flex items-center space-x-4">
            <button
              type="button"
              aria-label="Notifications"
              className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200"
            >
              <Bell className="h-4 w-4" />
            </button>

            <div className="h-4 w-px bg-slate-200 dark:bg-slate-800" />

            <div className="flex items-center space-x-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-700 text-xs font-bold text-white">
                <User className="h-4 w-4" />
              </div>
              <div className="hidden text-left sm:block">
                <div className="text-xs font-semibold leading-none">
                  {[user?.first_name, user?.last_name].filter(Boolean).join(' ') || 'Signed-in user'}
                </div>
                <div className="text-[10px] leading-tight text-slate-400">{user?.email}</div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => void handleLogout()}
              disabled={isLoggingOut}
              aria-label="Sign out"
              className="flex items-center gap-1.5 rounded-md border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              {isLoggingOut ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LogOut className="h-3.5 w-3.5" />}
              Sign out
            </button>
          </div>
        </header>

        {logoutError && (
          <div role="alert" className="border-b border-red-200 bg-red-50 px-6 py-2 text-xs text-red-800">
            {logoutError}
          </div>
        )}

        <main className="flex-1 overflow-y-auto bg-slate-50 p-6 dark:bg-slate-950">{children}</main>
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
        {userEmail && <p className="mt-3 text-xs text-slate-500">Signed in as {userEmail}</p>}
        {logoutError && <p role="alert" className="mt-3 text-xs text-red-700">{logoutError}</p>}
        <div className="mt-6 flex gap-2">
          {primaryLabel && onPrimary && (
            <Button type="button" onClick={onPrimary} variant="primary" size="sm">
              {primaryLabel}
            </Button>
          )}
          <Button type="button" onClick={onLogout} disabled={isLoggingOut} variant="secondary" size="sm">
            {isLoggingOut ? 'Signing out…' : 'Sign out'}
          </Button>
        </div>
      </div>
    </div>
  );
}
