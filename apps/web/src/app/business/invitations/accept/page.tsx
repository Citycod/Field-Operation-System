"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Building2,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
  UserCheck,
  Loader2,
  ArrowRight,
  LogOut,
  Mail,
} from "lucide-react";
import { Badge, Button } from "@field/ui";
import { useAuth } from "@/lib/auth/auth-context";
import type { InvitationPreview } from "@field/types";

export default function AcceptInvitationPage() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading: isAuthLoading, reload, logout } = useAuth();

  const [token, setToken] = useState<string | null>(null);
  const [preview, setPreview] = useState<InvitationPreview | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(true);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const [isAccepting, setIsAccepting] = useState(false);
  const [acceptError, setAcceptError] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);

  // 1. Extract token from URL hash fragment and scrub browser history immediately
  useEffect(() => {
    if (typeof window === "undefined") return;

    let extractedToken: string | null = null;
    const hash = window.location.hash;
    if (hash && hash.includes("token=")) {
      const match = hash.match(/token=([0-9a-fA-F]+)/);
      if (match && match[1]) {
        extractedToken = match[1];
      }
    }

    // Also check query param fallback if user navigated from email client that stripped hash
    if (!extractedToken) {
      const searchParams = new URLSearchParams(window.location.search);
      const paramToken = searchParams.get("token");
      if (paramToken) {
        extractedToken = paramToken;
      }
    }

    if (extractedToken) {
      setToken(extractedToken);
      // Immediately scrub token from address bar and browser history to prevent leakage
      window.history.replaceState(null, "", window.location.pathname);
    } else {
      setIsLoadingPreview(false);
      setPreviewError("No invitation token was provided. Please check the invitation link.");
    }
  }, []);

  // 2. Fetch invitation preview once token is in memory
  useEffect(() => {
    if (!token) return;

    let isMounted = true;
    async function loadPreview() {
      setIsLoadingPreview(true);
      setPreviewError(null);
      try {
        const res = await fetch("/api/organizations/invitations/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });

        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || "Unable to load invitation details.");
        }

        if (isMounted) {
          setPreview(data.preview);
        }
      } catch (err) {
        if (isMounted) {
          setPreviewError(
            err instanceof Error
              ? err.message
              : "The invitation link is invalid or has expired.",
          );
        }
      } finally {
        if (isMounted) {
          setIsLoadingPreview(false);
        }
      }
    }

    void loadPreview();
    return () => {
      isMounted = false;
    };
  }, [token]);

  // 3. Accept invitation action
  async function handleAccept() {
    if (!token) return;
    setIsAccepting(true);
    setAcceptError(null);

    try {
      const res = await fetch("/api/organizations/invitations/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to accept invitation.");
      }

      setIsSuccess(true);
      // Reload user tenant context so active organization is refreshed
      await reload(data.organization_id);

      setTimeout(() => {
        router.replace("/dashboard");
      }, 1500);
    } catch (err) {
      setAcceptError(
        err instanceof Error
          ? err.message
          : "An unexpected error occurred while accepting the invitation.",
      );
      setIsAccepting(false);
    }
  }

  // Loading state
  if (isLoadingPreview || isAuthLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4 dark:bg-slate-950">
        <div className="flex items-center space-x-3 rounded-lg border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <Loader2 className="h-5 w-5 animate-spin text-emerald-600" />
          <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
            Verifying invitation details…
          </span>
        </div>
      </div>
    );
  }

  // Error / Invalid state
  if (previewError || !preview) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4 dark:bg-slate-950">
        <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center space-x-3 text-red-600 dark:text-red-400">
            <AlertCircle className="h-6 w-6 shrink-0" />
            <h1 className="text-base font-bold text-slate-900 dark:text-slate-100">
              Invitation Unavailable
            </h1>
          </div>
          <p className="mt-3 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
            {previewError || "This invitation link is invalid or has expired. Please contact your organization administrator to request a new invitation."}
          </p>
          <div className="mt-6 flex justify-end">
            <Link
              href="/login"
              className="inline-flex items-center text-xs font-semibold text-emerald-700 hover:underline dark:text-emerald-400"
            >
              Go to sign in <ArrowRight className="ml-1 h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Success state
  if (isSuccess) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4 dark:bg-slate-950">
        <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
            <CheckCircle2 className="h-6 w-6" />
          </div>
          <h1 className="mt-4 text-base font-bold text-slate-900 dark:text-slate-100">
            Welcome to {preview.organization_name}!
          </h1>
          <p className="mt-2 text-xs text-slate-600 dark:text-slate-400">
            Your invitation has been accepted. Redirecting you to the workspace dashboard…
          </p>
        </div>
      </div>
    );
  }

  // Account Email Matching Verification
  const userEmail = user?.email?.toLowerCase().trim();
  const invitedEmail = preview.email.toLowerCase().trim();
  const isEmailMatch = userEmail === invitedEmail;

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4 dark:bg-slate-950">
      <div className="w-full max-w-lg rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        {/* Header */}
        <div className="border-b border-slate-200 px-6 py-5 dark:border-slate-800">
          <div className="flex items-center space-x-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
              <Building2 className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-base font-bold text-slate-900 dark:text-slate-100">
                Team Workspace Invitation
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                You have been invited to join a business organization
              </p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="space-y-4 px-6 py-5 text-xs text-slate-700 dark:text-slate-300">
          {/* Organization Details Card */}
          <div className="rounded-md border border-slate-100 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-800/50">
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <span className="font-medium text-slate-500 dark:text-slate-400">Organization:</span>
                <p className="mt-0.5 font-bold text-slate-900 dark:text-slate-100">
                  {preview.organization_name}
                </p>
              </div>
              <div>
                <span className="font-medium text-slate-500 dark:text-slate-400">Assigned Role:</span>
                <p className="mt-0.5">
                  <Badge variant="success" className="capitalize text-[10px]">
                    {preview.role}
                  </Badge>
                </p>
              </div>
              <div>
                <span className="font-medium text-slate-500 dark:text-slate-400">Invited Email:</span>
                <p className="mt-0.5 font-medium text-slate-900 dark:text-slate-100">
                  {preview.email}
                </p>
              </div>
              <div>
                <span className="font-medium text-slate-500 dark:text-slate-400">Expires:</span>
                <p className="mt-0.5 text-slate-700 dark:text-slate-300">
                  {new Date(preview.expires_at).toLocaleDateString()}
                </p>
              </div>
            </div>
          </div>

          {/* Authentication State Handling */}
          {!isAuthenticated ? (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
              <div className="flex items-start space-x-2">
                <Mail className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                <div>
                  <p className="font-bold">Sign in required</p>
                  <p className="mt-1 text-[11px] leading-relaxed">
                    Please sign in with <strong>{preview.email}</strong> to accept this invitation. If you do not have an account yet, create one using this email.
                  </p>
                </div>
              </div>
              <div className="mt-4 flex items-center space-x-3">
                <Link
                  href={`/login`}
                  className="inline-flex items-center rounded-md bg-amber-700 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-amber-800"
                >
                  Sign In <ArrowRight className="ml-1 h-3.5 w-3.5" />
                </Link>
                <Link
                  href={`/business/signup`}
                  className="text-xs font-semibold text-amber-900 underline hover:text-amber-950 dark:text-amber-200"
                >
                  Create Account
                </Link>
              </div>
            </div>
          ) : !isEmailMatch ? (
            <div className="rounded-md border border-red-200 bg-red-50 p-4 text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
              <div className="flex items-start space-x-2">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
                <div>
                  <p className="font-bold">Account mismatch</p>
                  <p className="mt-1 text-[11px] leading-relaxed">
                    This invitation was sent to <strong>{preview.email}</strong>, but you are currently signed in as <strong>{user?.email}</strong>.
                  </p>
                </div>
              </div>
              <div className="mt-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void logout()}
                  className="text-xs font-semibold text-red-800 hover:bg-red-100 dark:text-red-200"
                >
                  <LogOut className="mr-1.5 h-3.5 w-3.5" /> Sign out & switch account
                </Button>
              </div>
            </div>
          ) : (
            <div className="rounded-md border border-emerald-200 bg-emerald-50 p-4 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">
              <div className="flex items-center space-x-2">
                <ShieldCheck className="h-4 w-4 text-emerald-700 dark:text-emerald-400" />
                <p className="font-semibold text-xs">
                  Verified as {user?.email}
                </p>
              </div>
              <p className="mt-1 text-[11px] text-emerald-800 dark:text-emerald-300">
                You are ready to join {preview.organization_name} as a {preview.role}.
              </p>
            </div>
          )}

          {acceptError && (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
              {acceptError}
            </div>
          )}
        </div>

        {/* Footer */}
        {isAuthenticated && isEmailMatch && (
          <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-6 py-4 dark:border-slate-800 dark:bg-slate-900/50">
            <Link
              href="/dashboard"
              className="text-xs font-medium text-slate-500 hover:text-slate-700 dark:text-slate-400"
            >
              Cancel
            </Link>
            <Button
              variant="primary"
              size="sm"
              disabled={isAccepting}
              onClick={() => void handleAccept()}
              className="bg-emerald-700 font-semibold text-white hover:bg-emerald-800"
            >
              {isAccepting ? (
                <>
                  <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                  Accepting…
                </>
              ) : (
                <>Accept Invitation & Join Workspace</>
              )}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

