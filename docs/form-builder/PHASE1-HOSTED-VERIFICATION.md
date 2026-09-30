# Phase 1 hosted verification — 2026-09-30

Resume checkpoint: `644cca2e19b273c05f5144220324c92187e07e14`.

**PHASE 1 STATUS: LOCKED. All hosted checks and application quality gates passed.**
No Phase 2 work, push, or merge.

## Append-only privilege fix

Applied `20260930000000_phase1_table_privileges.sql` through the linked Supabase
CLI workflow (`db push --dry-run --yes`, then `db push --yes`, both exit 0).
Already-applied migrations were not edited. All four versions are recorded in
hosted migration history for development project `corzsaybyrtuqsyhwmyv`.

Before changing grants, inspected the actual deployed policies, table ACLs,
schema/function privileges, UUID defaults, and application repository queries.
The earlier HTTP 403 / `42501` was missing table privileges, not a policy failure.
The new migration grants only:

| Role | Tables | Privileges |
| --- | --- | --- |
| authenticated | profiles, organizations, organization_memberships | SELECT |
| authenticated | forms | SELECT, INSERT, UPDATE |
| authenticated | form_versions | SELECT, INSERT, UPDATE, DELETE |
| service_role | organizations, organization_memberships, form_versions | SELECT, INSERT |
| anon / PUBLIC | These five tables | None |

Authenticated foundation reads support existing profile/session and tenant
resolution. Form SELECT policies themselves read memberships. Forms are archived
by UPDATE; no form DELETE privilege was added. Version DELETE remains subject
to role-based RLS and published/archived immutability triggers.

Administrative SELECT/INSERT grants support fixture provisioning with RETURNING
and the explicit tenant-FK assertion. Cleanup uses scoped management SQL as the
database owner. No service-role application path or publish privilege was added.
Existing unnecessary TRUNCATE, TRIGGER, and REFERENCES grants were removed from
these five tables for all API roles. No broad default grants were introduced.

Existing public-schema USAGE and authenticated helper/RPC EXECUTE permissions
were sufficient. No sequences are used by these tables, so no sequence grants
were added. RLS policies, helpers, triggers, and the SECURITY INVOKER publish RPC
were unchanged; publisher identity still derives from `auth.uid()`.

## Security

- The exposed credential was a Supabase server secret API key,
  `SUPABASE_SECRET_KEY`; no credential values are included here.
- Management write access is now available. A replacement secret key was created
  and atomically stored in the ignored local `.env`, retaining mode `0600`.
- The compromised key was deleted using the management API. Initial gateway
  probes continued accepting it during propagation; the final probe returned
  **HTTP 401**, matching an invalid-key control. The replacement passed gateway
  authentication (HTTP 404 for the deliberately nonexistent probe table).
- Management inventory confirms the old key is absent and the replacement is
  present. The replacement also successfully created and signed in four Auth
  test users; the earlier table-permission failure was separate from authentication and
  is now resolved by the grant migration.
- `.env.example` contains placeholders only. `.env`, `.env.local`, nested
  application `.env.local`, and the Supabase link/cache are gitignored.
- Existing unrelated untracked files were preserved.

The exposed secret was introduced by `50d0ba15aa5a5d2f1666bf2a7195d11c81152870`.
It remains in that commit and descendant snapshots `b54e7f8`, `2d7e73d`,
`3bafea9`, `93b5c9e`, `63b038c`, `5cc3b43`, and `78a181c`.
Commit `57e685c` sanitized the template; history was not rewritten.
The cached `origin/refactor/supabase-portability` ref points to the introducing
commit. Current GitHub branch state has not been independently verified because
fresh remote authentication was unavailable in the preceding pass.

## Hosted catalog, RLS, and lifecycle results

Command:

```bash
python3 supabase/tests/phase1_hosted.py --project-ref corzsaybyrtuqsyhwmyv
```

**50 hosted checks passed**, using genuine Supabase Auth password sessions and
PostgREST. Normal operations use the public API key with authenticated user JWTs.
Service-role credentials are used only for fixture provisioning and the
administrative tenant-constraint test. All synthetic fixtures/users were cleaned
up. Cleanup uses transaction-local replication settings on generated UUIDs;
this is separate from ordinary immutable-version deletion, which was rejected.

Catalog checks confirmed both tables with RLS enabled, the one-active-draft
partial unique index, the composite organization/form FK, the two-argument
invoker publish RPC, absence of the legacy caller-identity overload, both enabled
immutability triggers, seven Form Builder policies, all four migrations, and
exact table grants matching the matrix above.

| Authenticated hosted behavior | Result |
| --- | --- |
| Org A reads its own form and version | Passed |
| Org A cannot read Org B form/version | Passed; no rows exposed |
| Org A cannot insert Org B form/version | Passed; HTTP 403 / 42501 at RLS level |
| Org A cannot update Org B form/version | Passed; no rows updated; B unchanged |
| Disabled membership cannot read protected tenant data or publish | Passed |
| Unrelated authenticated user cannot read either tenant or publish | Passed |
| Anonymous access to protected forms/versions | Denied; no anonymous table grants |
| Cross-tenant publish | Rejected; HTTP 400 / P0001; other tenant unchanged |
| Caller-supplied p_user_id | Rejected; HTTP 404 / PGRST202; overload absent |
| published_by equals authenticated user | Passed for both V1 and V2 |
| Direct status update attempts to spoof publisher/time | Trigger derives actual user/time |
| Composite tenant mismatch using administrative insert | HTTP 409 / 23503 |

Full lifecycle passed:

```text
Create Form → Draft V1 → Save Draft → Publish V1
→ Published mutation rejected → Published deletion rejected
→ Create Draft V2 → second active Draft rejected
→ Publish V2 → V1 remains entirely unchanged
```

Each requested immutable column was tested independently: `schema_jsonb`,
`schema_version`, `organization_id`, `form_id`, `version_number`, `created_by`,
and `created_at`. Additional hosted checks protected `published_by`,
`published_at`, and status reversal. Mutation/deletion returned HTTP 400 / P0001.
The duplicate draft returned HTTP 409 / 23505 specifically for
`one_active_draft_per_form`. Publication updated form pointers and version audit
metadata consistently. Only editorial `change_note` and the one-way
Published-to-Archived transition intentionally remain mutable; the local database
suite also verifies archived snapshot protection.

## Generated types and test layers

The genuine hosted `packages/types/src/database.ts` generated at the resume
checkpoint was retained unchanged. This migration changes only privileges,
not schema-visible types/contracts, so regeneration was not needed.

| Layer / gate | Result |
| --- | --- |
| Hosted Supabase catalog, RLS, lifecycle | 50 checks passed |
| Local PostgreSQL database integration | 19 tests passed |
| pnpm lint | Passed, exit 0 |
| pnpm typecheck | Passed against genuine hosted types, exit 0 |
| pnpm test | 86 passed: 68 Form Engine unit tests and 18 web tests, exit 0 |
| pnpm build | Passed, exit 0; production build and all 10 static pages completed |
| Form Engine Supabase imports | Zero matches; grep exit 1 |

The local harness now relies on the actual grant migration instead of installing
blanket authenticated table grants in its scaffolding. It still supplies local
Auth/Storage substitutes and is separate from the hosted evidence. Its concurrent
writers test confirms exactly one active draft survives. The initial sandboxed
cluster could not start; the authorized run outside that sandbox passed all 19.

Schema validation and mocked service/repository coverage are documented in the
historical `PHASE1-VERIFICATION.md`, including all required validator cases and
safe incomplete Draft acceptance versus semantic Publish rejection. Hosted RPC
tests verify database authorization/lifecycle, not execution of the TypeScript
semantic validator; application validation/authorization remain additional layers.

## Git and scope

Only the new migration, verification tests, and documentation changed. Generated
types and previously applied migrations are unchanged. Existing untracked
`AGENT_RULES.md`, `BACKEND_ARCHITECTURE.md`, `IMPLEMENTATION_ROADMAP.md`,
`README (1).md`, and `UI screens/` are preserved and unstaged. Build-generated changes to tracked TypeScript caches were restored. The tracked
worktree is committed; the whole worktree retains those
five user entries. No push, merge, or Phase 2 implementation.
