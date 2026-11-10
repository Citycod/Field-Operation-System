import { FieldDefinition, OptionItem } from './fields';

export type TabType = 'form' | 'details' | 'notes' | 'documents';

export interface BaseTabDefinition {
  id: string;
  key: string;
  title: string;
  type: TabType;
  order: number;
}

export interface FormSectionDefinition {
  id: string;
  key: string;
  title: string;
  order: number;
  columns?: number;
  fields: FieldDefinition[];
}

export interface FormTabDefinition extends BaseTabDefinition {
  type: 'form';
  columns?: number;
  sections: FormSectionDefinition[];
}

export interface DetailsColumnDefinition {
  id: string;
  key: string;
  label: string;
  type: FieldDefinition['type'];
  order: number;
  required?: boolean;
  readOnly?: boolean;
  options?: OptionItem[];
  lookupConfig?: FieldDefinition extends infer F ? (F extends { lookupConfig: infer L } ? L : never) : never;
  calculationConfig?: FieldDefinition extends infer F ? (F extends { calculationConfig: infer C } ? C : never) : never;
}

export interface DetailsTabConfig {
  allowAdd?: boolean;
  allowEdit?: boolean;
  allowDelete?: boolean;
  minRows?: number;
  maxRows?: number;
  columns: DetailsColumnDefinition[];
}

export interface DetailsTabDefinition extends BaseTabDefinition {
  type: 'details';
  configuration: DetailsTabConfig;
}

export interface NotesTabDefinition extends BaseTabDefinition {
  type: 'notes';
  appendOnly: boolean;
  showAuthor: boolean;
  showTimestamp: boolean;
  allowAttachments: boolean;
  defaultVisibility: 'internal' | 'requester_and_approvers' | 'all_authorized_users';
}

export interface DocumentsTabDefinition extends BaseTabDefinition {
  type: 'documents';
  allowMultiple: boolean;
  required: boolean;
  maxFiles?: number;
  maxFileSizeMb?: number;
  allowedExtensions?: string[];
  allowDeleteBeforeSubmit?: boolean;
}

export type FormTabUnion =
  | FormTabDefinition
  | DetailsTabDefinition
  | NotesTabDefinition
  | DocumentsTabDefinition;
