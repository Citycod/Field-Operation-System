import { FieldDefinition } from './fields';
import { FormTabUnion } from './tabs';
import { RuleDefinition } from './rules';
import { WorkflowDefinition } from './workflow';
import { ListViewDefinition } from './list-view';

export interface FormMetadata {
  id: string;
  key: string;
  title: string;
  description?: string;
  schemaVersion: 1;
}

export interface HeaderSectionDefinition {
  id: string;
  key: string;
  title: string;
  order: number;
  width?: 'full' | 'half' | 'third' | 'quarter';
  fields: FieldDefinition[];
}

export interface HeaderDefinition {
  columns?: number;
  sections: HeaderSectionDefinition[];
}

export interface FormPermissionDefinition {
  createRoles?: string[];
  readOwnRoles?: string[];
  readAllRoles?: string[];
  manageFormRoles?: string[];
}

export interface FormSettings {
  allowDrafts?: boolean;
  referenceNumber?: {
    enabled?: boolean;
    prefix?: string;
    suffix?: string;
    sequenceLength?: number;
  };
  notifications?: {
    emailOnSubmit?: boolean;
    emailOnApprove?: boolean;
    emailOnReject?: boolean;
    // Legacy / extended properties preserved for backward compatibility
    onSubmit?: boolean;
    onApproval?: boolean;
    onRejection?: boolean;
    onReturn?: boolean;
    [key: string]: unknown;
  };
}

export interface FormSchemaV1 {
  schemaVersion: 1;
  form: FormMetadata;
  header: HeaderDefinition;
  tabs: FormTabUnion[];
  rules: RuleDefinition[];
  workflow: WorkflowDefinition | null;
  listView: ListViewDefinition;
  permissions: FormPermissionDefinition;
  settings: FormSettings;
}
