import { describe, it, expect } from 'vitest';
import { validateDraftSchema, validatePublishableSchema } from '../validation';
import { MINIMAL_VALID_SCHEMA, ALL_FIELD_TYPES_SCHEMA } from '../fixtures';
import { FormSchemaV1 } from '../schema';

// ---------------------------------------------------------------------------
// Unit Tests — Schema Validation
// ---------------------------------------------------------------------------
describe('Draft Validator', () => {
  it('accepts minimal valid schema', () => {
    const res = validateDraftSchema(MINIMAL_VALID_SCHEMA);
    expect(res.valid).toBe(true);
    expect(res.errors).toHaveLength(0);
  });

  it('accepts schema with all field and tab types', () => {
    const res = validateDraftSchema(ALL_FIELD_TYPES_SCHEMA);
    expect(res.valid).toBe(true);
  });

  it('rejects unsupported schemaVersion', () => {
    const invalid = { ...MINIMAL_VALID_SCHEMA, schemaVersion: 2 };
    const res = validateDraftSchema(invalid);
    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => e.code === 'UNSUPPORTED_SCHEMA_VERSION')).toBe(true);
  });

  it('rejects non-object input', () => {
    expect(validateDraftSchema(null).valid).toBe(false);
    expect(validateDraftSchema('string').valid).toBe(false);
    expect(validateDraftSchema(42).valid).toBe(false);
  });

  // --- Duplicate detection ---
  it('detects duplicate field IDs', () => {
    const schema: FormSchemaV1 = {
      ...MINIMAL_VALID_SCHEMA,
      header: {
        columns: 1,
        sections: [{
          id: 'sec_1', key: 'sec_1_key', title: 'S', order: 0,
          fields: [
            { id: 'fld_dup', key: 'key_a', type: 'text', label: 'L1', order: 0 },
            { id: 'fld_dup', key: 'key_b', type: 'text', label: 'L2', order: 1 },
          ],
        }],
      },
    };
    const res = validateDraftSchema(schema);
    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => e.code === 'DUPLICATE_FIELD_ID')).toBe(true);
  });

  it('detects duplicate field keys', () => {
    const schema: FormSchemaV1 = {
      ...MINIMAL_VALID_SCHEMA,
      header: {
        columns: 1,
        sections: [{
          id: 'sec_1', key: 'sec_1_key', title: 'S', order: 0,
          fields: [
            { id: 'fld_a', key: 'dup_key', type: 'text', label: 'L1', order: 0 },
            { id: 'fld_b', key: 'dup_key', type: 'text', label: 'L2', order: 1 },
          ],
        }],
      },
    };
    const res = validateDraftSchema(schema);
    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => e.code === 'DUPLICATE_FIELD_KEY')).toBe(true);
  });

  it('detects duplicate tab IDs', () => {
    const schema: FormSchemaV1 = {
      ...MINIMAL_VALID_SCHEMA,
      tabs: [
        { id: 't1', key: 'tk1', title: 'T1', type: 'form', order: 0, sections: [] },
        { id: 't1', key: 'tk2', title: 'T2', type: 'form', order: 1, sections: [] },
      ],
    };
    const res = validateDraftSchema(schema);
    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => e.code === 'DUPLICATE_TAB_ID')).toBe(true);
  });

  it('detects duplicate tab keys', () => {
    const schema: FormSchemaV1 = {
      ...MINIMAL_VALID_SCHEMA,
      tabs: [
        { id: 't1', key: 'tk_dup', title: 'T1', type: 'form', order: 0, sections: [] },
        { id: 't2', key: 'tk_dup', title: 'T2', type: 'form', order: 1, sections: [] },
      ],
    };
    const res = validateDraftSchema(schema);
    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => e.code === 'DUPLICATE_TAB_KEY')).toBe(true);
  });

  // --- Unsupported types ---
  it('rejects unsupported field type', () => {
    const schema: FormSchemaV1 = {
      ...MINIMAL_VALID_SCHEMA,
      tabs: [{
        id: 't1', key: 'tk1', title: 'T', type: 'form', order: 0,
        sections: [{
          id: 's1', key: 'sk1', title: 'S', order: 0,
          fields: [{ id: 'f1', key: 'fk1', type: 'imaginary' as any, label: 'L', order: 0 }],
        }],
      }],
    };
    const res = validateDraftSchema(schema);
    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => e.code === 'UNSUPPORTED_FIELD_TYPE')).toBe(true);
  });

  it('rejects unsupported tab type', () => {
    const schema: FormSchemaV1 = {
      ...MINIMAL_VALID_SCHEMA,
      tabs: [{ id: 't1', key: 'tk1', title: 'T', type: 'kanban' as any, order: 0 } as any],
    };
    const res = validateDraftSchema(schema);
    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => e.code === 'UNSUPPORTED_TAB_TYPE')).toBe(true);
  });

  // --- Header layout ---
  it('rejects invalid header columns (>4)', () => {
    const schema: FormSchemaV1 = {
      ...MINIMAL_VALID_SCHEMA,
      header: { columns: 6, sections: [] },
    };
    const res = validateDraftSchema(schema);
    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => e.code === 'INVALID_HEADER_LAYOUT')).toBe(true);
  });

  // --- Section layout ---
  it('rejects header section without id/key', () => {
    const schema: FormSchemaV1 = {
      ...MINIMAL_VALID_SCHEMA,
      header: { columns: 1, sections: [{ title: 'S', order: 0, fields: [] } as any] },
    };
    const res = validateDraftSchema(schema);
    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => e.code === 'INVALID_SECTION_LAYOUT')).toBe(true);
  });

  // --- Details/Grid config ---
  it('rejects details tab without configuration', () => {
    const schema: FormSchemaV1 = {
      ...MINIMAL_VALID_SCHEMA,
      tabs: [{ id: 't1', key: 'tk1', title: 'Items', type: 'details', order: 0 } as any],
    };
    const res = validateDraftSchema(schema);
    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => e.code === 'INVALID_DETAILS_CONFIG')).toBe(true);
  });

  // --- Lookup config ---
  it('rejects lookup field without lookupConfig', () => {
    const schema: FormSchemaV1 = {
      ...MINIMAL_VALID_SCHEMA,
      tabs: [{
        id: 't1', key: 'tk1', title: 'T', type: 'form', order: 0,
        sections: [{
          id: 's1', key: 'sk1', title: 'S', order: 0,
          fields: [{ id: 'f1', key: 'fk1', type: 'lookup', label: 'L', order: 0 } as any],
        }],
      }],
    };
    const res = validateDraftSchema(schema);
    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => e.code === 'INVALID_LOOKUP_CONFIG')).toBe(true);
  });

  // --- Notes config ---
  it('rejects notes tab with invalid defaultVisibility', () => {
    const schema: FormSchemaV1 = {
      ...MINIMAL_VALID_SCHEMA,
      tabs: [{
        id: 't1', key: 'tk1', title: 'Notes', type: 'notes', order: 0,
        appendOnly: true, showAuthor: true, showTimestamp: true,
        allowAttachments: false, defaultVisibility: 'bogus' as any,
      }],
    };
    const res = validateDraftSchema(schema);
    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => e.code === 'INVALID_NOTES_CONFIG')).toBe(true);
  });

  // --- Documents config ---
  it('rejects documents tab with invalid maxFileSizeMb', () => {
    const schema: FormSchemaV1 = {
      ...MINIMAL_VALID_SCHEMA,
      tabs: [{
        id: 't1', key: 'tk1', title: 'Docs', type: 'documents', order: 0,
        allowMultiple: true, required: false, maxFileSizeMb: -5,
      }],
    };
    const res = validateDraftSchema(schema);
    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => e.code === 'INVALID_DOCUMENTS_CONFIG')).toBe(true);
  });

  // --- Multiple tabs of same type allowed ---
  it('allows multiple tabs of the same type', () => {
    const schema: FormSchemaV1 = {
      ...MINIMAL_VALID_SCHEMA,
      tabs: [
        { id: 't1', key: 'tk1', title: 'Form A', type: 'form', order: 0, sections: [] },
        { id: 't2', key: 'tk2', title: 'Form B', type: 'form', order: 1, sections: [] },
        { id: 't3', key: 'tk3', title: 'Items A', type: 'details', order: 2, configuration: { columns: [] } },
        { id: 't4', key: 'tk4', title: 'Items B', type: 'details', order: 3, configuration: { columns: [] } },
      ],
    };
    const res = validateDraftSchema(schema);
    expect(res.valid).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Publish Validator — semantic integrity checks
// ---------------------------------------------------------------------------
describe('Publish Validator', () => {
  it('blocks broken rule source references', () => {
    const schema: FormSchemaV1 = {
      ...MINIMAL_VALID_SCHEMA,
      rules: [{
        id: 'r1', key: 'rk1', name: 'R',
        conditions: [{ fieldId: 'non_existent', operator: 'equals', value: 'x' }],
        actions: [{ targetFieldId: 'fld_exists_maybe', action: 'show' }],
      }],
    };
    const res = validatePublishableSchema(schema);
    expect(res.valid).toBe(false);
    expect(res.errors.filter((e) => e.code === 'BROKEN_RULE_REF').length).toBeGreaterThanOrEqual(2);
  });

  it('blocks broken calculation references', () => {
    const schema: FormSchemaV1 = {
      ...MINIMAL_VALID_SCHEMA,
      tabs: [{
        id: 't1', key: 'tk1', title: 'T', type: 'form', order: 0,
        sections: [{
          id: 's1', key: 'sk1', title: 'S', order: 0,
          fields: [{
            id: 'f1', key: 'fk1', type: 'calculated', label: 'Calc', order: 0,
            calculationConfig: { operation: 'add', operands: ['ghost_field_1', 'ghost_field_2'] },
          }],
        }],
      }],
    };
    const res = validatePublishableSchema(schema);
    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => e.code === 'BROKEN_CALCULATION_REF')).toBe(true);
  });

  it('blocks broken list view references', () => {
    const schema: FormSchemaV1 = {
      ...MINIMAL_VALID_SCHEMA,
      listView: {
        columns: [{ id: 'col1', sourceRef: 'non_existent_key', label: 'Col 1', order: 0 }],
      },
    };
    const res = validatePublishableSchema(schema);
    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => e.code === 'BROKEN_LIST_VIEW_REF')).toBe(true);
  });

  it('blocks invalid workflow stage order (duplicates)', () => {
    const schema: FormSchemaV1 = {
      ...MINIMAL_VALID_SCHEMA,
      workflow: {
        type: 'sequential',
        stages: [
          { id: 's1', key: 'sk1', name: 'Stage 1', order: 0, approverType: 'managerOfRequester' },
          { id: 's2', key: 'sk2', name: 'Stage 2', order: 0, approverType: 'role' },
        ],
      },
    };
    const res = validatePublishableSchema(schema);
    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => e.code === 'INVALID_WORKFLOW_ORDER')).toBe(true);
  });

  it('blocks invalid workflow approver config', () => {
    const schema: FormSchemaV1 = {
      ...MINIMAL_VALID_SCHEMA,
      workflow: {
        type: 'sequential',
        stages: [
          { id: 's1', key: 'sk1', name: 'Stage 1', order: 0, approverType: 'alien' as any },
        ],
      },
    };
    const res = validatePublishableSchema(schema);
    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => e.code === 'INVALID_WORKFLOW_APPROVER')).toBe(true);
  });

  it('blocks invalid workflow stage without name', () => {
    const schema: FormSchemaV1 = {
      ...MINIMAL_VALID_SCHEMA,
      workflow: {
        type: 'sequential',
        stages: [
          { id: 's1', key: 'sk1', name: '', order: 0, approverType: 'managerOfRequester' },
        ],
      },
    };
    const res = validatePublishableSchema(schema);
    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => e.code === 'INVALID_WORKFLOW_STAGE')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Draft vs Publish Behavior (Item 6)
// ---------------------------------------------------------------------------
describe('Draft vs Publish behavior', () => {
  it('accepts structurally safe incomplete draft (broken refs allowed)', () => {
    const incompleteDraft: FormSchemaV1 = {
      ...MINIMAL_VALID_SCHEMA,
      rules: [{
        id: 'r1', key: 'rk1', name: 'WIP Rule',
        conditions: [{ fieldId: 'not_added_yet', operator: 'equals', value: 'x' }],
        actions: [{ targetFieldId: 'not_added_yet', action: 'show' }],
      }],
      listView: {
        columns: [{ id: 'c1', sourceRef: 'not_added_yet', label: 'C', order: 0 }],
      },
    };
    const draftRes = validateDraftSchema(incompleteDraft);
    expect(draftRes.valid).toBe(true); // Draft structural check passes

    const pubRes = validatePublishableSchema(incompleteDraft);
    expect(pubRes.valid).toBe(false); // Publish blocks broken refs
    expect(pubRes.errors.some((e) => e.code === 'BROKEN_RULE_REF')).toBe(true);
    expect(pubRes.errors.some((e) => e.code === 'BROKEN_LIST_VIEW_REF')).toBe(true);
  });
});
