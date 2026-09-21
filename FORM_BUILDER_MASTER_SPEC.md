# Form Builder MVP — Master Specification

**Status:** Approved baseline  
**Purpose:** High-level source of truth joining product, UX, architecture, and implementation constraints.

---

## 1. Product objective

Build a custom no-code Form Builder inside the Field Workforce & Operations Management Platform.

A Business Admin must be able to create a professional operational form from scratch without a developer creating a new application page for that form.

The engine must be generic enough to later power multiple platform modules.

---

## 2. MVP proof

After the core MVP is complete, the team will build the Visitor App using the Form Builder itself.

The MVP is considered successful when the Visitor App can be configured through:
- header configuration
- fields
- tabs
- details grids
- notes
- documents
- lookups
- rules
- approval workflow
- list view
- publishing
- runtime submissions

without adding Visitor-specific logic to the form engine.

---

## 3. Core architecture

```text
Visual Builder
      ↓
Form Schema / Configuration
      ↓
Renderer
      ↓
Published Form
      ↓
Submission
      ↓
List View / Record View
      ↓
Approval Runtime
```

The form definition is not a React page.

---

## 4. Locked form structure

```text
FORM
├── Metadata
├── Header
│   ├── Sections
│   └── Fields
├── Tabs[]
│   ├── Form / Fields
│   ├── Details / Grid
│   ├── Notes
│   └── Documents
├── Rules
├── Workflow
├── List View
├── Permissions
├── Settings
└── Version
```

Tabs are configurable and not artificially restricted to one per type.

---

## 5. MVP capabilities

The MVP includes:
- Form Library
- Create blank form
- Main Form Builder
- configurable Header
- unlimited configurable Tabs
- core field registry
- Details/Grid
- Notes
- Documents
- Data Sources / Lookups
- Rules / Conditions
- controlled Calculations
- sequential Approval Workflow
- configurable List View
- Draft / Preview / Publish
- immutable published Versions
- Runtime Form
- Submission List
- Record View
- Approver Review
- Import/Export form definition
- CSV submission export
- multi-tenant isolation
- publish validation

---

## 6. MVP exclusions

Later:
- templates
- AI
- offline
- payments
- advanced workflow
- parallel approval
- native app
- advanced analytics
- marketplace

---

## 7. Builder navigation

```text
Design | Form Settings | Workflow | Rules | List View | Versions
```

Inside Design:
- Header
- Tabs

Documents and Notes are not top-level navigation items.

---

## 8. Schema ownership

The platform owns:
- form schema
- renderer
- builder
- submissions
- data sources
- rules engine
- calculation engine
- approval engine
- files
- notes
- versioning
- import/export

Form.io is not a dependency.

---

## 9. Storage approach

Recommended:
- PostgreSQL for relational entities
- JSONB for dynamic form schema and submission data
- object storage for binary files
- relational tables for approval runtime, notes, file metadata, detail-row identity, tenancy, users

---

## 10. Security baseline

Mandatory:
- authenticated protected operations
- server-side tenant validation
- RBAC
- server-side submission validation
- file type/size validation
- permission checks on file download/delete
- publish validation
- no arbitrary customer JavaScript
- no raw SQL from customer configuration
- important calculations recomputed/validated on server

---

## 11. Versioning

Published versions are immutable.

```text
Draft V1 → Published V1
                ↓ edit
             Draft V2 → Published V2
```

Submission always references exact `form_version_id`.

---

## 12. Workflow

MVP supports sequential approval.

Actions:
- Approve
- Reject
- Return

Runtime decisions are append-only history.

---

## 13. Final acceptance

The Visitor App must be built as configuration using the engine.

If the implementation requires:

```ts
if (formType === "visitor") {
  // special core engine behavior
}
```

the team must first determine whether a missing generic capability should be added instead.


# PLATFORM MODULE CONTEXT

## Form Builder Position

The Form Builder is a core module of the Field Workforce & Operations Management Platform.

It exists as a reusable configuration engine that enables other modules to create business processes without custom development.

Architecture relationship:

```text
Field Workforce & Operations Management Platform

├── Users & Organizations
├── Roles & Permissions
├── Jobs
├── Assets
├── HSE
├── Procurement
├── Expenses
├── Visitor Management
├── Reporting
└── Form Builder Engine
        |
        ├── Purchase Requisition
        ├── Visitor Registration
        ├── Inspection Forms
        ├── Service Reports
        └── Custom Business Forms
```

## Integration Requirement

The Form Builder must consume shared platform capabilities.

The module should not introduce an independent:
- authentication system
- tenant model
- user directory
- permission framework
- storage system
- application shell

The Form Builder owns:
- form schema
- builder experience
- renderer
- submission lifecycle
- configurable workflow definitions
- rules
- calculations

The wider platform owns:
- identity
- organizations
- users
- global permissions
- platform navigation
- shared infrastructure.

## Architectural Principle

The Form Builder should behave like Microsoft Dynamics-style configurable business applications:

A business capability is created through configuration rather than a developer building a separate application screen.

The long-term goal is:

```text
New business process
        ↓
Configure Form Builder
        ↓
Publish module experience
        ↓
Users execute workflow
```
