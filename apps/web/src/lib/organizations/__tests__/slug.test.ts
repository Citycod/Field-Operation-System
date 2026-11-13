import { describe, expect, it } from 'vitest';
import { generateSlug, validateSlug, RESERVED_SLUGS } from '../slug';

describe('Organization Slug Utilities', () => {
  it('generates clean kebab-case slugs from business names', () => {
    expect(generateSlug('Acme Corporation')).toBe('acme-corporation');
    expect(generateSlug('  Alpha & Beta Services, Inc.  ')).toBe('alpha-beta-services-inc');
    expect(generateSlug('Energy_Solutions 2026!')).toBe('energy-solutions-2026');
  });

  it('handles edge cases and fallback in slug generation', () => {
    expect(generateSlug('')).toBe('workspace');
    expect(generateSlug('---')).toBe('workspace');
    expect(generateSlug('!!!')).toBe('workspace');
    expect(generateSlug('a'.repeat(80)).length).toBeLessThanOrEqual(50);
  });

  it('validates correct and incorrect slugs', () => {
    expect(validateSlug('acme-corp')).toBeNull();
    expect(validateSlug('oil-and-gas-123')).toBeNull();

    expect(validateSlug('')).toBe('Workspace identifier is required.');
    expect(validateSlug('a')).toBe('Workspace identifier must be at least 2 characters.');
    expect(validateSlug('a'.repeat(51))).toBe('Workspace identifier must not exceed 50 characters.');
    expect(validateSlug('-invalid-start')).toBe(
      'Must contain only lowercase letters, numbers, and single hyphens (cannot start or end with a hyphen).',
    );
    expect(validateSlug('invalid-end-')).toBe(
      'Must contain only lowercase letters, numbers, and single hyphens (cannot start or end with a hyphen).',
    );
    expect(validateSlug('has spaces')).toBe(
      'Must contain only lowercase letters, numbers, and single hyphens (cannot start or end with a hyphen).',
    );
  });

  it('rejects reserved platform slugs', () => {
    for (const reserved of Array.from(RESERVED_SLUGS)) {
      expect(validateSlug(reserved)).toContain('reserved system identifier');
    }
  });
});

