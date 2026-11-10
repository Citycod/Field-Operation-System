import type {
  FormSchemaV1,
  LookupConfig,
  OptionItem,
} from "@field/form-engine";

export type RendererMode = "edit" | "readOnly" | "preview";
/** Local file handles only. Nothing is uploaded by the renderer. */
export interface LocalFile {
  id: string;
  name: string;
  size: number;
  type: string;
  file?: File;
}
export type FieldValue = string | number | boolean | null | LocalFile[];
export interface DetailRow {
  id: string;
  values: Record<string, FieldValue>;
}
export interface LocalNote {
  id: string;
  text: string;
  author: string;
  createdAt: string;
  visibility: "internal" | "requester_and_approvers" | "all_authorized_users";
  attachments: LocalFile[];
}
export interface RendererValue {
  fields: Record<string, FieldValue>;
  details: Record<string, DetailRow[]>;
  notes: Record<string, LocalNote[]>;
  documents: Record<string, LocalFile[]>;
}
export interface ValueError {
  path: string;
  label: string;
  message: string;
  tabId?: string;
}
/** The host implements tenant authorization when connecting a real data source. */
export type LookupProvider = (
  config: LookupConfig,
  context: { fieldId: string; signal: AbortSignal },
) => Promise<readonly OptionItem[]>;
export interface FormRendererProps {
  schema: FormSchemaV1 | unknown;
  mode?: RendererMode;
  initialValue?: RendererValue;
  value?: RendererValue;
  onChange?: (value: RendererValue) => void;
  onSubmit?: (value: RendererValue) => void;
  /** Preview never invokes onSubmit. This callback is explicitly local/testing. */
  onPreview?: (value: RendererValue) => void;
  lookupProvider?: LookupProvider;
  noteAuthor?: string;
}
