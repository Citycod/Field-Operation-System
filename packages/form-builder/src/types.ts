import type { FormSchemaV1, ValidationResult } from "@field/form-engine";
import type { LookupProvider } from "@field/form-renderer";

export interface BuilderDataSourceFieldOption {
  key: string;
  label: string;
}

export interface BuilderDataSourceOption {
  id?: string;
  key: string;
  name: string;
  status?: "active" | "inactive" | "archived";
  displayFieldKey: string;
  valueFieldKey: string;
  fields?: readonly BuilderDataSourceFieldOption[];
}

export type BuilderSelection =
  | { kind: "header" }
  | {
      kind: "section";
      area: "header" | "tab";
      sectionId: string;
      tabId?: string;
    }
  | {
      kind: "field";
      area: "header" | "tab" | "details";
      fieldId: string;
      sectionId?: string;
      tabId?: string;
    }
  | { kind: "tab"; tabId: string };

export interface FormVersionSummary {
  id: string;
  version_number: number;
  status: "draft" | "published" | "archived";
  schema_version: number;
  schema_jsonb: FormSchemaV1;
  change_note?: string | null;
  created_at: string;
  created_by?: string | null;
  published_at?: string | null;
  published_by?: string | null;
}

export type BuilderModuleTab =
  | "Design"
  | "Form Settings"
  | "Workflow"
  | "Rules"
  | "List View"
  | "Versions";

export interface FormBuilderProps {
  initialSchema: FormSchemaV1;
  onChange?: (schema: FormSchemaV1) => void;
  onSave?: (schema: FormSchemaV1) => void | Promise<void>;
  onPublish?: (changeNote?: string) => void | Promise<void>;
  versions?: readonly FormVersionSummary[];
  onLoadVersions?: () => Promise<readonly FormVersionSummary[]>;
  createId?: (prefix: string) => string;
  dataSources?: readonly BuilderDataSourceOption[];
  lookupProvider?: LookupProvider;
}

export interface BuilderValidation extends ValidationResult {
  action: "preview" | "save" | "publish";
}
