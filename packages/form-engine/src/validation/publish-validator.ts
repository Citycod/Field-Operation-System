import { FormSchemaV1 } from '../schema/form-schema';
import { FieldDefinition } from '../schema/fields';
import { DetailsColumnDefinition } from '../schema/tabs';
import { validateDraftSchema } from './draft-validator';
import { ValidationResult } from './types';

export interface PublishDataSourceSnapshot {
  id?: string;
  key: string;
  status?: 'active' | 'inactive' | 'archived';
  fields?: ReadonlyArray<{ key: string }>;
}

export interface PublishValidationContext {
  dataSources?: readonly PublishDataSourceSnapshot[];
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
  const systemRefs = new Set(['system.id', 'system.reference_number', 'system.status', 'system.created_at', 'system.updated_at', 'system.created_by', 'system.submitted_at']);
  const listRef = (ref: string, path: string) => {
    if (!keys.has(ref) && !systemRefs.has(ref)) fail(path, 'BROKEN_LIST_VIEW_REF', 'List View reference does not exist');
  };
  s.listView.columns.forEach((column, i) => listRef(column.sourceRef, `listView.columns[${i}].sourceRef`));
  if (s.listView.defaultSort) listRef(s.listView.defaultSort.fieldRef, 'listView.defaultSort.fieldRef');
  if (s.workflow) {
    if (s.workflow.type !== 'sequential') fail('workflow.type', 'INVALID_WORKFLOW_TYPE', 'Only sequential approval is supported');
    if (!s.workflow.stages.length) fail('workflow.stages', 'INVALID_WORKFLOW_STAGE', 'A configured workflow needs at least one stage');
    const orders = new Set<number>();
    const stageIds = new Set<string>();
    const stageKeys = new Set<string>();
    s.workflow.stages.forEach((stage, i) => {
      const path = `workflow.stages[${i}]`;
      if (typeof stage.name !== 'string' || !stage.name.trim() || !stage.id || !stage.key || stageIds.has(stage.id) || stageKeys.has(stage.key)) fail(path, 'INVALID_WORKFLOW_STAGE', 'Stage needs a name and unique identity');
      stageIds.add(stage.id); stageKeys.add(stage.key);
      // Existing fixtures and contracts use zero-based consecutive orders.
      if (!Number.isInteger(stage.order) || stage.order < 0 || stage.order >= s.workflow!.stages.length || orders.has(stage.order)) fail(`${path}.order`, 'INVALID_WORKFLOW_ORDER', 'Stage orders must be unique consecutive integers starting at zero');
      orders.add(stage.order);
      if (!['user', 'role', 'departmentRole', 'managerOfRequester'].includes(stage.approverType) ||
          (stage.approverType !== 'managerOfRequester' && (typeof stage.approverValue !== 'string' || !stage.approverValue.trim()))) {
        fail(`${path}.approverType`, 'INVALID_WORKFLOW_APPROVER', 'Select a supported approver type and its user/role value');
      }
    });
  }
  result.valid = result.errors.length === 0;
  return result;
}
