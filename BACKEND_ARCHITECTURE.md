# BACKEND_ARCHITECTURE.md
# Field Workforce & Operations Management Platform

## Purpose

This document is the authoritative backend architecture reference for the **entire Field Workforce & Operations Management Platform**.

The platform is a modular, multi-tenant SaaS. The **Form Builder / Form Engine is one reusable platform module**. It does not own Customers, Jobs, Assets, Timesheets, Expenses, HSE, Contracts, or the rest of the product.

---

## 1. Architecture Summary

```text
Browser / PWA
    ↓
Next.js Route / Server Action
    ↓
Application Service
    ↓
Authorization Policy
    ↓
Domain Logic
    ↓
Repository Interface
    ↓
Supabase Adapter
    ↓
PostgreSQL / Auth / Storage
    ↓
RLS
```

The current MVP infrastructure is:

```text
Next.js / React / TypeScript
        ↓
Application Services
        ↓
Repository / Infrastructure Interfaces
        ↓
Supabase Adapters
        ↓
Supabase Cloud
├── PostgreSQL
├── Auth
├── Storage
└── RLS
```

### Core architectural decisions

- Use a **modular monolith first**.
- PostgreSQL is the source of truth.
- Supabase is current, replaceable infrastructure.
- Every tenant-owned record carries `organization_id`.
- RLS protects tenant boundaries; application authorization protects action-level permissions.
- Shared platform capabilities are implemented once and reused.
- Purpose-built relational business data stays relational.
- Dynamic form schemas and response payloads may use JSONB where appropriate.
- Published form versions, approval decisions, audit events and similar history are treated as immutable historical records.
- No hardcoded Visitor, Purchase Requisition, HSE or other business process inside the Form Engine.
- Avoid premature microservices, Kubernetes, message brokers and event-streaming infrastructure.

---

## 2. Platform Module Map

### Platform Core

#### Identity & Access
Owns:
- authentication boundary
- current user/session
- platform role checks
- tenant membership resolution

#### Organisation Management
Owns:
- organisations
- organisation memberships
- organisation settings
- departments/teams when introduced

#### Files
Owns:
- storage abstraction
- upload/download/delete/signed URL operations
- file metadata
- tenant-aware object keys

#### Audit
Owns:
- append-only platform audit events
- actor, tenant, action, entity, timestamp and metadata

#### Notifications
Owns:
- in-app notifications
- email initially
- SMS/web-push adapters later
- delivery state
- template/event mapping

#### Workflow / Approvals
Owns:
- reusable approval definitions where appropriate
- approval instances
- approval stages
- decisions
- approval history

#### Form Engine
Owns:
- forms
- form versions
- schema validation
- renderer contract
- configurable fields/tabs/rules/list view
- form submissions
- form detail rows
- form notes/documents integration
- configurable approval references

The Form Engine does **not** own the entire product.

### Business Modules

#### Customers
Owns business/customer organisations receiving field services.

#### Sites
Owns customer locations, operating sites and site-specific metadata.

#### Jobs / Work Orders
Owns service work requested, scheduled, executed and closed.

#### Scheduling / Dispatch
Owns assignments, planned dates/times, worker allocation and schedule views.

#### Workforce
Owns employee/contractor profiles and operational availability beyond authentication identity.

#### Timesheets
Owns time entries, approvals and job-linked labour data.

#### Expenses
Owns expense requisitions/claims, supporting evidence and approval state.

#### Assets
Owns equipment/assets and operational lifecycle.

#### Preventive Maintenance
Owns maintenance plans, schedules, maintenance work generation and maintenance history.

#### HSE / Compliance
Owns incidents, inspections, safety records and compliance artifacts.

#### Contracts / SLA
Owns commercial/service agreements, dates, terms and SLA references.

#### Reporting
Reads module data through reporting services/views. It does not own source-of-truth business records.

#### Customer Portal
Provides restricted external views/actions over Customers, Sites, Jobs, documents and approved forms.

#### Visitor Management
A later business module used to validate that the generic Form Engine can configure a real process without visitor-specific Form Engine code.

---

## 3. Domain Boundaries

### Platform Core Domain

```text
Identity
Organisation
Membership
Permission
File
Audit
Notification
```

### Operations Domain

```text
Customer
Site
Job
WorkOrder
Assignment
Schedule
WorkEvidence
```

### Workforce Domain

```text
WorkerProfile
Availability
Timesheet
TimeEntry
```

### Asset Domain

```text
Asset
AssetAssignment
MaintenancePlan
MaintenanceSchedule
MaintenanceEvent
```

### Finance / Expense Domain

```text
ExpenseRequest
ExpenseClaim
ExpenseLine
ExpenseAttachment
ApprovalReference
```

### HSE Domain

```text
Incident
Inspection
CorrectiveAction
ComplianceRecord
```

### Contract Domain

```text
Contract
ServiceAgreement
SLA
ContractDocument
```

### Form Engine Domain

```text
Form
FormVersion
FormSchema
FormSubmission
SubmissionDetailRow
FormNote
FormDocumentReference
```

### Approval Domain

```text
WorkflowDefinition
ApprovalInstance
ApprovalStageInstance
ApprovalDecision
```

### Boundary rule

A business module may attach a form to one of its records, but the business module remains authoritative for its own lifecycle.

Example:

```text
Job
├── job fields/status/assignment owned by Jobs module
└── linked Form Submission
    └── configurable checklist/evidence owned by Form Engine
```

Do not move every Job, Asset, HSE or Expense field into generic `schema_jsonb` merely because the Form Engine exists.

---

## 4. Core Operational Workflow

```text
Customer
  ↓
Site
  ↓
Job / Work Order
  ↓
Assignment / Schedule
  ↓
Worker Execution
  ├── Form/checklist submission
  ├── Time entries
  ├── Expenses
  ├── Asset usage
  └── Photos/documents
  ↓
Customer/manager sign-off
  ↓
Approval
  ↓
Close
  ↓
Reporting / future invoicing integration
```

The Form Engine participates in the workflow where configurable data capture is useful, but it does not replace the owning domain.

Examples:

```text
Job → Service Report
Asset → Inspection
HSE → Checklist
Expense → Configurable request fields
Visitor Management → Visitor registration
```

---

## 5. Database Module Map

This is the proposed logical database map. Exact columns are finalized module-by-module before implementation.

### Platform Core

```text
auth.users

public.profiles
public.organizations
public.organization_memberships
public.organization_settings      -- later
public.departments                -- later
public.teams                      -- later
public.files
public.audit_logs
public.notifications
```

### Customers / Sites

```text
public.customers
public.customer_contacts
public.sites
public.site_contacts
```

Relationship:

```text
organization
  └── customers
       └── sites
```

### Jobs / Work Orders

```text
public.jobs
public.job_assignments
public.job_status_history
public.job_documents
public.job_form_links
```

Conceptually:

```text
customer
  └── site
       └── job
            ├── assignments
            ├── documents
            ├── form links
            ├── time entries
            └── expenses
```

### Scheduling

```text
public.schedule_entries
public.worker_availability
```

Scheduling references Jobs and Workers. It is not the source of truth for a Job.

### Workforce

```text
public.worker_profiles
public.worker_skills              -- later
public.worker_certifications      -- later
```

`worker_profiles.user_id` may reference `auth.users` when a worker has platform access.

### Timesheets

```text
public.timesheets
public.time_entries
```

A time entry may reference:
- job
- worker
- date/time
- duration
- approval state

### Expenses

```text
public.expense_claims
public.expense_lines
public.expense_documents
```

### Assets

```text
public.assets
public.asset_assignments
public.asset_documents
public.asset_status_history
```

### Preventive Maintenance

```text
public.maintenance_plans
public.maintenance_schedule_items
public.maintenance_events
```

A maintenance event may generate/link a Job instead of duplicating the Job execution model.

### HSE / Compliance

```text
public.hse_incidents
public.hse_inspections
public.corrective_actions
public.compliance_records
```

Configurable HSE forms may use the Form Engine, but critical searchable lifecycle fields remain relational where required.

### Contracts / SLA

```text
public.contracts
public.contract_documents
public.sla_definitions
```

### Form Engine

Already started:

```text
public.forms
public.form_versions
```

Later:

```text
public.form_submissions
public.submission_detail_rows
public.form_notes
public.form_file_links
public.data_sources
public.data_source_fields
public.data_source_items
```

### Approvals

Later:

```text
public.approval_workflows
public.approval_workflow_stages
public.approval_instances
public.approval_stage_instances
public.approval_decisions
```

### Reporting

Prefer:
- repository/service queries
- SQL views
- dashboard aggregations
- materialized views only when performance later justifies them

Do not create a second source-of-truth reporting database during MVP.

### Cross-cutting database rules

Every tenant-owned table should have:
- `id uuid`
- `organization_id uuid not null`
- relevant foreign keys
- timestamps
- indexes on tenant + common query keys
- RLS enabled
- tenant consistency protected at database level where relationships cross tenant-owned tables

Prefer composite tenant-aware foreign keys for sensitive cross-tenant relationships where practical.

---

## 6. Multi-Tenancy & Authorization

### Tenant model

```text
Organization
  └── Memberships
       └── User
```

A user may belong to multiple organizations.

### Initial role baseline

```text
super_admin
business_admin
manager
employee
```

More granular permissions may be added without changing the tenant model.

### Authorization flow

```text
1. Resolve authenticated user from Supabase session
2. Resolve requested/active organization
3. Verify active membership
4. Verify role/permission for requested operation
5. Execute tenant-scoped repository operation
6. PostgreSQL RLS applies final tenant boundary
```

### Never trust from client input

Do not trust:
- user ID
- role
- tenant membership
- permission flags
- unrestricted organization ID

The client may select an active organization, but server/database must verify membership.

### RLS pattern

Every tenant-owned table should be protected through policies based on active organisation membership.

Conceptually:

```sql
organization_id IN (
  SELECT organization_id
  FROM organization_memberships
  WHERE user_id = auth.uid()
    AND status = 'active'
)
```

Use the existing audited helper function when one is already established.

### Authorization split

RLS handles tenant isolation.

Application/server authorization handles action-level permissions, for example:

```text
employee:
- view assigned jobs
- submit timesheet
- submit expense

manager:
- schedule workers
- approve timesheets/expenses
- manage jobs

business_admin:
- manage organisation configuration
- manage Forms
- manage users
```

Do not encode every product permission only in RLS.

### Super Admin

Platform super-admin capabilities use explicit server-only privileged pathways.

Ordinary browser operations must not use service-role credentials as the default path.

---

## 7. API, Service & Repository Conventions

### Layering

```text
Route / Server Action
      ↓
Application Service
      ↓
Authorization
      ↓
Repository Interface
      ↓
Supabase Repository
      ↓
PostgreSQL
```

### Route / Server Action responsibilities

Should:
- parse request
- validate transport input
- resolve authenticated context
- call application service
- map known errors to response

Should not:
- contain business workflows
- run scattered SQL-like Supabase queries
- make permission decisions using client flags

### Application Service responsibilities

Should:
- enforce use-case rules
- coordinate repositories
- call validation/domain policies
- execute lifecycle transitions
- initiate audit/event hooks

Examples:

```text
JobService.createJob()
JobService.assignWorker()
TimesheetService.submit()
ExpenseService.approve()
FormService.publish()
```

### Repository responsibilities

Repositories handle persistence, not business orchestration.

Examples:

```text
JobRepository
CustomerRepository
AssetRepository
FormRepository
```

Supabase-specific implementations:

```text
SupabaseJobRepository
SupabaseCustomerRepository
SupabaseAssetRepository
SupabaseFormRepository
```

### Domain package independence

Core reusable logic should not import:
- Supabase SDK
- Next.js request objects
- React

### Error model

Use typed application errors such as:

```text
NotAuthenticated
PermissionDenied
TenantAccessDenied
NotFound
Conflict
ValidationFailed
InvalidStateTransition
```

Do not expose raw database errors directly to end users.

### Transactions

Any use case that changes multiple related records atomically should run inside a database transaction/RPC or another single transaction boundary.

---

## 8. Storage & Documents

### Storage boundary

Application modules depend on:

```text
StorageService
```

Current implementation:

```text
SupabaseStorageService
```

Future possible adapters:

```text
S3StorageService
R2StorageService
MinIOStorageService
```

### Provider-neutral storage key

```text
{organization_id}/{module}/{entity_id}/{uuid}-{sanitized_filename}
```

Examples:

```text
org-123/jobs/job-456/uuid-service-photo.jpg
org-123/forms/submission-789/uuid-document.pdf
org-123/assets/asset-100/uuid-manual.pdf
```

### File metadata

Store metadata in PostgreSQL, not permanent public URLs.

Common metadata:

```text
id
organization_id
storage_key
file_name
mime_type
size_bytes
checksum         -- optional later
created_by
created_at
```

Module-specific link tables may reference `files.id`.

### Privacy

Operational documents are private by default unless the product explicitly requires public access.

Use signed URLs or authenticated streaming for access.

### Shared service rule

Do not create separate storage engines for:
- Form Builder
- Jobs
- HSE
- Assets
- Expenses

They share the same storage service and metadata strategy.

### Deletion

Do not automatically hard-delete files merely because a UI reference is removed.

Module lifecycle/retention rules determine physical deletion.

---

## 9. Workflow, Events & Approvals

### MVP approval model

The MVP approval engine is simple and sequential:

```text
Submitted
   ↓
Stage 1
   ↓
Stage 2
   ↓
Approved
```

Actions:

```text
Approve
Reject
Return
```

The approval subsystem should eventually be reusable by:
- Form submissions
- Expense claims
- Timesheets
- HSE corrective actions
- procurement-style requests
- other modules

Do not create a different approval table set for every module.

### Proposed approval tables

```text
approval_workflows
approval_workflow_stages
approval_instances
approval_stage_instances
approval_decisions
```

An approval instance references a controlled target type and ID:

```text
target_type
target_id
```

Avoid an ungoverned generic polymorphic model.

### Domain events

For MVP, domain events may remain internal application events rather than Kafka or another broker.

Examples:

```text
job.created
job.assigned
job.completed

form.submitted
form.approved

timesheet.submitted
timesheet.approved

expense.submitted
expense.approved

asset.maintenance_due
```

Consumers may trigger:
- notifications
- audit entries
- later background jobs

### Avoid premature infrastructure

Do not introduce:
- Kafka
- RabbitMQ
- event sourcing
- distributed sagas

until scale/use cases require them.

### Transactional consistency

Critical state transitions should be atomic.

Examples:
- publish form version
- approve current stage and activate next stage
- close work order and write completion state

Use PostgreSQL transactions/RPCs when several database changes must succeed together.

---

## 10. Audit, Notifications & Reporting

### Audit

Use a shared append-only `audit_logs` capability.

Suggested fields:

```text
id
organization_id
actor_user_id
action
entity_type
entity_id
metadata_jsonb
created_at
```

Examples:

```text
form.published
job.assigned
job.completed
expense.approved
timesheet.returned
user.role_changed
```

Audit logs are not editable business notes.

### Notifications

Use a shared notification service.

Initial channels:
- in-app
- email

Later:
- SMS
- web push
- WhatsApp only if explicitly selected as a platform integration

Suggested model:

```text
notifications
notification_deliveries
```

Business modules emit meaningful events; the notification service handles delivery.

### Reporting

Reporting reads authoritative module data.

Initial approach:
- repository/service queries
- SQL views
- dashboard aggregations

Later if needed:
- materialized views
- warehouse/BI integration

Do not store duplicated reporting totals as another source of truth unless justified.

Example operational metrics:
- open jobs
- jobs due today
- overdue maintenance
- pending approvals
- unapproved timesheets
- expense totals

Every metric must have an explicit source query and tenant scope.

---

## 11. Cross-Module Contracts

### Customers ↔ Sites

```text
Customer owns many Sites
Site belongs to Customer
```

### Sites ↔ Jobs

A Job may reference Customer + Site.

Site remains authoritative for site identity/address metadata.

### Jobs ↔ Scheduling

Scheduling references Jobs and Workers.

Scheduling does not duplicate Job data.

### Jobs ↔ Form Engine

A Job may link one or more configured forms:

```text
job_form_links
- job_id
- form_id / form_version_id
- purpose
- required
```

Actual answers live in Form Submissions.

### Jobs ↔ Timesheets

Time entries reference Job and Worker.

### Jobs ↔ Expenses

Expense lines/claims may reference Job where relevant.

### Assets ↔ Jobs

A Job may reference an Asset.

Maintenance may create a Job.

### Assets ↔ Form Engine

Inspections/checklists may use Form Submissions tied to an Asset.

### HSE ↔ Form Engine

Configurable inspection/incident detail may use forms, but critical HSE lifecycle fields remain in HSE domain tables.

### Workflow ↔ Modules

Modules request approval through the shared approval service.

Approval records should retain:
- target module/type
- target ID
- workflow version/config snapshot where required
- decision history

### Files ↔ Modules

Modules reference common file metadata, not storage-provider URLs.

### Customer Portal ↔ Modules

Portal access exposes controlled read/write use cases through existing services.

It must not bypass service/authorization layers.

---

## 12. Deployment, Scaling & Portability

### Current MVP shape

```text
Vercel / Next.js
      ↓
Supabase Cloud
├── PostgreSQL
├── Auth
├── Storage
└── RLS
```

### Portability layer

Core modules depend on:
- repository interfaces
- Auth boundary
- `StorageService`

Supabase-specific code stays in adapters.

### Growth path

#### Stage 1 — MVP

Managed Supabase + Next.js.

#### Stage 2 — Early Production

Add as needed:
- stronger monitoring
- backups/restore drills
- rate limiting
- background jobs
- database performance review
- connection pooling

#### Stage 3 — Scale

Possible:
- self-hosted Supabase
- managed PostgreSQL + replacement Auth/Storage
- Redis for caching/queues
- worker processes
- object-storage migration

### What should not change

Business modules and Form Engine should not need rewriting merely because the infrastructure provider changes.

### Avoid early complexity

Do not introduce:
- microservices
- Kubernetes
- distributed databases
- event-streaming platform
- read replicas

until usage/performance requires them.

### Portability risks to track

Intentional Supabase-specific coupling:
- `auth.uid()` in RLS
- Supabase session/cookie handling
- Supabase Storage bucket policies
- generated Supabase DB types

These are infrastructure concerns and should remain isolated/documented.

---

## 13. Architecture Decisions

### ADR-001 — Modular Monolith First
Use one deployable application with explicit module boundaries during MVP.

Reason:
- simpler operations
- faster development
- easier transactions
- enough scale for early product validation

### ADR-002 — PostgreSQL as Source of Truth
All core business data is stored in PostgreSQL.

### ADR-003 — Supabase as Replaceable Infrastructure
Use Supabase for speed and open-source portability. Keep domain logic outside direct SDK coupling.

### ADR-004 — Multi-Tenant by Organisation
All tenant-owned records include `organization_id`.

### ADR-005 — RLS + Application Authorization
RLS protects tenant boundaries; application policies protect action-level permissions.

### ADR-006 — Form Builder Is a Shared Module
The Form Builder/Engine is reusable by modules but does not own unrelated business domains.

### ADR-007 — Relational Domain Data + JSONB Form Answers
Purpose-built business records stay relational. Dynamic form definitions/answers use schema + JSONB where appropriate.

### ADR-008 — Shared File Service
All modules use the same storage abstraction.

### ADR-009 — Shared Approval Service
Approval workflow should be reusable across forms, timesheets, expenses and other modules.

### ADR-010 — Domain Events Without Message Broker Initially
Use internal events/application hooks during MVP. Introduce queues/brokers only when required.

### ADR-011 — Immutable Historical Records
Published form versions, approval decisions and other historical records must not be mutated casually.

### ADR-012 — No Hardcoded Business Process in Form Engine
Visitor, Purchase Requisition, HSE and other examples remain configuration/use-case examples, not core engine conditionals.

---

## 14. Module Definition Requirement

Before a new module is considered production-ready, define:

1. domain owner
2. tables
3. lifecycle/status model
4. service interface
5. repository interface
6. RLS
7. cross-module contracts
8. audit events
9. tests
10. migration

This keeps module ownership explicit and prevents the Form Engine from becoming a catch-all backend.
