import {
  DataSourceDetail,
  DataSourceFieldInput,
  DataSourceItemData,
  DataSourceItemEntity,
  DataSourceItemInput,
  DataSourceItemStatus,
  DataSourceRepository,
  DataSourceStatus,
  DataSourceSummary,
} from '../repositories/data-source-repository';
import { MembershipRepository } from '../repositories/membership-repository';
import { hasPermission } from '../permissions/permissions';
import type {
  DetailsColumnDefinition,
  FieldDefinition,
  FormSchemaV1,
  OptionItem,
} from '@field/form-engine';
import type { PlatformRole } from '@field/types';

export interface LookupValidationIssue {
  path: string;
  fieldKey: string;
  code:
    | 'REQUIRED_LOOKUP_MISSING'
    | 'LOOKUP_SOURCE_UNAVAILABLE'
    | 'INVALID_LOOKUP_VALUE';
  message: string;
}

export interface LookupValidationSummary {
  valid: boolean;
  errors: LookupValidationIssue[];
}

export interface SubmissionLookupPayload {
  fields?: Record<string, unknown>;
  details?: Record<
    string,
    Array<{ id?: string; values?: Record<string, unknown> }>
  >;
}

const SAFE_KEY_PATTERN = /^[a-z0-9][a-z0-9_]*$/;

export function normalizeDataSourceKey(raw: string): string {
  return (
    raw
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'source'
  );
}

export class DataSourceService {
  constructor(
    private readonly dataSourceRepository: DataSourceRepository,
    private readonly membershipRepository: MembershipRepository,
  ) {}

  private async assertReadAccess(
    userId: string,
    organizationId: string,
  ): Promise<void> {
    const membership = await this.membershipRepository.findUserMembershipInOrg(
      userId,
      organizationId,
    );
    if (
      !membership ||
      membership.status !== 'active' ||
      !hasPermission(membership.role_key as PlatformRole, 'data_sources.read')
    ) {
      throw new Error(
        `Unauthorized: User ${userId} does not have active data-source read permission in organization ${organizationId}`,
      );
    }
  }

  private async assertManageAccess(
    userId: string,
    organizationId: string,
  ): Promise<void> {
    const membership = await this.membershipRepository.findUserMembershipInOrg(
      userId,
      organizationId,
    );
    if (
      !membership ||
      membership.status !== 'active' ||
      !hasPermission(membership.role_key as PlatformRole, 'data_sources.manage')
    ) {
      throw new Error(
        `Unauthorized: User ${userId} does not have active data-source management permission in organization ${organizationId}`,
      );
    }
  }

  private validateFieldsDefinition(
    fields: DataSourceFieldInput[],
    displayFieldKey: string,
    valueFieldKey: string,
  ): DataSourceFieldInput[] {
    if (!Array.isArray(fields) || fields.length === 0) {
      throw new Error('At least one data source field is required.');
    }

    const seenKeys = new Set<string>();
    const normalized: DataSourceFieldInput[] = fields.map((field, index) => {
      const key = normalizeDataSourceKey(field.key || field.label || '');
      const label = (field.label || '').trim();
      if (!label) {
        throw new Error(`Field at position ${index + 1} requires a label.`);
      }
      if (!SAFE_KEY_PATTERN.test(key)) {
        throw new Error(`Invalid field key '${key}'.`);
      }
      if (seenKeys.has(key)) {
        throw new Error(`Duplicate data source field key '${key}'.`);
      }
      seenKeys.add(key);

      return {
        key,
        label,
        field_type: field.field_type ?? 'text',
        required: Boolean(field.required),
        order_index: field.order_index ?? index,
      };
    });

    if (!seenKeys.has(displayFieldKey)) {
      throw new Error(
        `Display field '${displayFieldKey}' must match one of the configured source fields.`,
      );
    }
    if (!seenKeys.has(valueFieldKey)) {
      throw new Error(
        `Value field '${valueFieldKey}' must match one of the configured source fields.`,
      );
    }

    return normalized;
  }

  private sanitizeItemData(
    data: DataSourceItemData,
    fields: ReadonlyArray<{ key: string; label: string; required?: boolean }>,
    displayFieldKey: string,
    valueFieldKey: string,
  ): DataSourceItemData {
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new Error('Item data must be a valid key-value object.');
    }

    const allowedKeys = new Set(fields.map((field) => field.key));
    const sanitized: DataSourceItemData = {};

    for (const [key, rawValue] of Object.entries(data)) {
      if (!allowedKeys.has(key)) continue;
      if (
        rawValue === null ||
        typeof rawValue === 'string' ||
        typeof rawValue === 'number' ||
        typeof rawValue === 'boolean'
      ) {
        sanitized[key] =
          typeof rawValue === 'string' ? rawValue.trim() : rawValue;
      }
    }

    for (const field of fields) {
      const isKeyRequired =
        Boolean(field.required) ||
        field.key === displayFieldKey ||
        field.key === valueFieldKey;
      const val = sanitized[field.key];
      const isEmpty =
        val === undefined ||
        val === null ||
        (typeof val === 'string' && val.trim().length === 0);
      if (isKeyRequired && isEmpty) {
        throw new Error(`Field '${field.label}' (${field.key}) is required.`);
      }
    }

    return sanitized;
  }

  async listDataSources(params: {
    userId: string;
    organizationId: string;
  }): Promise<DataSourceSummary[]> {
    await this.assertReadAccess(params.userId, params.organizationId);
    return this.dataSourceRepository.listDataSources(params.organizationId);
  }

  async getDataSource(params: {
    userId: string;
    organizationId: string;
    dataSourceId: string;
  }): Promise<DataSourceDetail | null> {
    await this.assertReadAccess(params.userId, params.organizationId);
    return this.dataSourceRepository.getDataSourceByKeyOrId(
      params.dataSourceId,
      params.organizationId,
    );
  }

  async createDataSource(params: {
    userId: string;
    organizationId: string;
    name: string;
    key?: string;
    description?: string;
    displayFieldKey: string;
    valueFieldKey: string;
    fields: DataSourceFieldInput[];
    items?: DataSourceItemInput[];
  }): Promise<DataSourceDetail> {
    await this.assertManageAccess(params.userId, params.organizationId);

    const name = params.name.trim();
    if (!name) {
      throw new Error('Data source name is required.');
    }

    const key = normalizeDataSourceKey(params.key || name);
    if (!SAFE_KEY_PATTERN.test(key)) {
      throw new Error(`Invalid data source key '${key}'.`);
    }

    const existing = await this.dataSourceRepository.getDataSourceByKeyOrId(
      key,
      params.organizationId,
    );
    if (existing) {
      throw new Error(
        `A data source with key '${key}' already exists in this organization.`,
      );
    }

    const displayFieldKey = normalizeDataSourceKey(params.displayFieldKey);
    const valueFieldKey = normalizeDataSourceKey(params.valueFieldKey);
    const validatedFields = this.validateFieldsDefinition(
      params.fields,
      displayFieldKey,
      valueFieldKey,
    );

    const validatedItems = (params.items ?? []).map((item) => ({
      status: item.status ?? 'active',
      data: this.sanitizeItemData(
        item.data,
        validatedFields,
        displayFieldKey,
        valueFieldKey,
      ),
    }));

    return this.dataSourceRepository.createDataSource({
      organizationId: params.organizationId,
      key,
      name,
      description: params.description?.trim() || undefined,
      displayFieldKey,
      valueFieldKey,
      createdBy: params.userId,
      fields: validatedFields,
      items: validatedItems,
    });
  }

  async updateDataSource(params: {
    userId: string;
    organizationId: string;
    dataSourceId: string;
    name?: string;
    description?: string | null;
    displayFieldKey?: string;
    valueFieldKey?: string;
    status?: DataSourceStatus;
    fields?: DataSourceFieldInput[];
  }): Promise<DataSourceDetail> {
    await this.assertManageAccess(params.userId, params.organizationId);

    const existing = await this.dataSourceRepository.getDataSourceById(
      params.dataSourceId,
      params.organizationId,
    );
    if (!existing) {
      throw new Error('Data source not found.');
    }

    const nextDisplayKey = params.displayFieldKey
      ? normalizeDataSourceKey(params.displayFieldKey)
      : existing.display_field_key;
    const nextValueKey = params.valueFieldKey
      ? normalizeDataSourceKey(params.valueFieldKey)
      : existing.value_field_key;

    const candidateFields: DataSourceFieldInput[] =
      params.fields ??
      existing.fields.map((field) => ({
        key: field.key,
        label: field.label,
        field_type: field.field_type,
        required: field.required,
        order_index: field.order_index,
      }));

    const validatedFields = this.validateFieldsDefinition(
      candidateFields,
      nextDisplayKey,
      nextValueKey,
    );

    if (params.status && !['active', 'inactive', 'archived'].includes(params.status)) {
      throw new Error(`Invalid data source status '${params.status}'.`);
    }

    return this.dataSourceRepository.updateDataSource({
      id: existing.id,
      organizationId: params.organizationId,
      name: params.name !== undefined ? params.name.trim() : undefined,
      description:
        params.description !== undefined
          ? params.description?.trim() || null
          : undefined,
      displayFieldKey: nextDisplayKey,
      valueFieldKey: nextValueKey,
      status: params.status,
      fields: params.fields !== undefined ? validatedFields : undefined,
    });
  }

  async createItem(params: {
    userId: string;
    organizationId: string;
    dataSourceId: string;
    data: DataSourceItemData;
    status?: DataSourceItemStatus;
  }): Promise<DataSourceItemEntity> {
    await this.assertManageAccess(params.userId, params.organizationId);

    const source = await this.dataSourceRepository.getDataSourceById(
      params.dataSourceId,
      params.organizationId,
    );
    if (!source) {
      throw new Error('Data source not found.');
    }

    const sanitized = this.sanitizeItemData(
      params.data,
      source.fields,
      source.display_field_key,
      source.value_field_key,
    );

    const targetValue = String(sanitized[source.value_field_key] ?? '');
    const duplicate = source.items.some(
      (item) =>
        String(item.data_jsonb[source.value_field_key] ?? '') === targetValue,
    );
    if (duplicate) {
      throw new Error(
        `An item with '${source.value_field_key}' = '${targetValue}' already exists in this data source.`,
      );
    }

    return this.dataSourceRepository.createItem({
      dataSourceId: source.id,
      organizationId: params.organizationId,
      data: sanitized,
      status: params.status ?? 'active',
      createdBy: params.userId,
    });
  }

  async updateItem(params: {
    userId: string;
    organizationId: string;
    dataSourceId: string;
    itemId: string;
    data?: DataSourceItemData;
    status?: DataSourceItemStatus;
  }): Promise<DataSourceItemEntity> {
    await this.assertManageAccess(params.userId, params.organizationId);

    const source = await this.dataSourceRepository.getDataSourceById(
      params.dataSourceId,
      params.organizationId,
    );
    if (!source) {
      throw new Error('Data source not found.');
    }

    const existingItem = source.items.find((item) => item.id === params.itemId);
    if (!existingItem) {
      throw new Error('Data source item not found.');
    }

    const sanitized =
      params.data !== undefined
        ? this.sanitizeItemData(
            params.data,
            source.fields,
            source.display_field_key,
            source.value_field_key,
          )
        : undefined;

    if (sanitized !== undefined) {
      const targetValue = String(sanitized[source.value_field_key] ?? '');
      const duplicate = source.items.some(
        (item) =>
          item.id !== params.itemId &&
          String(item.data_jsonb[source.value_field_key] ?? '') === targetValue,
      );
      if (duplicate) {
        throw new Error(
          `An item with '${source.value_field_key}' = '${targetValue}' already exists in this data source.`,
        );
      }
    }

    return this.dataSourceRepository.updateItem({
      itemId: params.itemId,
      dataSourceId: source.id,
      organizationId: params.organizationId,
      data: sanitized,
      status: params.status,
    });
  }

  async deleteItem(params: {
    userId: string;
    organizationId: string;
    dataSourceId: string;
    itemId: string;
  }): Promise<void> {
    await this.assertManageAccess(params.userId, params.organizationId);

    const source = await this.dataSourceRepository.getDataSourceById(
      params.dataSourceId,
      params.organizationId,
    );
    if (!source) {
      throw new Error('Data source not found.');
    }

    await this.dataSourceRepository.deleteItem({
      itemId: params.itemId,
      dataSourceId: source.id,
      organizationId: params.organizationId,
    });
  }

  async resolveLookupOptions(params: {
    userId: string;
    organizationId: string;
    targetEntity: string;
    displayField?: string;
    valueField?: string;
    query?: string;
  }): Promise<OptionItem[]> {
    await this.assertReadAccess(params.userId, params.organizationId);

    const source = await this.dataSourceRepository.getDataSourceByKeyOrId(
      params.targetEntity,
      params.organizationId,
    );
    if (!source || source.status !== 'active') {
      throw new Error(
        `Data source '${params.targetEntity}' was not found or is inactive in this organization.`,
      );
    }

    const displayKey = params.displayField?.trim() || source.display_field_key;
    const valueKey = params.valueField?.trim() || source.value_field_key;
    const normalizedQuery = params.query?.trim().toLowerCase() ?? '';

    const options: OptionItem[] = [];
    for (const item of source.items) {
      if (item.status !== 'active') continue;
      const rawDisplay = item.data_jsonb[displayKey];
      const rawValue = item.data_jsonb[valueKey];
      if (rawValue === undefined || rawValue === null || String(rawValue).trim() === '') {
        continue;
      }
      const value = String(rawValue);
      const label =
        rawDisplay !== undefined && rawDisplay !== null && String(rawDisplay).trim() !== ''
          ? String(rawDisplay)
          : value;

      if (
        normalizedQuery &&
        !label.toLowerCase().includes(normalizedQuery) &&
        !value.toLowerCase().includes(normalizedQuery)
      ) {
        continue;
      }
      options.push({ label, value });
    }

    return options;
  }

  async validateSubmissionLookups(params: {
    userId: string;
    organizationId: string;
    schema: FormSchemaV1;
    payload: SubmissionLookupPayload;
  }): Promise<LookupValidationSummary> {
    await this.assertReadAccess(params.userId, params.organizationId);

    const errors: LookupValidationIssue[] = [];
    const sourceCache = new Map<string, DataSourceDetail | null>();

    const loadSource = async (targetEntity: string) => {
      if (!sourceCache.has(targetEntity)) {
        const loaded = await this.dataSourceRepository.getDataSourceByKeyOrId(
          targetEntity,
          params.organizationId,
        );
        sourceCache.set(targetEntity, loaded);
      }
      return sourceCache.get(targetEntity) ?? null;
    };

    const verifyLookupValue = async (
      field: FieldDefinition | DetailsColumnDefinition,
      rawValue: unknown,
      path: string,
    ) => {
      if (field.type !== 'lookup' || !field.lookupConfig) return;
      const isEmpty =
        rawValue === undefined ||
        rawValue === null ||
        (typeof rawValue === 'string' && rawValue.trim().length === 0);

      if (isEmpty) {
        if (field.required) {
          errors.push({
            path,
            fieldKey: field.key,
            code: 'REQUIRED_LOOKUP_MISSING',
            message: `${field.label} is required.`,
          });
        }
        return;
      }

      const source = await loadSource(field.lookupConfig.targetEntity);
      if (!source || source.status !== 'active') {
        errors.push({
          path,
          fieldKey: field.key,
          code: 'LOOKUP_SOURCE_UNAVAILABLE',
          message: `Lookup data source '${field.lookupConfig.targetEntity}' is unavailable or not active in this organization.`,
        });
        return;
      }

      const valueKey =
        field.lookupConfig.valueField?.trim() || source.value_field_key;
      const candidate = String(rawValue);
      const validMatch = source.items.some(
        (item) =>
          item.status === 'active' &&
          String(item.data_jsonb[valueKey] ?? '') === candidate,
      );

      if (!validMatch) {
        errors.push({
          path,
          fieldKey: field.key,
          code: 'INVALID_LOOKUP_VALUE',
          message: `Selected value '${candidate}' for '${field.label}' is not a valid active option in data source '${source.name}'.`,
        });
      }
    };

    const topFields: FieldDefinition[] = [
      ...params.schema.header.sections.flatMap((section) => section.fields),
      ...params.schema.tabs.flatMap((tab) =>
        tab.type === 'form'
          ? tab.sections.flatMap((section) => section.fields)
          : [],
      ),
    ];

    for (const field of topFields) {
      if (field.type === 'lookup') {
        await verifyLookupValue(
          field,
          params.payload.fields?.[field.key],
          `fields.${field.key}`,
        );
      }
    }

    for (const tab of params.schema.tabs) {
      if (tab.type !== 'details') continue;
      const lookupColumns = tab.configuration.columns.filter(
        (col) => col.type === 'lookup',
      );
      if (lookupColumns.length === 0) continue;

      const rows = params.payload.details?.[tab.key] ?? [];
      for (const [index, row] of rows.entries()) {
        const rowId = row.id ?? String(index);
        for (const col of lookupColumns) {
          await verifyLookupValue(
            col,
            row.values?.[col.key],
            `details.${tab.key}.${rowId}.${col.key}`,
          );
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}

