import { describe, expect, it } from 'vitest';
import { isBusinessSignupPage, isProtectedPage, isPublicPage, safePostLoginPath } from '../route-policy';

describe('authentication route policy', () => {
  it('keeps only the login page public', () => {
    expect(isPublicPage('/login')).toBe(true);
    expect(isProtectedPage('/')).toBe(true);
    expect(isProtectedPage('/dashboard')).toBe(true);
    expect(isProtectedPage('/forms')).toBe(true);
    expect(isProtectedPage('/forms/new')).toBe(true);
    expect(isProtectedPage('/forms/form-1/builder')).toBe(true);
    expect(isProtectedPage('/approvals')).toBe(true);
    expect(isProtectedPage('/administration')).toBe(true);
  });

  it('allows public and authenticated access to business signup without requiring login', () => {
    expect(isBusinessSignupPage('/business/signup')).toBe(true);
    expect(isProtectedPage('/business/signup')).toBe(false);
    expect(isPublicPage('/business/signup')).toBe(false);
    expect(isProtectedPage('/auth/callback')).toBe(false);
  });

  it('leaves API authorization to API handlers and dev fixtures outside production policy', () => {
    expect(isProtectedPage('/api/forms')).toBe(false);
    expect(isProtectedPage('/dev/form-builder')).toBe(false);
  });

  it('accepts an internal protected next path', () => {
    expect(safePostLoginPath('/forms/form-1/builder?mode=preview')).toBe(
      '/forms/form-1/builder?mode=preview',
    );
  });

  it('accepts business signup as post-login destination', () => {
    expect(safePostLoginPath('/business/signup')).toBe('/business/signup');
  });

  it('rejects external, protocol-relative, public, and malformed next paths', () => {
    expect(safePostLoginPath('https://attacker.example')).toBe('/dashboard');
    expect(safePostLoginPath('//attacker.example/path')).toBe('/dashboard');
    expect(safePostLoginPath('/login')).toBe('/dashboard');
    expect(safePostLoginPath(undefined)).toBe('/dashboard');
  });
});
