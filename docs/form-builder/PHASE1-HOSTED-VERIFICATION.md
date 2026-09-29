# Phase 1 hosted verification — 2026-09-29

**Result: BLOCKED, not LOCKED. No Phase 2 work, push, or merge.**

This report supplements the historical local verification in
`PHASE1-VERIFICATION.md`. After the user requested proceeding with the remaining
checks despite the unresolved exposed-key issue, hosted access was investigated
without treating that instruction as evidence of credential revocation.

## Security and workspace

- `.env.example` is restored to the committed, placeholder-only template.
- The actual `.env` is ignored and has mode `0600`.
- `SUPABASE_PROJECT_REF` was normalized from a dashboard URL to the project
  reference after confirming it matched `SUPABASE_URL`.
- The exposed `SUPABASE_SECRET_KEY` still matches the local value and returned
  HTTP 200 in a live authentication check. It is **not verified revoked**.
- A different local `SUPABASE_SERVICE_ROLE_KEY` also returned HTTP 200. Its
  existence does not prove revocation of the exposed key.
- Management access can list keys (HTTP 200), but the attempted creation of a
  replacement key returned HTTP 403. No replacement was created by that attempt;
  no old key was deleted.
- No credential values were printed or written into this report.
- Existing untracked `AGENT_RULES.md`, `BACKEND_ARCHITECTURE.md`,
  `IMPLEMENTATION_ROADMAP.md`, `README (1).md`, and `UI screens/` were preserved.

The exposed secret was introduced by `50d0ba15aa5a5d2f1666bf2a7195d11c81152870`.
Its SHA-256 fingerprint is
`56d1ef684fdcd4e3d42727df9ae5ae82f26b5b39ed1442d081084402a5560f5d`.
It remains in that commit and these descendant snapshots:
`b54e7f8`, `2d7e73d`, `3bafea9`, `93b5c9e`, `63b038c`, `5cc3b43`, `78a181c`.
Commit `57e685c` removed live credentials from the current template, not history.
The cached `origin/refactor/supabase-portability` ref points to the introducing
commit; a fresh GitHub ref check was blocked by missing GitHub authentication,
so current remote branch state was not independently confirmed.

## CLI and project link

Supabase CLI **2.118.0** was downloaded through `pnpm dlx supabase`; no project
dependencies or architecture were changed. The local `.env` was loaded privately
for CLI calls and output was scrubbed before being displayed.

`supabase link --project-ref corzsaybyrtuqsyhwmyv --yes` succeeded (exit 0).
The resulting `supabase/.temp/` project link/cache remains ignored.

`supabase db push --dry-run --yes` failed (exit 1) with `DbConnectError`:
connection to `aws-1-eu-west-1.pooler.supabase.com` timed out. This attempt ran
outside the filesystem/network sandbox. No migrations were applied. A mutating
`db push` was not run after its prerequisite connection failed.

An HTTPS fallback capability check also succeeded, but the management SQL
session reported `current_user = supabase_read_only_user` and
`transaction_read_only = on`, even when the request specified `read_only: false`.
Only harmless SELECT queries were used for this check. The token therefore did
not provide a writable database session through this route; no migration SQL was
submitted through the management API. The preflight also found no migration-history
table and no `public.organizations` foundation table.

## Direct hosted catalog verification

Supabase's [read-only management SQL endpoint](https://supabase.com/docs/reference/api/v1-read-only-query)
was reachable over HTTPS and returned HTTP 201. The query inspected only
`pg_catalog` tables/views; it did not read application records or modify data.

| Required object | Actual hosted catalog result |
| --- | --- |
| `public.forms` | Absent |
| `public.form_versions` | Absent |
| `one_active_draft_per_form` | Absent |
| `form_versions_org_form_fkey` | Absent |
| `public.publish_form_version` | Absent |
| Immutability triggers on `public.form_versions` | Absent |
| RLS policies on `public.forms` and `public.form_versions` | Absent |

These results are direct hosted catalog evidence, stronger than the earlier
REST schema-cache 404 observations. They do not invalidate the separately
documented local PostgreSQL tests, but those local tests are not hosted proof.

## Generated types

The CLI successfully returned genuine output for
`supabase gen types typescript --linked --schema public`. Before writing it,
the wrapper checked that it included `forms` and `form_versions`. That check
failed because the hosted schema lacks both tables.

`packages/types/src/database.ts` was therefore left unchanged. No generated
types were manually approximated and the incomplete hosted schema did not
overwrite the current application types. This gate remains blocked until the
committed migrations are applied to the linked development database.

## Hosted tests

Hosted authenticated tenant-isolation, publisher identity, and Draft/Publish
lifecycle tests were **not run**: their tables/RPC are absent. No synthetic users
or tenant records were created during this pass. No hosted test pass is claimed.

## Local quality gates

| Gate | Result |
| --- | --- |
| `pnpm lint` | Passed, exit 0 |
| `pnpm typecheck` | Passed, exit 0 |
| `pnpm test` | Passed: 68 Form Engine tests plus 18 web tests (86 total) |
| `pnpm build` | Passed, exit 0; Next.js production build completed |
| `grep -R "@supabase" packages/form-engine/` | No matches; grep exit 1 |
| `git diff --check` | Passed |

These gates ran against the existing application types, not migrated hosted types.
Build-generated changes to the two tracked TypeScript cache files were restored.
Only verification documentation was committed in this pass; pre-existing
untracked files remain untracked. No source, migration, or database type file
was modified.

## Remaining blockers

1. Revoke the identified exposed key and confirm its authentication is rejected;
   update the local secret variable to an appropriate replacement. Current
   management access was denied when attempting to create that replacement.
2. Restore an authorized working PostgreSQL connection for the linked project
   (the HTTPS management SQL fallback is also restricted to a read-only role),
   then apply the three committed migrations through the repository CLI workflow.
   This pass did not change migration history or recreate schema objects manually.
3. Recheck the hosted catalog, run authenticated hosted RLS and lifecycle tests,
   regenerate and use the genuine migrated-schema types, and rerun all gates.

Phase 1 must remain unapproved for Phase 2 until these blockers are resolved.
