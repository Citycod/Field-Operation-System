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

/**
 * Validates an external API endpoint against SSRF (Server-Side Request Forgery).
 * Blocks loopback addresses, local domains, link-local IPs, cloud metadata IPs, and private CIDR ranges.
 */
export function isSafeExternalApiUrl(urlStr: string): { safe: boolean; reason?: string } {
  try {
    const parsed = new URL(urlStr);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return { safe: false, reason: 'Protocol must be http or https.' };
    }
    const hostname = parsed.hostname.toLowerCase();

    // Block local hostnames and internal domain patterns
    if (
      hostname === 'localhost' ||
      hostname.endsWith('.localhost') ||
      hostname.endsWith('.internal') ||
      hostname.endsWith('.local') ||
      hostname === 'metadata.google.internal'
    ) {
      return { safe: false, reason: 'Access to internal or local domains is prohibited.' };
    }

    // Check IPv4 addresses
    const ipv4Match = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (ipv4Match) {
      const p1 = Number(ipv4Match[1]);
      const p2 = Number(ipv4Match[2]);
      const p3 = Number(ipv4Match[3]);
      const p4 = Number(ipv4Match[4]);
      if (p1 > 255 || p2 > 255 || p3 > 255 || p4 > 255) {
        return { safe: false, reason: 'Invalid IP address format.' };
      }
      // 0.0.0.0/8
      if (p1 === 0) return { safe: false, reason: 'Access to broadcast or zero network is prohibited.' };
      // 127.0.0.0/8 (Loopback)
      if (p1 === 127) return { safe: false, reason: 'Access to loopback IP is prohibited.' };
      // 10.0.0.0/8 (RFC 1918 Private)
      if (p1 === 10) return { safe: false, reason: 'Access to private network (10.0.0.0/8) is prohibited.' };
      // 172.16.0.0/12 (RFC 1918 Private)
      if (p1 === 172 && p2 >= 16 && p2 <= 31) {
        return { safe: false, reason: 'Access to private network (172.16.0.0/12) is prohibited.' };
      }
      // 192.168.0.0/16 (RFC 1918 Private)
      if (p1 === 192 && p2 === 168) {
        return { safe: false, reason: 'Access to private network (192.168.0.0/16) is prohibited.' };
      }
      // 169.254.0.0/16 (Link-local & cloud metadata 169.254.169.254)
      if (p1 === 169 && p2 === 254) {
        return { safe: false, reason: 'Access to link-local or cloud metadata IP is prohibited.' };
      }
    }

    // Check IPv6 addresses
    if (hostname.startsWith('[') || hostname.includes(':')) {
      const stripped = hostname.replace(/^\[|\]$/g, '').toLowerCase();
      if (
        stripped === '::1' ||
        stripped === '::' ||
        stripped.startsWith('fe80:') ||
        stripped.startsWith('fc00:') ||
        stripped.startsWith('fd00:') ||
        stripped.includes('::ffff:') ||
        stripped.startsWith('ffff:')
      ) {
        return { safe: false, reason: 'Access to local, link-local, or private IPv6 addresses is prohibited.' };
      }
    }

    // NOTE: Standard fetch executes DNS resolution after URL string validation.
    // Without an isolated egress proxy or custom DNS pinning, DNS rebinding
    // (TOCTOU between hostname validation and DNS lookup) cannot be prevented
    // purely by string analysis on arbitrary domains. DNS rebinding protection
    // is therefore explicitly NOT claimed.
    return { safe: true };
  } catch {
    return { safe: false, reason: 'Malformed URL format.' };
  }
}

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
    sourceType?: 'data_source' | 'table' | 'view' | 'api';
    displayField?: string;
    valueField?: string;
    query?: string;
    apiEndpoint?: string;
    apiMethod?: 'GET' | 'POST';
  }): Promise<OptionItem[]> {
    await this.assertReadAccess(params.userId, params.organizationId);

    const normalizedQuery = params.query?.trim().toLowerCase() ?? '';

    // 1. Platform Member / User Roster Lookup
    if (params.sourceType === 'table' || params.targetEntity === 'members') {
      const roster = await this.membershipRepository.getRoster(params.organizationId);
      const activeMembers = roster.filter((m) => m.status === 'active');
      const options: OptionItem[] = [];

      for (const m of activeMembers) {
        const value = params.valueField === 'membership_id' ? m.membership_id : m.user_id;
        const namePart = [m.first_name, m.last_name].filter(Boolean).join(' ');
        const label = m.display_name?.trim() || namePart || m.email || m.user_id;
        if (
          normalizedQuery &&
          !label.toLowerCase().includes(normalizedQuery) &&
          !value.toLowerCase().includes(normalizedQuery)
        ) {
          continue;
        }
        options.push({ key: value, value, label });
      }
      return options;
    }

    // 2. External REST API Lookup with SSRF Guards
    if (params.sourceType === 'api') {
      const endpoint = params.apiEndpoint?.trim();
      if (!endpoint) {
        throw new Error('API lookup endpoint is required for api source type.');
      }
      const safetyCheck = isSafeExternalApiUrl(endpoint);
      if (!safetyCheck.safe) {
        throw new Error(`SSRF validation blocked request to '${endpoint}': ${safetyCheck.reason}`);
      }

      const method = params.apiMethod ?? 'GET';
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      try {
        const response = await fetch(endpoint, {
          method,
          headers: {
            Accept: 'application/json',
            'User-Agent': 'FieldPlatform-Lookup/1.0',
          },
          signal: controller.signal,
          redirect: 'error',
        });

        if (!response.ok) {
          throw new Error(`External API returned HTTP ${response.status}: ${response.statusText}`);
        }

        // Bounded response handling (Max 1 MB)
        const MAX_BYTES = 1024 * 1024; // 1 MB
        const MAX_OPTIONS = 500;

        // Upstream Content-Length validation if provided
        const contentLength = response.headers.get('content-length');
        if (contentLength && parseInt(contentLength, 10) > MAX_BYTES) {
          throw new Error('Response size exceeds maximum allowed limit (1 MB).');
        }

        let bodyText = '';
        if (response.body && typeof response.body.getReader === 'function') {
          const reader = response.body.getReader();
          const chunks: Uint8Array[] = [];
          let totalBytes = 0;
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              if (value) {
                totalBytes += value.byteLength;
                if (totalBytes > MAX_BYTES) {
                  try {
                    await reader.cancel();
                  } catch {
                    // Safe stream cancellation ignore
                  }
                  throw new Error('Response size exceeds maximum allowed limit (1 MB).');
                }
                chunks.push(value);
              }
            }
          } finally {
            reader.releaseLock();
          }

          const merged = new Uint8Array(totalBytes);
          let offset = 0;
          for (const chunk of chunks) {
            merged.set(chunk, offset);
            offset += chunk.byteLength;
          }
          bodyText = new TextDecoder('utf-8').decode(merged);
        } else {
          // Fallback for mocked test environments
          bodyText = await response.text();
          if (new TextEncoder().encode(bodyText).byteLength > MAX_BYTES) {
            throw new Error('Response size exceeds maximum allowed limit (1 MB).');
          }
        }

        let json: unknown;
        try {
          json = JSON.parse(bodyText);
        } catch {
          throw new Error('External API returned malformed or non-JSON response.');
        }

        const rawItems = Array.isArray(json)
          ? json
          : Array.isArray((json as any)?.data)
          ? (json as any).data
          : Array.isArray((json as any)?.items)
          ? (json as any).items
          : [];

        const items = rawItems.slice(0, MAX_OPTIONS);

        const displayKey = params.displayField?.trim() || 'label';
        const valueKey = params.valueField?.trim() || 'value';
        const options: OptionItem[] = [];

        for (const item of items) {
          if (!item || typeof item !== 'object') continue;
          const rawVal = item[valueKey] ?? item.id ?? item.key ?? item.value;
          if (rawVal === undefined || rawVal === null || String(rawVal).trim() === '') continue;
          const val = String(rawVal);
          const rawLabel = item[displayKey] ?? item.name ?? item.title ?? item.label ?? val;
          const label = String(rawLabel);

          if (
            normalizedQuery &&
            !label.toLowerCase().includes(normalizedQuery) &&
            !val.toLowerCase().includes(normalizedQuery)
          ) {
            continue;
          }
          options.push({ key: val, value: val, label });
        }
        return options;
      } finally {
        clearTimeout(timeoutId);
      }
    }

    // 3. Tenant Data Source Lookup (Default)
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

      const candidate = String(rawValue);

      // Handle table / members roster source
      if (field.lookupConfig.sourceType === 'table' || field.lookupConfig.targetEntity === 'members') {
        const roster = await this.membershipRepository.getRoster(params.organizationId);
        const activeMembers = roster.filter((m) => m.status === 'active');
        const match = activeMembers.some((m) => {
          const val = field.lookupConfig?.valueField === 'membership_id' ? m.membership_id : m.user_id;
          return val === candidate;
        });
        if (!match) {
          errors.push({
            path,
            fieldKey: field.key,
            code: 'INVALID_LOOKUP_VALUE',
            message: `Selected value '${candidate}' for '${field.label}' is not an active tenant member.`,
          });
        }
        return;
      }

      // Handle external REST API source
      if (field.lookupConfig.sourceType === 'api') {
        try {
          const options = await this.resolveLookupOptions({
            userId: params.userId,
            organizationId: params.organizationId,
            targetEntity: field.lookupConfig.targetEntity,
            sourceType: 'api',
            apiEndpoint: field.lookupConfig.apiEndpoint,
            apiMethod: field.lookupConfig.apiMethod,
            displayField: field.lookupConfig.displayField,
            valueField: field.lookupConfig.valueField,
          });
          const match = options.some((o) => o.key === candidate || o.value === candidate);
          if (!match) {
            errors.push({
              path,
              fieldKey: field.key,
              code: 'INVALID_LOOKUP_VALUE',
              message: `Selected value '${candidate}' for '${field.label}' is not a valid option from external API.`,
            });
          }
        } catch (err) {
          errors.push({
            path,
            fieldKey: field.key,
            code: 'LOOKUP_SOURCE_UNAVAILABLE',
            message: `External API lookup failed for '${field.label}': ${err instanceof Error ? err.message : String(err)}`,
          });
        }
        return;
      }

      // Handle tenant data source
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

