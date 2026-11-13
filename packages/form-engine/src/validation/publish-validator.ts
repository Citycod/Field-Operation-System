import { FormSchemaV1 } from '../schema/form-schema';
import { FieldDefinition } from '../schema/fields';
import { DetailsColumnDefinition } from '../schema/tabs';
import { validateDraftSchema } from './draft-validator';
import { ValidationResult } from './types';
import { validateRulesSemantic, validateCalculationsSemantic } from './rules-validator';
import { validateListViewSemantic } from './list-view-validator';
import { validateWorkflowSemantic } from './workflow-validator';

export interface PublishDataSourceSnapshot {
  id?: string;
  key: string;
  status?: 'active' | 'inactive' | 'archived';
  fields?: ReadonlyArray<{ key: string }>;
}

export interface PublishValidationContext {
  dataSources?: readonly PublishDataSourceSnapshot[];
  activeMemberUserIds?: Set<string>;
}

export function validatePublishableSchema(
  schema: unknown,
  context?: PublishValidationContext,
): ValidationResult {
  const result = validateDraftSchema(schema);
  if (!result.valid) return result;
  const s = schema as FormSchemaV1;
  const fail = (path: string, code: string, message: string) => result.errors.push({ path, code, message });
  const fields: (FieldDefinition | DetailsColumnDefinition)[] = s.header.sections.flatMap(section => section.fields);
  for (const tab of s.tabs) {
    if (tab.type === 'form') fields.push(...tab.sections.flatMap(section => section.fields));
    if (tab.type === 'details') fields.push(...tab.configuration.columns);
  }
  if (context?.dataSources) {
    for (const field of fields) {
      if (field.type !== 'lookup' || !field.lookupConfig) continue;
      const path = `field[${field.id}].lookupConfig`;
      const target = field.lookupConfig.targetEntity?.trim();
      const matched = context.dataSources.find(
        ds => ds.key === target || (ds.id && ds.id === target),
      );
      if (!matched) {
        fail(`${path}.targetEntity`, 'BROKEN_LOOKUP_SOURCE', `Lookup data source "${target}" does not exist`);
        continue;
      }
      if (matched.status && matched.status !== 'active') {
        fail(`${path}.targetEntity`, 'INACTIVE_LOOKUP_SOURCE', `Lookup data source "${target}" is not active`);
      }
      if (matched.fields && matched.fields.length > 0) {
        const fieldKeys = new Set(matched.fields.map(f => f.key));
        if (!fieldKeys.has(field.lookupConfig.displayField)) {
          fail(`${path}.displayField`, 'BROKEN_LOOKUP_FIELD', `Lookup display field "${field.lookupConfig.displayField}" does not exist on data source "${matched.key}"`);
        }
        if (!fieldKeys.has(field.lookupConfig.valueField)) {
          fail(`${path}.valueField`, 'BROKEN_LOOKUP_FIELD', `Lookup value field "${field.lookupConfig.valueField}" does not exist on data source "${matched.key}"`);
        }
      }
    }
  }
  const ids = new Set(fields.map(field => field.id));
  const keys = new Set(fields.map(field => field.key));
  for (const [r, rule] of s.rules.entries()) {
    for (const [c, condition] of rule.conditions.entries()) {
      if (!ids.has(condition.fieldId)) fail(`rules[${r}].conditions[${c}].fieldId`, 'BROKEN_RULE_REF', 'Rule source field does not exist');
    }
    for (const [a, action] of rule.actions.entries()) {
      if (!ids.has(action.targetFieldId)) fail(`rules[${r}].actions[${a}].targetFieldId`, 'BROKEN_RULE_REF', 'Rule target field does not exist');
    }
  }
  for (const field of fields) {
    if (field.type !== 'calculated' || !field.calculationConfig) continue;
    const config = field.calculationConfig;
    const path = `field[${field.id}].calculationConfig`;
    if (!config.source && !config.operands?.length) fail(path, 'INVALID_CALCULATION_CONFIG', 'A calculation needs operands or a grid source');
    for (const [i, operand] of (config.operands ?? []).entries()) {
      if (!ids.has(operand) && !keys.has(operand)) fail(`${path}.operands[${i}]`, 'BROKEN_CALCULATION_REF', 'Calculation operand does not exist');
    }
    if (config.source) {
      const [tabKey, columnKey, extra] = config.source.split('.');
      const tab = s.tabs.find(tab => tab.key === tabKey);
      if (extra !== undefined || tab?.type !== 'details' || !tab.configuration.columns.some(column => column.key === columnKey)) {
        fail(`${path}.source`, 'BROKEN_CALCULATION_REF', 'Calculation source must identify an existing Details column as tab_key.field_key');
      }
    }
  }
  for (const err of validateRulesSemantic(s.rules, ids, keys, true)) {
    if (!result.errors.some(e => e.path === err.path && e.code === err.code)) {
      result.errors.push(err);
    }
  }
  for (const err of validateCalculationsSemantic(fields, s.tabs, true)) {
    if (!result.errors.some(e => e.path === err.path && e.code === err.code)) {
      result.errors.push(err);
    }
  }
  for (const err of validateListViewSemantic(s.listView, ids, keys, true)) {
    if (!result.errors.some(e => e.path === err.path && e.code === err.code)) {
      result.errors.push(err);
    }
  }
  if (s.workflow !== undefined && s.workflow !== null) {
    const wfReport = validateWorkflowSemantic(
      s.workflow,
      fields,
      ids,
      keys,
      true,
      { activeMemberUserIds: context?.activeMemberUserIds },
    );
    for (const err of wfReport.errors) {
      if (!result.errors.some(e => e.path === err.path && e.code === err.code && e.message === err.message)) {
        result.errors.push(err);
      }
    }
    for (const warn of wfReport.warnings) {
      result.warnings.push(warn);
    }
  }
  result.valid = result.errors.length === 0;
  return result;
}
