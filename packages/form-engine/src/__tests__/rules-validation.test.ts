import { describe, it, expect } from 'vitest';
import { validateRulesSemantic, validateCalculationsSemantic } from '../validation/rules-validator';
import { FormSchemaV1 } from '../schema/form-schema';
import { validateDraftSchema } from '../validation/draft-validator';
import { validatePublishableSchema } from '../validation/publish-validator';
import { MINIMAL_VALID_SCHEMA } from '../fixtures/minimal-valid-schema';
import { FieldDefinition } from '../schema/fields';

describe('Rules Semantic Validation', () => {
  const availableFieldIds = new Set(['f1', 'f2', 'f3']);
  const availableFieldKeys = new Set(['field_one', 'field_two', 'field_three']);

  it('rejects missing or duplicate rule IDs and keys', () => {
    const rules = [
      { id: '', key: 'k1', name: 'Rule 1', conditions: [], actions: [] },
      { id: 'r2', key: '', name: 'Rule 2', conditions: [], actions: [] },
      { id: 'r3', key: 'k3', name: '', conditions: [], actions: [] },
      { id: 'r2', key: 'k1', name: 'Duplicate Rule', conditions: [], actions: [] },
    ];

    const errors = validateRulesSemantic(rules, availableFieldIds, availableFieldKeys, false);
    expect(errors.some((e) => e.code === 'MISSING_RULE_ID')).toBe(true);
    expect(errors.some((e) => e.code === 'MISSING_RULE_KEY')).toBe(true);
    expect(errors.some((e) => e.code === 'MISSING_RULE_NAME')).toBe(true);
    expect(errors.some((e) => e.code === 'DUPLICATE_RULE_ID')).toBe(true);
    expect(errors.some((e) => e.code === 'DUPLICATE_RULE_KEY')).toBe(true);
  });

  it('validates supported operators and actions', () => {
    const rules = [
      {
        id: 'r1',
        key: 'k1',
        name: 'Valid Rule',
        conditions: [{ fieldId: 'f1', operator: 'invalid_op' as any }],
        actions: [{ targetFieldId: 'f2', action: 'invalid_act' as any }],
      },
    ];

    const errors = validateRulesSemantic(rules, availableFieldIds, availableFieldKeys, false);
    expect(errors.some((e) => e.code === 'INVALID_RULE_OPERATOR')).toBe(true);
    expect(errors.some((e) => e.code === 'INVALID_RULE_ACTION')).toBe(true);
  });

  it('detects circular setValue targeting its own condition field', () => {
    const rules = [
      {
        id: 'r_loop',
        key: 'k_loop',
        name: 'Self referential loop',
        conditions: [{ fieldId: 'f1', operator: 'equals', value: 'yes' }],
        actions: [{ targetFieldId: 'f1', action: 'setValue', value: 'no' }],
      },
    ];

    const errors = validateRulesSemantic(rules, availableFieldIds, availableFieldKeys, false);
    expect(errors.some((e) => e.code === 'CIRCULAR_RULE_ACTION')).toBe(true);
  });

  it('blocks broken references when publishing, but permits WIP in draft', () => {
    const draftSchema: FormSchemaV1 = {
      ...MINIMAL_VALID_SCHEMA,
      rules: [
        {
          id: 'r_wip',
          key: 'k_wip',
          name: 'WIP Rule',
          conditions: [{ fieldId: 'non_existent_source', operator: 'equals', value: '1' }],
          actions: [{ targetFieldId: 'non_existent_target', action: 'show' }],
        },
      ],
    };

    // Draft passes
    const draftRes = validateDraftSchema(draftSchema);
    expect(draftRes.valid).toBe(true);

    // Publish blocks broken refs
    const pubRes = validatePublishableSchema(draftSchema);
    expect(pubRes.valid).toBe(false);
    expect(pubRes.errors.some((e) => e.code === 'BROKEN_RULE_REF')).toBe(true);
  });
});

describe('Calculations Semantic Validation', () => {
  it('detects circular calculation dependencies', () => {
    const fields: FieldDefinition[] = [
      {
        id: 'c1',
        key: 'calc_1',
        type: 'calculated',
        label: 'Calc 1',
        order: 0,
        calculationConfig: { operation: 'add', operands: ['calc_2'] },
      },
      {
        id: 'c2',
        key: 'calc_2',
        type: 'calculated',
        label: 'Calc 2',
        order: 1,
        calculationConfig: { operation: 'add', operands: ['calc_1'] },
      },
    ];

    const errors = validateCalculationsSemantic(fields, [], false);
    expect(errors.some((e) => e.code === 'CIRCULAR_CALCULATION')).toBe(true);
  });
});

