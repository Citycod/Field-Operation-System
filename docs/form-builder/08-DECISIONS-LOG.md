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
