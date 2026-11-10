import { ValidationError } from './types';

type RecordValue = Record<string, unknown>;
const object = (value: unknown): value is RecordValue =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const integer = (value: unknown, min = 0): boolean => typeof value === 'number' && Number.isInteger(value) && value >= min;

// Check containers before the semantic validator traverses untrusted JSON.
// Unresolved references and incomplete workflow selections remain valid drafts.
export function validateStructure(value: unknown): ValidationError[] {
  const errors: ValidationError[] = [];
  const fail = (path: string, code: string, message = 'Invalid configuration structure') => errors.push({ path, code, message });
  const record = (v: unknown, path: string, code: string): v is RecordValue => {
    if (object(v)) return true;
    fail(path, code);
    return false;
  };
  const array = (v: unknown, path: string, code: string): v is unknown[] => {
    if (Array.isArray(v)) return true;
    fail(path, code, 'Expected an array');
    return false;
  };
  const columns = (v: unknown, path: string, code: string) => {
    if (v !== undefined && (!integer(v, 1) || Number(v) > 4)) fail(path, code, 'Columns must be an integer from 1 to 4');
  };
  const booleans = (v: RecordValue, keys: string[], path: string, code: string, required = false) => {
    for (const key of keys) {
      if ((required || v[key] !== undefined) && typeof v[key] !== 'boolean') fail(`${path}.${key}`, code, 'Expected a boolean');
    }
  };
  const strings = (v: unknown, path: string, code: string) => {
    if (array(v, path, code) && !v.every(text)) fail(path, code, 'Expected non-empty strings');
  };
  function field(v: unknown, path: string) {
    if (!record(v, path, 'INVALID_FIELD')) return;
    for (const key of ['id', 'key']) if (!text(v[key])) fail(`${path}.${key}`, 'INVALID_FIELD');
    if (typeof v.label !== 'string' || !integer(v.order)) fail(path, 'INVALID_FIELD');
    booleans(v, ['required', 'readOnly', 'hidden'], path, 'INVALID_FIELD');
    if (v.type === 'lookup') {
      if (record(v.lookupConfig, `${path}.lookupConfig`, 'INVALID_LOOKUP_CONFIG')) {
        for (const key of ['targetEntity', 'displayField', 'valueField']) {
          if (!text(v.lookupConfig[key])) fail(`${path}.lookupConfig.${key}`, 'INVALID_LOOKUP_CONFIG');
        }
      }
    }
    if (v.type === 'calculated' && record(v.calculationConfig, `${path}.calculationConfig`, 'INVALID_CALCULATION_CONFIG')) {
      if (v.calculationConfig.operands !== undefined) strings(v.calculationConfig.operands, `${path}.calculationConfig.operands`, 'INVALID_CALCULATION_CONFIG');
      if (v.calculationConfig.source !== undefined && !text(v.calculationConfig.source)) fail(`${path}.calculationConfig.source`, 'INVALID_CALCULATION_CONFIG');
    }
    if (v.type === 'dropdown' && array(v.options, `${path}.options`, 'INVALID_FIELD')) {
      v.options.forEach((option, i) => {
        if (!object(option) || typeof option.label !== 'string' || !text(option.value)) fail(`${path}.options[${i}]`, 'INVALID_FIELD');
      });
    }
  }
  function sections(v: unknown, path: string) {
    if (!array(v, path, 'INVALID_SECTION_LAYOUT')) return;
    const ids = new Set<string>();
    const keys = new Set<string>();
    v.forEach((section, i) => {
      const p = `${path}[${i}]`;
      if (!record(section, p, 'INVALID_SECTION_LAYOUT')) return;
      if (!text(section.id) || !text(section.key) || !integer(section.order)) fail(p, 'INVALID_SECTION_LAYOUT');
      else {
        if (ids.has(section.id) || keys.has(section.key)) fail(p, 'INVALID_SECTION_LAYOUT', 'Duplicate section identity');
        ids.add(section.id); keys.add(section.key);
      }
      columns(section.columns, `${p}.columns`, 'INVALID_SECTION_LAYOUT');
      if (section.width !== undefined && !['full', 'half', 'third', 'quarter'].includes(String(section.width))) fail(`${p}.width`, 'INVALID_SECTION_LAYOUT');
      if (array(section.fields, `${p}.fields`, 'INVALID_SECTION_LAYOUT')) section.fields.forEach((f, j) => field(f, `${p}.fields[${j}]`));
    });
  }
  if (!record(value, '', 'INVALID_OBJECT')) return errors;
  record(value.form, 'form', 'MISSING_FORM_METADATA');
  if (record(value.header, 'header', 'INVALID_HEADER_LAYOUT')) {
    columns(value.header.columns, 'header.columns', 'INVALID_HEADER_LAYOUT');
    sections(value.header.sections, 'header.sections');
  }
  if (array(value.tabs, 'tabs', 'INVALID_TAB')) value.tabs.forEach((tab, i) => {
    const p = `tabs[${i}]`;
    if (!record(tab, p, 'INVALID_TAB')) return;
    if (!text(tab.id) || !text(tab.key) || !integer(tab.order) || typeof tab.title !== 'string') fail(p, 'INVALID_TAB');
    if (tab.type === 'form') {
      columns(tab.columns, `${p}.columns`, 'INVALID_SECTION_LAYOUT');
      sections(tab.sections, `${p}.sections`);
    }
    if (tab.type === 'details' && record(tab.configuration, `${p}.configuration`, 'INVALID_DETAILS_CONFIG')) {
      const config = tab.configuration;
      booleans(config, ['allowAdd', 'allowEdit', 'allowDelete'], `${p}.configuration`, 'INVALID_DETAILS_CONFIG');
      for (const key of ['minRows', 'maxRows']) if (config[key] !== undefined && !integer(config[key])) fail(`${p}.configuration.${key}`, 'INVALID_DETAILS_CONFIG');
      if (typeof config.minRows === 'number' && typeof config.maxRows === 'number' && config.minRows > config.maxRows) fail(`${p}.configuration`, 'INVALID_DETAILS_CONFIG', 'minRows exceeds maxRows');
      if (array(config.columns, `${p}.configuration.columns`, 'INVALID_DETAILS_CONFIG')) config.columns.forEach((f, j) => field(f, `${p}.configuration.columns[${j}]`));
    }
    if (tab.type === 'notes') {
      booleans(tab, ['appendOnly', 'showAuthor', 'showTimestamp', 'allowAttachments'], p, 'INVALID_NOTES_CONFIG', true);
      if (tab.appendOnly !== true || !['internal', 'requester_and_approvers', 'all_authorized_users'].includes(String(tab.defaultVisibility))) fail(p, 'INVALID_NOTES_CONFIG');
    }
    if (tab.type === 'documents') {
      booleans(tab, ['allowMultiple', 'required'], p, 'INVALID_DOCUMENTS_CONFIG', true);
      booleans(tab, ['allowDeleteBeforeSubmit'], p, 'INVALID_DOCUMENTS_CONFIG');
      if (tab.maxFiles !== undefined && !integer(tab.maxFiles, 1)) fail(`${p}.maxFiles`, 'INVALID_DOCUMENTS_CONFIG');
      if (tab.maxFileSizeMb !== undefined && (typeof tab.maxFileSizeMb !== 'number' || !Number.isFinite(tab.maxFileSizeMb) || tab.maxFileSizeMb <= 0)) fail(`${p}.maxFileSizeMb`, 'INVALID_DOCUMENTS_CONFIG');
      if (tab.allowedExtensions !== undefined) strings(tab.allowedExtensions, `${p}.allowedExtensions`, 'INVALID_DOCUMENTS_CONFIG');
    }
  });
  if (array(value.rules, 'rules', 'INVALID_RULE_CONFIG')) value.rules.forEach((rule, i) => {
    const p = `rules[${i}]`;
    if (!record(rule, p, 'INVALID_RULE_CONFIG')) return;
    if (rule.conditionLogic !== undefined && !['AND', 'OR'].includes(String(rule.conditionLogic))) fail(p, 'INVALID_RULE_CONFIG');
    if (array(rule.conditions, `${p}.conditions`, 'INVALID_RULE_CONFIG')) rule.conditions.forEach((condition, j) => {
      if (!object(condition) || !text(condition.fieldId) || !['equals', 'notEquals', 'greaterThan', 'lessThan', 'contains', 'isEmpty', 'isNotEmpty'].includes(String(condition.operator))) fail(`${p}.conditions[${j}]`, 'INVALID_RULE_CONFIG');
    });
    if (array(rule.actions, `${p}.actions`, 'INVALID_RULE_CONFIG')) rule.actions.forEach((action, j) => {
      if (!object(action) || !text(action.targetFieldId) || !['show', 'hide', 'require', 'enable', 'disable', 'setValue'].includes(String(action.action))) fail(`${p}.actions[${j}]`, 'INVALID_RULE_CONFIG');
    });
  });
  if (value.workflow !== null && record(value.workflow, 'workflow', 'INVALID_WORKFLOW_STAGE')) {
    if (array(value.workflow.stages, 'workflow.stages', 'INVALID_WORKFLOW_STAGE')) value.workflow.stages.forEach((stage, i) => record(stage, `workflow.stages[${i}]`, 'INVALID_WORKFLOW_STAGE'));
  }
  if (record(value.listView, 'listView', 'INVALID_LIST_VIEW_CONFIG')) {
    if (array(value.listView.columns, 'listView.columns', 'INVALID_LIST_VIEW_CONFIG')) value.listView.columns.forEach((column, i) => {
      if (!object(column) || !text(column.sourceRef)) fail(`listView.columns[${i}]`, 'INVALID_LIST_VIEW_CONFIG');
    });
    if (value.listView.defaultSort !== undefined && record(value.listView.defaultSort, 'listView.defaultSort', 'INVALID_LIST_VIEW_CONFIG')) {
      if (!text(value.listView.defaultSort.fieldRef) || !['asc', 'desc'].includes(String(value.listView.defaultSort.direction))) fail('listView.defaultSort', 'INVALID_LIST_VIEW_CONFIG');
    }
  }
  record(value.permissions, 'permissions', 'INVALID_PERMISSIONS');
  record(value.settings, 'settings', 'INVALID_SETTINGS');
  return errors;
}
