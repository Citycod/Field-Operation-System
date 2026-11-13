export const RESERVED_SLUGS = new Set([
  'admin',
  'api',
  'app',
  'auth',
  'dashboard',
  'dev',
  'login',
  'onboarding',
  'platform',
  'public',
  'system',
]);

export const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{0,48}[a-z0-9]$/;

export function generateSlug(name: string): string {
  const normalized = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);

  return normalized || 'workspace';
}

export function validateSlug(slug: string): string | null {
  const normalized = slug.trim().toLowerCase();
  if (!normalized) {
    return 'Workspace identifier is required.';
  }
  if (normalized.length < 2) {
    return 'Workspace identifier must be at least 2 characters.';
  }
  if (normalized.length > 50) {
    return 'Workspace identifier must not exceed 50 characters.';
  }
  if (!SLUG_PATTERN.test(normalized)) {
    return 'Must contain only lowercase letters, numbers, and single hyphens (cannot start or end with a hyphen).';
  }
  if (RESERVED_SLUGS.has(normalized)) {
    return `"${normalized}" is a reserved system identifier.`;
  }
  return null;
}

