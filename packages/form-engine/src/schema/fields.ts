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
  label: string;
  value: string;
}

export interface LookupConfig {
  targetEntity: string;
  displayField: string;
  valueField: string;
  filter?: Record<string, unknown>;
}

export interface CalculationConfig {
  operation: 'add' | 'subtract' | 'multiply' | 'divide' | 'sum' | 'min' | 'max' | 'count';
  operands?: string[];
  source?: string;
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
