import { beforeEach, describe, expect, it } from 'vitest';
import {
  saveBusinessSignupDraft,
  loadBusinessSignupDraft,
  clearBusinessSignupDraft,
  DRAFT_STORAGE_KEY,
  MAX_DRAFT_AGE_MS,
} from '../signup-draft';

describe('Business Signup Draft Persistence (sessionStorage)', () => {
  const mockStorage: Record<string, string> = {};

  beforeEach(() => {
    // Scaffold window.sessionStorage
    for (const key of Object.keys(mockStorage)) {
      delete mockStorage[key];
    }

    Object.defineProperty(globalThis, 'window', {
      value: {
        sessionStorage: {
          getItem: (key: string) => mockStorage[key] ?? null,
          setItem: (key: string, value: string) => {
            mockStorage[key] = value;
          },
          removeItem: (key: string) => {
            delete mockStorage[key];
          },
        },
      },
      writable: true,
      configurable: true,
    });
  });

  it('saves non-sensitive business draft without passwords or auth tokens', () => {
    saveBusinessSignupDraft({
      accountEmail: 'owner@apex.example',
      businessName: 'Apex Energy Services',
      slug: 'apex-energy-services',
      businessPhone: '+1 555-0100',
      industry: 'Utilities',
      countryCode: 'US',
      website: 'https://apex.example',
    });

    const raw = mockStorage[DRAFT_STORAGE_KEY];
    expect(raw).toBeDefined();

    const parsed = JSON.parse(raw);
    expect(parsed.accountEmail).toBe('owner@apex.example');
    expect(parsed.businessName).toBe('Apex Energy Services');
    expect(parsed.slug).toBe('apex-energy-services');
    expect(parsed.industry).toBe('Utilities');

    // Crucial security invariant: never store credentials or tokens
    expect(parsed.password).toBeUndefined();
    expect(parsed.access_token).toBeUndefined();
    expect(parsed.token).toBeUndefined();
    expect(parsed.role).toBeUndefined();
  });

  it('restores draft matching the authenticated account email', () => {
    saveBusinessSignupDraft({
      accountEmail: 'owner@apex.example',
      businessName: 'Apex Energy Services',
      slug: 'apex-energy-services',
      industry: 'Utilities',
    });

    const draft = loadBusinessSignupDraft('owner@apex.example');
    expect(draft).not.toBeNull();
    expect(draft?.businessName).toBe('Apex Energy Services');
    expect(draft?.slug).toBe('apex-energy-services');
    expect(draft?.industry).toBe('Utilities');
  });

  it('discards and clears draft if user signs in with a different account email', () => {
    saveBusinessSignupDraft({
      accountEmail: 'original.owner@apex.example',
      businessName: 'Apex Energy Services',
      slug: 'apex-energy-services',
    });

    // Another user account is active
    const draft = loadBusinessSignupDraft('different.user@other.example');
    expect(draft).toBeNull();
    expect(mockStorage[DRAFT_STORAGE_KEY]).toBeUndefined();
  });

  it('discards expired drafts', () => {
    const expiredPayload = {
      accountEmail: 'owner@apex.example',
      businessName: 'Apex Energy Services',
      slug: 'apex-energy-services',
      savedAt: Date.now() - (MAX_DRAFT_AGE_MS + 1000), // expired
    };
    mockStorage[DRAFT_STORAGE_KEY] = JSON.stringify(expiredPayload);

    const draft = loadBusinessSignupDraft('owner@apex.example');
    expect(draft).toBeNull();
    expect(mockStorage[DRAFT_STORAGE_KEY]).toBeUndefined();
  });

  it('discards malformed or corrupted drafts', () => {
    mockStorage[DRAFT_STORAGE_KEY] = 'not-valid-json';
    expect(loadBusinessSignupDraft('owner@apex.example')).toBeNull();
    expect(mockStorage[DRAFT_STORAGE_KEY]).toBeUndefined();
  });

  it('clears draft explicitly upon successful provisioning', () => {
    saveBusinessSignupDraft({
      accountEmail: 'owner@apex.example',
      businessName: 'Apex Energy Services',
      slug: 'apex-energy-services',
    });
    expect(mockStorage[DRAFT_STORAGE_KEY]).toBeDefined();

    clearBusinessSignupDraft();
    expect(mockStorage[DRAFT_STORAGE_KEY]).toBeUndefined();
  });
});

