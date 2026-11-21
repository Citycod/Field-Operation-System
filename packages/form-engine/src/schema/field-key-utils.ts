/**
 * Field Key Utilities
 * Provides deterministic key generation, slugification, reserved word guards,
 * and uniqueness enforcement for form fields across client and server.
 */

export const JS_RESERVED_WORDS: ReadonlySet<string> = new Set([
  'break',
  'case',
  'catch',
  'class',
  'const',
  'continue',
  'debugger',
  'default',
  'delete',
  'do',
  'else',
  'enum',
  'export',
  'extends',
  'false',
  'finally',
  'for',
  'function',
  'if',
  'import',
  'in',
  'instanceof',
  'let',
  'new',
  'null',
  'return',
  'super',
  'switch',
  'this',
  'throw',
  'true',
  'try',
  'typeof',
  'undefined',
  'var',
  'void',
  'while',
  'with',
  'yield',
  'nan',
  'infinity',
  'static',
  'implements',
  'interface',
  'package',
  'private',
  'protected',
  'public',
  'constructor',
  'prototype',
  '__proto__',
]);

export const FORMULA_RESERVED_KEYWORDS: ReadonlySet<string> = new Set([
  'sum',
  'avg',
  'min',
  'max',
  'count',
  'round',
  'floor',
  'ceil',
  'abs',
  'and',
  'or',
  'not',
  'sqrt',
  'pow',
  'mod',
]);

const DEFAULT_TYPE_SLUGS = new Set([
  'text',
  'long_text',
  'number',
  'currency',
  'date',
  'dropdown',
  'checkbox',
  'lookup',
  'file',
  'calculated',
  'column',
  'field',
  'item',
]);

/**
 * Checks whether an existing key is a system default placeholder key
 * (e.g. "text", "number_2", "column_1", "field_3").
 */
export function isDefaultPlaceholderKey(key: string): boolean {
  if (!key) return true;
  const match = /^([a-z0-9_]+?)(?:_(\d+))?$/.exec(key.trim().toLowerCase());
  if (!match) return false;
  const base = match[1];
  return DEFAULT_TYPE_SLUGS.has(base);
}

/**
 * Slugifies a human label into a clean, safe machine key.
 * Rules:
 * - Lowercase
 * - Non-alphanumerics become underscores
 * - Collapse repeated underscores
 * - Trim leading/trailing underscores
 * - If empty -> 'field'
 * - If starts with a digit -> prefix with 'field_'
 * - If matches JS or formula engine reserved words -> prefix with 'field_'
 */
export function slugifyFieldKey(label: string): string {
  if (!label || typeof label !== 'string') {
    return 'field';
  }

  let slug = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');

  if (!slug) {
    return 'field';
  }

  // If slug starts with a digit, prefix with 'field_'
  if (/^[0-9]/.test(slug)) {
    slug = `field_${slug}`;
  }

  // Reject/prefix reserved words
  if (JS_RESERVED_WORDS.has(slug) || FORMULA_RESERVED_KEYWORDS.has(slug)) {
    slug = `field_${slug}`;
  }

  return slug;
}

/**
 * Generates a unique machine key per form.
 * On collision, auto-suffixes (_2, _3, ...).
 */
export function generateUniqueFieldKey(
  label: string,
  existingKeys: Iterable<string>,
): string {
  const base = slugifyFieldKey(label);
  const used = new Set(existingKeys);

  if (!used.has(base)) {
    return base;
  }

  let index = 2;
  while (used.has(`${base}_${index}`)) {
    index += 1;
  }
  return `${base}_${index}`;
}

/**
 * Validates a user-supplied field key.
 */
export function validateFieldKey(
  key: string,
  existingKeys?: Iterable<string>,
  currentFieldKey?: string,
): { valid: boolean; error?: string } {
  if (!key || typeof key !== 'string' || !key.trim()) {
    return { valid: false, error: 'Field key cannot be empty.' };
  }

  const trimmed = key.trim();

  if (!/^[a-z][a-z0-9_]*$/.test(trimmed)) {
    return {
      valid: false,
      error: 'Key must start with a lowercase letter and contain only lowercase letters, numbers, and underscores.',
    };
  }

  if (JS_RESERVED_WORDS.has(trimmed) || FORMULA_RESERVED_KEYWORDS.has(trimmed)) {
    return {
      valid: false,
      error: `"${trimmed}" is a reserved word and cannot be used as a field key.`,
    };
  }

  if (existingKeys) {
    const used = new Set(existingKeys);
    if (currentFieldKey) {
      used.delete(currentFieldKey);
    }
    if (used.has(trimmed)) {
      return {
        valid: false,
        error: `Field key "${trimmed}" is already in use on this form.`,
      };
    }
  }

  return { valid: true };
}

