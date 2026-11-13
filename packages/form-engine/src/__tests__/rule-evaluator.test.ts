import { describe, it, expect } from 'vitest';
import { evaluateRules, evaluateCondition, isValueEmpty } from '../rules/rule-evaluator';
import { RuleDefinition } from '../schema/rules';
import { FieldDefinition } from '../schema/fields';

describe('Rule Evaluator - isValueEmpty', () => {
  it('identifies null and undefined as empty', () => {
    expect(isValueEmpty(null)).toBe(true);
    expect(isValueEmpty(undefined)).toBe(true);
  });

  it('identifies whitespace and empty strings as empty', () => {
    expect(isValueEmpty('')).toBe(true);
    expect(isValueEmpty('   ')).toBe(true);
    expect(isValueEmpty('\t\n')).toBe(true);
    expect(isValueEmpty('valid')).toBe(false);
  });

  it('identifies empty arrays as empty', () => {
    expect(isValueEmpty([])).toBe(true);
    expect(isValueEmpty(['a'])).toBe(false);
  });

  it('treats 0 and false as non-empty', () => {
    expect(isValueEmpty(0)).toBe(false);
    expect(isValueEmpty(false)).toBe(false);
  });
});

describe('Rule Evaluator - evaluateCondition', () => {
  describe('equals & notEquals', () => {
    it('compares strings with trimming', () => {
      expect(evaluateCondition('apple ', 'equals', 'apple')).toBe(true);
      expect(evaluateCondition('banana', 'equals', 'apple')).toBe(false);
      expect(evaluateCondition('banana', 'notEquals', 'apple')).toBe(true);
    });

    it('compares numbers coerced from strings', () => {
      expect(evaluateCondition('42', 'equals', 42)).toBe(true);
      expect(evaluateCondition(42, 'equals', '42')).toBe(true);
      expect(evaluateCondition(10, 'notEquals', 20)).toBe(true);
    });

    it('compares booleans', () => {
      expect(evaluateCondition(true, 'equals', true)).toBe(true);
      expect(evaluateCondition(false, 'equals', true)).toBe(false);
      expect(evaluateCondition(false, 'notEquals', true)).toBe(true);
    });

    it('compares empty values as equal', () => {
      expect(evaluateCondition(null, 'equals', undefined)).toBe(true);
      expect(evaluateCondition('', 'equals', null)).toBe(true);
    });
  });

  describe('greaterThan & lessThan', () => {
    it('compares numeric values', () => {
      expect(evaluateCondition(100, 'greaterThan', 50)).toBe(true);
      expect(evaluateCondition(50, 'greaterThan', 100)).toBe(false);
      expect(evaluateCondition('75', 'greaterThan', 50)).toBe(true);
      expect(evaluateCondition(25, 'lessThan', 50)).toBe(true);
      expect(evaluateCondition(50, 'lessThan', 25)).toBe(false);
    });

    it('handles non-numeric strings safely by returning false', () => {
      expect(evaluateCondition('abc', 'greaterThan', 50)).toBe(false);
      expect(evaluateCondition(50, 'lessThan', 'xyz')).toBe(false);
    });

    it('compares valid ISO date strings', () => {
      expect(evaluateCondition('2026-05-15', 'greaterThan', '2026-01-01')).toBe(true);
      expect(evaluateCondition('2026-01-01', 'lessThan', '2026-05-15')).toBe(true);
    });
  });

  describe('contains', () => {
    it('checks substring case-insensitively for strings', () => {
      expect(evaluateCondition('Contractor Visit', 'contains', 'contractor')).toBe(true);
      expect(evaluateCondition('Employee Visit', 'contains', 'contractor')).toBe(false);
    });

    it('checks membership in arrays', () => {
      expect(evaluateCondition(['contractor', 'vendor'], 'contains', 'Contractor')).toBe(true);
      expect(evaluateCondition(['employee'], 'contains', 'contractor')).toBe(false);
    });

    it('returns false for null/undefined', () => {
      expect(evaluateCondition(null, 'contains', 'test')).toBe(false);
    });
  });

  describe('isEmpty & isNotEmpty', () => {
    it('evaluates isEmpty correctly', () => {
      expect(evaluateCondition('', 'isEmpty', undefined)).toBe(true);
      expect(evaluateCondition(null, 'isEmpty', undefined)).toBe(true);
      expect(evaluateCondition('hello', 'isEmpty', undefined)).toBe(false);
    });

    it('evaluates isNotEmpty correctly', () => {
      expect(evaluateCondition('hello', 'isNotEmpty', undefined)).toBe(true);
      expect(evaluateCondition(0, 'isNotEmpty', undefined)).toBe(true);
      expect(evaluateCondition('', 'isNotEmpty', undefined)).toBe(false);
    });
  });
});

describe('Rule Evaluator - evaluateRules', () => {
  const fields: FieldDefinition[] = [
    { id: 'fld_purpose', key: 'visit_purpose', type: 'dropdown', label: 'Purpose', order: 0, options: [] },
    { id: 'fld_safety', key: 'safety_briefing', type: 'text', label: 'Safety Briefing', order: 1 },
    { id: 'fld_escort', key: 'requires_escort', type: 'checkbox', label: 'Requires Escort', order: 2 },
    { id: 'fld_notes', key: 'internal_notes', type: 'textarea', label: 'Internal Notes', order: 3 },
  ];

  it('evaluates single condition and applies show/hide/require/disable', () => {
    const rules: RuleDefinition[] = [
      {
        id: 'r1',
        key: 'safety_for_contractor',
        name: 'Show safety if contractor',
        conditions: [{ fieldId: 'fld_purpose', operator: 'equals', value: 'Contractor' }],
        actions: [
          { targetFieldId: 'fld_safety', action: 'show' },
          { targetFieldId: 'fld_safety', action: 'require' },
        ],
      },
    ];

    // Form value matches by key
    const res1 = evaluateRules(rules, { visit_purpose: 'Contractor' }, fields);
    expect(res1.appliedRuleIds).toEqual(['r1']);
    expect(res1.fieldStates['safety_briefing']?.hidden).toBe(false);
    expect(res1.fieldStates['safety_briefing']?.required).toBe(true);
    // Also accessible by ID
    expect(res1.fieldStates['fld_safety']?.hidden).toBe(false);

    // Form value does not match
    const res2 = evaluateRules(rules, { visit_purpose: 'Employee' }, fields);
    expect(res2.appliedRuleIds).toEqual([]);
    expect(res2.fieldStates['safety_briefing']).toBeUndefined();
  });

  it('supports conditionLogic: "AND" and "OR"', () => {
    const andRule: RuleDefinition = {
      id: 'r_and',
      key: 'and_rule',
      name: 'AND Rule',
      conditionLogic: 'AND',
      conditions: [
        { fieldId: 'visit_purpose', operator: 'equals', value: 'Contractor' },
        { fieldId: 'requires_escort', operator: 'equals', value: true },
      ],
      actions: [{ targetFieldId: 'internal_notes', action: 'require' }],
    };

    const orRule: RuleDefinition = {
      id: 'r_or',
      key: 'or_rule',
      name: 'OR Rule',
      conditionLogic: 'OR',
      conditions: [
        { fieldId: 'visit_purpose', operator: 'equals', value: 'VIP' },
        { fieldId: 'requires_escort', operator: 'equals', value: true },
      ],
      actions: [{ targetFieldId: 'internal_notes', action: 'show' }],
    };

    // AND rule: only one condition true -> false
    const res1 = evaluateRules([andRule], { visit_purpose: 'Contractor', requires_escort: false }, fields);
    expect(res1.appliedRuleIds).toEqual([]);

    // AND rule: both true -> true
    const res2 = evaluateRules([andRule], { visit_purpose: 'Contractor', requires_escort: true }, fields);
    expect(res2.appliedRuleIds).toEqual(['r_and']);
    expect(res2.fieldStates['internal_notes']?.required).toBe(true);

    // OR rule: one condition true -> true
    const res3 = evaluateRules([orRule], { visit_purpose: 'Standard', requires_escort: true }, fields);
    expect(res3.appliedRuleIds).toEqual(['r_or']);
    expect(res3.fieldStates['internal_notes']?.hidden).toBe(false);
  });

  it('skips disabled rules (enabled: false)', () => {
    const rules: RuleDefinition[] = [
      {
        id: 'r_disabled',
        key: 'r_disabled',
        name: 'Disabled Rule',
        enabled: false,
        conditions: [{ fieldId: 'visit_purpose', operator: 'isNotEmpty' }],
        actions: [{ targetFieldId: 'internal_notes', action: 'hide' }],
      },
    ];

    const res = evaluateRules(rules, { visit_purpose: 'Any' }, fields);
    expect(res.appliedRuleIds).toEqual([]);
    expect(res.fieldStates['internal_notes']).toBeUndefined();
  });

  it('handles deterministic precedence where later rules override earlier rules', () => {
    const rules: RuleDefinition[] = [
      {
        id: 'r1',
        key: 'r1',
        name: 'Hide Notes',
        conditions: [{ fieldId: 'visit_purpose', operator: 'isNotEmpty' }],
        actions: [{ targetFieldId: 'internal_notes', action: 'hide' }],
      },
      {
        id: 'r2',
        key: 'r2',
        name: 'Show Notes for Contractor',
        conditions: [{ fieldId: 'visit_purpose', operator: 'equals', value: 'Contractor' }],
        actions: [{ targetFieldId: 'internal_notes', action: 'show' }],
      },
    ];

    const res = evaluateRules(rules, { visit_purpose: 'Contractor' }, fields);
    // Both matched
    expect(res.appliedRuleIds).toEqual(['r1', 'r2']);
    // Later rule r2 overrides r1: hidden should be false
    expect(res.fieldStates['internal_notes']?.hidden).toBe(false);
  });

  it('supports setValue action with deterministic result', () => {
    const rules: RuleDefinition[] = [
      {
        id: 'r_set',
        key: 'r_set',
        name: 'Set Escort for VIP',
        conditions: [{ fieldId: 'visit_purpose', operator: 'equals', value: 'VIP' }],
        actions: [{ targetFieldId: 'requires_escort', action: 'setValue', value: true }],
      },
    ];

    const res = evaluateRules(rules, { visit_purpose: 'VIP' }, fields);
    expect(res.appliedRuleIds).toEqual(['r_set']);
    expect(res.fieldStates['requires_escort']?.setValue).toBe(true);
  });
});

