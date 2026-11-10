# IMPLEMENTATION_ROADMAP.md
# Field Workforce & Operations Management Platform

## Purpose

This document defines the platform backend implementation order.

The purpose of the sequence is to keep development modular and prevent the product from becoming Form-Builder-centric.

---

## Phase A — Platform Core

**Status in the source architecture pack:** substantially started.

Build / maintain:

- Auth
- Organisations
- Memberships
- roles baseline
- RLS
- storage abstraction
- audit foundation
- portability boundaries

### Exit criteria

Before broader platform modules depend on Platform Core, the foundation should provide:
- authenticated user/session handling
- organisation membership resolution
- tenant isolation
- reusable storage abstraction
- server-side privileged pathways for true platform-admin operations
- repository/application-service boundaries
- migration-driven database changes

---

## Phase B — Form Engine

**Status in the source architecture pack:** currently in progress.

Build in the approved Form Engine sequence:

- schema/versioning
- renderer
- builder
- data sources
- rules/calculations
- approvals integration
- submissions
- import/export/versioning

### Architecture constraint

The Form Engine is a reusable shared module.

It must not become the data model for Customers, Jobs, Assets, HSE, Expenses or other purpose-built business domains.

### Validation milestone

The Visitor App is a validation exercise for the Form Engine.

Its purpose is to prove that a real operational process can be configured through the generic engine without visitor-specific core Form Engine code.

It does not replace Jobs, Customers, Assets or other platform modules.

---

## Phase C — Customer & Site Foundation

Build:

- customers
- customer contacts
- sites
- site contacts
- tenant security
- list/detail UX

### Key relationship

```text
organization
  └── customers
       └── sites
```

Sites remain authoritative for site identity/address metadata.

---

## Phase D — Jobs / Work Orders

Build:

- jobs
- status lifecycle
- job assignments
- documents
- form links
- job history

### Integration points

```text
Customer
  ↓
Site
  ↓
Job
  ├── Assignments
  ├── Documents
  ├── Form links
  ├── Time entries
  └── Expenses
```

A Job may link configured Form Engine forms through `job_form_links`, but the Job module owns the Job lifecycle.

---

## Phase E — Scheduling / Workforce

Build:

- worker profiles
- scheduling
- assignment calendar/dispatch
- availability

### Architecture constraint

Scheduling references Jobs and Workers.

It must not duplicate Job source-of-truth data.

---

## Phase F — Timesheets & Expenses

Build:

- timesheets/time entries
- expense claims/lines
- approvals
- documents

### Integration points

- Time entries may reference Job and Worker.
- Expense claims/lines may reference Job.
- Approval uses the shared approval capability.
- Documents use the shared storage/file metadata capability.

---

## Phase G — Assets & Maintenance

Build:

- assets
- asset assignment/history
- maintenance plans
- maintenance schedule
- maintenance jobs/events

### Architecture constraint

A maintenance event may create/link a Job rather than duplicating the Job execution model.

Inspections/checklists may use Form Submissions tied to an Asset.

---

## Phase H — HSE / Compliance

Build:

- incidents
- inspections
- corrective actions
- form-engine integration

### Architecture constraint

Configurable forms may capture inspection/incident details, but critical searchable HSE lifecycle fields remain in HSE domain tables.

---

## Phase I — Contracts / Customer Portal / Reporting

Build incrementally after core operational flows are stable.

Includes:

- contracts
- contract documents
- SLA definitions
- controlled Customer Portal access
- reporting services/views/dashboard aggregations

### Reporting rule

Reporting reads authoritative module data.

Do not introduce a second source-of-truth reporting database during MVP.

---

## Cross-Phase Engineering Gate

For every new platform module, define before treating its UI as production-ready:

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

---

## Infrastructure Growth Path

### Stage 1 — MVP

- Next.js
- Managed Supabase
- PostgreSQL
- Supabase Auth
- Supabase Storage
- RLS

### Stage 2 — Early Production

Add when required:
- stronger monitoring
- backups/restore drills
- rate limiting
- background jobs
- database performance review
- connection pooling

### Stage 3 — Scale

Possible later:
- self-hosted Supabase
- managed PostgreSQL + replacement Auth/Storage
- Redis for caching/queues
- worker processes
- object-storage migration

Do not introduce microservices, Kubernetes, distributed databases, read replicas or an event-streaming platform until actual usage/performance requires them.
