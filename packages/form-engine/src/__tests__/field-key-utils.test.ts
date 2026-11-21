import { describe, expect, it } from 'vitest';
import {
  slugifyFieldKey,
  generateUniqueFieldKey,
  validateFieldKey,
  isDefaultPlaceholderKey,
} from '../schema/field-key-utils';

describe('Field Key Utilities', () => {
  describe('slugifyFieldKey', () => {
    it('converts labels to lowercase alphanumeric underscores with collapsed repeats', () => {
      expect(slugifyFieldKey('Estimated Cost')).toBe('estimated_cost');
      expect(slugifyFieldKey('Unit Price ($ USD)')).toBe('unit_price_usd');
      expect(slugifyFieldKey('  Maintenance -- 24/7  ')).toBe('maintenance_24_7');
      expect(slugifyFieldKey('special__characters...here')).toBe('special_characters_here');
    });

    it('prefixes slugs starting with digits with field_', () => {
      expect(slugifyFieldKey('123 Quantity')).toBe('field_123_quantity');
      expect(slugifyFieldKey('2024 Budget')).toBe('field_2024_budget');
      expect(slugifyFieldKey('1st Choice')).toBe('field_1st_choice');
    });

    it('prefixes JS reserved words with field_', () => {
      expect(slugifyFieldKey('for')).toBe('field_for');
      expect(slugifyFieldKey('return')).toBe('field_return');
      expect(slugifyFieldKey('default')).toBe('field_default');
      expect(slugifyFieldKey('class')).toBe('field_class');
      expect(slugifyFieldKey('null')).toBe('field_null');
      expect(slugifyFieldKey('delete')).toBe('field_delete');
    });

    it('prefixes formula engine keywords with field_', () => {
      expect(slugifyFieldKey('sum')).toBe('field_sum');
      expect(slugifyFieldKey('avg')).toBe('field_avg');
      expect(slugifyFieldKey('count')).toBe('field_count');
      expect(slugifyFieldKey('min')).toBe('field_min');
      expect(slugifyFieldKey('max')).toBe('field_max');
    });

    it('handles empty or whitespace-only labels gracefully', () => {
      expect(slugifyFieldKey('')).toBe('field');
      expect(slugifyFieldKey('   ')).toBe('field');
      expect(slugifyFieldKey('---')).toBe('field');
      expect(slugifyFieldKey('___')).toBe('field');
    });
  });

  describe('generateUniqueFieldKey', () => {
    it('returns base slug when there is no collision', () => {
      expect(generateUniqueFieldKey('Estimated Cost', [])).toBe('estimated_cost');
      expect(generateUniqueFieldKey('Quantity', ['other_field'])).toBe('quantity');
    });

    it('enforces uniqueness on collision with auto-suffix _2, _3', () => {
      const existing = ['estimated_cost'];
      // "Estimated Cost" and "Estimated cost" produce collision
      const key2 = generateUniqueFieldKey('Estimated cost', existing);
      expect(key2).toBe('estimated_cost_2');

      const existingWith2 = [...existing, key2];
      const key3 = generateUniqueFieldKey('ESTIMATED COST', existingWith2);
      expect(key3).toBe('estimated_cost_3');
    });

    it('handles collisions with digit-leading and reserved labels', () => {
      expect(generateUniqueFieldKey('123 Items', ['field_123_items'])).toBe('field_123_items_2');
      expect(generateUniqueFieldKey('sum', ['field_sum'])).toBe('field_sum_2');
    });
  });

  describe('isDefaultPlaceholderKey', () => {
    it('identifies system default placeholder keys', () => {
      expect(isDefaultPlaceholderKey('text')).toBe(true);
      expect(isDefaultPlaceholderKey('text_2')).toBe(true);
      expect(isDefaultPlaceholderKey('number_1')).toBe(true);
      expect(isDefaultPlaceholderKey('column_3')).toBe(true);
      expect(isDefaultPlaceholderKey('field')).toBe(true);
      expect(isDefaultPlaceholderKey('field_5')).toBe(true);
    });

    it('identifies custom user-generated keys as non-placeholders', () => {
      expect(isDefaultPlaceholderKey('estimated_cost')).toBe(false);
      expect(isDefaultPlaceholderKey('quantity')).toBe(false);
      expect(isDefaultPlaceholderKey('unit_price')).toBe(false);
      expect(isDefaultPlaceholderKey('department')).toBe(false);
    });
  });

  describe('validateFieldKey', () => {
    it('accepts valid lowercase alphanumeric keys', () => {
      expect(validateFieldKey('estimated_cost').valid).toBe(true);
      expect(validateFieldKey('quantity_1').valid).toBe(true);
      expect(validateFieldKey('unit_price_usd').valid).toBe(true);
    });

    it('rejects empty or whitespace keys', () => {
      expect(validateFieldKey('').valid).toBe(false);
      expect(validateFieldKey('   ').valid).toBe(false);
    });

    it('rejects keys starting with digits or uppercase', () => {
      expect(validateFieldKey('123field').valid).toBe(false);
      expect(validateFieldKey('EstimatedCost').valid).toBe(false);
      expect(validateFieldKey('field-name').valid).toBe(false); // hyphens not allowed in formula identifiers
    });

    it('rejects reserved words', () => {
      expect(validateFieldKey('return').valid).toBe(false);
      expect(validateFieldKey('sum').valid).toBe(false);
      expect(validateFieldKey('delete').valid).toBe(false);
    });

    it('rejects duplicate keys across form', () => {
      const res = validateFieldKey('quantity', ['quantity', 'price'], 'price');
      expect(res.valid).toBe(false);
      expect(res.error).toContain('already in use');

      // But permits keeping the current field key unchanged
      const sameKey = validateFieldKey('quantity', ['quantity', 'price'], 'quantity');
      expect(sameKey.valid).toBe(true);
    });
  });
});

