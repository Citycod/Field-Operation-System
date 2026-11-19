import { CalculatedFieldDefinition, FieldDefinition } from '../schema/fields';
import {
  evaluateFormula,
  extractFormulaFieldReferences,
  safeRound,
} from './formula-evaluator';

export {
  evaluateFormula,
  extractFormulaFieldReferences,
  parseFormula,
  refactorFormulaIdentifier,
  safeRound,
  tokenizeFormula,
} from './formula-evaluator';
export type {
  ASTNode,
  FormulaEvaluationResult,
  FormulaParseResult,
  Token,
  TokenType,
} from './formula-evaluator';

export interface CalculationEvaluationResult {
  /** Map of calculated field keys to their computed values */
  values: Record<string, number | null>;
  /** Circular dependency errors or calculation errors */
  errors: string[];
}

/**
 * Coerces an arbitrary value to a clean finite number or null.
 */
export function toNumber(val: unknown): number | null {
  if (val === null || val === undefined || val === '') return null;
  const num = typeof val === 'number' ? val : Number(val);
  return Number.isFinite(num) ? num : null;
}


/**
 * Topologically sorts calculated fields based on their operand dependencies
 * to ensure upstream calculated values are computed before downstream fields.
 * Returns sorted fields and any detected circular dependency cycles.
 */
export function sortCalculatedFieldsTopologically(
  calculatedFields: readonly CalculatedFieldDefinition[],
  fieldKeyToField: Map<string, FieldDefinition>,
  fieldIdToField: Map<string, FieldDefinition>,
): { sorted: CalculatedFieldDefinition[]; cycles: string[] } {
  const sorted: CalculatedFieldDefinition[] = [];
  const cycles: string[] = [];

  // Map field key/id to calculated field definition
  const calcByKey = new Map<string, CalculatedFieldDefinition>();
  for (const f of calculatedFields) {
    calcByKey.set(f.key, f);
    calcByKey.set(f.id, f);
  }

  const visited = new Set<string>();
  const visiting = new Set<string>();

  function visit(calcField: CalculatedFieldDefinition, path: string[]) {
    const key = calcField.key;
    if (visiting.has(key)) {
      cycles.push(`Circular calculation dependency detected: ${[...path, key].join(' -> ')}`);
      return;
    }
    if (visited.has(key)) return;

    visiting.add(key);

    const config = calcField.calculationConfig;
    let operands = Array.isArray(config.operands) ? [...config.operands] : [];
    if (typeof config.formula === 'string' && config.formula.trim().length > 0) {
      operands = [...operands, ...extractFormulaFieldReferences(config.formula)];
    }
    for (const opRef of operands) {
      // Check if operand is another calculated field
      const depField = calcByKey.get(opRef);
      if (depField && depField.key !== key) {
        visit(depField, [...path, key]);
      }
    }

    visiting.delete(key);
    visited.add(key);
    sorted.push(calcField);
  }

  for (const f of calculatedFields) {
    if (!visited.has(f.key)) {
      visit(f, []);
    }
  }

  return { sorted, cycles };
}

/**
 * Evaluates all calculated fields against the current form values and detail rows.
 *
 * Requirements:
 * - Topological dependency evaluation order.
 * - Safe division by zero (returns null or 0, avoids Infinity / NaN).
 * - Safe aggregation on detail grid columns (sum, min, max, count).
 * - Cycle detection without recursion crash.
 */
export function evaluateCalculations(
  fields: readonly FieldDefinition[],
  formValues: Record<string, unknown> = {},
  detailsData: Record<string, Array<Record<string, unknown>>> = {},
): CalculationEvaluationResult {
  const result: CalculationEvaluationResult = {
    values: {},
    errors: [],
  };

  const calculatedFields = fields.filter(
    (f): f is CalculatedFieldDefinition => f.type === 'calculated' && !!f.calculationConfig,
  );

  if (calculatedFields.length === 0) {
    return result;
  }

  const fieldKeyToField = new Map<string, FieldDefinition>();
  const fieldIdToField = new Map<string, FieldDefinition>();
  for (const f of fields) {
    fieldKeyToField.set(f.key, f);
    fieldIdToField.set(f.id, f);
  }

  const { sorted, cycles } = sortCalculatedFieldsTopologically(
    calculatedFields,
    fieldKeyToField,
    fieldIdToField,
  );

  if (cycles.length > 0) {
    result.errors.push(...cycles);
  }

  // Work with a mutable copy of values including newly computed calculated fields
  // Seed with both field.key and field.id so formulas referencing either identifier resolve reliably
  const currentValues: Record<string, unknown> = { ...formValues };
  for (const f of fields) {
    if (Object.prototype.hasOwnProperty.call(formValues, f.key)) {
      currentValues[f.id] = formValues[f.key];
    } else if (Object.prototype.hasOwnProperty.call(formValues, f.id)) {
      currentValues[f.key] = formValues[f.id];
    }
  }

  function resolveOperand(ref: string): number | null {
    if (Object.prototype.hasOwnProperty.call(currentValues, ref)) {
      return toNumber(currentValues[ref]);
    }
    const fByKey = fieldKeyToField.get(ref);
    if (fByKey && Object.prototype.hasOwnProperty.call(currentValues, fByKey.key)) {
      return toNumber(currentValues[fByKey.key]);
    }
    const fById = fieldIdToField.get(ref);
    if (fById && Object.prototype.hasOwnProperty.call(currentValues, fById.key)) {
      return toNumber(currentValues[fById.key]);
    }
    return null;
  }

  for (const field of sorted) {
    const config = field.calculationConfig;
    const precision =
      typeof config.precision === 'number' && config.precision >= 0
        ? config.precision
        : 4;
    let computed: number | null = null;

    try {
      // 0. Custom formula expression
      if (config.formula || config.operation === 'custom') {
        if (config.formula && config.formula.trim().length > 0) {
          const evalRes = evaluateFormula(config.formula, currentValues, { precision });
          computed = evalRes.value;
          if (evalRes.error) {
            result.errors.push(`Formula error in field ${field.key}: ${evalRes.error}`);
          }
        } else {
          computed = null;
        }
      } else if (config.source) {
        // 1. Grid details source (e.g. source: "tab_key.column_key")
        const [tabKey, colKey] = config.source.split('.');
        const rows = (tabKey && detailsData[tabKey]) || [];

        const colValues: number[] = [];
        for (const row of rows) {
          if (row && colKey && Object.prototype.hasOwnProperty.call(row, colKey)) {
            const num = toNumber(row[colKey]);
            if (num !== null) colValues.push(num);
          }
        }

        switch (config.operation) {
          case 'sum':
            computed = colValues.reduce((acc, v) => acc + v, 0);
            break;
          case 'count':
            computed = rows.length;
            break;
          case 'min':
            computed = colValues.length > 0 ? Math.min(...colValues) : null;
            break;
          case 'max':
            computed = colValues.length > 0 ? Math.max(...colValues) : null;
            break;
          case 'add':
            computed = colValues.reduce((acc, v) => acc + v, 0);
            break;
          case 'multiply':
            computed = colValues.length > 0 ? colValues.reduce((acc, v) => acc * v, 1) : 0;
            break;
          default:
            computed = null;
        }
      } else {
        // 2. Operands from form values
        const operands = (config.operands || []).map((opRef) => resolveOperand(opRef));

        switch (config.operation) {
          case 'add': {
            const nums = operands.filter((n): n is number => n !== null);
            computed = nums.length > 0 ? nums.reduce((a, b) => a + b, 0) : 0;
            break;
          }

          case 'subtract': {
            if (operands.length === 0) {
              computed = 0;
            } else {
              const first = operands[0] ?? 0;
              const rest = operands.slice(1).map((n) => n ?? 0);
              computed = rest.reduce((acc, v) => acc - v, first);
            }
            break;
          }

          case 'multiply': {
            const nums = operands.filter((n): n is number => n !== null);
            computed = nums.length > 0 ? nums.reduce((a, b) => a * b, 1) : 0;
            break;
          }

          case 'divide': {
            if (operands.length < 2) {
              computed = operands[0] ?? null;
            } else {
              const numerator = operands[0];
              const denominator = operands[1];
              if (
                numerator === null ||
                denominator === null ||
                denominator === 0 ||
                !Number.isFinite(denominator)
              ) {
                computed = null;
                if (denominator === 0) {
                  result.errors.push(`Division by zero in field ${field.key}`);
                }
              } else {
                computed = numerator / denominator;
              }
            }
            break;
          }

          case 'sum': {
            const nums = operands.filter((n): n is number => n !== null);
            computed = nums.reduce((a, b) => a + b, 0);
            break;
          }

          case 'min': {
            const nums = operands.filter((n): n is number => n !== null);
            computed = nums.length > 0 ? Math.min(...nums) : null;
            break;
          }

          case 'max': {
            const nums = operands.filter((n): n is number => n !== null);
            computed = nums.length > 0 ? Math.max(...nums) : null;
            break;
          }

          case 'count': {
            const valid = operands.filter((n) => n !== null);
            computed = valid.length;
            break;
          }

          default:
            result.errors.push(`Unknown calculation operation: ${String(config.operation)}`);
            computed = null;
        }
      }

      if (computed !== null && Number.isFinite(computed)) {
        computed = safeRound(computed, precision);
      } else {
        computed = null;
      }
    } catch (err) {
      result.errors.push(`Calculation error in field ${field.key}: ${err instanceof Error ? err.message : String(err)}`);
      computed = null;
    }

    result.values[field.key] = computed;
    result.values[field.id] = computed;
    currentValues[field.key] = computed;
    currentValues[field.id] = computed;
  }

  return result;
}

