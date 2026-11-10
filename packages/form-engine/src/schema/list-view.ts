export type ColumnFormat = 'text' | 'date' | 'currency' | 'status';

export interface ListViewColumnDefinition {
  id: string;
  sourceRef: string;
  label: string;
  order: number;
  width?: number;
  sortable?: boolean;
  filterable?: boolean;
  searchable?: boolean;
  format?: ColumnFormat;
}

export interface ListViewSortDefinition {
  fieldRef: string;
  direction: 'asc' | 'desc';
}

export interface ListViewDefinition {
  columns: ListViewColumnDefinition[];
  defaultSort?: ListViewSortDefinition;
  pageSize?: number;
}
