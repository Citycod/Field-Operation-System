export type DataSourceStatus = 'active' | 'inactive' | 'archived';
export type DataSourceFieldType = 'text' | 'number' | 'currency' | 'date' | 'boolean';
export type DataSourceItemStatus = 'active' | 'inactive';
export type DataSourceItemValue = string | number | boolean | null;
export type DataSourceItemData = Record<string, DataSourceItemValue>;

export interface DataSourceEntity {
  id: string;
  organization_id: string;
  key: string;
  name: string;
  description: string | null;
  display_field_key: string;
  value_field_key: string;
  status: DataSourceStatus;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface DataSourceFieldEntity {
  id: string;
  organization_id: string;
  data_source_id: string;
  key: string;
  label: string;
  field_type: DataSourceFieldType;
  required: boolean;
  order_index: number;
  config_jsonb: Record<string, unknown>;
  created_at: string;
}

export interface DataSourceItemEntity {
  id: string;
  organization_id: string;
  data_source_id: string;
  data_jsonb: DataSourceItemData;
  status: DataSourceItemStatus;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface DataSourceSummary extends DataSourceEntity {
  fields: DataSourceFieldEntity[];
  item_count: number;
  active_item_count: number;
}

export interface DataSourceDetail extends DataSourceSummary {
  items: DataSourceItemEntity[];
}

export interface DataSourceFieldInput {
  key: string;
  label: string;
  field_type?: DataSourceFieldType;
  required?: boolean;
  order_index?: number;
}

export interface DataSourceItemInput {
  data: DataSourceItemData;
  status?: DataSourceItemStatus;
}

export interface DataSourceRepository {
  listDataSources(organizationId: string): Promise<DataSourceSummary[]>;

  getDataSourceById(id: string, organizationId: string): Promise<DataSourceDetail | null>;

  getDataSourceByKeyOrId(target: string, organizationId: string): Promise<DataSourceDetail | null>;

  createDataSource(params: {
    organizationId: string;
    key: string;
    name: string;
    description?: string;
    displayFieldKey: string;
    valueFieldKey: string;
    createdBy: string;
    fields: DataSourceFieldInput[];
    items?: DataSourceItemInput[];
  }): Promise<DataSourceDetail>;

  updateDataSource(params: {
    id: string;
    organizationId: string;
    name?: string;
    description?: string | null;
    displayFieldKey?: string;
    valueFieldKey?: string;
    status?: DataSourceStatus;
    fields?: DataSourceFieldInput[];
  }): Promise<DataSourceDetail>;

  listItems(params: {
    dataSourceId: string;
    organizationId: string;
    status?: DataSourceItemStatus;
  }): Promise<DataSourceItemEntity[]>;

  createItem(params: {
    dataSourceId: string;
    organizationId: string;
    data: DataSourceItemData;
    status?: DataSourceItemStatus;
    createdBy: string;
  }): Promise<DataSourceItemEntity>;

  updateItem(params: {
    itemId: string;
    dataSourceId: string;
    organizationId: string;
    data?: DataSourceItemData;
    status?: DataSourceItemStatus;
  }): Promise<DataSourceItemEntity>;

  deleteItem(params: {
    itemId: string;
    dataSourceId: string;
    organizationId: string;
  }): Promise<void>;
}

