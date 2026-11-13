import { ValidationError } from './types';
import {
  ALLOWLISTED_FILTER_OPERATORS,
  ColumnAlignment,
  ColumnFormat,
  ListFilterGroup,
  ListFilterOperator,
  ListViewColumnDefinition,
  ListViewDefinition,
  ListViewSortDefinition,
} from '../schema/list-view';

export const SYSTEM_FIELD_REFS = new Set([
  'system.id',
  'system.reference_number',
  'system.status',
  'system.created_at',
  'system.updated_at',
  'system.created_by',
  'system.submitted_at',
]);

const VALID_FORMATS = new Set<ColumnFormat>([
  'text',
  'date',
  'currency',
  'status',
  'boolean',
  'number',
]);

const VALID_ALIGNMENTS = new Set<ColumnAlignment>(['left', 'center', 'right']);

const OPERATOR_SET = new Set<string>(ALLOWLISTED_FILTER_OPERATORS);

export function validateListViewSemantic(
  listView: unknown,
  availableFieldIds: Set<string>,
  availableFieldKeys: Set<string>,
  strictRefs: boolean,
  path = 'listView',
): ValidationError[] {
  const errors: ValidationError[] = [];
  const fail = (p: string, code: string, message: string) =>
    errors.push({ path: p, code, message });

  if (listView === undefined || listView === null) {
    fail(path, 'INVALID_LIST_VIEW_CONFIG', 'ListView configuration is required');
    return errors;
  }

  if (typeof listView !== 'object' || Array.isArray(listView)) {
    fail(path, 'INVALID_LIST_VIEW_CONFIG', 'ListView configuration must be an object');
    return errors;
  }

  const lv = listView as Partial<ListViewDefinition>;

  // Check valid source ref
  const checkRef = (ref: unknown, p: string) => {
    if (typeof ref !== 'string' || !ref.trim()) {
      fail(p, 'INVALID_LIST_VIEW_CONFIG', 'Source reference must be a non-empty string');
      return;
    }
    if (strictRefs) {
      if (!availableFieldKeys.has(ref) && !SYSTEM_FIELD_REFS.has(ref)) {
        fail(p, 'BROKEN_LIST_VIEW_REF', `List View reference "${ref}" does not exist`);
      }
    }
  };

  // 1. Columns validation
  if (!Array.isArray(lv.columns)) {
    fail(`${path}.columns`, 'INVALID_LIST_VIEW_CONFIG', 'Columns must be an array');
  } else {
    const colIds = new Set<string>();
    lv.columns.forEach((col, i) => {
      const colPath = `${path}.columns[${i}]`;
      if (!col || typeof col !== 'object' || Array.isArray(col)) {
        fail(colPath, 'INVALID_LIST_VIEW_CONFIG', 'Column must be an object');
        return;
      }

      const c = col as Partial<ListViewColumnDefinition>;

      if (typeof c.id !== 'string' || !c.id.trim()) {
        fail(`${colPath}.id`, 'INVALID_LIST_VIEW_CONFIG', 'Column ID is required');
      } else if (colIds.has(c.id)) {
        fail(`${colPath}.id`, 'INVALID_LIST_VIEW_CONFIG', `Duplicate column ID: "${c.id}"`);
      } else {
        colIds.add(c.id);
      }

      checkRef(c.sourceRef, `${colPath}.sourceRef`);

      if (typeof c.label !== 'string') {
        fail(`${colPath}.label`, 'INVALID_LIST_VIEW_CONFIG', 'Column label must be a string');
      }

      if (typeof c.order !== 'number' || !Number.isInteger(c.order) || c.order < 0) {
        fail(`${colPath}.order`, 'INVALID_LIST_VIEW_CONFIG', 'Column order must be a non-negative integer');
      }

      if (c.width !== undefined && (typeof c.width !== 'number' || c.width < 40)) {
        fail(`${colPath}.width`, 'INVALID_LIST_VIEW_CONFIG', 'Column width must be at least 40px');
      }

      if (c.visible !== undefined && typeof c.visible !== 'boolean') {
        fail(`${colPath}.visible`, 'INVALID_LIST_VIEW_CONFIG', 'Column visible must be a boolean');
      }

      if (c.sortable !== undefined && typeof c.sortable !== 'boolean') {
        fail(`${colPath}.sortable`, 'INVALID_LIST_VIEW_CONFIG', 'Column sortable must be a boolean');
      }

      if (c.filterable !== undefined && typeof c.filterable !== 'boolean') {
        fail(`${colPath}.filterable`, 'INVALID_LIST_VIEW_CONFIG', 'Column filterable must be a boolean');
      }

      if (c.searchable !== undefined && typeof c.searchable !== 'boolean') {
        fail(`${colPath}.searchable`, 'INVALID_LIST_VIEW_CONFIG', 'Column searchable must be a boolean');
      }

      if (c.format !== undefined && !VALID_FORMATS.has(c.format)) {
        fail(`${colPath}.format`, 'INVALID_LIST_VIEW_CONFIG', `Invalid column format: "${c.format}"`);
      }

      if (c.alignment !== undefined && !VALID_ALIGNMENTS.has(c.alignment)) {
        fail(`${colPath}.alignment`, 'INVALID_LIST_VIEW_CONFIG', `Invalid column alignment: "${c.alignment}"`);
      }
    });
  }

  // 2. Default sort validation
  if (lv.defaultSort !== undefined && lv.defaultSort !== null) {
    const sortList: Partial<ListViewSortDefinition>[] = Array.isArray(lv.defaultSort)
      ? lv.defaultSort
      : [lv.defaultSort];

    const sortFields = new Set<string>();
    sortList.forEach((sort, i) => {
      const sortPath = Array.isArray(lv.defaultSort)
        ? `${path}.defaultSort[${i}]`
        : `${path}.defaultSort`;

      if (!sort || typeof sort !== 'object' || Array.isArray(sort)) {
        fail(sortPath, 'INVALID_LIST_VIEW_CONFIG', 'Sort rule must be an object');
        return;
      }

      checkRef(sort.fieldRef, `${sortPath}.fieldRef`);

      if (typeof sort.fieldRef === 'string') {
        if (sortFields.has(sort.fieldRef)) {
          fail(`${sortPath}.fieldRef`, 'INVALID_LIST_VIEW_CONFIG', `Duplicate sort field: "${sort.fieldRef}"`);
        } else {
          sortFields.add(sort.fieldRef);
        }
      }

      if (!['asc', 'desc'].includes(String(sort.direction))) {
        fail(`${sortPath}.direction`, 'INVALID_LIST_VIEW_CONFIG', 'Sort direction must be "asc" or "desc"');
      }

      if (sort.priority !== undefined && (typeof sort.priority !== 'number' || sort.priority < 0)) {
        fail(`${sortPath}.priority`, 'INVALID_LIST_VIEW_CONFIG', 'Sort priority must be a non-negative integer');
      }
    });
  }

  // 3. Default filters validation
  if (lv.defaultFilters !== undefined && lv.defaultFilters !== null) {
    if (!Array.isArray(lv.defaultFilters)) {
      fail(`${path}.defaultFilters`, 'INVALID_LIST_VIEW_CONFIG', 'Default filters must be an array of filter groups');
    } else {
      lv.defaultFilters.forEach((group, gIdx) => {
        const groupPath = `${path}.defaultFilters[${gIdx}]`;
        if (!group || typeof group !== 'object' || Array.isArray(group)) {
          fail(groupPath, 'INVALID_LIST_VIEW_CONFIG', 'Filter group must be an object');
          return;
        }

        const grp = group as Partial<ListFilterGroup>;
        if (typeof grp.id !== 'string' || !grp.id.trim()) {
          fail(`${groupPath}.id`, 'INVALID_LIST_VIEW_CONFIG', 'Filter group ID is required');
        }

        if (!['and', 'or'].includes(String(grp.combinator))) {
          fail(`${groupPath}.combinator`, 'INVALID_LIST_VIEW_CONFIG', 'Combinator must be "and" or "or"');
        }

        if (!Array.isArray(grp.conditions)) {
          fail(`${groupPath}.conditions`, 'INVALID_LIST_VIEW_CONFIG', 'Conditions must be an array');
        } else {
          grp.conditions.forEach((cond, cIdx) => {
            const condPath = `${groupPath}.conditions[${cIdx}]`;
            if (!cond || typeof cond !== 'object' || Array.isArray(cond)) {
              fail(condPath, 'INVALID_LIST_VIEW_CONFIG', 'Filter condition must be an object');
              return;
            }

            if (typeof cond.id !== 'string' || !cond.id.trim()) {
              fail(`${condPath}.id`, 'INVALID_LIST_VIEW_CONFIG', 'Condition ID is required');
            }

            checkRef(cond.sourceRef, `${condPath}.sourceRef`);

            if (!OPERATOR_SET.has(String(cond.operator))) {
              fail(
                `${condPath}.operator`,
                'INVALID_FILTER_OPERATOR',
                `Operator "${cond.operator}" is not an allowlisted filter operator`,
              );
            }
          });
        }
      });
    }
  }

  // 4. Search configuration validation
  if (lv.search !== undefined && lv.search !== null) {
    if (typeof lv.search !== 'object' || Array.isArray(lv.search)) {
      fail(`${path}.search`, 'INVALID_LIST_VIEW_CONFIG', 'Search configuration must be an object');
    } else {
      if (lv.search.enabled !== undefined && typeof lv.search.enabled !== 'boolean') {
        fail(`${path}.search.enabled`, 'INVALID_LIST_VIEW_CONFIG', 'search.enabled must be a boolean');
      }

      if (lv.search.placeholder !== undefined && typeof lv.search.placeholder !== 'string') {
        fail(`${path}.search.placeholder`, 'INVALID_LIST_VIEW_CONFIG', 'search.placeholder must be a string');
      }

      if (lv.search.searchableFields !== undefined) {
        if (!Array.isArray(lv.search.searchableFields)) {
          fail(`${path}.search.searchableFields`, 'INVALID_LIST_VIEW_CONFIG', 'searchableFields must be an array');
        } else {
          lv.search.searchableFields.forEach((fRef, sIdx) => {
            checkRef(fRef, `${path}.search.searchableFields[${sIdx}]`);
          });
        }
      }
    }
  }

  // 5. Page size validation
  if (lv.pageSize !== undefined) {
    if (typeof lv.pageSize !== 'number' || !Number.isInteger(lv.pageSize) || lv.pageSize < 1 || lv.pageSize > 100) {
      fail(`${path}.pageSize`, 'INVALID_LIST_VIEW_CONFIG', 'pageSize must be an integer between 1 and 100');
    }
  }

  return errors;
}

