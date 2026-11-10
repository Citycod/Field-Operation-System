# ANTIGRAVITY MASTER PROMPT — FORM BUILDER PHASE 1
## Field Workforce & Operations Management Platform
## Repository Audit + Form Schema v1 + Validation + Persistence + RLS + Version Lifecycle

You are working inside the repository for the **Field Workforce & Operations Management Platform**.

The **Supabase portability hardening has already been completed and approved**.

The current architecture is intentionally:

```text
Next.js / React / TypeScript
        ↓
Application Services
        ↓
Repository / Infrastructure Interfaces
        ↓
Supabase Adapters
        ↓
Supabase
├── PostgreSQL
├── Auth
├── Storage
└── RLS
```

The Form Builder is **one reusable module inside the wider platform**. It is not a standalone product.

Your task now is to implement **Form Builder Phase 1 only**.

Do not begin Phase 2 automatically.

---

# 1. Git / Branch

Work from the approved Supabase-portability foundation.

Create or switch to:

```text
feat/form-builder-phase-1
```

Do not force-push.

Do not rewrite the approved portability work.

Preserve the completed portability branch/commit history.

---

# 2. Required Reading Before Editing

Before changing code, read and treat these files as the source of truth:

```text
AGENTS.md
FORM_BUILDER_MASTER_SPEC.md
README.md

docs/architecture/PLATFORM-ARCHITECTURE.md
docs/architecture/SUPABASE-PORTABILITY.md

docs/form-builder/00-MVP-SCOPE.md
docs/form-builder/01-UI-UX-SPEC.md
docs/form-builder/02-FORM-SCHEMA-SPEC.md
docs/form-builder/03-DATA-MODEL.md
docs/form-builder/04-API-SERVICE-CONTRACTS.md
docs/form-builder/05-AUTH-TENANCY-PERMISSIONS.md
docs/form-builder/06-IMPLEMENTATION-PLAN.md
docs/form-builder/07-TESTING-ACCEPTANCE.md
docs/form-builder/08-DECISIONS-LOG.md
docs/form-builder/09-PLATFORM-MODULE-ARCHITECTURE.md
```

Also inspect:

```text
apps/web/
packages/form-engine/
packages/types/
packages/ui/
supabase/
```

If the existing implementation conflicts with the approved docs, do not silently choose one.

Report the conflict before making destructive architecture changes.

---

# 3. Locked Stack

Keep:

```text
Frontend:
- Next.js
- React
- TypeScript
- App Router
- PWA-first

Backend:
- Supabase

Supabase:
- PostgreSQL
- Auth
- Storage
- RLS

Architecture:
- pnpm monorepo
- multi-tenant
- infrastructure abstraction boundaries
```

Do not introduce:

```text
Directus
Firebase
Neon as active backend
NestJS
Express backend
another BaaS
```

Do not replace the approved Supabase portability architecture.

---

# 4. Form Engine Isolation Rule

This is critical.

`packages/form-engine` must remain infrastructure-independent.

It must NOT import:

```text
@supabase/supabase-js
@supabase/ssr
```

The intended architecture is:

```text
Form Builder UI
      ↓
Application Service
      ↓
FormRepository Interface
      ↓
SupabaseFormRepository
      ↓
PostgreSQL
```

Core Form Engine responsibilities belong in:

```text
packages/form-engine/
```

Infrastructure-specific persistence belongs under the web/infrastructure layer.

Do not leak Supabase types into the Form Engine domain.

---

# 5. Phase 1 Scope Only

Implement only:

```text
1. Repository audit
2. Form Schema v1
3. Strong TypeScript domain types
4. Runtime structural validation
5. Publish-level semantic validation
6. forms persistence
7. form_versions persistence
8. FormRepository abstraction
9. SupabaseFormRepository implementation
10. Draft / Published lifecycle
11. Published-version immutability
12. Multi-tenant RLS
13. Fixtures
14. Unit tests
15. Lifecycle tests
16. Tenant-security tests
17. Supabase migration/type updates
18. Documentation updates only where needed
```

Do NOT implement yet:

```text
Renderer UI
Drag/drop Builder UI
Rules UI
Calculation UI
Workflow runtime
Submission runtime
Submission List
Record View
Approver Review UI
Visitor App
Templates
AI
Offline synchronization
Payments
Redis
Native mobile app
```

Stop when Phase 1 is complete.

---

# 6. Product Context

The wider platform includes or will include modules such as:

```text
Dashboard
Customers
Sites
Jobs / Work Orders
Scheduling / Dispatch
Employees
Timesheets
Expenses
Assets
Preventive Maintenance
HSE / Compliance
Documents
Contracts
Reporting
Customer Portal
Approvals
Visitor Management
Form Builder
```

The Form Builder must eventually be reusable by these modules.

Examples:

```text
Procurement → Purchase Requisition
HSE → Inspection / Incident Report
Assets → Asset Inspection
Jobs → Service Report
Expenses → Expense Request
Visitor Management → Visitor Registration
```

Do not hardcode those business processes into the engine.

Never add logic such as:

```ts
if (formType === "visitor") {}
if (formType === "purchase_requisition") {}
```

inside the Form Engine.

---

# 7. Core Architecture

The Form Builder follows:

```text
Builder
  ↓
Form Schema
  ↓
Renderer
  ↓
Runtime Form
```

Phase 1 implements the **Form Schema contract and persistence foundation** only.

---

# 8. Form Schema v1

Implement the approved schema contract from:

```text
docs/form-builder/02-FORM-SCHEMA-SPEC.md
```

Top-level conceptual structure:

```text
Form
├── Metadata
├── Header
├── Tabs
├── Rules
├── Workflow
├── List View
├── Permissions
├── Settings
└── Version Metadata
```

Conceptually:

```ts
interface FormSchemaV1 {
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

Use strong TypeScript discriminated unions.

The schema must remain JSON serializable.

Do not store:

```text
React components
functions
arbitrary JavaScript
arbitrary SQL
browser runtime objects
Supabase client objects
```

---

# 9. Metadata

Form metadata should support approved properties such as:

```text
id
key
title
description
schemaVersion
```

Use stable machine-readable keys.

Do not use display labels as stable references.

---

# 10. Header Model

Support the Dynamics-style Header/Main information area.

Conceptually:

```text
Header
├── columns: 1–4
└── sections[]
    ├── id
    ├── key
    ├── title
    ├── order
    ├── width
    └── fields[]
```

Use controlled grid layout.

No free pixel positioning.

Header may support multiple sections such as:

```text
Requisition Header
Delivery & Sourcing
Vendor
Currency & Amounts
```

---

# 11. Approved Field Types

Support exactly the approved MVP types:

```text
text
textarea
number
currency
date
dropdown
checkbox
lookup
file
calculated
```

Use a common base field definition plus specialized discriminated unions.

Common properties may include:

```text
id
key
type
label
order
required
readOnly
hidden
placeholder
helpText
defaultValue
validation
visibility
width
```

Rules:

```text
id = immutable internal identity
key = stable machine-readable reference
label = editable display text
```

Do not reference fields by label in rules/calculations.

---

# 12. Validation Configuration

Support field-level validation configuration such as:

```text
minLength
maxLength
min
max
pattern
allowedFileExtensions
maxFileSizeMb
customMessage
```

No arbitrary JavaScript validators.

Server-side validation remains authoritative.

---

# 13. Approved Tab Types

Support:

```text
form
details
notes
documents
```

Important:

- no arbitrary tab-count restriction
- multiple tabs of the same type are allowed
- title and type are independent

Examples:

```text
Items → details
Materials → details
Vendor → form
Accounting → form
Manager Comments → notes
Attachments → documents
```

Notes/Documents are tab types inside Design.

They are NOT top-level global builder navigation items.

---

# 14. Form/Fields Tab

Support a definition like:

```text
id
key
title
type = form
order
visibility
columns
sections[]
```

Each section may contain fields.

This is for non-repeating structured information.

---

# 15. Details/Grid Tab

Support:

```text
id
key
title
type = details
order
configuration
```

Configuration should support:

```text
allowAdd
allowEdit
allowDelete
minRows
maxRows
columns[]
```

Each column should support:

```text
id
key
label
type
order
required
readOnly
validation
lookup config where relevant
calculation config where relevant
attachment capability where relevant
```

Do not implement runtime row CRUD yet.

Only define and validate the schema contract.

---

# 16. Notes Tab

Support:

```text
type = notes
appendOnly = true
showAuthor
showTimestamp
allowAttachments
defaultVisibility
```

Possible visibility values may include:

```text
internal
requester_and_approvers
all_authorized_users
```

Do not implement notes persistence/runtime yet.

---

# 17. Documents Tab

Support:

```text
type = documents
allowMultiple
required
maxFiles
maxFileSizeMb
allowedExtensions
allowDeleteBeforeSubmit
```

Do NOT hardcode document categories such as:

```text
Quotation
Invoice
Certificate
Purchase Order
```

Document Type is not hardcoded in MVP.

---

# 18. Rules Schema

Implement declarative rule configuration.

Approved operators:

```text
equals
notEquals
greaterThan
lessThan
contains
isEmpty
isNotEmpty
```

Approved actions:

```text
show
hide
require
enable
disable
setValue
```

Rules must reference stable IDs/keys.

Do not implement arbitrary JavaScript.

Do not implement the complete runtime rule engine in this phase.

Only define schema and validate references/config.

---

# 19. Calculation Schema

Implement controlled calculation definitions.

Approved operations:

```text
add
subtract
multiply
divide
sum
min
max
count
```

Examples conceptually:

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

Do not implement the full calculation runtime yet.

Validate references and operation configuration.

Use safe numeric/decimal concepts for future currency behavior.

---

# 20. Workflow Configuration Schema

Phase 1 only defines workflow configuration.

MVP workflow type:

```text
sequential
```

Stage definition should support:

```text
id
key
name
order
approver
requireCommentOnApprove
requireCommentOnReject
requireCommentOnReturn
```

Approver types may include:

```text
user
role
departmentRole
managerOfRequester
```

Do not implement:

```text
parallel approval
delegation
escalation
BPMN
graphical workflow engine
runtime approval instances
```

in Phase 1.

---

# 21. List View Configuration

Support:

```text
columns[]
defaultSort
pageSize
```

Each list column may contain:

```text
id
sourceRef
label
order
width
sortable
filterable
searchable
format
```

Supported formats may include:

```text
text
date
currency
status
```

Validate source references against:

```text
configured fields
approved system fields
```

Do not build List View UI yet.

---

# 22. Permission Configuration

Implement only the configuration shape.

Example concepts:

```text
createRoles
readOwnRoles
readAllRoles
manageFormRoles
```

Schema permission config does NOT replace PostgreSQL RLS.

---

# 23. Form Settings

Keep settings minimal and aligned with docs.

Support approved concepts such as:

```text
allowDrafts
referenceNumber
notifications
```

Do not overbuild.

---

# 24. Runtime Validation

Implement a reusable validator in the Form Engine.

Prefer the validation library already in the repo.

If none exists, add an appropriate TypeScript runtime validation library only if justified.

The validator must safely handle unknown/malformed JSON.

It must not crash on bad input.

Return structured validation results.

At minimum detect:

```text
unsupported schemaVersion
missing required top-level structures
duplicate field IDs
duplicate field keys
duplicate tab IDs
duplicate tab keys
unsupported field type
unsupported tab type
invalid header layout
invalid section layout
invalid Details column definition
invalid Lookup config
broken rule source
broken rule target
broken calculation references
broken List View references
invalid workflow stage order
invalid workflow approver config
invalid Documents config
invalid Notes config
```

---

# 25. Separate Draft and Publish Validation

Implement:

```text
validateDraftSchema()
validatePublishableSchema()
```

Draft validation:
- checks structural safety
- allows temporarily incomplete configuration where safe to persist

Publish validation:
- checks full semantic integrity
- blocks broken references
- blocks invalid workflow
- blocks invalid list-view references
- blocks critical incomplete configuration

Return a structured shape such as:

```text
errors
warnings
passedChecks
```

Errors block publish.

Warnings do not necessarily block publish.

---

# 26. Form Repository Abstraction

Create an infrastructure-neutral repository interface.

Conceptually:

```ts
interface FormRepository {
  createForm(...): Promise<...>;
  getFormById(...): Promise<...>;
  getDraftVersion(...): Promise<...>;
  getPublishedVersion(...): Promise<...>;
  saveDraft(...): Promise<...>;
  publishVersion(...): Promise<...>;
  createDraftFromPublished(...): Promise<...>;
}
```

Keep Supabase implementation separate.

Example:

```text
apps/web/src/lib/repositories/form-repository.ts
apps/web/src/lib/repositories/supabase/supabase-form-repository.ts
```

Adapt paths to repo conventions.

---

# 27. forms Table

Create a new Supabase/PostgreSQL migration for:

```text
public.forms
```

Minimum fields:

```text
id uuid primary key
organization_id uuid not null
key text not null
title text not null
description text
status text not null
current_draft_version_id uuid null
current_published_version_id uuid null
created_by uuid not null
created_at timestamptz not null
updated_at timestamptz not null
archived_at timestamptz null
```

Constraints:

```text
unique (organization_id, key)
```

Foreign keys:

```text
organization_id → organizations.id
created_by → auth.users.id
```

Handle circular version references safely.

---

# 28. form_versions Table

Create:

```text
public.form_versions
```

Minimum fields:

```text
id uuid primary key
organization_id uuid not null
form_id uuid not null
version_number integer not null
status text not null
schema_version integer not null
schema_jsonb jsonb not null
change_note text
created_by uuid not null
created_at timestamptz not null
published_by uuid null
published_at timestamptz null
```

Constraints:

```text
unique (form_id, version_number)
```

Foreign keys:

```text
organization_id → organizations.id
form_id → forms.id
created_by → auth.users.id
published_by → auth.users.id
```

Add indexes needed for:

```text
organization_id
form_id
status
current version lookups
```

Ensure form/version tenant consistency.

---

# 29. Version Statuses

Use:

```text
draft
published
archived
```

Do not silently add more states without justification.

---

# 30. Version Lifecycle

Implement:

```text
Create Form
→ Draft V1

Draft V1
→ Publish
→ Published V1

Published V1
→ Edit
→ Draft V2

Draft V2
→ Publish
→ Published V2
```

Rules:

- Published versions are immutable.
- Never update a Published `schema_jsonb`.
- Editing a Published version creates a new Draft.
- Historical Published versions remain available.
- `current_published_version_id` points to latest Published.
- `current_draft_version_id` points to active Draft when present.

If only one active Draft per form is allowed, enforce it consistently.

---

# 31. createForm()

Implement a generic application/service operation.

It should:

```text
derive authenticated user from server session
verify organization membership/permission
create logical form
create Draft V1
write minimal structurally valid schema
set current_draft_version_id
return form + version
```

Do not trust a frontend-supplied `userId`.

Do not create business-specific services.

---

# 32. saveDraftSchema()

Implement:

```text
saveDraftSchema(...)
```

Rules:

```text
authenticated
tenant-authorized
manage permission
target version must be Draft
draft structural validation must pass
Published targets must be rejected
```

Do not allow direct Published mutation.

---

# 33. publishForm()

Implement publishing atomically.

Required flow:

```text
authorize
load current Draft
run validatePublishableSchema()
block on errors
mark Draft/version as Published
update form.current_published_version_id
clear/update current_draft_version_id
set published_by/published_at
```

Use a transaction/RPC/database function if required to make the operation atomic.

Do not implement this as a race-prone chain of unrelated client calls.

---

# 34. createDraftFromPublished()

Implement:

```text
authorize
load Published version
calculate next version number safely
copy schema
insert Draft
set current_draft_version_id
leave original Published version unchanged
```

Ensure concurrent draft creation cannot create duplicate version numbers.

---

# 35. RLS

Enable RLS on:

```text
forms
form_versions
```

Use the existing membership architecture.

Tenant rules:

```text
Org A user cannot read Org B form
Org A user cannot read Org B version
Org A user cannot insert into Org B
Org A user cannot update Org B
Org A user cannot publish Org B
Org A user cannot create Draft for Org B
```

Do not rely only on frontend filters or TypeScript guards.

Use authenticated user context where practical.

Do not use service-role access for normal application operations.

---

# 36. Published Immutability at More Than One Layer

Enforce Published-version immutability in:

```text
application/service layer
repository layer where appropriate
database layer where practical
```

Do not rely on UI disabling alone.

If using a trigger/function/policy to block Published schema mutation, keep it simple and documented.

---

# 37. Fixtures

Add fixtures for:

```text
minimal valid form
all supported field types
multiple tabs
multiple Details tabs
Form/Fields tab
Notes tab
Documents tab
rules
calculations
sequential workflow config
List View config

invalid duplicate IDs
invalid duplicate keys
broken rule refs
broken calculation refs
broken lookup refs
broken List View refs
invalid workflow stage
```

A Purchase Requisition-style fixture is allowed only as generic test data.

Do not embed Purchase Requisition behavior in the engine.

---

# 38. Unit Tests

At minimum test:

```text
minimal valid schema accepted
all approved field types accepted
all approved tab types accepted
multiple tabs of same type accepted
duplicate field ID rejected
duplicate field key rejected
duplicate tab ID rejected
duplicate tab key rejected
invalid field type rejected
invalid tab type rejected
broken rule ref blocked by publish validation
broken calculation ref blocked
broken List View ref blocked
invalid lookup config blocked
invalid workflow stage blocked
Draft incomplete but structurally safe schema can persist
Publish blocks critical semantic errors
```

---

# 39. Lifecycle Tests

Test:

```text
create form → Draft V1
save Draft V1
publish V1
Published V1 immutable
create Draft V2 from Published V1
save Draft V2
publish V2
Published V1 remains unchanged
form points to current Published V2
```

---

# 40. Tenant-Security Tests

Mandatory tests:

```text
Org A member can access Org A form
Org A member cannot access Org B form
Org A member cannot access Org B version
Org A member cannot insert/update Org B form
disabled membership rejected
unrelated authenticated user rejected
```

Prefer real RLS integration tests where environment supports them.

Do not claim RLS was truly tested if only repository mocks were used.

Clearly label:

```text
unit tests
integration tests
RLS/database tests
```

---

# 41. Migration Rules

Add a new migration.

Do not edit already-applied foundation migrations in place unless clearly safe and explicitly justified.

Use a new file such as:

```text
supabase/migrations/<timestamp>_form_builder_phase_1.sql
```

Keep migrations reproducible.

---

# 42. Generated Database Types

After applying migration:

- regenerate database TypeScript types if the linked Supabase project is available
- preserve the approved generated-types location

If real generation cannot run, report that fact.

Do not fabricate generated schema output.

---

# 43. Documentation

Update docs only where implementation decisions require it.

At minimum consider:

```text
docs/form-builder/03-DATA-MODEL.md
docs/form-builder/04-API-SERVICE-CONTRACTS.md
docs/form-builder/08-DECISIONS-LOG.md
```

Do not change approved UI scope.

Do not rewrite the product requirements.

---

# 44. Static Architecture Audit

Before completion verify:

```text
grep -R "@supabase" packages/form-engine/
```

must return 0 relevant results.

Also inspect for:

```text
supabase.from(
supabase.auth.
supabase.storage.
SUPABASE_SERVICE_ROLE_KEY
```

Ensure Form Builder domain logic does not directly depend on those.

Supabase-specific persistence belongs in adapters/infrastructure.

---

# 45. No UI Expansion

Do not build:

```text
drag/drop field palette
properties panel
Header configuration UI
Add Tab modal
Details/Grid configuration screen
Notes configuration screen
Documents configuration screen
Rules UI
Workflow UI
List View UI
runtime form
submission screens
```

Those belong to later phases.

---

# 46. Quality Gates

Before declaring completion, run:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

All must pass.

Do not suppress errors merely to make the checks green.

If real Supabase integration tests cannot run due missing environment/access, state exactly what remains unverified.

---

# 47. Git / Commit Expectations

Use focused commits.

Suggested:

```text
feat(form-engine): implement form schema v1
feat(form-engine): add draft and publish validation
feat(db): add forms and form_versions persistence
feat(form-builder): add repository and version lifecycle
test(form-builder): add schema lifecycle and tenant coverage
```

Adapt if the repository uses another convention.

Do not squash unrelated prior work.

---

# 48. Completion Report

When Phase 1 is finished, STOP.

Provide:

## Branch / Git

```text
branch
commit(s)
git status
```

## Files Changed

List important created/updated files.

## Form Schema

Describe:

```text
top-level structure
field types
tab types
rules
calculations
workflow
List View
permissions
settings
```

## Validators

Describe:

```text
validateDraftSchema()
validatePublishableSchema()
error/warning structure
```

## Database

Show actual:

```text
forms
form_versions
```

including:

```text
fields
constraints
foreign keys
indexes
```

## RLS

List actual policies and intended access.

## Repository Architecture

Show:

```text
FormRepository
SupabaseFormRepository
application/service layer
```

Confirm `packages/form-engine` remains Supabase-independent.

## Lifecycle

Confirm:

```text
Draft V1
Published V1
Draft V2
Published V2
Published immutability
```

## Tests

Report separately:

```text
unit
lifecycle
tenant-security
RLS/database integration
```

Do not overclaim mocked tests.

## Quality Gates

Report actual results for:

```text
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

## Known Limitations

Be explicit.

## Deferred

Confirm these remain unimplemented:

```text
Renderer
Builder UI
Rules runtime engine
Workflow runtime
Submissions
Visitor App
Templates
AI
Offline
```

Then STOP.

Do not begin Phase 2.

---

# 49. Definition of Done

Phase 1 is complete only if:

- repo audited first
- approved docs were read
- schema matches approved MVP
- strong TS types exist
- schema is JSON serializable
- Draft validation exists
- Publish validation exists
- FormRepository abstraction exists
- SupabaseFormRepository exists
- forms persistence exists
- form_versions persistence exists
- migration exists
- RLS exists
- tenant isolation is covered
- Published versions are immutable
- Draft can be created from Published
- fixtures exist
- tests pass
- lint passes
- typecheck passes
- build passes
- `packages/form-engine` remains Supabase-independent
- no Phase 2 UI/runtime work was started

Then stop and wait for review.

---

# 50. Final Engineering Principle

This Form Builder is a **generic configuration engine inside a wider enterprise operations platform**.

Build the Phase 1 foundation so future platform modules can reuse it without changing core architecture.

Do not optimize for one sample form.

Do not optimize for Visitor App only.

Do not optimize for Purchase Requisition only.

The architecture must support many future business processes through configuration.
