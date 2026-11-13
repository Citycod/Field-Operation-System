"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Building2,
  Users,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  ArrowLeft,
  Mail,
  Shield,
  Loader2,
  Trash2,
  Plus,
  RefreshCw,
} from "lucide-react";
import { Badge, Button, Input } from "@field/ui";
import { useAuth } from "@/lib/auth/auth-context";
import type {
  OrganizationProfile,
  OrganizationInvitation,
  InvitationRole,
  UpdateOrganizationProfileInput,
} from "@field/types";

export default function BusinessOnboardingPage() {
  const router = useRouter();
  const { user, activeOrganization, currentRole, isLoading: isAuthLoading, reload } = useAuth();

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [profile, setProfile] = useState<OrganizationProfile | null>(null);
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);
  const [profileError, setProfileError] = useState<string | null>(null);

  // Step 1: Profile form state
  const [businessEmail, setBusinessEmail] = useState("");
  const [businessPhone, setBusinessPhone] = useState("");
  const [industry, setIndustry] = useState("");
  const [addressLine1, setAddressLine1] = useState("");
  const [city, setCity] = useState("");
  const [stateRegion, setStateRegion] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [countryCode, setCountryCode] = useState("");
  const [website, setWebsite] = useState("");
  const [timezone, setTimezone] = useState("UTC");
  const [currencyCode, setCurrencyCode] = useState("USD");
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [profileSaveError, setProfileSaveError] = useState<string | null>(null);

  // Step 2: Invitations state
  const [invitations, setInvitations] = useState<OrganizationInvitation[]>([]);
  const [isLoadingInvitations, setIsLoadingInvitations] = useState(false);
  const [newInviteEmail, setNewInviteEmail] = useState("");
  const [newInviteRole, setNewInviteRole] = useState<InvitationRole>("employee");
  const [isSendingInvite, setIsSendingInvite] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSuccessMsg, setInviteSuccessMsg] = useState<string | null>(null);

  // Step 3: Completion state
  const [isCompleting, setIsCompleting] = useState(false);
  const [completeError, setCompleteError] = useState<string | null>(null);

  // Load organization profile
  useEffect(() => {
    if (!activeOrganization) return;

    let isMounted = true;
    async function fetchProfile() {
      setIsLoadingProfile(true);
      setProfileError(null);
      try {
        const res = await fetch(`/api/organizations/${activeOrganization?.id}`);
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || "Failed to load organization profile.");
        }

        if (isMounted) {
          const loadedProfile = data.profile as OrganizationProfile;
          setProfile(loadedProfile);

          // If already completed, redirect to dashboard
          if (loadedProfile && loadedProfile.onboarding_completed) {
            router.replace("/dashboard");
            return;
          }

          // Populate form fields
          if (loadedProfile) {
            setBusinessEmail(loadedProfile.business_email || "");
            setBusinessPhone(loadedProfile.business_phone || "");
            setIndustry(loadedProfile.industry || "");
            setAddressLine1(loadedProfile.address_line_1 || "");
            setCity(loadedProfile.city || "");
            setStateRegion(loadedProfile.state_region || "");
            setPostalCode(loadedProfile.postal_code || "");
            setCountryCode(loadedProfile.country_code || "");
            setWebsite(loadedProfile.website || "");
            setTimezone(loadedProfile.timezone || "UTC");
            setCurrencyCode(loadedProfile.currency_code || "USD");
          }
        }
      } catch (err) {
        if (isMounted) {
          setProfileError(
            err instanceof Error ? err.message : "Failed to load workspace profile.",
          );
        }
      } finally {
        if (isMounted) {
          setIsLoadingProfile(false);
        }
      }
    }

    void fetchProfile();
    return () => {
      isMounted = false;
    };
  }, [activeOrganization, router]);

  // Load invitations when navigating to Step 2
  useEffect(() => {
    if (step !== 2 || !activeOrganization) return;

    let isMounted = true;
    async function fetchInvitations() {
      setIsLoadingInvitations(true);
      try {
        const res = await fetch(`/api/organizations/${activeOrganization?.id}/invitations`);
        const data = await res.json();
        if (res.ok && isMounted) {
          setInvitations(data.invitations || []);
        }
      } catch {
        // Silently handle
      } finally {
        if (isMounted) {
          setIsLoadingInvitations(false);
        }
      }
    }

    void fetchInvitations();
    return () => {
      isMounted = false;
    };
  }, [step, activeOrganization]);

  // Step 1: Save profile & advance
  async function handleSaveProfileAndContinue(e: React.FormEvent) {
    e.preventDefault();
    if (!activeOrganization) return;

    setIsSavingProfile(true);
    setProfileSaveError(null);

    const updates: UpdateOrganizationProfileInput = {
      business_email: businessEmail.trim() || null,
      business_phone: businessPhone.trim() || null,
      industry: industry.trim() || null,
      address_line_1: addressLine1.trim() || null,
      city: city.trim() || null,
      state_region: stateRegion.trim() || null,
      postal_code: postalCode.trim() || null,
      country_code: countryCode.trim() || null,
      website: website.trim() || null,
      timezone: timezone.trim() || "UTC",
      currency_code: currencyCode.trim() || "USD",
    };

    try {
      const res = await fetch(`/api/organizations/${activeOrganization.id}/profile`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to update profile.");
      }

      setProfile(data.profile);
      setStep(2);
    } catch (err) {
      setProfileSaveError(
        err instanceof Error ? err.message : "Failed to update profile details.",
      );
    } finally {
      setIsSavingProfile(false);
    }
  }

  // Step 2: Send Invitation
  async function handleSendInvitation(e: React.FormEvent) {
    e.preventDefault();
    if (!activeOrganization) return;

    const email = newInviteEmail.trim().toLowerCase();
    if (!email) {
      setInviteError("Please provide an email address.");
      return;
    }

    setIsSendingInvite(true);
    setInviteError(null);
    setInviteSuccessMsg(null);

    try {
      const res = await fetch(`/api/organizations/${activeOrganization.id}/invitations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          role: newInviteRole,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to create invitation.");
      }

      setInvitations((prev) => [data.invitation, ...prev]);
      setNewInviteEmail("");
      setInviteSuccessMsg(`Invitation dispatched to ${email}.`);
    } catch (err) {
      setInviteError(
        err instanceof Error ? err.message : "Failed to send invitation.",
      );
    } finally {
      setIsSendingInvite(false);
    }
  }

  // Step 2: Revoke Invitation
  async function handleRevokeInvitation(invitationId: string) {
    if (!activeOrganization) return;

    try {
      const res = await fetch(
        `/api/organizations/${activeOrganization.id}/invitations/${invitationId}/revoke`,
        { method: "POST" },
      );

      if (res.ok) {
        setInvitations((prev) =>
          prev.map((i) => (i.id === invitationId ? { ...i, status: "revoked" as const } : i)),
        );
      }
    } catch {
      // ignore error
    }
  }

  // Step 3: Complete Onboarding
  async function handleCompleteOnboarding() {
    if (!activeOrganization) return;

    setIsCompleting(true);
    setCompleteError(null);

    try {
      const res = await fetch(
        `/api/organizations/${activeOrganization.id}/onboarding/complete`,
        { method: "POST" },
      );

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to complete onboarding.");
      }

      await reload(activeOrganization.id);
      router.replace("/dashboard");
    } catch (err) {
      setCompleteError(
        err instanceof Error ? err.message : "Failed to complete workspace onboarding.",
      );
      setIsCompleting(false);
    }
  }

  if (isAuthLoading || isLoadingProfile) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-950">
        <div className="flex items-center space-x-3 rounded-lg border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <Loader2 className="h-5 w-5 animate-spin text-emerald-600" />
          <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
            Loading workspace onboarding…
          </span>
        </div>
      </div>
    );
  }

  if (profileError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4 dark:bg-slate-950">
        <div className="w-full max-w-md rounded-lg border border-red-200 bg-white p-6 shadow-sm dark:border-red-900 dark:bg-slate-900">
          <div className="flex items-center space-x-2 text-red-600">
            <AlertCircle className="h-5 w-5" />
            <h2 className="text-sm font-bold">Workspace Access Error</h2>
          </div>
          <p className="mt-2 text-xs text-slate-600 dark:text-slate-400">{profileError}</p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.location.reload()}
            className="mt-4 text-xs"
          >
            Retry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      {/* Microsoft Dynamics Dense Header */}
      <header className="border-b border-slate-200 bg-white px-6 py-3 dark:border-slate-800 dark:bg-slate-900">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="flex h-8 w-8 items-center justify-center rounded bg-emerald-700 text-white font-bold text-xs">
              <Building2 className="h-4 w-4" />
            </div>
            <div>
              <span className="text-xs font-bold text-slate-900 dark:text-slate-100">
                {activeOrganization?.name}
              </span>
              <span className="ml-2 text-[11px] text-slate-400">Workspace Onboarding Wizard</span>
            </div>
          </div>
          <div className="text-xs text-slate-500">
            Signed in as <strong>{user?.email}</strong>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="mx-auto max-w-5xl px-6 py-8">
        {/* Step Indicator */}
        <div className="mb-8 flex items-center justify-between border-b border-slate-200 pb-5 dark:border-slate-800">
          <div className="flex items-center space-x-8 text-xs font-semibold">
            <div
              className={`flex items-center space-x-2 ${
                step === 1
                  ? "text-emerald-700 dark:text-emerald-400"
                  : step > 1
                    ? "text-slate-700 dark:text-slate-300"
                    : "text-slate-400"
              }`}
            >
              <div
                className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] ${
                  step === 1
                    ? "bg-emerald-700 text-white"
                    : step > 1
                      ? "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                      : "bg-slate-100 text-slate-400 dark:bg-slate-800"
                }`}
              >
                {step > 1 ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : "1"}
              </div>
              <span>1. Organization Details</span>
            </div>

            <div
              className={`flex items-center space-x-2 ${
                step === 2
                  ? "text-emerald-700 dark:text-emerald-400"
                  : step > 2
                    ? "text-slate-700 dark:text-slate-300"
                    : "text-slate-400"
              }`}
            >
              <div
                className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] ${
                  step === 2
                    ? "bg-emerald-700 text-white"
                    : step > 2
                      ? "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                      : "bg-slate-100 text-slate-400 dark:bg-slate-800"
                }`}
              >
                {step > 2 ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : "2"}
              </div>
              <span>2. Team Invitations</span>
            </div>

            <div
              className={`flex items-center space-x-2 ${
                step === 3
                  ? "text-emerald-700 dark:text-emerald-400"
                  : "text-slate-400"
              }`}
            >
              <div
                className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] ${
                  step === 3
                    ? "bg-emerald-700 text-white"
                    : "bg-slate-100 text-slate-400 dark:bg-slate-800"
                }`}
              >
                3
              </div>
              <span>3. Review & Launch</span>
            </div>
          </div>
        </div>

        {/* STEP 1: ORGANIZATION DETAILS */}
        {step === 1 && (
          <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="mb-6">
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                Organization Profile
              </h2>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Configure your business operational parameters and regional preferences.
              </p>
            </div>

            {profileSaveError && (
              <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
                {profileSaveError}
              </div>
            )}

            <form onSubmit={handleSaveProfileAndContinue} className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Business Email
                  </label>
                  <Input
                    type="email"
                    value={businessEmail}
                    onChange={(e) => setBusinessEmail(e.target.value)}
                    placeholder="contact@company.com"
                    className="mt-1"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Business Phone
                  </label>
                  <Input
                    type="tel"
                    value={businessPhone}
                    onChange={(e) => setBusinessPhone(e.target.value)}
                    placeholder="+1 (555) 000-0000"
                    className="mt-1"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Industry Sector
                  </label>
                  <Input
                    type="text"
                    value={industry}
                    onChange={(e) => setIndustry(e.target.value)}
                    placeholder="e.g. Field Operations, Manufacturing"
                    className="mt-1"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Website URL
                  </label>
                  <Input
                    type="url"
                    value={website}
                    onChange={(e) => setWebsite(e.target.value)}
                    placeholder="https://company.com"
                    className="mt-1"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Street Address
                  </label>
                  <Input
                    type="text"
                    value={addressLine1}
                    onChange={(e) => setAddressLine1(e.target.value)}
                    placeholder="123 Industrial Parkway"
                    className="mt-1"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    City
                  </label>
                  <Input
                    type="text"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="Houston"
                    className="mt-1"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    State / Region / Province
                  </label>
                  <Input
                    type="text"
                    value={stateRegion}
                    onChange={(e) => setStateRegion(e.target.value)}
                    placeholder="Texas"
                    className="mt-1"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Postal Code
                  </label>
                  <Input
                    type="text"
                    value={postalCode}
                    onChange={(e) => setPostalCode(e.target.value)}
                    placeholder="77001"
                    className="mt-1"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Country Code (2 Letters)
                  </label>
                  <Input
                    type="text"
                    maxLength={2}
                    value={countryCode}
                    onChange={(e) => setCountryCode(e.target.value.toUpperCase())}
                    placeholder="US"
                    className="mt-1 uppercase"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Operational Timezone
                  </label>
                  <select
                    value={timezone}
                    onChange={(e) => setTimezone(e.target.value)}
                    className="mt-1 flex h-9 w-full rounded-md border border-slate-300 bg-white px-3 py-1 text-xs shadow-sm focus:border-emerald-600 focus:outline-none dark:border-slate-700 dark:bg-slate-900"
                  >
                    <option value="UTC">UTC (Coordinated Universal Time)</option>
                    <option value="America/New_York">America/New_York (EST/EDT)</option>
                    <option value="America/Chicago">America/Chicago (CST/CDT)</option>
                    <option value="America/Denver">America/Denver (MST/MDT)</option>
                    <option value="America/Los_Angeles">America/Los_Angeles (PST/PDT)</option>
                    <option value="Europe/London">Europe/London (GMT/BST)</option>
                    <option value="Europe/Paris">Europe/Paris (CET/CEST)</option>
                    <option value="Africa/Lagos">Africa/Lagos (WAT)</option>
                    <option value="Asia/Dubai">Asia/Dubai (GST)</option>
                    <option value="Asia/Singapore">Asia/Singapore (SGT)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Currency Code
                  </label>
                  <select
                    value={currencyCode}
                    onChange={(e) => setCurrencyCode(e.target.value)}
                    className="mt-1 flex h-9 w-full rounded-md border border-slate-300 bg-white px-3 py-1 text-xs shadow-sm focus:border-emerald-600 focus:outline-none dark:border-slate-700 dark:bg-slate-900"
                  >
                    <option value="USD">USD ($ - US Dollar)</option>
                    <option value="EUR">EUR (€ - Euro)</option>
                    <option value="GBP">GBP (£ - British Pound)</option>
                    <option value="CAD">CAD ($ - Canadian Dollar)</option>
                    <option value="AUD">AUD ($ - Australian Dollar)</option>
                    <option value="NGN">NGN (₦ - Nigerian Naira)</option>
                    <option value="ZAR">ZAR (R - South African Rand)</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end pt-4">
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  disabled={isSavingProfile}
                  className="bg-emerald-700 font-semibold text-white hover:bg-emerald-800"
                >
                  {isSavingProfile ? (
                    <>
                      <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                      Saving Profile…
                    </>
                  ) : (
                    <>
                      Continue to Team Invitations <ArrowRight className="ml-1 h-3.5 w-3.5" />
                    </>
                  )}
                </Button>
              </div>
            </form>
          </div>
        )}

        {/* STEP 2: TEAM INVITATIONS (OPTIONAL) */}
        {step === 2 && (
          <div className="space-y-6">
            <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="mb-4">
                <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  Invite Team Members
                </h2>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Invite managers and operational employees to your workspace. Team invitations are optional and can also be dispatched later from Workspace Settings.
                </p>
              </div>

              {inviteError && (
                <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
                  {inviteError}
                </div>
              )}

              {inviteSuccessMsg && (
                <div className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">
                  {inviteSuccessMsg}
                </div>
              )}

              {/* Add Invitation Form */}
              <form onSubmit={handleSendInvitation} className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <div className="flex-1">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Team Member Email
                  </label>
                  <Input
                    type="email"
                    value={newInviteEmail}
                    onChange={(e) => setNewInviteEmail(e.target.value)}
                    placeholder="colleague@company.com"
                    className="mt-1"
                  />
                </div>

                <div className="w-full sm:w-44">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Assigned Role
                  </label>
                  <select
                    value={newInviteRole}
                    onChange={(e) => setNewInviteRole(e.target.value as InvitationRole)}
                    className="mt-1 flex h-9 w-full rounded-md border border-slate-300 bg-white px-3 py-1 text-xs shadow-sm focus:border-emerald-600 focus:outline-none dark:border-slate-700 dark:bg-slate-900"
                  >
                    <option value="employee">Employee</option>
                    <option value="manager">Manager</option>
                  </select>
                </div>

                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  disabled={isSendingInvite || !newInviteEmail.trim()}
                  className="bg-emerald-700 font-semibold text-white hover:bg-emerald-800 shrink-0"
                >
                  {isSendingInvite ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <Plus className="mr-1 h-3.5 w-3.5" /> Send Invitation
                    </>
                  )}
                </Button>
              </form>

              {/* Sent Invitations List */}
              <div className="mt-6 border-t border-slate-100 pt-5 dark:border-slate-800">
                <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200">
                  Pending & Dispatched Invitations ({invitations.length})
                </h3>

                {isLoadingInvitations ? (
                  <div className="mt-3 flex items-center space-x-2 text-xs text-slate-500">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Loading invitations…</span>
                  </div>
                ) : invitations.length === 0 ? (
                  <p className="mt-2 text-xs italic text-slate-400">
                    No team members invited yet. You can invite colleagues now or continue to review.
                  </p>
                ) : (
                  <div className="mt-3 overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-slate-200 text-slate-500 dark:border-slate-800">
                          <th className="pb-2 font-semibold">Email</th>
                          <th className="pb-2 font-semibold">Role</th>
                          <th className="pb-2 font-semibold">Status</th>
                          <th className="pb-2 font-semibold">Expires</th>
                          <th className="pb-2 text-right font-semibold">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {invitations.map((inv) => (
                          <tr key={inv.id} className="text-slate-700 dark:text-slate-300">
                            <td className="py-2.5 font-medium">{inv.email}</td>
                            <td className="py-2.5 capitalize">{inv.role}</td>
                            <td className="py-2.5">
                              <Badge
                                variant={
                                  inv.status === "accepted"
                                    ? "success"
                                    : inv.status === "pending"
                                      ? "warning"
                                      : "default"
                                }
                                className="text-[10px]"
                              >
                                {inv.status}
                              </Badge>
                            </td>
                            <td className="py-2.5 text-slate-500">
                              {new Date(inv.expires_at).toLocaleDateString()}
                            </td>
                            <td className="py-2.5 text-right">
                              {inv.status === "pending" && (
                                <button
                                  type="button"
                                  onClick={() => void handleRevokeInvitation(inv.id)}
                                  className="text-xs font-semibold text-red-600 hover:text-red-700 hover:underline"
                                >
                                  Revoke
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>

            {/* Navigation buttons */}
            <div className="flex items-center justify-between">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setStep(1)}
                className="text-xs"
              >
                <ArrowLeft className="mr-1 h-3.5 w-3.5" /> Back to Profile
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => setStep(3)}
                className="bg-emerald-700 font-semibold text-white hover:bg-emerald-800 text-xs"
              >
                Continue to Final Review <ArrowRight className="ml-1 h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )}

        {/* STEP 3: REVIEW & LAUNCH */}
        {step === 3 && (
          <div className="space-y-6">
            <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="mb-6">
                <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  Ready to Launch {activeOrganization?.name}
                </h2>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Review your configured parameters before completing workspace initialization.
                </p>
              </div>

              {completeError && (
                <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
                  {completeError}
                </div>
              )}

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 text-xs">
                <div className="rounded-md border border-slate-100 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-800/40">
                  <span className="font-semibold text-slate-500">Business Name</span>
                  <p className="mt-1 font-bold text-slate-900 dark:text-slate-100 text-sm">
                    {activeOrganization?.name}
                  </p>
                  <span className="mt-3 block font-semibold text-slate-500">Slug / Identifier</span>
                  <p className="mt-0.5 text-slate-700 dark:text-slate-300 font-mono text-[11px]">
                    {activeOrganization?.slug}
                  </p>
                </div>

                <div className="rounded-md border border-slate-100 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-800/40">
                  <span className="font-semibold text-slate-500">Operational Region</span>
                  <p className="mt-1 text-slate-800 dark:text-slate-200">
                    Timezone: <strong>{timezone}</strong>
                  </p>
                  <p className="mt-0.5 text-slate-800 dark:text-slate-200">
                    Currency: <strong>{currencyCode}</strong>
                  </p>
                  <p className="mt-0.5 text-slate-800 dark:text-slate-200">
                    Industry: <strong>{industry || "Not specified"}</strong>
                  </p>
                </div>

                <div className="rounded-md border border-slate-100 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-800/40 sm:col-span-2">
                  <span className="font-semibold text-slate-500">Team Status</span>
                  <p className="mt-1 text-slate-800 dark:text-slate-200">
                    {invitations.length === 0
                      ? "No initial team invitations sent. You can invite colleagues anytime from settings."
                      : `${invitations.length} team invitation(s) pending dispatch.`}
                  </p>
                </div>
              </div>

              <div className="mt-8 border-t border-slate-100 pt-5 dark:border-slate-800">
                <div className="flex items-center justify-between">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setStep(2)}
                    className="text-xs"
                  >
                    <ArrowLeft className="mr-1 h-3.5 w-3.5" /> Back to Team Invites
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    disabled={isCompleting}
                    onClick={() => void handleCompleteOnboarding()}
                    className="bg-emerald-700 font-semibold text-white hover:bg-emerald-800 text-xs px-5 py-2"
                  >
                    {isCompleting ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Completing Onboarding…
                      </>
                    ) : (
                      <>
                        Complete Setup & Launch Workspace <ArrowRight className="ml-1 h-3.5 w-3.5" />
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
