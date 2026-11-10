# 08 — Form Builder MVP Decisions Log

This file records important product/architecture decisions so later implementation does not silently reverse approved feedback.

---

## ADR-001 — Build a custom Form Builder

**Status:** Approved

Decision:
Build our own Form Builder engine.

We are not integrating Form.io and not cloning Form.io code.

Form.io was studied only for architectural lessons.

---

## ADR-002 — Schema-driven architecture

**Status:** Approved

Decision:

```text
Builder → Schema → Renderer
```

Do not generate one coded page per business form.

---

## ADR-003 — No templates in first MVP

**Status:** Approved by boss

Decision:
The first MVP starts forms from blank.

Templates/template gallery come later.

Reason:
The builder itself should prove it can create a real business form from scratch.

---

## ADR-004 — Visitor App validates MVP

**Status:** Approved by boss

Decision:
After the Form Builder MVP is complete, build Visitor App through the builder.

Success:
No Visitor-specific engine code required.

---

## ADR-005 — Dynamics-style form structure

**Status:** Approved by boss

Decision:
Use:

```text
Header
+
Configurable horizontal Tab workspace
```

rather than stacking Details/Documents/Notes vertically.

---

## ADR-006 — Unlimited configurable tabs

**Status:** Approved

Decision:
Do not restrict form to one Details tab or one specific business tab set.

Tab title is separate from tab type.

---

## ADR-007 — Supported tab types

**Status:** MVP approved

Types:

- Form / Fields
- Details / Grid
- Notes
- Documents

Additional types require review.

---

## ADR-008 — Documents and Notes are inside Design

**Status:** Approved/corrected

Top builder navigation:

```text
Design | Form Settings | Workflow | Rules | List View | Versions
```

Documents and Notes are not top-level modules.

---

## ADR-009 — No hardcoded document types

**Status:** Approved correction

Decision:
Generic Documents tab does not assume Quotation/Invoice/etc.

Those may come from future templates or configurable metadata.

---

## ADR-010 — UI visual direction

**Status:** Approved by boss

Direction:

- enterprise
- Microsoft Dynamics-inspired
- green/white
- dense but readable
- compact controls
- professional business software

Avoid generic colorful SaaS visual drift.

---

## ADR-011 — PostgreSQL + JSONB model

**Status:** Engineering baseline

Decision:
Use relational tables for stable entities and JSONB for dynamic schema/data.

Binary files go to object storage.

If existing repository has a compatible approved persistence layer, adapt without unnecessary migration.

---

## ADR-012 — Published versions immutable

**Status:** Required

Decision:
Editing a Published version creates a new Draft version.

Historical submissions stay linked to original version.

---

## ADR-013 — Sequential approval only in MVP

**Status:** Approved scope

Actions:

- Approve
- Reject
- Return

Parallel workflows/delegation/escalation later.

---

## ADR-014 — Controlled rules/calculations

**Status:** Required

Decision:
No arbitrary JavaScript.

Use declarative operators/actions and controlled formulas.

---

## ADR-015 — AI deferred

**Status:** Approved scope

AI assistant later.

Not part of first MVP.

---

## ADR-016 — Offline deferred

**Status:** Approved scope

Offline architecture may be considered later.

Not part of first MVP implementation.

---

## ADR-017 — Payments deferred

**Status:** Approved scope

Payments later.

---

## ADR-018 — Multi-tenancy enforced server-side

**Status:** Non-negotiable

Frontend filtering is not security.

Every tenant-owned entity/query/action must verify organization context.

---

## ADR-019 — Detail rows have stable identity

**Status:** Engineering decision

Reason:
Needed for:

- row attachments
- audit
- edits
- future reporting/offline

Do not treat them as anonymous UI arrays only.

---

## ADR-020 — Notes are append-only in MVP

**Status:** Approved direction

Notes preserve history with:

- author
- timestamp
- visibility
- optional approval-stage link

---

## ADR-021 — Object storage for files

**Status:** Engineering baseline

Binary file outside DB.
Metadata in DB.

---

## ADR-022 — Renderer before full builder

**Status:** Approved implementation strategy

Build schema + renderer first.

Reason:
The builder must author a stable runtime contract, not define ad hoc UI behavior.

---

## ADR-023 — Approved implementation sequence

**Status:** Approved by boss

```text
Core architecture/schema
→ Renderer
→ Builder
→ Data Sources
→ Rules/Calculations
→ Workflow/Approval
→ Submissions
→ Versioning/Import/Export/Publishing
→ Testing/Hardening
→ Visitor App validation
```

---

## ADR-024 — Supabase Portability & Infrastructure Decoupling

**Status:** Approved Architectural Decision  
**Date:** 2026-09-25

Decision:

1. Use Supabase (PostgreSQL + Auth + Storage + RLS) for MVP and early-stage production.
2. Business logic and Form Engine code (`packages/form-engine`) must have zero direct dependencies on `@supabase/*` SDKs.
3. Storage API is accessed strictly through a provider-neutral `StorageService` interface; object keys follow `{organization_id}/{module}/{entity_id}/{uuid}-{filename}`.
4. User identity is strictly resolved from authenticated session context (`auth.uid()`, `assertTenantAccessFromSession`). Client-provided `userId` parameters are never trusted for server authorization.
5. Migration exit paths are fully documented (`SUPABASE-PORTABILITY.md`) covering Self-Hosted Supabase and PostgreSQL + decoupled Auth (e.g. Better Auth, Keycloak, Clerk) + S3 Storage (AWS S3, Cloudflare R2, MinIO).

---

## ADR-025 — Phase 1 publication and snapshot hardening

**Status:** Implemented and hosted-verified; Phase 1 locked on 2026-09-30

The publish RPC takes only form/version IDs, derives identity from `auth.uid()`,
uses `SECURITY INVOKER` with an empty search path, and serializes publication on
the form row. The legacy caller-identity overload is removed by a new migration.
Existing platform role helpers enforce active Business Admin/Super Admin writes;
the FormService performs the same role check in addition to database enforcement.

Published and archived snapshots cannot change structural fields or audit metadata,
return to Draft, or be deleted. Only editorial `change_note` and the one-way
Published-to-Archived transition remain mutable. Database tests cover every
protected field and the status-transition bypass.

Draft validation checks safe containers/configuration; Publish additionally checks
references and completed workflow selections. Stage order follows the existing
zero-based consecutive convention. Calculation aggregate sources resolve both
Details tab key and column key. Field IDs/keys, including Details columns, are
globally unique. Existing serialized property names/layout widths are preserved.

PostgreSQL integration coverage is kept distinct from hosted Supabase verification.
See `PHASE1-VERIFICATION.md` for historical local evidence and
`PHASE1-HOSTED-VERIFICATION.md` for the passing hosted gate, explicit least-privilege
grants, and application quality results. Phase 2 remains a separate review checkpoint.

---

## ADR-026 — Reusable React renderer package

**Status:** Implemented in Phase 2
**Date:** 2026-09-30

The generic schema renderer lives in `packages/form-renderer`, separate from the
React-free `packages/form-engine` domain package and from Next.js routes. Preview
and future Runtime screens share this renderer. The package accepts local or
controlled state and injected lookup options, but owns no authentication,
persistence, storage, tenant filtering, or backend SDK integration.

The locked Phase 1 schema remains unchanged. Features absent from that contract,
including configured grid row numbering and line-detail layouts, are not invented
by the renderer. Notes/Documents remain local UI contracts; rules, calculations,
submission persistence, and authoritative server validation remain later phases.

See `PHASE2-VERIFICATION.md` for API boundaries, test evidence, visual captures,
and the documented Phase 2 limits.

---

## ADR-027 — Visual builder authors the locked schema directly

**Status:** Implemented in Phase 3
**Date:** 2026-09-30

The reusable visual builder lives in `packages/form-builder`. Its editing state
is the existing `FormSchemaV1`; it does not introduce a persisted builder model
or translate through a parallel schema. Stable IDs are created once and survive
property edits and reordering, while array order values are normalized after
structural moves.

Preview passes the current draft schema directly to the Phase 2 renderer after
the Form Engine draft validator accepts it. Save is an injected host callback so
the application can use the authorized `FormService.saveDraft` boundary without
placing Supabase, repository, auth, tenant, or Next.js request dependencies in
builder core. The development route uses local state only.

The canonical later-module navigation remains visible, but this phase implements
Design only. Data Sources, Rules, calculations execution, Workflow, List View,
Versions, publishing, and production file behavior remain outside Phase 3.

See `PHASE3-VERIFICATION.md` for implemented behavior, browser evidence, and
quality-gate results.

---

## Adding a new decision

Use:

```text
## ADR-XXX — Title

Status:
Date:
Decision:
Reason:
Impact:
Supersedes:
```

Never silently reverse a prior Approved ADR.
