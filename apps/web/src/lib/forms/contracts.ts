import type {
  FormListItem,
  FormEntity,
  FormVersionEntity,
} from "@/lib/repositories/form-repository";

export interface FormLibraryResponse {
  forms: FormListItem[];
}
export interface FormDraftResponse {
  form: FormEntity;
  draft: FormVersionEntity | null;
  isLocked?: boolean;
  hasSubmissions?: boolean;
}
export interface ApiErrorResponse {
  error: string;
  code: string;
}
