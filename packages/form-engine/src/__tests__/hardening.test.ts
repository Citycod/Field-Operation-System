import { describe, expect, it } from 'vitest';
import { ALL_FIELD_TYPES_SCHEMA, MINIMAL_VALID_SCHEMA } from '../fixtures';
import { validateDraftSchema, validatePublishableSchema } from '../validation';
import { FormSchemaV1 } from '../schema/form-schema';

const fixture = () => structuredClone(ALL_FIELD_TYPES_SCHEMA);
const headerField = (s: FormSchemaV1) => s.header.sections[0].fields[0];
const grid = (s: FormSchemaV1) => {
  const tab = s.tabs.find(t => t.type === 'details');
  if (!tab || tab.type !== 'details') throw new Error('Fixture missing grid');
  return tab;
};

describe('Draft structure hardening', () => {
  it.each([0, 5, 1.5, NaN, Infinity])('rejects invalid header columns %s', columns => {
    const s = fixture(); s.header.columns = columns;
    expect(validateDraftSchema(s).errors.some(e => e.code === 'INVALID_HEADER_LAYOUT')).toBe(true);
  });
  it.each([0, 5, 1.5])('rejects invalid form section columns %s', columns => {
    const s = fixture(); const tab = s.tabs[0];
    if (tab.type !== 'form') throw new Error('Fixture missing form tab');
    tab.sections[0].columns = columns;
    expect(validateDraftSchema(s).errors.some(e => e.code === 'INVALID_SECTION_LAYOUT')).toBe(true);
  });
  it.each(['INVALID_DETAILS_CONFIG', 'UNSUPPORTED_FIELD_TYPE', 'DUPLICATE_FIELD_ID', 'DUPLICATE_FIELD_KEY', 'INVALID_LOOKUP_CONFIG'])('validates grid columns: %s', code => {
    const s = fixture(); const g = grid(s);
    if (code === 'INVALID_DETAILS_CONFIG') { g.configuration.minRows = 4; g.configuration.maxRows = 2; }
    if (code === 'UNSUPPORTED_FIELD_TYPE') Object.assign(g.configuration.columns[0], { type: 'script' });
    if (code === 'DUPLICATE_FIELD_ID') g.configuration.columns[0].id = headerField(s).id;
    if (code === 'DUPLICATE_FIELD_KEY') g.configuration.columns[0].key = headerField(s).key;
    if (code === 'INVALID_LOOKUP_CONFIG') Object.assign(g.configuration.columns[0], { type: 'lookup', lookupConfig: { targetEntity: 42, valueField: 'id', displayField: 'name' } });
    expect(validateDraftSchema(s).errors.some(e => e.code === code)).toBe(true);
  });
  it('rejects non-append-only Notes', () => {
    const s = fixture(); Object.assign(s.tabs[2], { appendOnly: false });
    expect(validateDraftSchema(s).errors.some(e => e.code === 'INVALID_NOTES_CONFIG')).toBe(true);
  });
  it.each([{ maxFiles: 1.5 }, { maxFiles: 0 }, { maxFileSizeMb: Infinity }, { allowedExtensions: 'pdf' }, { required: 'yes' }])('rejects invalid Documents options %j', patch => {
    const s = fixture(); Object.assign(s.tabs[3], patch);
    expect(validateDraftSchema(s).errors.some(e => e.code === 'INVALID_DOCUMENTS_CONFIG')).toBe(true);
  });
  it.each([
    { header: null }, { header: { sections: [null] } }, { tabs: 'bad' },
    { rules: [null] }, { rules: [{ conditions: [null], actions: [] }] },
    { workflow: { stages: [null] } }, { listView: { columns: [null] } },
    { listView: { columns: [{ sourceRef: 42 }] } },
  ])('rejects malformed containers without throwing: %j', patch => {
    const s = { ...fixture(), ...patch };
    expect(validateDraftSchema(s).valid).toBe(false);
    expect(validatePublishableSchema(s).valid).toBe(false);
  });
  it('accepts multiple tabs of every supported type at publish time', () => {
    const s = structuredClone(MINIMAL_VALID_SCHEMA);
    s.tabs = ['a', 'b'].flatMap(suffix => [
      { id: `form-${suffix}`, key: `form-${suffix}`, title: 'Fields', type: 'form' as const, order: 0, sections: [] },
      { id: `details-${suffix}`, key: `details-${suffix}`, title: 'Grid', type: 'details' as const, order: 1, configuration: { columns: [] } },
      { id: `notes-${suffix}`, key: `notes-${suffix}`, title: 'Notes', type: 'notes' as const, order: 2, appendOnly: true, showAuthor: true, showTimestamp: true, allowAttachments: false, defaultVisibility: 'internal' as const },
      { id: `documents-${suffix}`, key: `documents-${suffix}`, title: 'Files', type: 'documents' as const, order: 3, required: false, allowMultiple: true },
    ]);
    expect(validateDraftSchema(s).valid).toBe(true);
    expect(validatePublishableSchema(s).valid).toBe(true);
  });
});

describe('Publish semantic hardening', () => {
  it.each(['source', 'target'])('blocks broken rule %s independently', side => {
    const s = fixture();
    if (side === 'source') s.rules[0].conditions[0].fieldId = 'missing';
    else s.rules[0].actions[0].targetFieldId = 'missing';
    expect(validateDraftSchema(s).valid).toBe(true);
    expect(validatePublishableSchema(s).errors.filter(e => e.code === 'BROKEN_RULE_REF')).toHaveLength(1);
  });
  it.each(['header', 'form', 'details'])('validates calculation sources in %s', location => {
    const s = fixture();
    const field = { id: 'aggregate', key: 'aggregate', label: 'Total', type: 'calculated' as const, order: 10, calculationConfig: { operation: 'sum' as const, source: 'line_items.missing_column' } };
    if (location === 'header') s.header.sections[0].fields.push(field);
    if (location === 'form' && s.tabs[0].type === 'form') s.tabs[0].sections[0].fields.push(field);
    if (location === 'details') grid(s).configuration.columns.push(field);
    expect(validateDraftSchema(s).valid).toBe(true);
    expect(validatePublishableSchema(s).errors.some(e => e.code === 'BROKEN_CALCULATION_REF')).toBe(true);
    field.calculationConfig.source = 'line_items.quantity';
    expect(validatePublishableSchema(s).valid).toBe(true);
  });
  it('blocks empty calculations only at publish time', () => {
    const s = fixture();
    s.header.sections[0].fields.push({ id: 'c', key: 'c', label: 'Calc', type: 'calculated', order: 1, calculationConfig: { operation: 'add' } });
    expect(validateDraftSchema(s).valid).toBe(true);
    expect(validatePublishableSchema(s).errors.some(e => e.code === 'INVALID_CALCULATION_CONFIG')).toBe(true);
  });
  it.each(['system.typo', 'unknown_field'])('blocks invalid List View sort reference %s', fieldRef => {
    const s = fixture(); s.listView.defaultSort = { fieldRef, direction: 'asc' };
    expect(validateDraftSchema(s).valid).toBe(true);
    expect(validatePublishableSchema(s).errors.some(e => e.code === 'BROKEN_LIST_VIEW_REF')).toBe(true);
  });
  it('blocks unknown system column references', () => {
    const s = fixture(); s.listView.columns[0].sourceRef = 'system.typo';
    expect(validatePublishableSchema(s).valid).toBe(false);
  });
  it.each([-1, 0.5, 2, undefined])('blocks invalid workflow order %s', order => {
    const s = fixture(); Object.assign(s.workflow!.stages[0], { order });
    expect(validateDraftSchema(s).valid).toBe(true);
    expect(validatePublishableSchema(s).errors.some(e => e.code === 'INVALID_WORKFLOW_ORDER')).toBe(true);
  });
  it.each(['user', 'role', 'departmentRole'] as const)('allows incomplete %s selection in Draft and blocks Publish', approverType => {
    const s = fixture(); Object.assign(s.workflow!.stages[0], { approverType, approverValue: ' ' });
    expect(validateDraftSchema(s).valid).toBe(true);
    expect(validatePublishableSchema(s).errors.some(e => e.code === 'INVALID_WORKFLOW_APPROVER')).toBe(true);
    s.workflow!.stages[0].approverValue = 'selected-identity';
    expect(validatePublishableSchema(s).valid).toBe(true);
  });
});
