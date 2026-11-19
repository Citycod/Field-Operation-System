export type FieldType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'currency'
  | 'date'
  | 'dropdown'
  | 'checkbox'
  | 'lookup'
  | 'file'
  | 'calculated';

export interface BaseFieldValidation {
  customMessage?: string;
}

export interface TextFieldValidation extends BaseFieldValidation {
  minLength?: number;
  maxLength?: number;
  pattern?: string;
}

export interface NumberFieldValidation extends BaseFieldValidation {
  min?: number;
  max?: number;
}

export interface FileFieldValidation extends BaseFieldValidation {
  allowedFileExtensions?: string[];
  maxFileSizeMb?: number;
}

export interface OptionItem {
  /** Stable immutable identifier / key for persistence, business rules, and references */
  key?: string;
  /** Display label shown to respondents in forms and viewers */
  label: string;
  /** Stored value (matches `key` in modern schemas; backwards compatible with legacy `value`) */
  value: string;
  /** Optional description or tooltip text */
  description?: string;
}

export type LookupSourceType = 'data_source' | 'table' | 'view' | 'api';

export interface LookupConfig {
  /** Type of dynamic data source ('data_source', 'table', 'view', or 'api') */
  sourceType?: LookupSourceType;
  /** Identifier of the target data source, table, view, or API definition */
  targetEntity: string;
  /** Field to display in dropdown options */
  displayField: string;
  /** Field to store as the stable value */
  valueField: string;
  /** Optional static or parameterized filter criteria */
  filter?: Record<string, unknown>;
  /** Optional external API endpoint (for sourceType: 'api') */
  apiEndpoint?: string;
  /** Optional HTTP method for external API */
  apiMethod?: 'GET' | 'POST';
}

export type CalculationOperation =
  | 'add'
  | 'subtract'
  | 'multiply'
  | 'divide'
  | 'sum'
  | 'min'
  | 'max'
  | 'count'
  | 'custom';

export interface CalculationConfig {
  /** Predefined operation or 'custom' for mathematical formula expressions */
  operation: CalculationOperation;
  /** Operand field keys when using predefined operations */
  operands?: string[];
  /** Grid source (e.g. 'tabKey.columnKey') for grid column aggregations */
  source?: string;
  /** Custom formula expression, e.g. '(principal_amount * interest_rate * tenor_days) / 36500' */
  formula?: string;
  /** Explicit decimal precision for rounding results (0 to 8). When omitted, defaults to 4. */
  precision?: number;
}

export interface BaseFieldDefinition {
  id: string;
  key: string;
  type: FieldType;
  label: string;
  order: number;
  required?: boolean;
  readOnly?: boolean;
  hidden?: boolean;
  placeholder?: string;
  helpText?: string;
  defaultValue?: unknown;
  width?: 'full' | 'half' | 'third' | 'quarter';
}

export interface TextFieldDefinition extends BaseFieldDefinition {
  type: 'text';
  validation?: TextFieldValidation;
}

export interface TextareaFieldDefinition extends BaseFieldDefinition {
  type: 'textarea';
  validation?: TextFieldValidation;
}

export interface NumberFieldDefinition extends BaseFieldDefinition {
  type: 'number';
  validation?: NumberFieldValidation;
}

export interface CurrencyFieldDefinition extends BaseFieldDefinition {
  type: 'currency';
  currencyCode?: string;
  validation?: NumberFieldValidation;
}

export interface DateFieldDefinition extends BaseFieldDefinition {
  type: 'date';
  validation?: BaseFieldValidation;
}

export interface DropdownFieldDefinition extends BaseFieldDefinition {
  type: 'dropdown';
  options: OptionItem[];
  validation?: BaseFieldValidation;
}

export interface CheckboxFieldDefinition extends BaseFieldDefinition {
  type: 'checkbox';
  validation?: BaseFieldValidation;
}

export interface LookupFieldDefinition extends BaseFieldDefinition {
  type: 'lookup';
  lookupConfig: LookupConfig;
  validation?: BaseFieldValidation;
}

export interface FileFieldDefinition extends BaseFieldDefinition {
  type: 'file';
  validation?: FileFieldValidation;
}

export interface CalculatedFieldDefinition extends BaseFieldDefinition {
  type: 'calculated';
  calculationConfig: CalculationConfig;
  validation?: BaseFieldValidation;
}

export type FieldDefinition =
  | TextFieldDefinition
  | TextareaFieldDefinition
  | NumberFieldDefinition
  | CurrencyFieldDefinition
  | DateFieldDefinition
  | DropdownFieldDefinition
  | CheckboxFieldDefinition
  | LookupFieldDefinition
  | FileFieldDefinition
  | CalculatedFieldDefinition;
