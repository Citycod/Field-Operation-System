# 06 — Form Builder MVP Implementation Plan

**Status:** Approved sequence  
**Purpose:** Define build order, milestones, Codex-sized work units, and review gates.

---

## 1. Strategy

Build the engine vertically and incrementally.

Do not build the full UI first.

Core dependency order:

```text
Schema
→ Persistence
→ Renderer
→ Builder
→ Data Sources
→ Rules/Calculations
→ Workflow
→ Submissions
→ Versioning/Import/Export/Publishing
→ Hardening
→ Visitor App validation
```

---

# Phase 0 — Repository assessment

Before implementation:
- inspect framework/version
- inspect auth
- inspect DB/ORM
- inspect route conventions
- inspect styling/design system
- inspect test tooling
- inspect tenancy support
- inspect object storage support

Deliverable:
`IMPLEMENTATION_NOTES.md` or a concise report listing:
- what exists
- what can be reused
- any conflicts with docs

Do not migrate stack without approval.

---

# Phase 1 — Schema & persistence foundation

Build:
- FormSchemaV1 TS types
- runtime validator
- field/tab discriminated unions
- rule/calculation/workflow types
- forms table/model
- form_versions
- draft/published lifecycle
- tenant constraints
- schema fixtures
- unit tests

Acceptance:
- valid schema saves/loads
- invalid schema rejected
- published version immutable
- tenant isolation tests pass

---

# Phase 2 — Renderer

Build:
- renderer shell
- Header renderer
- section layout
- field registry
- base field components
- Form tab renderer
- Details/Grid renderer
- Notes runtime renderer
- Documents runtime renderer
- client validation
- responsive runtime layout

Acceptance:
Given schema fixture, a working form renders with no hardcoded business page.

---

# Phase 3 — Builder

Build:
- Form Library
- Create blank form
- builder shell
- fixed navigation
- field palette
- canvas
- properties panel
- Header configuration
- Add Tab
- Form/Fields tab editor
- Details/Grid tab editor
- Notes tab editor
- Documents tab editor
- drag/reorder
- Save Draft
- Preview

Acceptance:
Business Admin can build a meaningful schema visually.

---

# Phase 4 — Data Sources / Lookups

Build:
- data source tables/services
- source management UI
- source fields/items
- lookup query
- Lookup field configuration
- runtime Lookup renderer
- server validation

Acceptance:
A configured form can reference reusable business data.

---

# Phase 5 — Rules & Calculations

Build:
- rules editor
- operators
- actions
- rule evaluator
- calculated field evaluator
- details-grid calculations
- aggregate sum
- server-side verification for critical values

Acceptance:
Rules behave same in Preview and Runtime.
Currency totals are safe.

---

# Phase 6 — Workflow / Approval

Build:
- workflow configuration UI
- stage editor
- approver resolution
- runtime approval tables
- workflow start on submit
- approve
- reject
- return
- task list/query
- history
- Approver Review View

Acceptance:
Sequential workflow completes end-to-end.

---

# Phase 7 — Submissions

Build:
- create submission
- save draft
- runtime form binding
- detail row CRUD
- file upload
- notes
- server submit validation
- Submission List
- Record View
- status transitions

Acceptance:
Published form produces durable business records.

---

# Phase 8 — Versions / Import / Export / Publish

Build:
- Versions UI
- new Draft from Published
- Import
- Export definition
- CSV export
- publish validation
- publish confirmation
- change notes

Acceptance:
Version history remains correct and old submissions still render with original version.

---

# Phase 9 — Hardening

Build/test:
- audit logs
- cross-tenant denial
- file security
- approval race/idempotency
- export security
- large-form basic performance
- error/empty/loading states
- accessibility basics
- E2E regression suite

---

# Phase 10 — Visitor App validation

Use builder only.

Build Visitor App through:
- header
- fields
- tabs
- details if required
- documents
- notes
- lookups
- rules
- approvals
- list view

If engine code change is requested:
1. identify missing behavior
2. decide whether generic
3. if generic, add capability
4. if visitor-only, keep outside generic engine

---

## Suggested PR sequence

```text
PR01 schema types + validator
PR02 DB foundation + tenancy
PR03 version lifecycle
PR04 field registry + renderer shell
PR05 header + form-tab renderer
PR06 details-grid renderer
PR07 notes/documents renderer
PR08 form library + create form
PR09 builder shell + field editor
PR10 header builder
PR11 tabs + tab editors
PR12 data sources/lookups
PR13 rules engine
PR14 calculations
PR15 workflow config
PR16 approval runtime
PR17 submissions + detail rows
PR18 files + notes
PR19 submission list + record view
PR20 versions + import/export
PR21 publish validation
PR22 security/audit hardening
PR23 visitor validation
```

Adjust based on existing repo.

---

## Review gates

After each phase:
- demo working feature
- list deviations
- run tests
- get approval before large dependency changes

Especially review after:
- schema
- renderer
- builder core
- workflow
- end-to-end submission

---

## MVP timeline guidance

Do not treat duration as fixed promise.

A realistic focused build can be organized around roughly 6–8+ weeks depending on existing platform foundation and one-developer capacity.

Quality gates matter more than arbitrary dates.

---

## First Codex task

Implement:
1. schema types
2. runtime validation
3. forms/form_versions persistence
4. draft/published lifecycle
5. fixtures/tests

Do not start drag/drop first.
