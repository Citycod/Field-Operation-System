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

    // Division by zero
    const res1 = evaluateCalculations(divFields, { numerator: 100, denominator: 0 });
    expect(res1.values['result']).toBe(0);
    expect(Number.isFinite(res1.values['result'] as number)).toBe(true);

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
});

