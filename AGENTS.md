# AGENTS.md — Form Builder MVP Engineering Instructions

## Purpose

This file gives Codex and any coding agent the rules that must be followed when implementing the Form Builder MVP.

Treat the documentation under `docs/form-builder/` as the product and engineering source of truth.

---

## Required reading before implementation

Before editing code, read:

1. `FORM_BUILDER_MASTER_SPEC.md`
2. `docs/form-builder/00-MVP-SCOPE.md`
3. `docs/form-builder/01-UI-UX-SPEC.md`
4. `docs/form-builder/02-FORM-SCHEMA-SPEC.md`
5. `docs/form-builder/03-DATA-MODEL.md`
6. `docs/form-builder/04-API-SERVICE-CONTRACTS.md`
7. `docs/form-builder/05-AUTH-TENANCY-PERMISSIONS.md`
8. `docs/form-builder/06-IMPLEMENTATION-PLAN.md`
9. `docs/form-builder/07-TESTING-ACCEPTANCE.md`
10. `docs/form-builder/08-DECISIONS-LOG.md`

If repository reality conflicts with these documents, stop and report the conflict before making a destructive or architectural change.

---

## Core product rules

1. This is a custom Form Builder. Do not integrate Form.io.
2. Do not clone Form.io code or make Form.io a runtime dependency.
3. Forms are schema/configuration, not custom-coded pages.
4. Builder, renderer, submissions, approvals, files, notes, and data sources are separate concerns.
5. Published form versions are immutable.
6. Old submissions remain tied to the exact form version used when they were created.
7. Tenant isolation is mandatory at the server/data layer.
8. Do not rely on frontend filtering for organization isolation.
9. Do not trust `organizationId` from the client without membership validation.
10. Do not hardcode Purchase Requisition, Visitor, Expense, HSE, or other business-specific behavior into the core engine.

---

## Approved MVP exclusions

Do not implement these unless the product owner explicitly adds them:

- templates/template gallery
- AI form generation/chatbot
- offline sync
- payments
- QR/public-form enhancements beyond what already exists in the repository
- parallel approval
- advanced workflow designer
- delegation/escalation engine
- native mobile app
- template marketplace
- arbitrary customer JavaScript
- 30+ field types
- advanced analytics/reporting
- full PDF designer

---

## Locked builder hierarchy

Top-level Form Builder navigation:

```text
Design | Form Settings | Workflow | Rules | List View | Versions
```

Inside **Design**:

```text
Header
Tabs[]
  - Form / Fields
  - Details / Grid
  - Notes
  - Documents
```

Important:
- Documents and Notes are tab types inside Design.
- Documents and Notes are not top-level builder modules.
- Tabs are unlimited for MVP purposes; do not enforce an arbitrary count.
- Tab name and tab type are independent.

---

## UX constraints

The approved visual direction is:
- Microsoft Dynamics-inspired enterprise UI
- white/light surfaces
- green accent
- dense but readable
- compact business controls
- consistent command bars
- minimal decorative gradients and oversized cards

Do not replace the approved UX direction with a generic marketing-style SaaS dashboard.

---

## Engineering workflow

Before each change:

1. Inspect existing code and conventions.
2. Identify the smallest implementation slice.
3. Update types/contracts first if needed.
4. Implement feature.
5. Add validation.
6. Add authorization and tenant enforcement.
7. Add loading/empty/error handling.
8. Add tests.
9. Run typecheck/build/test.
10. Summarize changed files and any open decisions.

Prefer small reviewable PRs/commits.

---

## Prohibited shortcuts

Do not:
- mutate published schema in place
- store files as database blobs
- overwrite note history
- overwrite approval decision history
- execute arbitrary JS from form configuration
- execute raw SQL from customer configuration
- trust client-calculated financial values without server verification
- create separate React pages for every configured form
- duplicate renderer logic for Preview and Runtime unless unavoidable
- mix form definition data into submission payload storage
- mix workflow configuration with runtime approval state

---

## Multi-tenancy

Every tenant-owned entity must be scoped by `organization_id` or equivalent repository convention.

Cross-tenant access tests are mandatory for:
- forms
- versions
- submissions
- detail rows
- files
- notes
- data sources
- workflows
- approvals
- exports

---

## Definition of done

A feature is only done when:
- it matches approved behavior
- it builds/typechecks
- happy path works
- validation exists
- permission checks exist
- tenant checks exist
- loading/empty/error states exist
- critical tests exist
- no form-specific hardcoding is introduced
- docs are updated if behavior changed

---

## First implementation task

Start with:

> Form Schema v1 + runtime validation + minimum Form/FormVersion persistence.

Do not begin with a large drag-and-drop builder before schema/version foundations are stable.


# ADDITIONAL ARCHITECTURE RULE — PLATFORM MODULE

The Form Builder is a module inside the Field Workforce & Operations Management Platform.

It is NOT a standalone SaaS application.

All implementation decisions must consider the existing platform architecture.

## Shared Platform Integration

The Form Builder must reuse existing platform services where available:

- Authentication
- Users
- Organizations/Tenants
- Roles and Permissions
- Navigation/App Shell
- Audit Logging
- File Storage
- Notifications
- Reporting infrastructure
- Database conventions
- API conventions

Do not create duplicate:
- user tables
- authentication flows
- organization management
- permission systems
- file infrastructure

unless the repository does not already provide an equivalent service.

## Module Relationship

The Form Builder is a reusable engine powering other platform modules.

Examples:

Procurement
→ Purchase Requisition Form

HSE
→ Inspection / Incident Forms

Assets
→ Asset Inspection Forms

Visitor Management
→ Visitor Registration Forms

Expenses
→ Expense Request Forms

Jobs
→ Service Report Forms

The engine must remain generic.

Do not add:

```ts
if (module === "visitor") {}
if (module === "purchase_request") {}
```

inside the Form Builder core.

If a capability is missing, first determine whether it is a generic Form Builder capability.

## Platform Navigation

The module should integrate into the existing platform navigation.

Do not create a separate application shell.

The Form Builder module should follow existing:
- layout
- routing
- branding
- authentication state
- permission checks
