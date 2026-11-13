export type ColumnFormat = 'text' | 'date' | 'currency' | 'status' | 'boolean' | 'number';

export type ColumnAlignment = 'left' | 'center' | 'right';

export const ALLOWLISTED_FILTER_OPERATORS = [
  'is_empty',
  'is_not_empty',
  'equals',
  'not_equals',
  'contains',
  'not_contains',
  'starts_with',
  'ends_with',
  'greater_than',
  'greater_than_or_equal',
  'less_than',
  'less_than_or_equal',
  'between',
  'before',
  'after',
  'is_today',
  'in_past_days',
  'in',
  'not_in',
  'is_true',
  'is_false',
] as const;

export type ListFilterOperator = (typeof ALLOWLISTED_FILTER_OPERATORS)[number];

export interface ListFilterCondition {
  id: string;
  sourceRef: string;
  operator: ListFilterOperator;
  value?: string | number | boolean | string[] | number[] | null;
  secondaryValue?: string | number | null;
}

export interface ListFilterGroup {
  id: string;
  combinator: 'and' | 'or';
  conditions: ListFilterCondition[];
}

export interface ListViewColumnDefinition {
  id: string;
  sourceRef: string;
  label: string;
  order: number;
  width?: number;
  visible?: boolean;
  sortable?: boolean;
  filterable?: boolean;
  searchable?: boolean;
  format?: ColumnFormat;
  alignment?: ColumnAlignment;
}

export interface ListViewSortDefinition {
  fieldRef: string;
  direction: 'asc' | 'desc';
  priority?: number;
}

export interface ListViewSearchConfig {
  enabled?: boolean;
  searchableFields?: string[];
  placeholder?: string;
}

export interface ListViewDefinition {
  columns: ListViewColumnDefinition[];
  defaultSort?: ListViewSortDefinition | ListViewSortDefinition[];
  defaultFilters?: ListFilterGroup[];
  search?: ListViewSearchConfig;
  pageSize?: number;
}
