"use client";

import React, { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Building2,
  CheckCircle2,
  AlertCircle,
  Mail,
  ArrowRight,
  ShieldCheck,
  UserCheck,
} from "lucide-react";
import { Button, Input } from "@field/ui";
import { useAuth } from "@/lib/auth/auth-context";
import { SupabaseAuthService } from "@/lib/auth/supabase-auth-service";
import { generateSlug, validateSlug } from "@/lib/organizations/slug";
import {
  saveBusinessSignupDraft,
  loadBusinessSignupDraft,
  clearBusinessSignupDraft,
} from "@/lib/organizations/signup-draft";

export default function BusinessSignupPage() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading, reload, logout } = useAuth();

  // FLOW A: New User Account fields
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // Business Workspace fields (Flow A & Flow B)
  const [businessName, setBusinessName] = useState("");
  const [slug, setSlug] = useState("");
  const [isSlugManuallyEdited, setIsSlugManuallyEdited] = useState(false);

  // Optional profile fields
  const [businessPhone, setBusinessPhone] = useState("");
  const [industry, setIndustry] = useState("");
  const [countryCode, setCountryCode] = useState("");
  const [website, setWebsite] = useState("");

  // UI state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [verificationPendingEmail, setVerificationPendingEmail] = useState<string | null>(null);

  // Restore non-sensitive business draft from sessionStorage if returning from email verification
  useEffect(() => {
    const draft = loadBusinessSignupDraft(user?.email);
    if (draft) {
      if (draft.businessName) setBusinessName(draft.businessName);
      if (draft.slug) {
        setSlug(draft.slug);
        setIsSlugManuallyEdited(true);
      }
      if (draft.businessPhone) setBusinessPhone(draft.businessPhone);
      if (draft.industry) setIndustry(draft.industry);
      if (draft.countryCode) setCountryCode(draft.countryCode);
      if (draft.website) setWebsite(draft.website);
      if (!isAuthenticated && draft.accountEmail) {
        setEmail(draft.accountEmail);
      }
    }
  }, [user?.email, isAuthenticated]);

  /**
   * Reconciles workspace state when encountering network timeouts or 409 slug conflicts.
   * Checks whether the authenticated user already owns an organization matching this slug.
   */
  async function attemptRetryReconciliation(targetSlug: string): Promise<boolean> {
    try {
      const res = await fetch("/api/organizations", { credentials: "same-origin" });
      if (!res.ok) return false;
      const data = await res.json().catch(() => ({}));
      const organizations: Array<{ id: string; slug: string; status: string }> =
        data.organizations || [];

      const matched = organizations.find(
        (o) => o.slug.toLowerCase() === targetSlug.toLowerCase() && o.status === "active",
      );

      if (matched) {
        clearBusinessSignupDraft();
        await reload(matched.id);
        window.location.replace("/dashboard");
        return true;
      }
    } catch {
      // Fall through to standard error handling
    }
    return false;
  }

  // Auto-generate slug as business name is typed unless user manually edited slug
  const handleBusinessNameChange = (name: string) => {
    setBusinessName(name);
    if (!isSlugManuallyEdited) {
      setSlug(generateSlug(name));
    }
    if (fieldErrors.businessName) {
      setFieldErrors((prev) => ({ ...prev, businessName: "" }));
    }
  };

  const handleSlugChange = (rawSlug: string) => {
    setIsSlugManuallyEdited(true);
    const cleaned = rawSlug.toLowerCase().replace(/[^a-z0-9-]/g, "");
    setSlug(cleaned);
    if (fieldErrors.slug) {
      setFieldErrors((prev) => ({ ...prev, slug: "" }));
    }
  };

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};

    if (!businessName.trim() || businessName.trim().length < 2) {
      errors.businessName = "Business name must be at least 2 characters.";
    } else if (businessName.trim().length > 100) {
      errors.businessName = "Business name must not exceed 100 characters.";
    }

    const slugError = validateSlug(slug);
    if (slugError) {
      errors.slug = slugError;
    }

    if (!isAuthenticated) {
      if (!email.trim() || !email.includes("@")) {
        errors.email = "Please enter a valid work email address.";
      }
      if (!password || password.length < 8) {
        errors.password = "Password must be at least 8 characters.";
      }
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;

    setGeneralError(null);
    if (!validateForm()) return;

    setIsSubmitting(true);

    try {
      const authService = new SupabaseAuthService();

      // FLOW A: Unauthenticated Visitor registration
      if (!isAuthenticated) {
        const authResult = await authService.signUpWithEmail(email.trim(), password, {
          firstName: firstName.trim(),
          lastName: lastName.trim(),
        });

        if (authResult.error) {
          const msg = authResult.error.message;
          if (msg.toLowerCase().includes("already registered") || msg.toLowerCase().includes("exists")) {
            setGeneralError("An account with this email already exists. Please sign in instead.");
          } else {
            setGeneralError(msg);
          }
          setIsSubmitting(false);
          return;
        }

        // If email verification is required by Supabase configuration
        if (authResult.requiresEmailVerification || !authResult.session) {
          saveBusinessSignupDraft({
            accountEmail: email.trim(),
            businessName: businessName.trim(),
            slug: slug.trim().toLowerCase(),
            businessPhone: businessPhone.trim() || undefined,
            industry: industry.trim() || undefined,
            countryCode: countryCode.trim() || undefined,
            website: website.trim() || undefined,
          });
          setVerificationPendingEmail(email.trim());
          setIsSubmitting(false);
          return;
        }
      }

      // Provision Workspace via Stage 2 API
      const response = await fetch("/api/organizations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: businessName.trim(),
          slug: slug.trim().toLowerCase(),
          profile: {
            business_email: isAuthenticated ? user?.email : email.trim(),
            business_phone: businessPhone.trim() || undefined,
            industry: industry.trim() || undefined,
            country_code: countryCode.trim() || undefined,
            website: website.trim() || undefined,
          },
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        if (response.status === 409 || errorData.code === "SLUG_ALREADY_EXISTS") {
          // Check if this slug already belongs to the authenticated user from a prior attempt
          const reconciled = await attemptRetryReconciliation(slug.trim().toLowerCase());
          if (reconciled) return;

          setFieldErrors((prev) => ({
            ...prev,
            slug: `The workspace identifier "${slug}" is already taken. Please choose another.`,
          }));
        } else if (response.status === 401) {
          setGeneralError("Your session has expired. Please sign in again.");
        } else {
          setGeneralError(errorData.error || "Failed to provision business workspace.");
        }
        setIsSubmitting(false);
        return;
      }

      const result = await response.json();
      const newOrgId = result.organization?.id;

      // Clear draft on successful provisioning
      clearBusinessSignupDraft();

      // Reload auth context and activate the newly created workspace
      await reload(newOrgId);

      // Redirect into platform
      window.location.replace("/dashboard");
    } catch (caught) {
      // Reconcile in case the server succeeded before the client connection dropped
      const reconciled = await attemptRetryReconciliation(slug.trim().toLowerCase());
      if (reconciled) return;

      const message = caught instanceof Error ? caught.message : "An unexpected error occurred.";
      setGeneralError(
        message === "Failed to fetch"
          ? "Unable to reach the server. Please check your connection and try again."
          : message,
      );
      setIsSubmitting(false);
    }
  }

  // Email verification pending state
  if (verificationPendingEmail) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 p-4">
        <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 p-8 shadow-sm space-y-6 text-center">
          <div className="mx-auto h-12 w-12 rounded-full bg-emerald-50 dark:bg-emerald-950/60 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
            <Mail className="h-6 w-6" />
          </div>
          <div className="space-y-2">
            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">
              Check your inbox
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              We sent a verification link to{" "}
              <strong className="text-slate-900 dark:text-slate-200">{verificationPendingEmail}</strong>.
            </p>
            <p className="text-xs text-slate-500 pt-2">
              Please click the link in your email to verify your account. Once verified, sign in to activate your workspace.
            </p>
          </div>
          <div className="pt-4 flex flex-col gap-2">
            <Button
              type="button"
              variant="primary"
              className="w-full"
              onClick={() => router.push("/login")}
            >
              Go to Sign In
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="w-full text-xs text-slate-500"
              onClick={() => setVerificationPendingEmail(null)}
            >
              Use a different email
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-2xl mx-auto space-y-8">
        {/* Brand Header */}
        <div className="text-center space-y-2">
          <div className="mx-auto h-11 w-11 rounded-lg bg-emerald-600 flex items-center justify-center text-white font-bold text-2xl shadow-sm">
            F
          </div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
            {isAuthenticated ? "Create a Business Workspace" : "Register Your Business Workspace"}
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 max-w-md mx-auto">
            {isAuthenticated
              ? "Set up a new operational workspace for your organization. You will be assigned as the business administrator."
              : "Create your administrator account and provision your dedicated multi-tenant field operations workspace."}
          </p>
        </div>

        {/* Existing Authenticated User Notification Banner */}
        {isAuthenticated && user && (
          <div className="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-md p-4 flex items-center justify-between text-xs text-emerald-900 dark:text-emerald-200">
            <div className="flex items-center gap-2">
              <UserCheck className="h-4 w-4 text-emerald-600 shrink-0" />
              <span>
                Signed in as <strong>{user.email}</strong>. This new workspace will be added to your account.
              </span>
            </div>
            <button
              type="button"
              onClick={() => void logout()}
              className="underline text-emerald-700 dark:text-emerald-400 hover:text-emerald-800 text-xs shrink-0 ml-3"
            >
              Switch account
            </button>
          </div>
        )}

        {/* Form Container */}
        <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 p-8 shadow-sm">
          {generalError && (
            <div
              role="alert"
              className="mb-6 rounded-md border border-red-200 bg-red-50 dark:bg-red-950/40 dark:border-red-900 p-4 text-xs text-red-800 dark:text-red-200 flex items-start gap-2"
            >
              <AlertCircle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Unable to complete registration</p>
                <p className="mt-0.5">{generalError}</p>
                {generalError.includes("sign in instead") && (
                  <Link
                    href="/login"
                    className="mt-2 inline-block font-semibold text-emerald-700 underline"
                  >
                    Go to Sign In &rarr;
                  </Link>
                )}
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* SECTION 1: ACCOUNT CREDENTIALS (Only for unauthenticated visitors) */}
            {!isAuthenticated && (
              <div className="space-y-4">
                <div className="border-b border-slate-100 dark:border-slate-800 pb-2">
                  <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                    1. Administrator Account
                  </h2>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Input
                    label="First Name"
                    name="firstName"
                    autoComplete="given-name"
                    placeholder="Alex"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    disabled={isSubmitting}
                  />
                  <Input
                    label="Last Name"
                    name="lastName"
                    autoComplete="family-name"
                    placeholder="Morgan"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    disabled={isSubmitting}
                  />
                </div>

                <Input
                  label="Work Email *"
                  type="email"
                  name="email"
                  autoComplete="email"
                  placeholder="alex.morgan@company.com"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (fieldErrors.email) setFieldErrors((p) => ({ ...p, email: "" }));
                  }}
                  error={fieldErrors.email}
                  required
                  disabled={isSubmitting}
                />

                <Input
                  label="Password *"
                  type="password"
                  name="password"
                  autoComplete="new-password"
                  placeholder="••••••••"
                  helperText="Minimum 8 characters"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (fieldErrors.password) setFieldErrors((p) => ({ ...p, password: "" }));
                  }}
                  error={fieldErrors.password}
                  required
                  disabled={isSubmitting}
                />
              </div>
            )}

            {/* SECTION 2: BUSINESS WORKSPACE DETAILS */}
            <div className="space-y-4">
              <div className="border-b border-slate-100 dark:border-slate-800 pb-2">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  {isAuthenticated ? "Workspace Details" : "2. Business Workspace"}
                </h2>
              </div>

              <Input
                label="Business / Organization Name *"
                name="businessName"
                placeholder="Apex Energy Services"
                value={businessName}
                onChange={(e) => handleBusinessNameChange(e.target.value)}
                error={fieldErrors.businessName}
                required
                disabled={isSubmitting}
              />

              <div>
                <Input
                  label="Workspace Identifier (Slug) *"
                  name="slug"
                  value={slug}
                  onChange={(e) => handleSlugChange(e.target.value)}
                  error={fieldErrors.slug}
                  helperText={`Unique URL: https://fieldops.app/org/${slug || "workspace"}`}
                  required
                  disabled={isSubmitting}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                <Input
                  label="Industry (Optional)"
                  name="industry"
                  placeholder="Oil & Gas, Facilities, Utilities..."
                  value={industry}
                  onChange={(e) => setIndustry(e.target.value)}
                  disabled={isSubmitting}
                />
                <Input
                  label="Phone Number (Optional)"
                  name="businessPhone"
                  type="tel"
                  placeholder="+1 (555) 000-0000"
                  value={businessPhone}
                  onChange={(e) => setBusinessPhone(e.target.value)}
                  disabled={isSubmitting}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  label="Country Code (Optional)"
                  name="countryCode"
                  placeholder="US, UK, CA..."
                  maxLength={10}
                  value={countryCode}
                  onChange={(e) => setCountryCode(e.target.value.toUpperCase())}
                  disabled={isSubmitting}
                />
                <Input
                  label="Website (Optional)"
                  name="website"
                  type="url"
                  placeholder="https://company.com"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  disabled={isSubmitting}
                />
              </div>
            </div>

            {/* Security Guarantee Notice */}
            <div className="flex items-center gap-2 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-md border border-slate-200 dark:border-slate-700 text-xs text-slate-600 dark:text-slate-400">
              <ShieldCheck className="h-4 w-4 text-emerald-600 shrink-0" />
              <span>
                Isolated tenant schema with row-level security and strict administrative ownership.
              </span>
            </div>

            {/* Submit Action */}
            <div className="pt-2">
              <Button
                type="submit"
                variant="primary"
                className="w-full"
                size="md"
                isLoading={isSubmitting}
                disabled={isSubmitting}
              >
                {isSubmitting
                  ? "Provisioning workspace…"
                  : isAuthenticated
                  ? "Create Workspace"
                  : "Create Account & Workspace"}
              </Button>
            </div>

            {/* Footer Navigation */}
            {!isAuthenticated && (
              <div className="text-center text-xs text-slate-500 pt-2">
                Already have an account?{" "}
                <Link
                  href="/login"
                  className="font-medium text-emerald-600 hover:text-emerald-700 hover:underline"
                >
                  Sign in
                </Link>
              </div>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}

