# 02 — Form Schema Specification v1

**Status:** Implementation contract  
**Purpose:** Define the serializable schema shared by Builder, Renderer, Preview, Import/Export, validation, and publishing.

---

## 1. Design goals

The schema must be:
- serializable
- versionable
- deterministic
- safe
- generic
- tenant-independent in content except references
- understandable by both builder and renderer
- suitable for runtime validation
- backwards evolvable

Do not persist React components/functions in schema.

Do not persist arbitrary executable JavaScript.

---

## 2. Top-level TypeScript model

```ts
export type FormVersionStatus = "draft" | "published" | "archived";

export interface FormSchemaV1 {
  schemaVersion: 1;
  form: FormMetadata;
  header: HeaderDefinition;
  tabs: FormTabDefinition[];
  rules: RuleDefinition[];
  workflow: WorkflowDefinition | null;
  listView: ListViewDefinition;
  permissions: FormPermissionDefinition;
  settings: FormSettings;
}
```

---

## 3. Form metadata

```ts
export interface FormMetadata {
  formId: string;
  organizationId: string;
  key: string;
  title: string;
  description?: string;
  versionNumber: number;
  versionStatus: FormVersionStatus;
}
```

Rules:
- `formId` is stable across versions.
- `key` is stable internal name.
- `title` is user-facing.
- version snapshot is immutable after Published.

---

## 4. Header definition

```ts
export interface HeaderDefinition {
  columns: 1 | 2 | 3 | 4;
  sections: HeaderSectionDefinition[];
}

export interface HeaderSectionDefinition {
  id: string;
  key: string;
  title?: string;
  order: number;
  width: 1 | 2 | 3 | 4;
  fields: FormFieldDefinition[];
  visibility?: VisibilityDefinition;
}
```

Validation:
- unique section `id`
- unique section `key` within header
- width must fit layout rules
- field IDs/keys unique across whole form unless explicitly namespaced
- order normalized on save/publish

---

## 5. Field types

```ts
export type FieldType =
  | "text"
  | "textarea"
  | "number"
  | "currency"
  | "date"
  | "dropdown"
  | "checkbox"
  | "lookup"
  | "file"
  | "calculated";
```

---

## 6. Base field

```ts
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

  validation?: FieldValidationDefinition;
  visibility?: VisibilityDefinition;

  width?: 1 | 2 | 3 | 4;
}
```

Field IDs are immutable references.
Field keys are stable machine-readable references.
Labels are editable.

Rules should prefer stable field IDs internally where possible.

---

## 7. Field validation

```ts
export interface FieldValidationDefinition {
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  pattern?: string;
  allowedFileExtensions?: string[];
  maxFileSizeMb?: number;
  customMessage?: string;
}
```

MVP:
- basic safe regex may be supported
- no arbitrary JS validator

Server must validate again.

---

## 8. Specialized fields

### Text

```ts
export interface TextFieldDefinition extends BaseFieldDefinition {
  type: "text";
}
```

### Textarea

```ts
export interface TextAreaFieldDefinition extends BaseFieldDefinition {
  type: "textarea";
  rows?: number;
}
```

### Number

```ts
export interface NumberFieldDefinition extends BaseFieldDefinition {
  type: "number";
  decimals?: number;
}
```

### Currency

```ts
export interface CurrencyFieldDefinition extends BaseFieldDefinition {
  type: "currency";
  currency?: string;
  decimals?: number;
}
```

Important:
- use decimal-safe arithmetic server-side
- never rely on JS floating point for financial integrity

### Date

```ts
export interface DateFieldDefinition extends BaseFieldDefinition {
  type: "date";
  includeTime?: boolean;
}
```

### Dropdown

```ts
export interface DropdownOption {
  label: string;
  value: string;
}

export interface DropdownFieldDefinition extends BaseFieldDefinition {
  type: "dropdown";
  options: DropdownOption[];
  multiple?: boolean;
}
```

### Checkbox

```ts
export interface CheckboxFieldDefinition extends BaseFieldDefinition {
  type: "checkbox";
}
```

### Lookup

```ts
export interface LookupFieldDefinition extends BaseFieldDefinition {
  type: "lookup";
  dataSource: {
    sourceId: string;
    displayField: string;
    valueField: string;
    multiple?: boolean;
  };
}
```

### File

```ts
export interface FileFieldDefinition extends BaseFieldDefinition {
  type: "file";
  allowMultiple?: boolean;
  maxFiles?: number;
}
```

### Calculated

```ts
export interface CalculatedFieldDefinition extends BaseFieldDefinition {
  type: "calculated";
  readOnly: true;
  calculation: CalculationDefinition;
}
```

---

## 9. Field union

```ts
export type FormFieldDefinition =
  | TextFieldDefinition
  | TextAreaFieldDefinition
  | NumberFieldDefinition
  | CurrencyFieldDefinition
  | DateFieldDefinition
  | DropdownFieldDefinition
  | CheckboxFieldDefinition
  | LookupFieldDefinition
  | FileFieldDefinition
  | CalculatedFieldDefinition;
```

---

## 10. Tab definitions

```ts
export type FormTabType =
  | "form"
  | "details"
  | "notes"
  | "documents";
```

Base:

```ts
export interface BaseTabDefinition {
  id: string;
  key: string;
  title: string;
  type: FormTabType;
  order: number;
  visible?: boolean;
  helpText?: string;
  visibility?: VisibilityDefinition;
}
```

No arbitrary number restriction.

---

## 11. Form/Fields tab

```ts
export interface FormFieldsTabDefinition extends BaseTabDefinition {
  type: "form";
  columns: 1 | 2 | 3 | 4;
  sections: FormTabSectionDefinition[];
}

export interface FormTabSectionDefinition {
  id: string;
  key: string;
  title?: string;
  order: number;
  width: 1 | 2 | 3 | 4;
  fields: FormFieldDefinition[];
}
```

---

## 12. Details/Grid tab

```ts
export interface DetailsTabDefinition extends BaseTabDefinition {
  type: "details";
  configuration: {
    allowAdd: boolean;
    allowEdit: boolean;
    allowDelete: boolean;
    minRows?: number;
    maxRows?: number;
    columns: DetailColumnDefinition[];
  };
}

export interface DetailColumnDefinition {
  id: string;
  key: string;
  label: string;
  type: FieldType;
  order: number;
  required?: boolean;
  readOnly?: boolean;
  width?: number;
  validation?: FieldValidationDefinition;
  dataSource?: LookupFieldDefinition["dataSource"];
  calculation?: CalculationDefinition;
  allowAttachment?: boolean;
}
```

Each runtime row gets a stable row ID.

---

## 13. Notes tab

```ts
export type NoteVisibility =
  | "internal"
  | "requester_and_approvers"
  | "all_authorized_users";

export interface NotesTabDefinition extends BaseTabDefinition {
  type: "notes";
  configuration: {
    appendOnly: true;
    showAuthor: boolean;
    showTimestamp: boolean;
    allowAttachments: boolean;
    defaultVisibility: NoteVisibility;
  };
}
```

---

## 14. Documents tab

```ts
export interface DocumentsTabDefinition extends BaseTabDefinition {
  type: "documents";
  configuration: {
    allowMultiple: boolean;
    required: boolean;
    maxFiles?: number;
    maxFileSizeMb?: number;
    allowedExtensions?: string[];
    allowDeleteBeforeSubmit?: boolean;
  };
}
```

No hardcoded document categories in MVP.

---

## 15. Tab union

```ts
export type FormTabDefinition =
  | FormFieldsTabDefinition
  | DetailsTabDefinition
  | NotesTabDefinition
  | DocumentsTabDefinition;
```

---

## 16. Visibility

```ts
export interface VisibilityDefinition {
  mode: "always" | "rule";
  ruleId?: string;
}
```

The Rules Engine is the main dynamic behavior mechanism.

---

## 17. Rules

```ts
export type RuleOperator =
  | "equals"
  | "notEquals"
  | "greaterThan"
  | "lessThan"
  | "contains"
  | "isEmpty"
  | "isNotEmpty";

export interface RuleCondition {
  id: string;
  sourceRef: string;
  operator: RuleOperator;
  value?: unknown;
}

export type RuleActionType =
  | "show"
  | "hide"
  | "require"
  | "enable"
  | "disable"
  | "setValue";

export interface RuleAction {
  id: string;
  type: RuleActionType;
  targetRef: string;
  value?: unknown;
}

export interface RuleDefinition {
  id: string;
  name: string;
  enabled: boolean;
  match: "all" | "any";
  conditions: RuleCondition[];
  actions: RuleAction[];
}
```

`sourceRef` and `targetRef` should resolve deterministically.

Prefer IDs over labels.

Publish validation must reject broken references.

---

## 18. Calculations

```ts
export type CalculationOperation =
  | "add"
  | "subtract"
  | "multiply"
  | "divide"
  | "sum"
  | "min"
  | "max"
  | "count";

export interface CalculationDefinition {
  operation: CalculationOperation;
  operands?: Array<string | number>;
  source?: string;
}
```

Examples:

```json
{
  "operation": "multiply",
  "operands": ["quantity", "unitPrice"]
}
```

```json
{
  "operation": "sum",
  "source": "tab_items.amount"
}
```

Important:
- server verifies critical calculated values
- currency calculations use decimal-safe implementation

---

## 19. Workflow definition

```ts
export type ApproverType =
  | "user"
  | "role"
  | "departmentRole"
  | "managerOfRequester";

export interface ApproverDefinition {
  type: ApproverType;
  userId?: string;
  roleId?: string;
  departmentRoleId?: string;
}

export interface WorkflowStageDefinition {
  id: string;
  key: string;
  name: string;
  order: number;
  approver: ApproverDefinition;
  requireCommentOnApprove?: boolean;
  requireCommentOnReject?: boolean;
  requireCommentOnReturn?: boolean;
}

export interface WorkflowDefinition {
  enabled: boolean;
  type: "sequential";
  stages: WorkflowStageDefinition[];
}
```

MVP return behavior should be defined consistently by Workflow Service.

Recommended:
- Return sends submission back to requester.
- requester edits and resubmits.
- workflow runtime records preserve prior cycle history.

---

## 20. List View

```ts
export interface ListViewColumn {
  id: string;
  sourceRef: string;
  label: string;
  order: number;
  width?: number;
  sortable?: boolean;
  filterable?: boolean;
  searchable?: boolean;
  format?: "text" | "date" | "currency" | "status";
}

export interface ListViewDefinition {
  columns: ListViewColumn[];
  defaultSort?: {
    sourceRef: string;
    direction: "asc" | "desc";
  };
  pageSize?: number;
}
```

System fields such as reference/status/createdAt can also be valid source refs.

---

## 21. Permissions schema

Keep high-level form permissions declarative.

```ts
export interface FormPermissionDefinition {
  createRoles?: string[];
  readOwnRoles?: string[];
  readAllRoles?: string[];
  manageFormRoles?: string[];
}
```

Actual authorization is server-side and may combine schema config with platform RBAC.

Do not rely solely on schema permissions for platform security.

---

## 22. Settings

```ts
export interface FormSettings {
  allowDrafts: boolean;

  referenceNumber?: {
    enabled: boolean;
    prefix?: string;
    format?: string;
  };

  notifications?: {
    onSubmit?: boolean;
    onApproval?: boolean;
    onRejection?: boolean;
    onReturn?: boolean;
  };
}
```

---

## 23. Example minimal schema

```json
{
  "schemaVersion": 1,
  "form": {
    "formId": "form_001",
    "organizationId": "org_001",
    "key": "simple_request",
    "title": "Simple Request",
    "versionNumber": 1,
    "versionStatus": "draft"
  },
  "header": {
    "columns": 2,
    "sections": [
      {
        "id": "sec_1",
        "key": "general",
        "title": "General",
        "order": 1,
        "width": 2,
        "fields": [
          {
            "id": "fld_1",
            "key": "requesterName",
            "type": "text",
            "label": "Requester Name",
            "order": 1,
            "required": true
          }
        ]
      }
    ]
  },
  "tabs": [],
  "rules": [],
  "workflow": null,
  "listView": {
    "columns": []
  },
  "permissions": {},
  "settings": {
    "allowDrafts": true
  }
}
```

---

## 24. Publish validation rules

At minimum reject:
- unsupported schemaVersion
- missing form metadata
- duplicate field IDs
- duplicate field keys where global uniqueness is required
- duplicate tab IDs/keys
- invalid field type
- invalid tab type
- broken rule references
- broken list-view references
- broken calculation references
- missing lookup source
- invalid workflow stage ordering
- unresolved required approver configuration
- invalid file constraints
- invalid column widths/layout constraints

Warnings may include:
- empty tab
- no list-view columns
- no workflow
- no description

---

## 25. Schema migrations

Future schema versions should use explicit migration functions.

Example:

```ts
migrateSchemaV1ToV2(schemaV1): FormSchemaV2
```

Never silently reinterpret old schemas using new assumptions.

---

## 26. Schema fixtures

Maintain test fixtures:
- minimal valid form
- form with all field types
- multiple Details tabs
- Notes/Documents
- rules/calculations
- sequential approval
- invalid broken-reference schemas

Purchase Requisition can exist as fixture/test data only, not engine logic.
