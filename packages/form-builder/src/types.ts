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

export interface FormBuilderProps {
  initialSchema: FormSchemaV1;
  onChange?: (schema: FormSchemaV1) => void;
  onSave?: (schema: FormSchemaV1) => void | Promise<void>;
  createId?: (prefix: string) => string;
  dataSources?: readonly BuilderDataSourceOption[];
  lookupProvider?: LookupProvider;
}

export interface BuilderValidation extends ValidationResult {
  action: "preview" | "save";
}
