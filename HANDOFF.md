# Project Handoff — Field Workforce & Operations Management Platform (Form Builder MVP)

**Last Updated:** 2026-11-26  
**Branch:** `main`  
**Latest Commit:** `3ed4d4b` (`fix(form-builder): auto-derive keys on save, display clear auto-key status, and clean canvas card metadata`)  
**Remote:** `https://github.com/Citycod/Field-Operation-System.git`  
**Production Deployment:** Auto-deploys on push to `main` via Vercel (`https://field-operation-system.vercel.app`)

---

## 1. Purpose of This Document

This document provides complete context for an AI coding agent (or engineer) continuing development on a new machine. Read this file alongside [AGENTS.md](./AGENTS.md) and the specifications under `docs/form-builder/` before making any architectural or code changes.

---

## 2. Mandatory Reading & Core Engineering Rules

Before editing code, read:
1. [AGENTS.md](./AGENTS.md) — Core rules, prohibited shortcuts, locked builder hierarchy, MVP exclusions.
2. [FORM_BUILDER_MASTER_SPEC.md](./FORM_BUILDER_MASTER_SPEC.md)
3. `docs/form-builder/00-MVP-SCOPE.md` through `09-PLATFORM-MODULE-ARCHITECTURE.md` (especially `02-FORM-SCHEMA-SPEC.md`, `03-DATA-MODEL.md`, `04-API-SERVICE-CONTRACTS.md`, `05-AUTH-TENANCY-PERMISSIONS.md`, `06-IMPLEMENTATION-PLAN.md`).

### Non-Negotiable Constraints
- **Custom Engine Only:** Do not integrate or depend on Form.io.
- **Generic Engine:** Never hardcode business-specific logic (e.g. `if (module === "visitor")`, `purchase_request`, etc.) into `@field/form-engine`, `@field/form-builder`, or `@field/form-renderer`.
- **Immutable Published Versions:** Never mutate published `form_versions` in place. Submissions remain tied to the exact `form_version_id` under which they were created.
- **Strict Multi-Tenancy:** Every tenant-owned entity is scoped by `organization_id` and enforced at the service layer (membership + role checks via `FormService` / `SubmissionService` / `DataSourceService`) and database layer (Supabase RLS). Never trust client-supplied `organizationId` without server-side membership validation.
- **No `synchronize: true`:** All database schema changes must be written as new SQL migration files under `supabase/migrations/`. Never edit already-applied migrations.
- **UX Direction:** Microsoft Dynamics-inspired enterprise UI — white/light surfaces, green accent (`#08783e` / emerald), dense/compact business controls, consistent command bars, minimal decorative gradients.
- **Protected Fixture Rule:** Do not alter or corrupt any existing production/hosted Visitor Registration Form data; use synthetic fixtures in tests.

---

## 3. Tech Stack & Monorepo Structure

- **Package Manager:** `pnpm` (`>=9.0.0`)
- **Node:** `>=20.0.0 <23.0.0`
- **Frontend / API:** Next.js 15 (`apps/web`, App Router), React 19, TypeScript 5.6+, Tailwind CSS
- **Database & Auth:** Supabase (PostgreSQL + RLS + Supabase Auth + Storage)
- **Testing:** Vitest (unit/integration), Playwright (E2E / hosted verification)

### Workspace Layout
```text
apps/
  web/                  # Next.js 15 App Router application (pages, API routes, services, repositories)
packages/
  form-engine/          # Core schema types, validators, formula/rule evaluators, workflow simulator, field-key utils
  form-builder/         # Visual Form Builder UI (Design, Settings, Workflow, Rules, List View, Versions)
  form-renderer/        # Runtime Form Renderer UI (Header, Form/Details/Notes/Documents tabs, live rules & calcs)
  ui/                   # Shared UI primitives
  types/                # Shared platform TypeScript types
  config/               # Shared config
supabase/
  migrations/           # PostgreSQL migrations & RLS policies
  tests/                # Database / hosted verification scripts
docs/
  form-builder/         # Product & engineering specs + phase verification docs
```

---

## 4. Environment Setup on the New PC

1. **Clone & Install:**
   ```bash
   git clone https://github.com/Citycod/Field-Operation-System.git
   cd Field-Operation-System
   pnpm install
   ```
2. **Environment Variables:**
   Copy `.env.example` to `.env` (root) and `apps/web/.env.local`, and populate the real Supabase credentials (transfer `.env` and `apps/web/.env.local` securely from the old PC — they are gitignored):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_JWKS_URL`
   - `SUPABASE_SECRET_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
   - `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF`, `SUPABASE_DB_PASSWORD`
   - `REDIS_URL` (optional)
3. **Verify Everything Passes:**
   ```bash
   pnpm typecheck
   pnpm test
   pnpm build
   ```
   *(All three passed cleanly as of commit `3ed4d4b`: `form-engine` 215 tests, `form-builder` 77 tests, `apps/web` 243 tests.)*

---

## 5. Current Progress — What Is Already Built

### Completed Phases & Features

1. **Multi-Tenancy & Platform Foundation (Stages 1–5)**
   - Workspace provisioning, onboarding (`/business/signup`, `/business/onboarding`), invitations (`/business/invitations/accept`), role-based access (`super_admin`, `business_admin`, `manager`, `employee`), audit logging, tenant suspension RLS.
   - Layout & navigation shell (`apps/web/src/components/layout/platform-layout.tsx`, `sidebar.tsx` with collapsible hamburger toggle).

2. **Phase 1 — Schema & Persistence Foundation**
   - `FormSchemaV1` types and validators in `packages/form-engine` (`draft-validator.ts`, `publish-validator.ts`, `structure-validator.ts`).
   - `forms` and `form_versions` tables with draft/published lifecycle and atomic publish RPC (`20261110200000_atomic_publish_form_version_with_change_note.sql`).

3. **Phase 2 — Dynamic Form Renderer (`packages/form-renderer`)**
   - Renders Header sections, Form/Fields tabs, Details/Grid repeating row tabs, Notes tabs, and Documents tabs.
   - Supports client validation, live rules, and calculated fields.

4. **Phase 3 & 3.5 — Visual Form Builder (`packages/form-builder` & `/forms/[formId]/builder`)**
   - Top-level navigation: `Design | Form Settings | Workflow | Rules | List View | Versions`.
   - Form Library (`/forms`), Create Form (`/forms/new`), Draft save, Live Preview, Published Preview modal, Share dialog.
   - **Field & Section Key Management (Latest work — commits `f2aa028`, `a2c275d`, `3ed4d4b`):**
     - Users only enter human-readable **Label** (fields/columns) and **Title** (sections).
     - Keys are deterministically slugified (`packages/form-engine/src/schema/field-key-utils.ts`), guarded against JS/formula reserved words, and auto-suffixed on collision (`estimated_cost_2`).
     - Auto-derivation triggers on first blur **and** automatically on Save / Preview / Publish (`normalizeDraftKeysBeforeSave` in `packages/form-builder/src/form-builder.tsx`) if the key is still a default placeholder (`isDefaultPlaceholderKey`).
     - Once established, renaming a Label or Title **never** mutates the key.
     - Keys are editable under collapsed **Advanced / Developer Settings** only while the form is a draft with zero submissions; locked forms show a read-only `🔒 Key:` badge.
     - Backend fallback in `FormService.saveDraft` (`apps/web/src/lib/services/form-service.ts`) deterministically generates missing keys with a warning log and rejects key mutations on locked forms.
   - **Dropdown Options:** Stacked layout separating user-facing display labels from immutable option keys (`option-utils.ts`).

5. **Phase 4 — Data Sources & Lookups**
   - `data_sources`, `data_source_fields`, `data_source_items` (`20261006000000_form_builder_phase_4_data_sources.sql`).
   - Management UI at `/data-sources` and API at `/api/data-sources`.
   - Lookup fields support tenant data sources, API endpoints (with SSRF/security hardening), and platform member rosters.

6. **Phase 5 — Rules & Calculations**
   - Rules Editor (`rules-editor.tsx`) and `rule-evaluator.ts`.
   - Custom formula parser & evaluator (`packages/form-engine/src/rules/calculation-evaluator.ts` / formula evaluator) supporting arithmetic (`quantity * estimated_cost`), grid aggregations (`sum`, `avg`, `min`, `max`, `count`), and automatic formula key-rename cascading (`cascadeFormulaKeyRename`).

7. **Phase 6A — Workflow Designer (Phase E1, commit `b7d2692`)**
   - Visual `WorkflowEditor` (`workflow-editor.tsx`) and `WorkflowPreview` (`workflow-preview.tsx`).
   - Supports Start, Approval, Condition, Notification, Update Record, and End steps, transitions, triggers, assignee config, `workflow-validator.ts`, and in-memory `simulator.ts`.

8. **Phase 7A — Public Sharing & Submissions Viewer (commits `45e933a`, `e672432`)**
   - Public form route `/f/[slugOrId]` and `20261113090000_form_public_access_and_submissions.sql` (`form_submissions`, `submission_detail_rows`).
   - Authenticated Submissions Viewer at `/submissions`, API routes `/api/submissions` & `/api/submissions/[submissionId]`, `SubmissionService` (`apps/web/src/lib/services/submission-service.ts`), and `SubmissionDetailDrawer`.

---

## 6. Where We Stopped & What Is Next

### Immediate Next Milestone: **Phase 6B / 7B — Runtime Workflow & Approval Execution**

Currently, the **Workflow Designer** (configuration & simulation) and **Submissions Viewer** exist, **but workflow approvals do not yet execute at runtime when a form is submitted**:
- `apps/web/src/lib/services/submission-service.ts` has no workflow/approval execution logic yet.
- `apps/web/src/app/(platform)/approvals/page.tsx` is currently a placeholder `EmptyState` ("No pending approvals").
- `approval_instances`, `approval_stage_instances`, and `approval_decisions` tables do not yet exist in `supabase/migrations/`.

#### Deliverables for Phase 6B / 7B (per `docs/form-builder/03-DATA-MODEL.md` §§ 16–18 & `06-IMPLEMENTATION-PLAN.md`):
1. **New Database Migration (`supabase/migrations/`):**
   - Create `approval_instances` (linked to `organization_id`, `submission_id`, `status`).
   - Create `approval_stage_instances` (`approval_instance_id`, `stage_definition_id`, `stage_order`, `stage_name`, `status`, `assigned_approver_id`, `completed_at`).
   - Create `approval_decisions` (append-only decision history: `stage_instance_id`, `actor_id`, `decision`, `comment`, `created_at`).
   - Add RLS policies and indexes matching repository conventions.
2. **Backend Approval & Workflow Runtime Service:**
   - On submission submit in `SubmissionService`: evaluate the form version's `workflow` triggers/conditions, initialize `approval_instances` + first `approval_stage_instances`, resolve approver (user ID, role, or field reference), and set submission status (e.g., `pending_approval`).
   - Implement transactional decision handlers: `approve`, `reject`, `return_for_correction` (verifying actor authorization/assignment, recording `approval_decisions`, advancing to next stage or updating terminal submission status, and enforcing idempotency/race protection).
   - Add API routes for pending approval tasks and submitting approval decisions.
3. **Approver UI:**
   - Implement `/approvals` ("My Pending Approvals" / Tasks queue).
   - Add an interactive **Approval Action Card** and immutable **Approval History Timeline** inside the submission detail view/drawer.
4. **Tests:**
   - Unit + integration tests for workflow start on submit, sequential multi-stage approval, rejection, return-for-correction, unauthorized actor denial, idempotency, and cross-tenant isolation.

### Remaining Roadmap After Phase 6B / 7B
- **Phase 8:** Form definition Import/Export & CSV submission export.
- **Phase 9:** Hardening — audit log coverage across approval/submission actions, E2E Playwright regression suite, large-form performance checks.
- **Phase 10:** End-to-end validation by building real platform forms (e.g., **Purchase Requisition Form**, **Visitor Registration Form**) purely through the builder with zero business-specific engine code.

---

## 7. Quick Reference — Key Files

- **Form Engine:** `packages/form-engine/src/schema/form-schema.ts`, `field-key-utils.ts`, `workflow.ts`, `rules.ts`
- **Form Builder:** `packages/form-builder/src/form-builder.tsx`, `workflow-editor.tsx`, `rules-editor.tsx`, `form-settings-editor.tsx`, `list-view-editor.tsx`
- **Form Renderer:** `packages/form-renderer/src/form-renderer.tsx`
- **Services:** `apps/web/src/lib/services/form-service.ts`, `submission-service.ts`, `data-source-service.ts`, `audit-log-service.ts`
- **Repositories:** `apps/web/src/lib/repositories/supabase/`
- **Pages:** `apps/web/src/app/(platform)/forms/[formId]/builder/page.tsx`, `submissions/page.tsx`, `approvals/page.tsx`, `data-sources/page.tsx`

