import { CalculatedFieldDefinition, FieldDefinition } from '../schema/fields';
import { DetailsColumnDefinition, FormTabUnion } from '../schema/tabs';
import { RuleDefinition } from '../schema/rules';
import { ValidationError } from './types';

const VALID_OPERATORS = new Set([
  'equals',
  'notEquals',
  'greaterThan',
  'lessThan',
  'contains',
  'isEmpty',
  'isNotEmpty',
]);

const VALID_ACTIONS = new Set([
  'show',
  'hide',
  'require',
  'enable',
  'disable',
  'setValue',
]);

const VALID_CALCULATION_OPERATIONS = new Set([
  'add',
  'subtract',
  'multiply',
  'divide',
  'sum',
  'min',
  'max',
  'count',
]);

/**
 * Validates a list of rule definitions semantically.
 */
export function validateRulesSemantic(
  rules: readonly RuleDefinition[] | unknown,
  availableFieldIds: Set<string>,
  availableFieldKeys: Set<string>,
  isPublishing = false,
): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!rules) return errors;
  if (!Array.isArray(rules)) {
    errors.push({
      path: 'rules',
      code: 'INVALID_RULE_CONFIG',
      message: 'Rules must be an array',
    });
    return errors;
  }

  const ruleIds = new Set<string>();
  const ruleKeys = new Set<string>();

  for (let rIdx = 0; rIdx < rules.length; rIdx++) {
    const rule = rules[rIdx];
    const path = `rules[${rIdx}]`;

    if (!rule || typeof rule !== 'object') {
      errors.push({ path, code: 'INVALID_RULE_CONFIG', message: 'Rule must be an object' });
      continue;
    }

    const r = rule as Partial<RuleDefinition>;

    // Identity validation
    if (!r.id || typeof r.id !== 'string') {
      errors.push({ path: `${path}.id`, code: 'MISSING_RULE_ID', message: 'Rule missing ID' });
    } else if (ruleIds.has(r.id)) {
      errors.push({ path: `${path}.id`, code: 'DUPLICATE_RULE_ID', message: `Duplicate rule ID: ${r.id}` });
    } else {
      ruleIds.add(r.id);
    }

    if (!r.key || typeof r.key !== 'string') {
      errors.push({ path: `${path}.key`, code: 'MISSING_RULE_KEY', message: 'Rule missing key' });
    } else if (ruleKeys.has(r.key)) {
      errors.push({ path: `${path}.key`, code: 'DUPLICATE_RULE_KEY', message: `Duplicate rule key: ${r.key}` });
    } else {
      ruleKeys.add(r.key);
    }

    if (!r.name || typeof r.name !== 'string' || !r.name.trim()) {
      errors.push({ path: `${path}.name`, code: 'MISSING_RULE_NAME', message: 'Rule name is required' });
    }

    // Logic validation
    if (r.conditionLogic !== undefined && !['AND', 'OR'].includes(r.conditionLogic)) {
      errors.push({
        path: `${path}.conditionLogic`,
        code: 'INVALID_RULE_LOGIC',
        message: 'Rule conditionLogic must be "AND" or "OR"',
      });
    }

    // Conditions validation
    if (!Array.isArray(r.conditions) || r.conditions.length === 0) {
      if (isPublishing) {
        errors.push({
          path: `${path}.conditions`,
          code: 'EMPTY_RULE_CONDITIONS',
          message: 'Rule must specify at least one condition to publish',
        });
      }
    } else {
      for (let cIdx = 0; cIdx < r.conditions.length; cIdx++) {
        const cond = r.conditions[cIdx];
        const cPath = `${path}.conditions[${cIdx}]`;

        if (!cond || typeof cond !== 'object') {
          errors.push({ path: cPath, code: 'INVALID_RULE_CONDITION', message: 'Condition must be an object' });
          continue;
        }

        if (!cond.fieldId || typeof cond.fieldId !== 'string') {
          errors.push({ path: `${cPath}.fieldId`, code: 'MISSING_CONDITION_FIELD', message: 'Condition missing source field reference' });
        } else if (isPublishing && !availableFieldIds.has(cond.fieldId) && !availableFieldKeys.has(cond.fieldId)) {
          errors.push({
            path: `${cPath}.fieldId`,
            code: 'BROKEN_RULE_REF',
            message: `Rule source field "${cond.fieldId}" does not exist in the form`,
          });
        }

        if (!cond.operator || !VALID_OPERATORS.has(cond.operator)) {
          errors.push({
            path: `${cPath}.operator`,
            code: 'INVALID_RULE_OPERATOR',
            message: `Unsupported condition operator: ${String(cond.operator)}`,
          });
        }
      }
    }

    // Actions validation
    if (!Array.isArray(r.actions) || r.actions.length === 0) {
      if (isPublishing) {
        errors.push({
          path: `${path}.actions`,
          code: 'EMPTY_RULE_ACTIONS',
          message: 'Rule must specify at least one action to publish',
        });
      }
    } else {
      for (let aIdx = 0; aIdx < r.actions.length; aIdx++) {
        const act = r.actions[aIdx];
        const aPath = `${path}.actions[${aIdx}]`;

        if (!act || typeof act !== 'object') {
          errors.push({ path: aPath, code: 'INVALID_RULE_ACTION', message: 'Action must be an object' });
          continue;
        }

        if (!act.targetFieldId || typeof act.targetFieldId !== 'string') {
          errors.push({ path: `${aPath}.targetFieldId`, code: 'MISSING_ACTION_TARGET', message: 'Action missing target field reference' });
        } else if (isPublishing && !availableFieldIds.has(act.targetFieldId) && !availableFieldKeys.has(act.targetFieldId)) {
          errors.push({
            path: `${aPath}.targetFieldId`,
            code: 'BROKEN_RULE_REF',
            message: `Rule target field "${act.targetFieldId}" does not exist in the form`,
          });
        }

        if (!act.action || !VALID_ACTIONS.has(act.action)) {
          errors.push({
            path: `${aPath}.action`,
            code: 'INVALID_RULE_ACTION',
            message: `Unsupported action type: ${String(act.action)}`,
          });
        }

        // Circular setValue check: rule condition checking field X and action setting field X value
        if (act.action === 'setValue' && Array.isArray(r.conditions)) {
          const selfRef = r.conditions.some((c) => c && c.fieldId === act.targetFieldId);
          if (selfRef) {
            errors.push({
              path: aPath,
              code: 'CIRCULAR_RULE_ACTION',
              message: `Rule action setValue cannot target its own condition field "${act.targetFieldId}" to avoid evaluation loops`,
            });
          }
        }
      }
    }
  }

  return errors;
}

/**
 * Validates calculation configurations across all form fields.
 */
export function validateCalculationsSemantic(
  fields: readonly (FieldDefinition | DetailsColumnDefinition)[],
  tabs: readonly FormTabUnion[],
  isPublishing = false,
): ValidationError[] {
  const errors: ValidationError[] = [];

  const fieldIds = new Set(fields.map((f) => f.id));
  const fieldKeys = new Set(fields.map((f) => f.key));

  const calcFields = fields.filter((f): f is CalculatedFieldDefinition => f.type === 'calculated');

  // Build dependency graph for circular dependency check
  const calcByKey = new Map<string, string[]>();

  for (const field of calcFields) {
    const config = field.calculationConfig;
    const path = `field[${field.id}].calculationConfig`;

    if (!config || typeof config !== 'object') {
      errors.push({
        path,
        code: 'INVALID_CALCULATION_CONFIG',
        message: 'Calculated field missing calculationConfig',
      });
      continue;
    }

    if (!config.operation || !VALID_CALCULATION_OPERATIONS.has(config.operation)) {
      errors.push({
        path: `${path}.operation`,
        code: 'INVALID_CALCULATION_CONFIG',
        message: `Unsupported calculation operation: ${String(config.operation)}`,
      });
    }

    // Source grid vs Operands
    if (!config.source && (!config.operands || config.operands.length === 0)) {
      if (isPublishing) {
        errors.push({
          path,
          code: 'INVALID_CALCULATION_CONFIG',
          message: 'A calculation needs operands or a grid source',
        });
      }
    }

    if (config.operands && Array.isArray(config.operands)) {
      calcByKey.set(field.key, config.operands);
      for (let i = 0; i < config.operands.length; i++) {
        const operand = config.operands[i];
        if (isPublishing && !fieldIds.has(operand) && !fieldKeys.has(operand)) {
          errors.push({
            path: `${path}.operands[${i}]`,
            code: 'BROKEN_CALCULATION_REF',
            message: `Calculation operand "${operand}" does not exist in the form`,
          });
        }
      }
    }

    if (config.source) {
      const [tabKey, columnKey, extra] = config.source.split('.');
      const tab = tabs.find((t) => t.key === tabKey);
      if (
        extra !== undefined ||
        !tab ||
        tab.type !== 'details' ||
        !tab.configuration.columns.some((c) => c.key === columnKey)
      ) {
        if (isPublishing) {
          errors.push({
            path: `${path}.source`,
            code: 'BROKEN_CALCULATION_REF',
            message: 'Calculation source must identify an existing Details column as tab_key.field_key',
          });
        }
      }
    }
  }

  // Circular dependency check
  const visited = new Set<string>();
  const inStack = new Set<string>();

  function detectCycle(node: string, pathNodes: string[]): boolean {
    if (inStack.has(node)) {
      errors.push({
        path: `field[${node}].calculationConfig`,
        code: 'CIRCULAR_CALCULATION',
        message: `Circular calculation dependency detected: ${[...pathNodes, node].join(' -> ')}`,
      });
      return true;
    }
    if (visited.has(node)) return false;

    visited.add(node);
    inStack.add(node);

    const deps = calcByKey.get(node) || [];
    for (const dep of deps) {
      if (calcByKey.has(dep)) {
        detectCycle(dep, [...pathNodes, node]);
      }
    }

    inStack.delete(node);
    return false;
  }

  for (const node of calcByKey.keys()) {
    if (!visited.has(node)) {
      detectCycle(node, []);
    }
  }

  return errors;
}
