import { FieldDefinition } from '../schema/fields';
import { RuleActionType, RuleCondition, RuleDefinition, RuleOperator } from '../schema/rules';

export interface FieldRuleState {
  hidden?: boolean;
  required?: boolean;
  disabled?: boolean;
  setValue?: unknown;
}

export interface RuleEvaluationResult {
  /**
   * Computed states keyed by both field ID and field key
   * for fast O(1) lookup in renderer and validators.
   */
  fieldStates: Record<string, FieldRuleState>;
  /** IDs of rules that evaluated to true and applied actions */
  appliedRuleIds: string[];
  /** Errors encountered during evaluation */
  errors: string[];
}

/**
 * Checks if a value is considered "empty" in form context:
 * null, undefined, empty string, whitespace string, or empty array.
 */
export function isValueEmpty(val: unknown): boolean {
  if (val === null || val === undefined) return true;
  if (typeof val === 'string') return val.trim().length === 0;
  if (Array.isArray(val)) return val.length === 0;
  return false;
}

/**
 * Evaluates a single condition against a field's current value.
 * Pure, deterministic, type-aware, and safe against malformed inputs.
 */
export function evaluateCondition(currentValue: unknown, operator: RuleOperator, targetValue: unknown): boolean {
  switch (operator) {
    case 'isEmpty':
      return isValueEmpty(currentValue);

    case 'isNotEmpty':
      return !isValueEmpty(currentValue);

    case 'equals': {
      if (currentValue === targetValue) return true;
      if (isValueEmpty(currentValue) && isValueEmpty(targetValue)) return true;

      // Numeric comparison with string coercion
      if (typeof targetValue === 'number') {
        const num = Number(currentValue);
        return !isNaN(num) && num === targetValue;
      }
      if (typeof currentValue === 'number') {
        const num = Number(targetValue);
        return !isNaN(num) && num === currentValue;
      }

      // Boolean comparison
      if (typeof targetValue === 'boolean') {
        return Boolean(currentValue) === targetValue;
      }
      if (typeof currentValue === 'boolean') {
        return Boolean(targetValue) === currentValue;
      }

      // String comparison (case-sensitive or trimmed)
      if (typeof currentValue === 'string' && typeof targetValue === 'string') {
        return currentValue.trim() === targetValue.trim();
      }

      // Date comparison (ISO strings or timestamps)
      if (typeof currentValue === 'string' && typeof targetValue === 'string') {
        const t1 = Date.parse(currentValue);
        const t2 = Date.parse(targetValue);
        if (!isNaN(t1) && !isNaN(t2)) return t1 === t2;
      }

      return String(currentValue ?? '') === String(targetValue ?? '');
    }

    case 'notEquals':
      return !evaluateCondition(currentValue, 'equals', targetValue);

    case 'greaterThan': {
      if (typeof currentValue === 'number' && typeof targetValue === 'number') {
        return currentValue > targetValue;
      }
      const numCur = Number(currentValue);
      const numTar = Number(targetValue);
      if (!isNaN(numCur) && !isNaN(numTar) && currentValue !== '' && targetValue !== '') {
        return numCur > numTar;
      }
      // Date comparison
      if (typeof currentValue === 'string' && typeof targetValue === 'string') {
        const dCur = Date.parse(currentValue);
        const dTar = Date.parse(targetValue);
        if (!isNaN(dCur) && !isNaN(dTar)) return dCur > dTar;
      }
      return false;
    }

    case 'lessThan': {
      if (typeof currentValue === 'number' && typeof targetValue === 'number') {
        return currentValue < targetValue;
      }
      const numCur = Number(currentValue);
      const numTar = Number(targetValue);
      if (!isNaN(numCur) && !isNaN(numTar) && currentValue !== '' && targetValue !== '') {
        return numCur < numTar;
      }
      // Date comparison
      if (typeof currentValue === 'string' && typeof targetValue === 'string') {
        const dCur = Date.parse(currentValue);
        const dTar = Date.parse(targetValue);
        if (!isNaN(dCur) && !isNaN(dTar)) return dCur < dTar;
      }
      return false;
    }

    case 'contains': {
      if (currentValue === null || currentValue === undefined) return false;
      const targetStr = String(targetValue ?? '').toLowerCase();
      if (!targetStr) return false;

      if (Array.isArray(currentValue)) {
        return currentValue.some((item) => String(item).toLowerCase() === targetStr || String(item).toLowerCase().includes(targetStr));
      }
      if (typeof currentValue === 'string') {
        return currentValue.toLowerCase().includes(targetStr);
      }
      return false;
    }

    default:
      return false;
  }
}

/**
 * Resolves a field reference (either ID or key) against the current form values
 * and field definitions.
 */
function resolveFieldValue(
  ref: string,
  formValues: Record<string, unknown>,
  idToKey: Map<string, string>,
  keyToId: Map<string, string>,
): unknown {
  if (Object.prototype.hasOwnProperty.call(formValues, ref)) {
    return formValues[ref];
  }
  const key = idToKey.get(ref);
  if (key && Object.prototype.hasOwnProperty.call(formValues, key)) {
    return formValues[key];
  }
  const id = keyToId.get(ref);
  if (id && Object.prototype.hasOwnProperty.call(formValues, id)) {
    return formValues[id];
  }
  return undefined;
}

/**
 * Builds ID <-> Key lookup maps for a set of field definitions.
 */
function buildFieldIndexMaps(fields: readonly FieldDefinition[] = []) {
  const idToKey = new Map<string, string>();
  const keyToId = new Map<string, string>();
  for (const f of fields) {
    if (f.id && f.key) {
      idToKey.set(f.id, f.key);
      keyToId.set(f.key, f.id);
    }
  }
  return { idToKey, keyToId };
}

/**
 * Evaluates a group of declarative conditions using AND/OR logic.
 * Shared across Form Rules, Workflow Trigger Conditions, Workflow Condition Steps, and Workflow Simulator.
 */
export function evaluateConditionGroup(
  conditions: readonly RuleCondition[] | undefined | null,
  logic: 'AND' | 'OR' = 'AND',
  formValues: Record<string, unknown> = {},
  fields: readonly FieldDefinition[] = [],
  emptyBehavior: 'match' | 'no_match' = 'no_match',
): boolean {
  const list = Array.isArray(conditions) ? conditions : [];
  if (list.length === 0) {
    return emptyBehavior === 'match';
  }

  const { idToKey, keyToId } = buildFieldIndexMaps(fields);

  if (logic === 'OR') {
    for (const cond of list) {
      if (!cond || typeof cond !== 'object') continue;
      const curVal = resolveFieldValue(cond.fieldId, formValues, idToKey, keyToId);
      if (evaluateCondition(curVal, cond.operator, cond.value)) {
        return true;
      }
    }
    return false;
  }

  for (const cond of list) {
    if (!cond || typeof cond !== 'object') return false;
    const curVal = resolveFieldValue(cond.fieldId, formValues, idToKey, keyToId);
    if (!evaluateCondition(curVal, cond.operator, cond.value)) {
      return false;
    }
  }
  return true;
}

/**
 * Evaluates all declarative rules against current form values and field definitions.
 *
 * Deterministic Precedence Strategy:
 * 1. Rules evaluate in configured sequential array order (index 0..N).
 * 2. Disabled rules (`enabled === false`) are skipped entirely.
 * 3. Rules with empty conditions are not matched.
 * 4. `conditionLogic === 'OR'` (or `match === 'any'`) matches if at least one condition evaluates to true.
 * 5. `conditionLogic === 'AND'` (default) matches only if ALL conditions evaluate to true.
 * 6. When multiple matching rules target the same field:
 *    - Later rules in array sequence deterministically override earlier rules for the same property.
 *    - For example: Rule 1 `show` followed by Rule 2 `hide` results in `hidden: true`.
 * 7. Field states are indexed by both field ID and field Key to support fast lookup.
 */
export function evaluateRules(
  rules: readonly RuleDefinition[] | undefined | null,
  formValues: Record<string, unknown> = {},
  fields: readonly FieldDefinition[] = [],
): RuleEvaluationResult {
  const result: RuleEvaluationResult = {
    fieldStates: {},
    appliedRuleIds: [],
    errors: [],
  };

  if (!rules || !Array.isArray(rules) || rules.length === 0) {
    return result;
  }

  // Build field index maps for ID <-> Key resolution
  const { idToKey, keyToId } = buildFieldIndexMaps(fields);

  // Helper to apply field effect to both ID and Key slots
  function setFieldEffect(targetRef: string, patch: Partial<FieldRuleState>) {
    const key = idToKey.get(targetRef) || targetRef;
    const id = keyToId.get(targetRef) || targetRef;

    const existingKey = result.fieldStates[key] || {};
    const existingId = result.fieldStates[id] || {};

    const updated: FieldRuleState = {
      ...existingKey,
      ...existingId,
      ...patch,
    };

    result.fieldStates[key] = updated;
    result.fieldStates[id] = updated;
  }

  for (let rIdx = 0; rIdx < rules.length; rIdx++) {
    const rule = rules[rIdx];
    if (!rule || typeof rule !== 'object') continue;

    // Disabled check
    if (rule.enabled === false) continue;

    const conditions = Array.isArray(rule.conditions) ? rule.conditions : [];
    if (conditions.length === 0) continue;

    const logic = rule.conditionLogic || (rule.match === 'any' ? 'OR' : 'AND');
    const ruleMatches = evaluateConditionGroup(conditions, logic, formValues, fields, 'no_match');

    if (ruleMatches) {
      result.appliedRuleIds.push(rule.id || `rule_${rIdx}`);

      const actions = Array.isArray(rule.actions) ? rule.actions : [];
      for (const act of actions) {
        if (!act || typeof act !== 'object' || !act.targetFieldId) continue;

        switch (act.action) {
          case 'show':
            setFieldEffect(act.targetFieldId, { hidden: false });
            break;
          case 'hide':
            setFieldEffect(act.targetFieldId, { hidden: true });
            break;
          case 'require':
            setFieldEffect(act.targetFieldId, { required: true });
            break;
          case 'enable':
            setFieldEffect(act.targetFieldId, { disabled: false });
            break;
          case 'disable':
            setFieldEffect(act.targetFieldId, { disabled: true });
            break;
          case 'setValue':
            setFieldEffect(act.targetFieldId, { setValue: act.value });
            break;
          default:
            result.errors.push(`Unknown rule action type: ${String((act as { action: unknown }).action)}`);
        }
      }
    }
  }

  return result;
}

