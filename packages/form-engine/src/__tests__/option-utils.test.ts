import { describe, it, expect } from 'vitest';
import {
  slugifyOptionKey,
  normalizeOptionItem,
  generateUniqueOptionKey,
  resolveOptionLabel,
} from '../schema/option-utils';
import type { OptionItem } from '../schema/fields';

describe('Option Utilities', () => {
  describe('slugifyOptionKey', () => {
    it('converts display labels into snake_case keys', () => {
      expect(slugifyOptionKey('Office Supplies')).toBe('office_supplies');
      expect(slugifyOptionKey('Computers & Laptops')).toBe('computers_laptops');
      expect(slugifyOptionKey('  Maintenance -- 24/7  ')).toBe('maintenance_24_7');
      expect(slugifyOptionKey('IT Equipment!')).toBe('it_equipment');
    });

    it('handles non-alphanumeric or empty input safely', () => {
      expect(slugifyOptionKey('')).toBe('option');
      expect(slugifyOptionKey('   ')).toBe('option');
      expect(slugifyOptionKey('---')).toBe('option');
    });
  });

  describe('normalizeOptionItem', () => {
    it('normalizes legacy option with only label and value', () => {
      const item: OptionItem = { label: 'Office Supplies', value: 'office_supplies' };
      const normalized = normalizeOptionItem(item);
      expect(normalized).toEqual({
        key: 'office_supplies',
        value: 'office_supplies',
        label: 'Office Supplies',
        description: undefined,
      });
    });

    it('preserves immutable key when present even if label or value differs', () => {
      const item: OptionItem = {
        key: 'office_supplies',
        value: 'office_supplies',
        label: 'Office Supply Renamed',
      };
      const normalized = normalizeOptionItem(item);
      expect(normalized.key).toBe('office_supplies');
      expect(normalized.label).toBe('Office Supply Renamed');
    });

    it('generates fallback key from label when key and value are missing', () => {
      const item = { label: 'New Category' } as OptionItem;
      const normalized = normalizeOptionItem(item);
      expect(normalized.key).toBe('new_category');
      expect(normalized.value).toBe('new_category');
      expect(normalized.label).toBe('New Category');
    });
  });

  describe('generateUniqueOptionKey', () => {
    it('generates a unique key if name already exists in options', () => {
      const existing: OptionItem[] = [
        { key: 'supplies', value: 'supplies', label: 'Supplies' },
        { key: 'supplies_1', value: 'supplies_1', label: 'Supplies 1' },
      ];
      const newKey = generateUniqueOptionKey('Supplies', existing);
      expect(newKey).toBe('supplies_2');
    });

    it('returns base slug if not in existing options', () => {
      const existing: OptionItem[] = [
        { key: 'supplies', value: 'supplies', label: 'Supplies' },
      ];
      const newKey = generateUniqueOptionKey('Hardware', existing);
      expect(newKey).toBe('hardware');
    });
  });

  describe('resolveOptionLabel', () => {
    const options: OptionItem[] = [
      { key: 'office_supplies', value: 'office_supplies', label: 'Office Supplies' },
      { key: 'computers', value: 'computers', label: 'Computers & Hardware' },
    ];

    it('resolves label by exact key match', () => {
      expect(resolveOptionLabel(options, 'office_supplies')).toBe('Office Supplies');
    });

    it('resolves label by value match if key is absent or legacy', () => {
      const legacyOptions: OptionItem[] = [
        { value: 'legacy_val', label: 'Legacy Option' },
      ];
      expect(resolveOptionLabel(legacyOptions, 'legacy_val')).toBe('Legacy Option');
    });

    it('matches historical label if stored value was label', () => {
      expect(resolveOptionLabel(options, 'Office Supplies')).toBe('Office Supplies');
    });

    it('returns string value itself as fallback if option not found', () => {
      expect(resolveOptionLabel(options, 'unknown_key')).toBe('unknown_key');
      expect(resolveOptionLabel(options, '')).toBe('');
      expect(resolveOptionLabel(undefined, 'test')).toBe('test');
    });

    it('preserves historical key resolution when display label is renamed', () => {
      const updatedOptions: OptionItem[] = [
        { key: 'office_supplies', value: 'office_supplies', label: 'Office Supply New' },
      ];
      // Historical submission with canonical key resolves to new label
      expect(resolveOptionLabel(updatedOptions, 'office_supplies')).toBe('Office Supply New');
    });

    it('safely falls back to raw key when an option is deleted', () => {
      const remainingOptions: OptionItem[] = [
        { key: 'computers', value: 'computers', label: 'Computers' },
      ];
      expect(resolveOptionLabel(remainingOptions, 'office_supplies')).toBe('office_supplies');
    });

    it('preserves option identities when options are reordered', () => {
      const optA: OptionItem = { key: 'a', value: 'a', label: 'Option A' };
      const optB: OptionItem = { key: 'b', value: 'b', label: 'Option B' };
      const reordered = [optB, optA];
      expect(resolveOptionLabel(reordered, 'a')).toBe('Option A');
      expect(resolveOptionLabel(reordered, 'b')).toBe('Option B');
    });
  });
});
