import { describe, expect, it } from 'vitest';
import { validateDraftSchema, validatePublishableSchema } from '../validation';
import { FormSchemaV1 } from '../schema/form-schema';
import { ALLOWLISTED_FILTER_OPERATORS } from '../schema/list-view';

function createBaseSchema(): FormSchemaV1 {
  return {
    schemaVersion: 1,
    form: {
      id: 'form_123',
      key: 'maintenance_request',
      title: 'Equipment Maintenance Request',
      schemaVersion: 1,
    },
    header: {
      sections: [
        {
          id: 'sec_1',
          key: 'general',
          title: 'General Info',
          order: 0,
          fields: [
            { id: 'f_asset', key: 'asset_tag', type: 'text', label: 'Asset Tag', order: 0 },
            { id: 'f_cost', key: 'estimated_cost', type: 'currency', label: 'Est Cost', order: 1 },
            { id: 'f_priority', key: 'priority', type: 'dropdown', label: 'Priority', order: 2, options: [{ label: 'High', value: 'high' }] },
            { id: 'f_active', key: 'is_urgent', type: 'checkbox', label: 'Is Urgent', order: 3 },
          ],
        },
      ],
    },
    tabs: [],
    rules: [],
    workflow: null,
    listView: {
      columns: [
        { id: 'col_ref', sourceRef: 'system.reference_number', label: 'Ref #', order: 0 },
        { id: 'col_asset', sourceRef: 'asset_tag', label: 'Asset Tag', order: 1 },
      ],
      defaultSort: { fieldRef: 'system.created_at', direction: 'desc' },
      pageSize: 25,
    },
    permissions: {},
    settings: {},
  };
}

describe('List View Schema and Validation', () => {
  describe('Backward Compatibility', () => {
    it('accepts existing minimal ListViewDefinition with empty columns', () => {
      const s = createBaseSchema();
      s.listView = { columns: [] };
      expect(validateDraftSchema(s).valid).toBe(true);
      expect(validatePublishableSchema(s).valid).toBe(true);
    });

    it('accepts legacy single-object defaultSort', () => {
      const s = createBaseSchema();
      s.listView.defaultSort = { fieldRef: 'asset_tag', direction: 'asc' };
      expect(validateDraftSchema(s).valid).toBe(true);
      expect(validatePublishableSchema(s).valid).toBe(true);
    });
  });

  describe('Column Properties Validation', () => {
    it('accepts rich column configuration with visibility, alignment, formatting and widths', () => {
      const s = createBaseSchema();
      s.listView.columns = [
        {
          id: 'col_1',
          sourceRef: 'system.reference_number',
          label: 'Ref',
          order: 0,
          width: 140,
          visible: true,
          sortable: true,
          filterable: true,
          searchable: true,
          format: 'text',
          alignment: 'left',
        },
        {
          id: 'col_2',
          sourceRef: 'estimated_cost',
          label: 'Cost',
          order: 1,
          width: 120,
          visible: false,
          format: 'currency',
          alignment: 'right',
        },
        {
          id: 'col_3',
          sourceRef: 'is_urgent',
          label: 'Urgent',
          order: 2,
          format: 'boolean',
          alignment: 'center',
        },
      ];
      expect(validateDraftSchema(s).valid).toBe(true);
      expect(validatePublishableSchema(s).valid).toBe(true);
    });

    it('rejects column width smaller than 40px', () => {
      const s = createBaseSchema();
      s.listView.columns[0].width = 30;
      const res = validateDraftSchema(s);
      expect(res.valid).toBe(false);
      expect(res.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ path: 'listView.columns[0].width', code: 'INVALID_LIST_VIEW_CONFIG' }),
        ]),
      );
    });

    it('rejects invalid column alignment', () => {
      const s = createBaseSchema();
      // @ts-expect-error test invalid string
      s.listView.columns[0].alignment = 'diagonal';
      const res = validateDraftSchema(s);
      expect(res.valid).toBe(false);
      expect(res.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ path: 'listView.columns[0].alignment', code: 'INVALID_LIST_VIEW_CONFIG' }),
        ]),
      );
    });

    it('rejects duplicate column IDs', () => {
      const s = createBaseSchema();
      s.listView.columns = [
        { id: 'dup_id', sourceRef: 'asset_tag', label: 'Col 1', order: 0 },
        { id: 'dup_id', sourceRef: 'estimated_cost', label: 'Col 2', order: 1 },
      ];
      const res = validateDraftSchema(s);
      expect(res.valid).toBe(false);
      expect(res.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ path: 'listView.columns[1].id', code: 'INVALID_LIST_VIEW_CONFIG' }),
        ]),
      );
    });
  });

  describe('Sorting Configuration', () => {
    it('accepts multi-column sort array with priorities', () => {
      const s = createBaseSchema();
      s.listView.defaultSort = [
        { fieldRef: 'priority', direction: 'desc', priority: 0 },
        { fieldRef: 'system.created_at', direction: 'asc', priority: 1 },
      ];
      expect(validateDraftSchema(s).valid).toBe(true);
      expect(validatePublishableSchema(s).valid).toBe(true);
    });

    it('rejects duplicate field in sort rules', () => {
      const s = createBaseSchema();
      s.listView.defaultSort = [
        { fieldRef: 'asset_tag', direction: 'asc' },
        { fieldRef: 'asset_tag', direction: 'desc' },
      ];
      const res = validateDraftSchema(s);
      expect(res.valid).toBe(false);
      expect(res.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ path: 'listView.defaultSort[1].fieldRef', code: 'INVALID_LIST_VIEW_CONFIG' }),
        ]),
      );
    });
  });

  describe('Filter Configuration and Operator Allowlist', () => {
    it('accepts valid defaultFilters with allowlisted operators and AND/OR combinator', () => {
      const s = createBaseSchema();
      s.listView.defaultFilters = [
        {
          id: 'grp_1',
          combinator: 'and',
          conditions: [
            { id: 'cond_1', sourceRef: 'priority', operator: 'equals', value: 'high' },
            { id: 'cond_2', sourceRef: 'estimated_cost', operator: 'greater_than', value: 100 },
            { id: 'cond_3', sourceRef: 'system.status', operator: 'is_not_empty' },
          ],
        },
      ];
      expect(validateDraftSchema(s).valid).toBe(true);
      expect(validatePublishableSchema(s).valid).toBe(true);
    });

    it('rejects non-allowlisted filter operators', () => {
      const s = createBaseSchema();
      s.listView.defaultFilters = [
        {
          id: 'grp_1',
          combinator: 'and',
          conditions: [
            // @ts-expect-error test illegal operator
            { id: 'cond_bad', sourceRef: 'asset_tag', operator: 'raw_sql_exec', value: 'DROP TABLE' },
          ],
        },
      ];
      const res = validateDraftSchema(s);
      expect(res.valid).toBe(false);
      expect(res.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: 'listView.defaultFilters[0].conditions[0].operator',
            code: 'INVALID_FILTER_OPERATOR',
          }),
        ]),
      );
    });

    it('ALLOWLISTED_FILTER_OPERATORS contains required operators', () => {
      expect(ALLOWLISTED_FILTER_OPERATORS).toContain('equals');
      expect(ALLOWLISTED_FILTER_OPERATORS).toContain('not_equals');
      expect(ALLOWLISTED_FILTER_OPERATORS).toContain('contains');
      expect(ALLOWLISTED_FILTER_OPERATORS).toContain('greater_than');
      expect(ALLOWLISTED_FILTER_OPERATORS).toContain('between');
      expect(ALLOWLISTED_FILTER_OPERATORS).toContain('is_empty');
      expect(ALLOWLISTED_FILTER_OPERATORS).toContain('is_true');
    });
  });

  describe('Search Configuration', () => {
    it('accepts valid search configuration', () => {
      const s = createBaseSchema();
      s.listView.search = {
        enabled: true,
        searchableFields: ['asset_tag', 'system.reference_number'],
        placeholder: 'Search maintenance requests...',
      };
      expect(validateDraftSchema(s).valid).toBe(true);
      expect(validatePublishableSchema(s).valid).toBe(true);
    });
  });

  describe('Field Reference Integrity on Publish', () => {
    it('rejects non-existent column sourceRef on publish', () => {
      const s = createBaseSchema();
      s.listView.columns.push({
        id: 'col_ghost',
        sourceRef: 'non_existent_field',
        label: 'Ghost Field',
        order: 2,
      });

      // Valid as a draft (WIP allowed)
      expect(validateDraftSchema(s).valid).toBe(true);

      // Fails publish validation
      const pubRes = validatePublishableSchema(s);
      expect(pubRes.valid).toBe(false);
      expect(pubRes.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: 'listView.columns[2].sourceRef',
            code: 'BROKEN_LIST_VIEW_REF',
          }),
        ]),
      );
    });

    it('rejects non-existent filter sourceRef on publish', () => {
      const s = createBaseSchema();
      s.listView.defaultFilters = [
        {
          id: 'grp_1',
          combinator: 'or',
          conditions: [
            { id: 'c1', sourceRef: 'unknown_filter_target', operator: 'equals', value: 'x' },
          ],
        },
      ];
      const pubRes = validatePublishableSchema(s);
      expect(pubRes.valid).toBe(false);
      expect(pubRes.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: 'listView.defaultFilters[0].conditions[0].sourceRef',
            code: 'BROKEN_LIST_VIEW_REF',
          }),
        ]),
      );
    });

    it('rejects non-existent searchable field on publish', () => {
      const s = createBaseSchema();
      s.listView.search = {
        enabled: true,
        searchableFields: ['asset_tag', 'phantom_field'],
      };
      const pubRes = validatePublishableSchema(s);
      expect(pubRes.valid).toBe(false);
      expect(pubRes.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: 'listView.search.searchableFields[1]',
            code: 'BROKEN_LIST_VIEW_REF',
          }),
        ]),
      );
    });
  });
});

