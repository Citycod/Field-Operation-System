import { OptionItem } from './fields';

/**
 * Derives a clean, semantic, stable key from a user-entered display label.
 * Example: "Office Supplies" -> "office_supplies"
 */
export function slugifyOptionKey(label: string): string {
  if (!label || typeof label !== 'string') {
    return 'option';
  }
  const normalized = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

  return normalized || 'option';
}

/**
 * Normalizes an option item ensuring immutable key and display label are cleanly separated.
 * Backward compatible with legacy { label, value } options.
 */
export function normalizeOptionItem(
  raw: unknown,
  existingOptionsOrFallback?: readonly OptionItem[] | unknown,
): OptionItem {
  const existingOptions: readonly OptionItem[] = Array.isArray(existingOptionsOrFallback)
    ? existingOptionsOrFallback
    : [];

  if (typeof raw === 'string') {
    const label = raw.trim();
    const key = generateUniqueOptionKey(label, existingOptions);
    return { key, value: key, label };
  }

  if (raw && typeof raw === 'object') {
    const item = raw as Record<string, unknown>;
    const label = typeof item.label === 'string' ? item.label.trim() : '';

    let key = typeof item.key === 'string' && item.key.trim().length > 0 ? item.key.trim() : '';
    if (!key) {
      if (typeof item.value === 'string' && item.value.trim().length > 0) {
        key = item.value.trim();
      } else {
        key = generateUniqueOptionKey(label, existingOptions);
      }
    }

    const value = typeof item.value === 'string' && item.value.trim().length > 0 ? item.value.trim() : key;
    const description = typeof item.description === 'string' ? item.description.trim() : undefined;

    return {
      key,
      value,
      label,
      description,
    };
  }

  const fallbackKey = 'option';
  return { key: fallbackKey, value: fallbackKey, label: '' };
}

/**
 * Generates an immutable option key that is unique within the given options list.
 */
export function generateUniqueOptionKey(
  label: string,
  existingOptions: readonly OptionItem[] = [],
): string {
  const baseKey = slugifyOptionKey(label);
  const optionsList = Array.isArray(existingOptions) ? existingOptions : [];
  const existingKeys = new Set(optionsList.map((o) => o?.key || o?.value).filter(Boolean));

  if (!existingKeys.has(baseKey)) {
    return baseKey;
  }

  let counter = 1;
  while (existingKeys.has(`${baseKey}_${counter}`)) {
    counter++;
  }
  return `${baseKey}_${counter}`;
}

/**
 * Resolves a stored submission value to its corresponding presentation display label.
 * Safely handles:
 * - New submissions storing stable keys (matched via o.key or o.value)
 * - Historical submissions storing legacy values or labels
 * - Fallback to string representation if option was removed
 */
export function resolveOptionLabel(
  options: readonly OptionItem[] | undefined,
  storedValue: unknown,
): string {
  if (storedValue === null || storedValue === undefined || storedValue === '') {
    return '';
  }

  const strVal = String(storedValue);
  if (!options || options.length === 0) {
    return strVal;
  }

  // 1. Match against key or value (preferred)
  const matchedByKeyOrValue = options.find((o) => o.key === strVal || o.value === strVal);
  if (matchedByKeyOrValue) {
    return matchedByKeyOrValue.label;
  }

  // 2. Fallback match against historical label
  const matchedByLabel = options.find((o) => o.label === strVal);
  if (matchedByLabel) {
    return matchedByLabel.label;
  }

  // 3. Fallback to stored string
  return strVal;
}
