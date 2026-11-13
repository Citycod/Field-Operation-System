export interface BusinessSignupDraft {
  accountEmail: string;
  businessName: string;
  slug: string;
  businessPhone?: string;
  industry?: string;
  countryCode?: string;
  website?: string;
  savedAt: number;
}

export const DRAFT_STORAGE_KEY = 'fieldops.business_signup_draft';
export const MAX_DRAFT_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Saves a non-sensitive business signup draft to sessionStorage.
 * Passwords, tokens, and authorization claims are NEVER persisted.
 */
export function saveBusinessSignupDraft(draft: {
  accountEmail: string;
  businessName: string;
  slug: string;
  businessPhone?: string;
  industry?: string;
  countryCode?: string;
  website?: string;
}): void {
  if (typeof window === 'undefined' || !window.sessionStorage) return;

  try {
    const payload: BusinessSignupDraft = {
      accountEmail: draft.accountEmail.trim().toLowerCase(),
      businessName: draft.businessName.trim(),
      slug: draft.slug.trim().toLowerCase(),
      businessPhone: draft.businessPhone?.trim() || undefined,
      industry: draft.industry?.trim() || undefined,
      countryCode: draft.countryCode?.trim() || undefined,
      website: draft.website?.trim() || undefined,
      savedAt: Date.now(),
    };
    window.sessionStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Ignore storage quota or privacy mode errors
  }
}

/**
 * Loads and validates a saved business signup draft from sessionStorage.
 * If accountEmail is provided, verifies that the draft belongs to the same email.
 * Clears and discards invalid, expired, or mismatched drafts.
 */
export function loadBusinessSignupDraft(accountEmail?: string | null): BusinessSignupDraft | null {
  if (typeof window === 'undefined' || !window.sessionStorage) return null;

  try {
    const raw = window.sessionStorage.getItem(DRAFT_STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<BusinessSignupDraft>;
    if (!parsed || typeof parsed !== 'object') {
      clearBusinessSignupDraft();
      return null;
    }

    // Check expiration
    if (!parsed.savedAt || typeof parsed.savedAt !== 'number' || Date.now() - parsed.savedAt > MAX_DRAFT_AGE_MS) {
      clearBusinessSignupDraft();
      return null;
    }

    // If an account email is provided (e.g. authenticated user), ensure it matches
    if (accountEmail && accountEmail.trim()) {
      const currentEmail = accountEmail.trim().toLowerCase();
      const draftEmail = parsed.accountEmail?.trim().toLowerCase();
      if (draftEmail && draftEmail !== currentEmail) {
        clearBusinessSignupDraft();
        return null;
      }
    }

    // Validate required fields
    if (!parsed.businessName || typeof parsed.businessName !== 'string' || parsed.businessName.trim().length < 2) {
      clearBusinessSignupDraft();
      return null;
    }

    if (!parsed.slug || typeof parsed.slug !== 'string') {
      clearBusinessSignupDraft();
      return null;
    }

    return {
      accountEmail: parsed.accountEmail || '',
      businessName: parsed.businessName.trim().slice(0, 100),
      slug: parsed.slug.trim().toLowerCase().slice(0, 60),
      businessPhone: typeof parsed.businessPhone === 'string' ? parsed.businessPhone.trim().slice(0, 50) : undefined,
      industry: typeof parsed.industry === 'string' ? parsed.industry.trim().slice(0, 100) : undefined,
      countryCode: typeof parsed.countryCode === 'string' ? parsed.countryCode.trim().slice(0, 10) : undefined,
      website: typeof parsed.website === 'string' ? parsed.website.trim().slice(0, 200) : undefined,
      savedAt: parsed.savedAt,
    };
  } catch {
    clearBusinessSignupDraft();
    return null;
  }
}

/**
 * Removes the business signup draft from sessionStorage.
 */
export function clearBusinessSignupDraft(): void {
  if (typeof window === 'undefined' || !window.sessionStorage) return;
  try {
    window.sessionStorage.removeItem(DRAFT_STORAGE_KEY);
  } catch {
    // Ignore
  }
}

