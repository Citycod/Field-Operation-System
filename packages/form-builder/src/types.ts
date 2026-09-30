import type { FormSchemaV1, ValidationResult } from "@field/form-engine";

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
}

export interface BuilderValidation extends ValidationResult {
  action: "preview" | "save";
}
