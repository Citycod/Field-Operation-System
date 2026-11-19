import { describe, it, expect } from 'vitest';
import {
  tokenizeFormula,
  parseFormula,
  evaluateFormula,
  extractFormulaFieldReferences,
  refactorFormulaIdentifier,
  safeRound,
} from '../rules/formula-evaluator';

describe('Formula Evaluator Engine', () => {
  describe('tokenizeFormula', () => {
    it('tokenizes identifiers, numbers, operators and parentheses', () => {
      const { tokens, errors } = tokenizeFormula('(quantity * unit_price) + 5.50');
      expect(errors).toHaveLength(0);
      expect(tokens.map((t) => t.type)).toEqual([
        'LPAREN',
        'IDENTIFIER',
        'MULTIPLY',
        'IDENTIFIER',
        'RPAREN',
        'PLUS',
        'NUMBER',
        'EOF',
      ]);
    });

    it('flags error for unexpected/unsupported characters like $ or %', () => {
      const res1 = tokenizeFormula('100 + $50');
      expect(res1.errors.length).toBeGreaterThan(0);
      expect(res1.errors[0]).toContain("Invalid character '$'");

      const res2 = tokenizeFormula('100 * 5%');
      expect(res2.errors.length).toBeGreaterThan(0);
      expect(res2.errors[0]).toContain("Invalid character '%'");
    });
  });

  describe('parseFormula', () => {
    it('parses valid expressions into AST', () => {
      const res = parseFormula('(a + b) * c');
      expect(res.errors).toHaveLength(0);
      expect(res.ast).toBeDefined();
      expect(res.ast?.type).toBe('binary');
      expect(res.fieldReferences).toEqual(['a', 'b', 'c']);
    });

    it('rejects empty or whitespace-only expressions', () => {
      const res1 = parseFormula('');
      expect(res1.ast).toBeNull();
      expect(res1.errors[0]).toMatch(/empty/i);

      const res2 = parseFormula('   ');
      expect(res2.ast).toBeNull();
      expect(res2.errors[0]).toMatch(/empty/i);
    });

    it('rejects unbalanced parentheses', () => {
      const res1 = parseFormula('(a + b');
      expect(res1.ast).toBeNull();
      expect(res1.errors[0]).toMatch(/closing '\)'/i);

      const res2 = parseFormula('a + b)');
      expect(res2.ast).toBeNull();
      expect(res2.errors[0]).toContain('Unexpected extra tokens');
    });

    it('rejects consecutive operators or dangling operators', () => {
      const res1 = parseFormula('a + * b');
      expect(res1.ast).toBeNull();
      expect(res1.errors.length).toBeGreaterThan(0);

      const res2 = parseFormula('a + ');
      expect(res2.ast).toBeNull();
      expect(res2.errors[0]).toContain('Unexpected end of formula');
    });
  });

  describe('evaluateFormula', () => {
    it('evaluates basic arithmetic adhering to operator precedence', () => {
      expect(evaluateFormula('2 + 3 * 4', {}).value).toBe(14);
      expect(evaluateFormula('(2 + 3) * 4', {}).value).toBe(20);
      expect(evaluateFormula('10 - 4 - 2', {}).value).toBe(4);
      expect(evaluateFormula('20 / 4 / 2', {}).value).toBe(2.5);
    });

    it('handles unary minus properly', () => {
      expect(evaluateFormula('-5 + 10', {}).value).toBe(5);
      expect(evaluateFormula('10 + -5', {}).value).toBe(5);
      expect(evaluateFormula('-(2 + 3)', {}).value).toBe(-5);
    });

    it('resolves field values from context', () => {
      const context = {
        qty: 3,
        unit_price: 15.5,
        discount: 5,
      };
      expect(evaluateFormula('(qty * unit_price) - discount', context).value).toBe(41.5);
    });

    it('evaluates management example: (principal_amount * interest_rate * tenor_days) / 36500', () => {
      const context = {
        principal_amount: 1000000,
        interest_rate: 18,
        tenor_days: 60,
      };
      // (1000000 * 18 * 60) / 36500 = 1080000000 / 36500 = 29589.04109589...
      const result = evaluateFormula(
        '(principal_amount * interest_rate * tenor_days) / 36500',
        context
      );
      expect(result.value).toBe(29589.0411);
    });

    it('handles division by zero explicitly by returning null and error message without crashing', () => {
      const res1 = evaluateFormula('100 / 0', {});
      expect(res1.value).toBeNull();
      expect(res1.error).toBe('Division by zero');

      const res2 = evaluateFormula('100 / (5 - 5)', {});
      expect(res2.value).toBeNull();
      expect(res2.error).toBe('Division by zero');
    });

    it('supports explicit calculation precision settings (0, 2, 4, 6)', () => {
      const expr = '10 / 3'; // 3.3333333333...
      expect(evaluateFormula(expr, {}, { precision: 0 }).value).toBe(3);
      expect(evaluateFormula(expr, {}, { precision: 2 }).value).toBe(3.33);
      expect(evaluateFormula(expr, {}, { precision: 4 }).value).toBe(3.3333);
      expect(evaluateFormula(expr, {}, { precision: 6 }).value).toBe(3.333333);
    });

    it('handles rounding boundaries and symmetric negative values cleanly', () => {
      expect(safeRound(2.555, 2)).toBe(2.56);
      expect(safeRound(-2.555, 2)).toBe(-2.56);
      expect(safeRound(10.005, 2)).toBe(10.01);
      expect(safeRound(-10.005, 2)).toBe(-10.01);
      expect(safeRound(2.5, 0)).toBe(3);
      expect(safeRound(-2.5, 0)).toBe(-3);
    });

    it('returns null when required field values are missing or invalid', () => {
      expect(evaluateFormula('a + b', { a: null, b: 'invalid' }).value).toBeNull();
      expect(evaluateFormula('a + 10', {}).value).toBeNull();
    });

    it('coerces numeric strings into numbers', () => {
      expect(evaluateFormula('a * b', { a: '2.5', b: '4' }).value).toBe(10);
    });
  });

  describe('extractFormulaFieldReferences', () => {
    it('extracts unique variable references in order', () => {
      const refs = extractFormulaFieldReferences(
        '(principal_amount * interest_rate * tenor_days) / 36500 + principal_amount'
      );
      expect(refs).toEqual(['principal_amount', 'interest_rate', 'tenor_days']);
    });

    it('returns empty array for numeric only formulas', () => {
      expect(extractFormulaFieldReferences('100 * 2 / 5')).toEqual([]);
    });

    it('returns empty array or partial refs for invalid syntax without throwing', () => {
      const refs = extractFormulaFieldReferences('a +++ b');
      expect(Array.isArray(refs)).toBe(true);
    });
  });

  describe('refactorFormulaIdentifier', () => {
    it('replaces exact identifier token without touching sub-strings of other variables', () => {
      const formula = '(amount * rate) + total_amount';
      const refactored = refactorFormulaIdentifier(formula, 'amount', 'principal');
      expect(refactored).toBe('(principal * rate) + total_amount');
    });

    it('replaces multiple occurrences of the same identifier', () => {
      const formula = 'qty * price + (qty * tax)';
      const refactored = refactorFormulaIdentifier(formula, 'qty', 'quantity');
      expect(refactored).toBe('quantity * price + (quantity * tax)');
    });

    it('returns original formula when identifiers match or are empty', () => {
      expect(refactorFormulaIdentifier('a + b', 'a', 'a')).toBe('a + b');
      expect(refactorFormulaIdentifier('', 'a', 'b')).toBe('');
    });
  });
});
