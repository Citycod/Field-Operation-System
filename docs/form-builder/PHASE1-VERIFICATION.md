# Phase 1 final hardening verification — 2026-09-25

For the latest hosted access, credential, and catalog findings, see
[the 2026-09-29 hosted verification report](PHASE1-HOSTED-VERIFICATION.md).
The results below record the earlier local verification pass.

Status: local hardening verified; **not yet locked against the actual Supabase development project**.
No Phase 2 implementation was started.

## Git evidence

Branch: `feat/form-builder-phase-1`.

The checkout was genuinely clean at the start of this pass, at `93b5c9e`.
The earlier contradictory descriptions do not describe the inspected state.
Existing Phase 1 implementation was already committed:

- `b54e7f8`: database foundation.
- `2d7e73d`: schema and validators.
- `3bafea9`: repository/service and tests.
- `93b5c9e`: Phase 1 reference document.

New hardening commits:

- `63b038c`: publishing/RLS/immutability migration and PostgreSQL integration tests.
- `5cc3b43`: validator, service authorization, and adapter regressions.

This report and the decisions log are committed separately. Only build-generated
changes to already-tracked TypeScript cache files are restored after verification;
no source changes are discarded. The final response records the documentation
commit and the final `git status` result.

## Publishing identity and authorization

The baseline RPC already took two arguments and used `auth.uid()`, but ran as
`SECURITY DEFINER` without a tenant check. The new append-only migration:

- Drops any legacy `(uuid, uuid, uuid)` overload accepting a caller identity.
- Uses `SECURITY INVOKER`, a fixed empty search path, RLS, and active Business
  Admin/Super Admin membership checks. Anonymous invocation is revoked.
- Locks the form row and checks the conditional Draft update before moving pointers.
- Derives `published_by` from `auth.uid()` and publication time from the database.
- Enforces the same identity rule in the status-update trigger, including direct
  updates that try to supply another publisher.
- Preserves application membership checks and adds the matching management-role check.

The adapter transport test proves it sends only `p_form_id` and `p_version_id`.
The database suite verifies identity, unauthenticated denial, cross-tenant denial,
role denial, and atomic pointer changes. TypeScript semantic publish validation
still runs in FormService; the SQL RPC does not independently execute that validator.

## Actual Supabase project and generated types

The project identified in `.env.example` is `corzsaybyrtuqsyhwmyv`. A read-only
remote REST check executed using the existing API credential returned:

| Request | Actual result |
| --- | --- |
| `GET /rest/v1/forms?select=id&limit=0` | HTTP 404, `PGRST205` |
| `GET /rest/v1/form_versions?select=id&limit=0` | HTTP 404, `PGRST205` |
| `GET /rest/v1/` | HTTP 200; no table definitions or publish RPC exposed |

This means the two tables were not exposed in the REST schema cache; it does
**not** establish their physical database absence or verify indexes/triggers/RLS.
No records were fetched or changed by these requests.

`supabase db push` was **not executed**. The checkout has no
`supabase/.temp/project-ref`, the `supabase` executable is unavailable
(`pnpm supabase --version` exited 127), and no CLI management token or usable
database password/connection string was found. The example's project-ref and
DB-password values are placeholders. Its working API keys do not supply a SQL
migration connection. There is also no Docker executable for a local Supabase stack.

`packages/types/src/database.ts` was **not regenerated or manually edited**.
It still lacks the Form Builder tables. Real generation remains blocked by the
missing CLI/project/database access. Once access is supplied, use the commands
in `supabase/README.md`, apply all migrations, verify the actual database catalog
and authenticated RLS, then generate types from that schema and rerun the gates.

The existing tracked `.env.example` also contains a working API secret. Its value
was not printed or copied into this report. Credential removal/rotation is a
separate outstanding security concern; this pass did not change that file.

## Validator coverage checklist

Every row below has executed passing tests. `validation.test.ts` and
`hardening.test.ts` are under `packages/form-engine/src/__tests__/`.

| Verified requirement | Test evidence |
| --- | --- |
| [x] Unsupported schemaVersion | `rejects unsupported schemaVersion` |
| [x] Duplicate field IDs | Original duplicate-ID test; grid/header duplicate-ID regression |
| [x] Duplicate field keys | Original duplicate-key test; grid/header duplicate-key regression |
| [x] Duplicate tab IDs | `detects duplicate tab IDs` |
| [x] Duplicate tab keys | `detects duplicate tab keys` |
| [x] Unsupported field types | Original field-type rejection plus grid-column rejection |
| [x] Unsupported tab types | `rejects unsupported tab type` |
| [x] Invalid header layout | Out-of-range, fractional, NaN, and infinite column counts |
| [x] Invalid section layout | Missing identity plus invalid Form-section column counts |
| [x] Invalid Details/Grid config | Missing config, invalid bounds, column types/identity/configuration |
| [x] Invalid Lookup config | Missing config and non-string target entity in a grid column |
| [x] Broken rule source/target refs | Independent source and target rejection, one error each |
| [x] Broken calculation refs | Operands plus actual grid-column sources in Header/Form/Details |
| [x] Broken List View refs | Missing field, unknown system field, invalid default-sort ref |
| [x] Invalid workflow order | Duplicate, missing, negative, fractional, and non-consecutive order |
| [x] Invalid workflow approver config | Unsupported type and missing user/role/department-role selection |
| [x] Invalid Documents config | File size, integer count, extensions container, boolean flags |
| [x] Invalid Notes config | Invalid visibility and append-only requirement |
| [x] Multiple tabs of same type allowed | Two of each of the four tab types accepted by both validators |

Additional regressions reject malformed nested containers without throwing.
Existing serialized property names and width conventions were preserved.
Details dropdown columns now have an explicit `options` property in their type.

## Draft versus Publish

Verified at validator and mocked-service levels:

1. An otherwise valid schema referring to fields not added yet is accepted and
   persisted as Draft.
2. Publishing that exact schema fails for broken references; the mocked repository's
   publish method is never called and the version remains Draft.
3. Incomplete workflow approver selections and calculations with no operands/source
   are accepted structurally but rejected by publish validation.

## Database integration and immutability

Command: `python3 supabase/tests/phase1_database.py` — **19 tests passed**.

The harness created a disposable PostgreSQL 18 cluster, applied all three committed
migrations, then destroyed the cluster. Catalog queries confirmed:

- `public.forms` and `public.form_versions`, both with RLS enabled.
- `one_active_draft_per_form`, unique on `form_id` where `status = 'draft'`.
- The two-argument, invoker-security publish function, with no three-argument overload.
- Both immutability triggers and seven Form Builder RLS policies.

Each of the following was individually tested against both Published and Archived
snapshots and rejected by the database trigger:

- `schema_jsonb`
- `schema_version`
- `organization_id`
- `form_id`
- `version_number`
- `created_by`
- `created_at`

The suite additionally protects `id`, `published_by`, and `published_at`, blocks
ordinary deletion, and rejects returning a snapshot to Draft. Intentionally mutable:
`change_note` for editorial correction, and the one-way Published → Archived status
transition. Archived structural/audit data remains immutable.

A lifecycle test publishes V1, creates and publishes V2, and checks that V1's
schema/version remain unchanged. A duplicate-Draft test is rejected by the partial
unique index. A separate concurrency test holds the first insert transaction open,
starts a competing insert with a different version number, and proves that the
second writer fails on `one_active_draft_per_form`; exactly one Draft remains.

## Test layers and RLS evidence

| Layer | Executed result | Boundary |
| --- | --- | --- |
| Schema/validator unit tests | 68 passed | Pure TypeScript |
| Web suite | 18 passed | Includes 6 FormService tests, 2 publish-adapter tests, 10 existing platform tests |
| Service/repository tests | Passed within web suite | Membership/repository or transport mocks; not RLS proof |
| Database integration | 19 passed | Actual PostgreSQL constraints, triggers, transactions, catalog, concurrency |
| Real PostgreSQL RLS | Passed within database suite | Non-superuser/non-BYPASSRLS `authenticated` role with test session claims |
| Real Supabase Auth/PostgREST RLS | **Not verified** | No linked SQL connection or authenticated test-user setup |

Executed PostgreSQL RLS cases:

- [x] Org A reads its own form and version.
- [x] Org A cannot read Org B form.
- [x] Org A cannot read Org B version.
- [x] Org A cannot insert/update Org B forms or versions.
- [x] Org A cannot move its rows into Org B.
- [x] Disabled membership has no read/write/publish access.
- [x] Unrelated authenticated user has no read/write/publish access.
- [x] Employee cannot write or publish.
- [x] Org A cannot publish Org B's version.

These tests use real RLS, but **test scaffolding supplies auth.uid(), auth.users,
and storage tables**. They do not test Supabase JWT verification or PostgREST.
The local database major version was 18; repository Supabase configuration specifies
15. Hosted-project migration, catalog verification, generated types and authenticated
Supabase RLS checks remain required before calling Phase 1 fully locked.

## Final gates

| Command | Result |
| --- | --- |
| `pnpm lint` | Passed |
| `pnpm typecheck` | Passed |
| `pnpm test` | Passed: 86 tests across 8 files |
| `pnpm build` | Passed; Next.js production build completed |
| `grep -R "@supabase" packages/form-engine/` | No matches (grep exit 1 means no matches) |
| `git diff --check` | Passed |

Next lint and Vite emitted deprecation notices; they did not fail the gates.
No renderer, builder UI, submission runtime, workflow runtime, or other Phase 2
work was added. Stop at Phase 1.
