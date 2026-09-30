# Phase 1 hosted verification — 2026-09-30

**Result: BLOCKED, not LOCKED. No Phase 2 work, push, or merge.**

## Exact blocker

The genuine hosted test runner stopped during fixture setup: inserting a test
organization using the replacement administrative secret returned HTTP 403,
PostgreSQL code `42501`. A subsequent read-only catalog query confirmed:

| Hosted role | public schema USAGE | organizations INSERT | forms SELECT | forms INSERT |
| --- | --- | --- | --- | --- |
| authenticated | true | false | false | false |
| service_role | true | false | false | false |
| anon | true | false | false | false |

`service_role` has BYPASSRLS, but that does not confer table privileges.
The committed foundation/Form Builder migrations create tables and policies
without explicitly granting the required table access. This hosted project
has not supplied those grants automatically. Policy existence therefore does
not establish working authorized access.

Per the user's instruction to stop on a hosted failure, no grant fix was applied
and the test run was not retried. The next implementation step is an append-only
migration with appropriately scoped table grants for authenticated operations
and administrative provisioning, followed by rerunning the hosted gate. Do not
grant anonymous access as a shortcut. Preserve the existing RLS restrictions.

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
  test users; its later table-permission failure is separate from authentication.
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

## Hosted migration and catalog verification

The repository is linked to development project `corzsaybyrtuqsyhwmyv`.
Supabase CLI 2.118.0 was invoked through `pnpm dlx supabase`, privately loading
local environment variables. No dependencies or architecture were changed.

`supabase db push --dry-run --yes` and `supabase db push --yes` both succeeded.
All pending committed migrations were applied through the approved CLI workflow:

1. `20260922000000_init_tenant_schema.sql`
2. `20260925000000_form_builder_phase_1.sql`
3. `20260925010000_harden_form_builder_phase_1.sql`

The hosted `supabase_migrations.schema_migrations` history records all three.
Direct hosted catalog checks passed for:

- `public.forms` and `public.form_versions`, both with RLS enabled.
- Unique partial index `one_active_draft_per_form`, filtering `status = 'draft'`.
- Composite `form_versions_org_form_fkey` linking `(organization_id, form_id)`
  to `forms(organization_id, id)`.
- Two-argument `publish_form_version` using SECURITY INVOKER and `auth.uid()`.
  The legacy three-argument caller-identity overload is absent.
- Two enabled immutability triggers and seven Form Builder RLS policies.

These are catalog checks, not successful authenticated RLS/lifecycle tests.
The function body derives publisher identity from `auth.uid()`, but its hosted
execution and impersonation rejection remain unverified after the setup failure.

## Genuine generated types

`supabase gen types typescript --linked --schema public` completed successfully.
Its actual stdout replaced `packages/types/src/database.ts`, after checking that
both Form Builder tables were present. Types were not manually approximated.
These new types have not passed application quality gates yet; the requested
stop-on-failure condition was reached before those gates.

## Hosted tests and cleanup

Added an opt-in, fail-fast runner:

```bash
python3 supabase/tests/phase1_hosted.py --project-ref corzsaybyrtuqsyhwmyv
```

It reads credentials privately from ignored `.env`, verifies the project link,
checks the catalog, creates synthetic users/organizations, and uses real password
sessions with the public API key for normal tenant operations. Administrative
credentials are reserved for provisioning and cleanup.

Executed result: six catalog checks passed; four Auth users were created and
signed in; organization provisioning failed with HTTP 403 / `42501`.
All created Auth test users were removed. Scoped fixture cleanup completed.
The runner's administrative cleanup uses transaction-local replication settings
and generated UUIDs to remove its own immutable test snapshots; that cleanup is
not evidence that ordinary published-version deletion is allowed.

**Not executed:** hosted tenant-isolation assertions; disabled/unrelated/anonymous
access assertions; cross-tenant publish; publisher impersonation; draft saving;
V1/V2 publication; immutable-field/delete assertions; duplicate-draft insertion.
No hosted RLS or lifecycle pass is claimed.

## Quality gates and evidence boundaries

| Gate | This pass |
| --- | --- |
| Security revocation/replacement | Passed |
| Hosted migrations and catalog | Passed; missing table grants detected separately |
| Generated database types | Genuine hosted output written; integration unvalidated |
| Hosted RLS | Blocked during fixture setup |
| Hosted lifecycle | Not reached |
| `pnpm lint` | Not rerun: stopped after hosted failure |
| `pnpm typecheck` | Not rerun against new types |
| `pnpm test` | Not rerun against new types |
| `pnpm build` | Not rerun against new types |
| `grep -R "@supabase" packages/form-engine/` | No matches; exit 1 |
| `git diff --check` | Passed |

Historical evidence remains separate: the preceding application run passed 68
Form Engine tests and 18 web tests (86 total), lint, typecheck, and build. The
local PostgreSQL suite previously passed 19 integration tests with substituted
Auth/Storage scaffolding. Neither result substitutes for this hosted gate or
validates the newly generated types.

## Git scope

Only the hosted test runner, genuine generated types, and verification
documentation belong to this pass. Pre-existing untracked `AGENT_RULES.md`,
`BACKEND_ARCHITECTURE.md`, `IMPLEMENTATION_ROADMAP.md`, `README (1).md`, and
`UI screens/` remain preserved and unstaged. A wholly clean worktree cannot be
claimed while those user files remain untracked. No push or merge was performed.
