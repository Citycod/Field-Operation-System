import { describe, it, expect } from 'vitest';
import { evaluateCalculations, toNumber, safeRound } from '../rules/calculation-evaluator';
import { FieldDefinition } from '../schema/fields';

describe('Calculation Evaluator - toNumber & safeRound', () => {
  it('converts valid numbers and numeric strings', () => {
    expect(toNumber(42)).toBe(42);
    expect(toNumber('3.14')).toBe(3.14);
    expect(toNumber('-100')).toBe(-100);
    expect(toNumber(0)).toBe(0);
  });

  it('returns null for empty, null, undefined, or non-numeric values', () => {
    expect(toNumber(null)).toBeNull();
    expect(toNumber(undefined)).toBeNull();
    expect(toNumber('')).toBeNull();
    expect(toNumber('abc')).toBeNull();
  });

  it('rounds floating point numbers safely', () => {
    expect(safeRound(0.1 + 0.2)).toBe(0.3);
    expect(safeRound(10.123456, 2)).toBe(10.12);
  });
});

describe('Calculation Evaluator - evaluateCalculations', () => {
  const fields: FieldDefinition[] = [
    { id: 'f_qty', key: 'quantity', type: 'number', label: 'Quantity', order: 0 },
    { id: 'f_price', key: 'unit_price', type: 'currency', label: 'Unit Price', order: 1 },
    { id: 'f_tax_rate', key: 'tax_rate', type: 'number', label: 'Tax Rate', order: 2 },
    {
      id: 'f_subtotal',
      key: 'subtotal',
      type: 'calculated',
      label: 'Subtotal',
      order: 3,
      calculationConfig: {
        operation: 'multiply',
        operands: ['quantity', 'unit_price'],
      },
    },
    {
      id: 'f_tax',
      key: 'tax_amount',
      type: 'calculated',
      label: 'Tax Amount',
      order: 4,
      calculationConfig: {
        operation: 'multiply',
        operands: ['subtotal', 'tax_rate'],
      },
    },
    {
      id: 'f_total',
      key: 'grand_total',
      type: 'calculated',
      label: 'Grand Total',
      order: 5,
      calculationConfig: {
        operation: 'add',
        operands: ['subtotal', 'tax_amount'],
      },
    },
  ];

  it('evaluates chained calculations in topological order', () => {
    const values = {
      quantity: 5,
      unit_price: 20, // subtotal = 100
      tax_rate: 0.1,  // tax_amount = 10, grand_total = 110
    };

    const res = evaluateCalculations(fields, values);
    expect(res.errors).toEqual([]);
    expect(res.values['subtotal']).toBe(100);
    expect(res.values['tax_amount']).toBe(10);
    expect(res.values['grand_total']).toBe(110);
  });

  it('safely handles division by zero without returning Infinity or NaN', () => {
    const divFields: FieldDefinition[] = [
      { id: 'f_num', key: 'numerator', type: 'number', label: 'Num', order: 0 },
      { id: 'f_den', key: 'denominator', type: 'number', label: 'Den', order: 1 },
      {
        id: 'f_result',
        key: 'result',
        type: 'calculated',
        label: 'Result',
        order: 2,
        calculationConfig: {
          operation: 'divide',
          operands: ['numerator', 'denominator'],
        },
      },
    ];

    // Division by zero returns null explicitly and records error
    const res1 = evaluateCalculations(divFields, { numerator: 100, denominator: 0 });
    expect(res1.values['result']).toBeNull();
    expect(res1.errors.some((e) => e.includes('Division by zero'))).toBe(true);

    // Normal division
    const res2 = evaluateCalculations(divFields, { numerator: 100, denominator: 4 });
    expect(res2.values['result']).toBe(25);
  });

  it('evaluates subtract, min, max, count operations', () => {
    const testFields: FieldDefinition[] = [
      {
        id: 'f_sub',
        key: 'sub_val',
        type: 'calculated',
        label: 'Sub',
        order: 0,
        calculationConfig: { operation: 'subtract', operands: ['a', 'b'] },
      },
      {
        id: 'f_min',
        key: 'min_val',
        type: 'calculated',
        label: 'Min',
        order: 1,
        calculationConfig: { operation: 'min', operands: ['a', 'b', 'c'] },
      },
      {
        id: 'f_max',
        key: 'max_val',
        type: 'calculated',
        label: 'Max',
        order: 2,
        calculationConfig: { operation: 'max', operands: ['a', 'b', 'c'] },
      },
      {
        id: 'f_cnt',
        key: 'count_val',
        type: 'calculated',
        label: 'Count',
        order: 3,
        calculationConfig: { operation: 'count', operands: ['a', 'b', 'c'] },
      },
    ];

    const res = evaluateCalculations(testFields, { a: 50, b: 20, c: 80 });
    expect(res.values['sub_val']).toBe(30);
    expect(res.values['min_val']).toBe(20);
    expect(res.values['max_val']).toBe(80);
    expect(res.values['count_val']).toBe(3);
  });

  it('aggregates detail grid column sources (sum, min, max, count)', () => {
    const gridFields: FieldDefinition[] = [
      {
        id: 'f_sum_items',
        key: 'items_total',
        type: 'calculated',
        label: 'Total Amount',
        order: 0,
        calculationConfig: {
          operation: 'sum',
          source: 'line_items.line_total',
        },
      },
      {
        id: 'f_count_items',
        key: 'items_count',
        type: 'calculated',
        label: 'Total Items',
        order: 1,
        calculationConfig: {
          operation: 'count',
          source: 'line_items.line_total',
        },
      },
    ];

    const detailsData = {
      line_items: [
        { id: '1', line_total: 150.5 },
        { id: '2', line_total: 249.5 },
        { id: '3', line_total: 100 },
      ],
    };

    const res = evaluateCalculations(gridFields, {}, detailsData);
    expect(res.values['items_total']).toBe(500);
    expect(res.values['items_count']).toBe(3);
  });

  it('detects circular calculation dependencies without infinite recursion', () => {
    const circularFields: FieldDefinition[] = [
      {
        id: 'f_a',
        key: 'calc_a',
        type: 'calculated',
        label: 'Calc A',
        order: 0,
        calculationConfig: { operation: 'add', operands: ['calc_b'] },
      },
      {
        id: 'f_b',
        key: 'calc_b',
        type: 'calculated',
        label: 'Calc B',
        order: 1,
        calculationConfig: { operation: 'add', operands: ['calc_a'] },
      },
    ];

    const res = evaluateCalculations(circularFields, {});
    expect(res.errors.length).toBeGreaterThan(0);
    expect(res.errors[0]).toContain('Circular calculation dependency detected');
  });

  describe('Custom Formula Builder - Acceptance & Operator Tests', () => {
    it('evaluates the management acceptance formula: (principal_amount * interest_rate * tenor_days) / 36500', () => {
      const formulaFields: FieldDefinition[] = [
        { id: 'f_p', key: 'principal_amount', type: 'currency', label: 'Principal', order: 0 },
        { id: 'f_r', key: 'interest_rate', type: 'number', label: 'Interest Rate', order: 1 },
        { id: 'f_d', key: 'tenor_days', type: 'number', label: 'Tenor Days', order: 2 },
        {
          id: 'f_interest',
          key: 'simple_interest',
          type: 'calculated',
          label: 'Simple Interest',
          order: 3,
          calculationConfig: {
            operation: 'custom',
            formula: '(principal_amount * interest_rate * tenor_days) / 36500',
          },
        },
      ];

      const inputs = {
        principal_amount: 1000000,
        interest_rate: 12,
        tenor_days: 90,
      };

      const res = evaluateCalculations(formulaFields, inputs);
      expect(res.errors).toEqual([]);
      // (1000000 * 12 * 90) / 36500 = 1080000000 / 36500 = 29589.04109589... -> rounded to 4 decimals = 29589.0411
      expect(res.values['simple_interest']).toBeCloseTo(29589.0411, 4);
      expect(res.values['simple_interest']).toBe(29589.0411);
    });

    it('respects operator precedence: multiplication/division before addition/subtraction', () => {
      const precFields: FieldDefinition[] = [
        { id: 'f_a', key: 'a', type: 'number', label: 'A', order: 0 },
        { id: 'f_b', key: 'b', type: 'number', label: 'B', order: 1 },
        { id: 'f_c', key: 'c', type: 'number', label: 'C', order: 2 },
        {
          id: 'f_calc1',
          key: 'calc1',
          type: 'calculated',
          label: 'Calc 1',
          order: 3,
          calculationConfig: { operation: 'custom', formula: 'a + b * c' }, // 10 + 5 * 2 = 20
        },
        {
          id: 'f_calc2',
          key: 'calc2',
          type: 'calculated',
          label: 'Calc 2',
          order: 4,
          calculationConfig: { operation: 'custom', formula: '(a + b) * c' }, // (10 + 5) * 2 = 30
        },
      ];

      const res = evaluateCalculations(precFields, { a: 10, b: 5, c: 2 });
      expect(res.values['calc1']).toBe(20);
      expect(res.values['calc2']).toBe(30);
    });

    it('supports unary negative values and decimals', () => {
      const fields: FieldDefinition[] = [
        { id: 'f_x', key: 'x', type: 'number', label: 'X', order: 0 },
        {
          id: 'f_res',
          key: 'res',
          type: 'calculated',
          label: 'Res',
          order: 1,
          calculationConfig: { operation: 'custom', formula: '-x * 1.5 + 0.25' },
        },
      ];

      const res = evaluateCalculations(fields, { x: 10 });
      // -10 * 1.5 + 0.25 = -15 + 0.25 = -14.75
      expect(res.values['res']).toBe(-14.75);
    });

    it('safely handles division by zero in custom formulas without crashing', () => {
      const divFields: FieldDefinition[] = [
        { id: 'f_n', key: 'num', type: 'number', label: 'Num', order: 0 },
        { id: 'f_d', key: 'den', type: 'number', label: 'Den', order: 1 },
        {
          id: 'f_r',
          key: 'res',
          type: 'calculated',
          label: 'Res',
          order: 2,
          calculationConfig: { operation: 'custom', formula: 'num / den' },
        },
      ];

      const res = evaluateCalculations(divFields, { num: 100, den: 0 });
      expect(res.values['res']).toBeNull();
      expect(res.errors.some((e) => e.includes('Division by zero'))).toBe(true);
    });

    it('returns null when referenced operand values are missing or null', () => {
      const fields: FieldDefinition[] = [
        { id: 'f_a', key: 'a', type: 'number', label: 'A', order: 0 },
        { id: 'f_b', key: 'b', type: 'number', label: 'B', order: 1 },
        {
          id: 'f_res',
          key: 'res',
          type: 'calculated',
          label: 'Res',
          order: 2,
          calculationConfig: { operation: 'custom', formula: 'a + b' },
        },
      ];

      const res = evaluateCalculations(fields, { a: 10 }); // b missing
      expect(res.values['res']).toBeNull();
    });

    it('handles chained custom formulas with topological ordering', () => {
      const fields: FieldDefinition[] = [
        { id: 'f_base', key: 'base', type: 'number', label: 'Base', order: 0 },
        {
          id: 'f_sub',
          key: 'step1',
          type: 'calculated',
          label: 'Step 1',
          order: 1,
          calculationConfig: { operation: 'custom', formula: 'base * 2' }, // 50 * 2 = 100
        },
        {
          id: 'f_final',
          key: 'step2',
          type: 'calculated',
          label: 'Step 2',
          order: 2,
          calculationConfig: { operation: 'custom', formula: 'step1 + 15' }, // 100 + 15 = 115
        },
      ];

      const res = evaluateCalculations(fields, { base: 50 });
      expect(res.values['step1']).toBe(100);
      expect(res.values['step2']).toBe(115);
    });

    it('detects circular dependencies in custom formulas', () => {
      const fields: FieldDefinition[] = [
        {
          id: 'f_1',
          key: 'c1',
          type: 'calculated',
          label: 'C1',
          order: 0,
          calculationConfig: { operation: 'custom', formula: 'c2 + 1' },
        },
        {
          id: 'f_2',
          key: 'c2',
          type: 'calculated',
          label: 'C2',
          order: 1,
          calculationConfig: { operation: 'custom', formula: 'c1 * 2' },
        },
      ];

      const res = evaluateCalculations(fields, {});
      expect(res.errors.length).toBeGreaterThan(0);
      expect(res.errors[0]).toContain('Circular calculation dependency detected');
    });

    it('evaluates formulas referencing stable field IDs as well as field keys', () => {
      const fields: FieldDefinition[] = [
        { id: 'fld_principal_id', key: 'loan_amount', type: 'number', label: 'Loan', order: 0 },
        { id: 'fld_rate_id', key: 'annual_rate', type: 'number', label: 'Rate', order: 1 },
        {
          id: 'fld_calc_id',
          key: 'interest',
          type: 'calculated',
          label: 'Interest',
          order: 2,
          // Referencing by immutable field ID
          calculationConfig: {
            operation: 'custom',
            formula: 'fld_principal_id * fld_rate_id',
          },
        },
      ];

      const res = evaluateCalculations(fields, {
        loan_amount: 5000,
        annual_rate: 0.1,
      });

      expect(res.values['interest']).toBe(500);
      expect(res.values['fld_calc_id']).toBe(500);
    });

    it('honors calculation precision configuration (0, 2, 4)', () => {
      const fields: FieldDefinition[] = [
        { id: 'f_val', key: 'val', type: 'number', label: 'Value', order: 0 },
        {
          id: 'f_p0',
          key: 'calc_int',
          type: 'calculated',
          label: 'Integer',
          order: 1,
          calculationConfig: { operation: 'custom', formula: 'val / 3', precision: 0 },
        },
        {
          id: 'f_p2',
          key: 'calc_curr',
          type: 'calculated',
          label: 'Currency',
          order: 2,
          calculationConfig: { operation: 'custom', formula: 'val / 3', precision: 2 },
        },
        {
          id: 'f_p4',
          key: 'calc_high',
          type: 'calculated',
          label: 'High Precision',
          order: 3,
          calculationConfig: { operation: 'custom', formula: 'val / 3', precision: 4 },
        },
      ];

      const res = evaluateCalculations(fields, { val: 100 });
      expect(res.values['calc_int']).toBe(33);
      expect(res.values['calc_curr']).toBe(33.33);
      expect(res.values['calc_high']).toBe(33.3333);
    });
  });
});

