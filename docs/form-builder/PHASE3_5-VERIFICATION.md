# Phase 3.5 verification — Form Library and Builder integration

**Date:** 2026-10-01
**Branch:** `feat/form-library-builder-integration`
**Starting commit:** `f74512ad769364fa0dc07508b4b6cd2ad7a641d6`

Phase 3.5 connects the existing Phase 3 `FormBuilder` and Phase 2
`FormRenderer` to the production tenant flow. It does not add Phase 4 work.

## Production routes

| Route | Implemented behavior |
| --- | --- |
| `/forms` | Tenant-scoped Form Library with loading, error, empty, search, lifecycle, version, and updated-date states |
| `/forms/new` | Creates a blank Draft V1 through the authenticated FormService path, then redirects to the production builder |
| `/forms/[formId]/builder` | Loads the active draft, hosts the existing `FormBuilder`, persists its validated `onSave`, and uses its Phase 2 renderer preview |
| `/dev/form-builder` | Retained development/demo route |
| `/dev/form-renderer` | Retained development/demo route |

The old `Codex Phase 1 Shell` and roadmap cards are no longer rendered at
`/forms`.

## Application and security boundaries

Production pages call the `/api/forms` application endpoints. Those endpoints:

1. derive the authenticated identity from the server Supabase session;
2. call `FormService` for tenant membership and role authorization;
3. use the existing repository adapters for RLS-protected database access.

No browser-supplied user ID is accepted. Organization IDs remain untrusted input
and must pass active `business_admin` or `super_admin` membership checks in
addition to database RLS. Production form pages do not import Supabase or call a
Supabase client directly.

Configured Supabase environments no longer fall back to mock identity or mock
organizations after an authentication failure. The tenant switcher uses the
organizations returned for the signed-in user. The login page performs a real
password sign-in. Follow-up auth loading is deferred outside Supabase's auth-state
callback so it does not deadlock sign-in.

Draft saving validates with the existing Form Engine before invoking the host
callback. Repository writes match the version ID, form ID, organization ID, and
Draft status. A rejected write is surfaced as `Save failed`; no success message
is shown. If no active draft exists, the builder shows an explicit state and can
only clone the latest Published version through the approved lifecycle service.
Published snapshots are never loaded as editable schemas.

## Hosted Supabase browser proof

Command:

```bash
pnpm --filter @field/form-builder test:hosted-integration
```

Result: **1 focused hosted test passed**.

The test used a generated Supabase Auth user and isolated organization in the
linked development project. It completed this production flow:

```text
Sign in
→ /forms empty Form Library
→ /forms/new
→ create persisted Form and Draft V1
→ /forms/[formId]/builder
→ add Header section and Text field
→ add Details/Grid tab and configured column
→ add Notes tab
→ Save Draft through PUT /api/forms/[formId]/draft
→ reload and confirm Header field plus configured tabs are restored
→ leave for Form Library
→ confirm persisted Draft V1 row
→ reopen production builder
→ confirm saved schema is restored
→ open Preview
→ confirm Phase 2 renderer displays the restored Header, Details, and Notes tabs
```

The test asserted HTTP 201 for creation and HTTP 200 for saving. Browser console
page errors were empty. The generated forms, versions, membership, organization,
and Auth user were removed after the test. No credential values were logged or
stored in tracked files.

## Visual QA

Desktop screenshots at 1536 × 1080 were inspected against the approved dense
green/white enterprise direction:

- [Empty Form Library](phase3_5-qa/desktop-empty-library.png)
- [Create Form](phase3_5-qa/desktop-create-form.png)
- [Saved production Builder](phase3_5-qa/desktop-production-builder.png)
- [Populated Form Library](phase3_5-qa/desktop-populated-library.png)
- [Reopened saved Builder](phase3_5-qa/desktop-reopened-builder.png)
- [Restored schema in Phase 2 Preview](phase3_5-qa/desktop-production-preview.png)

The production shell, compact controls, thin borders, restrained green accents,
Builder workspace, saved state, lifecycle row, and preview composition are
visually consistent. No generic card-dashboard redesign was introduced.

## Automated coverage

Focused coverage verifies:

- tenant-scoped library results and rejection of cross-tenant service access;
- active Draft loading and persisted schema reload through `FormService`;
- server-session identity instead of caller-supplied user identity;
- creation through the API/service boundary and builder redirect contract;
- the production builder imports the existing `@field/form-builder` package;
- invalid schema is blocked before save;
- persistence failure is displayed without false success;
- Published-to-Draft editing uses the existing explicit lifecycle method;
- production pages contain no direct Supabase persistence bypass.

## Final gates

| Gate | Result |
| --- | --- |
| `pnpm lint` | Passed; no ESLint warnings or errors |
| `pnpm typecheck` | Passed across all seven workspace projects |
| `pnpm test` | Passed: 136 tests (68 engine, 26 renderer, 15 builder, 27 web) |
| `pnpm build` | Passed; Next production build includes all three production form routes and both API routes |
| Form Engine Supabase imports | Zero |
| Renderer Supabase imports | Zero |
| Builder core Supabase imports | Zero |
| Production form-page direct persistence | Zero; all three pages call `/api/forms` endpoints |

No push, merge, or Phase 4 implementation is part of this phase.
