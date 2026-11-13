"use client";

import React, { FormEvent, useEffect, useState } from "react";
import { Button, Input } from "@field/ui";
import { SupabaseAuthService } from "@/lib/auth/supabase-auth-service";
import { safePostLoginPath } from "@/lib/auth/route-policy";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const err = params.get("error");
    if (err === "verification_failed") {
      setError("Email verification link is invalid or has expired. Please sign in or register again.");
    } else if (err === "missing_code") {
      setError("Verification code is missing from the link. Please check your verification email.");
    }
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError("");
    try {
      const result = await new SupabaseAuthService().signInWithEmail(
        email,
        password,
      );
      if (result.error || !result.user) {
        setError(result.error?.message ?? "Authentication failed.");
        return;
      }

      const nextPath = safePostLoginPath(
        new URLSearchParams(window.location.search).get("next"),
      );
      window.location.replace(nextPath);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Authentication failed.";
      setError(
        message === "Failed to fetch"
          ? "Unable to reach the authentication service. Check your connection and try again."
          : message,
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 dark:bg-slate-950 p-4">
      <div className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 p-6 shadow-md space-y-6">
        <div className="text-center space-y-2">
          <div className="mx-auto h-10 w-10 rounded-lg bg-emerald-600 flex items-center justify-center text-white font-bold text-xl shadow-sm">
            F
          </div>
          <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">
            Sign In to FieldOps
          </h1>
          <p className="text-xs text-slate-500">
            Enter your credentials to access your tenant workspace
          </p>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <Input
            label="Work Email"
            type="email"
            name="email"
            autoComplete="username"
            placeholder="operator@company.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
          <Input
            label="Password"
            type="password"
            name="password"
            autoComplete="current-password"
            placeholder="••••••••"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
          {error && (
            <p
              role="alert"
              className="rounded border border-red-200 bg-red-50 p-3 text-xs text-red-800"
            >
              {error}
            </p>
          )}
          <Button
            type="submit"
            variant="primary"
            className="w-full"
            size="md"
            disabled={submitting}
          >
            {submitting ? "Signing in…" : "Sign In"}
          </Button>
        </form>

        <div className="pt-2 border-t border-slate-100 dark:border-slate-800 text-center text-xs text-slate-500">
          Need a workspace for your team?{" "}
          <a
            href="/business/signup"
            className="font-medium text-emerald-600 hover:text-emerald-700 hover:underline"
          >
            Set up a business workspace
          </a>
        </div>
      </div>
    </div>
  );
}
