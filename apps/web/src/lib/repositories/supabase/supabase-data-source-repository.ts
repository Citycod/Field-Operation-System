import {
  DataSourceDetail,
  DataSourceEntity,
  DataSourceFieldEntity,
  DataSourceFieldInput,
  DataSourceItemData,
  DataSourceItemEntity,
  DataSourceItemInput,
  DataSourceItemStatus,
  DataSourceRepository,
  DataSourceStatus,
  DataSourceSummary,
} from '../data-source-repository';
import type { Database, Json } from '@field/types';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class SupabaseDataSourceRepository implements DataSourceRepository {
  constructor(private readonly injectedClient?: SupabaseClient<Database>) {}

  private client(): SupabaseClient<Database> {
    return this.injectedClient ?? createClient();
  }

  async listDataSources(organizationId: string): Promise<DataSourceSummary[]> {
    const supabase = this.client();
    const { data: sources, error } = await supabase
      .from('data_sources')
      .select('*')
      .eq('organization_id', organizationId)
      .neq('status', 'archived')
      .order('updated_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to load data sources: ${error.message}`);
    }
    if (!sources?.length) return [];

    const sourceIds = sources.map((source) => source.id);

    const [{ data: fields, error: fieldsError }, { data: items, error: itemsError }] =
      await Promise.all([
        supabase
          .from('data_source_fields')
          .select('*')
          .eq('organization_id', organizationId)
          .in('data_source_id', sourceIds)
          .order('order_index', { ascending: true }),
        supabase
          .from('data_source_items')
          .select('id,data_source_id,status')
          .eq('organization_id', organizationId)
          .in('data_source_id', sourceIds),
      ]);

    if (fieldsError) {
      throw new Error(`Failed to load data source fields: ${fieldsError.message}`);
    }
    if (itemsError) {
      throw new Error(`Failed to load data source items: ${itemsError.message}`);
    }

    return sources.map((source) => {
      const sourceFields = (fields ?? []).filter(
        (field) => field.data_source_id === source.id,
      ) as unknown as DataSourceFieldEntity[];
      const sourceItems = (items ?? []).filter(
        (item) => item.data_source_id === source.id,
      );
      const activeItems = sourceItems.filter((item) => item.status === 'active');

      return {
        ...(source as unknown as DataSourceEntity),
        fields: sourceFields,
        item_count: sourceItems.length,
        active_item_count: activeItems.length,
      };
    });
  }

  async getDataSourceById(
    id: string,
    organizationId: string,
  ): Promise<DataSourceDetail | null> {
    const supabase = this.client();
    const { data: source, error } = await supabase
      .from('data_sources')
      .select('*')
      .eq('id', id)
      .eq('organization_id', organizationId)
      .single();

    if (error || !source) return null;
    return this.hydrateDetail(source as unknown as DataSourceEntity);
  }

  async getDataSourceByKeyOrId(
    target: string,
    organizationId: string,
  ): Promise<DataSourceDetail | null> {
    const supabase = this.client();
    const trimmed = target.trim();
    if (!trimmed) return null;

    if (UUID_PATTERN.test(trimmed)) {
      const byId = await this.getDataSourceById(trimmed, organizationId);
      if (byId) return byId;
    }

    const { data: source, error } = await supabase
      .from('data_sources')
      .select('*')
      .eq('key', trimmed)
      .eq('organization_id', organizationId)
      .single();

    if (error || !source) return null;
    return this.hydrateDetail(source as unknown as DataSourceEntity);
  }

  private async hydrateDetail(source: DataSourceEntity): Promise<DataSourceDetail> {
    const supabase = this.client();
    const [{ data: fields, error: fieldsError }, { data: items, error: itemsError }] =
      await Promise.all([
        supabase
          .from('data_source_fields')
          .select('*')
          .eq('organization_id', source.organization_id)
          .eq('data_source_id', source.id)
          .order('order_index', { ascending: true }),
        supabase
          .from('data_source_items')
          .select('*')
          .eq('organization_id', source.organization_id)
          .eq('data_source_id', source.id)
          .order('created_at', { ascending: true }),
      ]);

    if (fieldsError) {
      throw new Error(`Failed to load data source fields: ${fieldsError.message}`);
    }
    if (itemsError) {
      throw new Error(`Failed to load data source items: ${itemsError.message}`);
    }

    const hydratedItems = (items ?? []) as unknown as DataSourceItemEntity[];
    const activeCount = hydratedItems.filter((item) => item.status === 'active').length;

    return {
      ...source,
      fields: (fields ?? []) as unknown as DataSourceFieldEntity[],
      items: hydratedItems,
      item_count: hydratedItems.length,
      active_item_count: activeCount,
    };
  }

  async createDataSource(params: {
    organizationId: string;
    key: string;
    name: string;
    description?: string;
    displayFieldKey: string;
    valueFieldKey: string;
    createdBy: string;
    fields: DataSourceFieldInput[];
    items?: DataSourceItemInput[];
  }): Promise<DataSourceDetail> {
    const supabase = this.client();

    const { data: source, error: sourceError } = await supabase
      .from('data_sources')
      .insert({
        organization_id: params.organizationId,
        key: params.key,
        name: params.name,
        description: params.description || null,
        display_field_key: params.displayFieldKey,
        value_field_key: params.valueFieldKey,
        status: 'active',
        created_by: params.createdBy,
      })
      .select()
      .single();

    if (sourceError || !source) {
      throw new Error(`Failed to create data source: ${sourceError?.message}`);
    }

    if (params.fields.length > 0) {
      const fieldRows = params.fields.map((field, index) => ({
        organization_id: params.organizationId,
        data_source_id: source.id,
        key: field.key,
        label: field.label,
        field_type: field.field_type ?? 'text',
        required: field.required ?? false,
        order_index: field.order_index ?? index,
        config_jsonb: {} as Json,
      }));
      const { error: fieldsError } = await supabase
        .from('data_source_fields')
        .insert(fieldRows);

      if (fieldsError) {
        throw new Error(`Failed to create data source fields: ${fieldsError.message}`);
      }
    }

    if (params.items && params.items.length > 0) {
      const itemRows = params.items.map((item) => ({
        organization_id: params.organizationId,
        data_source_id: source.id,
        data_jsonb: item.data as unknown as Json,
        status: item.status ?? 'active',
        created_by: params.createdBy,
      }));
      const { error: itemsError } = await supabase
        .from('data_source_items')
        .insert(itemRows);

      if (itemsError) {
        throw new Error(`Failed to create data source items: ${itemsError.message}`);
      }
    }

    return this.hydrateDetail(source as unknown as DataSourceEntity);
  }

  async updateDataSource(params: {
    id: string;
    organizationId: string;
    name?: string;
    description?: string | null;
    displayFieldKey?: string;
    valueFieldKey?: string;
    status?: DataSourceStatus;
    fields?: DataSourceFieldInput[];
  }): Promise<DataSourceDetail> {
    const supabase = this.client();

    const patch: Database['public']['Tables']['data_sources']['Update'] = {
      updated_at: new Date().toISOString(),
    };
    if (params.name !== undefined) patch.name = params.name;
    if (params.description !== undefined) patch.description = params.description;
    if (params.displayFieldKey !== undefined) {
      patch.display_field_key = params.displayFieldKey;
    }
    if (params.valueFieldKey !== undefined) {
      patch.value_field_key = params.valueFieldKey;
    }
    if (params.status !== undefined) patch.status = params.status;

    const { data: source, error } = await supabase
      .from('data_sources')
      .update(patch)
      .eq('id', params.id)
      .eq('organization_id', params.organizationId)
      .select()
      .single();

    if (error || !source) {
      throw new Error(
        `Failed to update data source: ${error?.message || 'Data source not found'}`,
      );
    }

    if (params.fields !== undefined) {
      const { data: existingFields, error: existingError } = await supabase
        .from('data_source_fields')
        .select('*')
        .eq('organization_id', params.organizationId)
        .eq('data_source_id', params.id);

      if (existingError) {
        throw new Error(`Failed to inspect data source fields: ${existingError.message}`);
      }

      const existingByKey = new Map(
        (existingFields ?? []).map((field) => [field.key, field]),
      );

      for (const [index, field] of params.fields.entries()) {
        const existing = existingByKey.get(field.key);
        if (existing) {
          const { error: updateFieldError } = await supabase
            .from('data_source_fields')
            .update({
              label: field.label,
              field_type: field.field_type ?? (existing.field_type as DataSourceFieldEntity['field_type']),
              required: field.required ?? existing.required,
              order_index: field.order_index ?? index,
            })
            .eq('id', existing.id)
            .eq('organization_id', params.organizationId);

          if (updateFieldError) {
            throw new Error(`Failed to update data source field: ${updateFieldError.message}`);
          }
        } else {
          const { error: insertFieldError } = await supabase
            .from('data_source_fields')
            .insert({
              organization_id: params.organizationId,
              data_source_id: params.id,
              key: field.key,
              label: field.label,
              field_type: field.field_type ?? 'text',
              required: field.required ?? false,
              order_index: field.order_index ?? index,
              config_jsonb: {} as Json,
            });

          if (insertFieldError) {
            throw new Error(`Failed to add data source field: ${insertFieldError.message}`);
          }
        }
      }
    }

    return this.hydrateDetail(source as unknown as DataSourceEntity);
  }

  async listItems(params: {
    dataSourceId: string;
    organizationId: string;
    status?: DataSourceItemStatus;
  }): Promise<DataSourceItemEntity[]> {
    const supabase = this.client();
    let query = supabase
      .from('data_source_items')
      .select('*')
      .eq('organization_id', params.organizationId)
      .eq('data_source_id', params.dataSourceId)
      .order('created_at', { ascending: true });

    if (params.status) {
      query = query.eq('status', params.status);
    }

    const { data, error } = await query;
    if (error) {
      throw new Error(`Failed to load data source items: ${error.message}`);
    }
    return (data ?? []) as unknown as DataSourceItemEntity[];
  }

  async createItem(params: {
    dataSourceId: string;
    organizationId: string;
    data: DataSourceItemData;
    status?: DataSourceItemStatus;
    createdBy: string;
  }): Promise<DataSourceItemEntity> {
    const supabase = this.client();
    const { data, error } = await supabase
      .from('data_source_items')
      .insert({
        organization_id: params.organizationId,
        data_source_id: params.dataSourceId,
        data_jsonb: params.data as unknown as Json,
        status: params.status ?? 'active',
        created_by: params.createdBy,
      })
      .select()
      .single();

    if (error || !data) {
      throw new Error(`Failed to create data source item: ${error?.message}`);
    }
    return data as unknown as DataSourceItemEntity;
  }

  async updateItem(params: {
    itemId: string;
    dataSourceId: string;
    organizationId: string;
    data?: DataSourceItemData;
    status?: DataSourceItemStatus;
  }): Promise<DataSourceItemEntity> {
    const supabase = this.client();
    const patch: Database['public']['Tables']['data_source_items']['Update'] = {
      updated_at: new Date().toISOString(),
    };
    if (params.data !== undefined) {
      patch.data_jsonb = params.data as unknown as Json;
    }
    if (params.status !== undefined) {
      patch.status = params.status;
    }

    const { data, error } = await supabase
      .from('data_source_items')
      .update(patch)
      .eq('id', params.itemId)
      .eq('data_source_id', params.dataSourceId)
      .eq('organization_id', params.organizationId)
      .select()
      .single();

    if (error || !data) {
      throw new Error(
        `Failed to update data source item: ${error?.message || 'Item not found'}`,
      );
    }
    return data as unknown as DataSourceItemEntity;
  }

  async deleteItem(params: {
    itemId: string;
    dataSourceId: string;
    organizationId: string;
  }): Promise<void> {
    const supabase = this.client();
    const { error } = await supabase
      .from('data_source_items')
      .update({
        status: 'inactive',
        updated_at: new Date().toISOString(),
      })
      .eq('id', params.itemId)
      .eq('data_source_id', params.dataSourceId)
      .eq('organization_id', params.organizationId);

    if (error) {
      throw new Error(`Failed to deactivate data source item: ${error.message}`);
    }
  }
}
