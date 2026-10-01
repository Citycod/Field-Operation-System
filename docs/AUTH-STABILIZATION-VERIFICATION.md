# Authentication and route stabilization verification

**Date:** 2026-10-01

**Branch:** `feat/form-library-builder-integration`

**Starting commit:** `1fd5b646896254dde7c472e7c1ac3668beb164b4`

This checkpoint stabilizes the existing Supabase authentication lifecycle before
Phase 4. It does not add Form Builder features or Phase 4 behavior.

## Root cause

The observed behavior came from four connected problems:

1. The root page redirected to `/dashboard` without checking a session, while
   middleware protected only a short allowlist and skipped protection entirely
   when the web Supabase URL was missing.
2. `AuthProvider` substituted a Phase 1 mock user, organizations, and memberships
   in an unconfigured environment. This made an unauthenticated Dashboard look
   authenticated and kept browser state separate from the server session.
3. Login called `router.replace()` and immediately called `router.refresh()`.
   The refresh could win and reload the old `/login` route after Supabase had
   created a valid cookie. Logout used the same competing navigation pattern.
4. Authentication and tenant loading shared one broad error handler. A membership
   or organization query failure cleared the authenticated user, so a valid
   session appeared to have been logged out. Placeholder Supabase endpoints and
   swallowed repository errors made the resulting `Failed to fetch` state hard
   to diagnose and retry.

## Final authentication model

- Supabase SSR cookies are the server authority. Middleware refreshes and checks
  the user on page requests, and the platform layout also rejects a missing or
  invalid server user before rendering the shell.
- The browser client uses the same cookie-backed Supabase session. It contains no
  mock identity or mock tenant fallback.
- Login uses `signInWithPassword`, requires both a returned user and session, and
  performs one full navigation only after sign-in succeeds.
- `onAuthStateChange` defers follow-up reads until the Supabase auth lock is
  released. Request generations prevent older reads from overwriting newer auth
  events.
- Authentication and tenant resolution are separate states. Tenant query errors
  retain the authenticated user and present a retry state. An authenticated user
  with no active membership sees an explicit organization-access state.
- Logout calls Supabase sign-out once, clears browser context, and performs one
  full navigation to `/login`.
- Missing or placeholder public Supabase configuration now fails clearly. It
  cannot create a fake session or contact a placeholder project.

## Route policy

| Request state | Route | Result |
| --- | --- | --- |
| Unauthenticated | `/` | Redirect to `/login` |
| Authenticated | `/` | Redirect to `/dashboard` |
| Unauthenticated | Protected platform page | Redirect to `/login?next=...` |
| Authenticated | `/login` | Redirect to a safe internal `next` path or `/dashboard` |
| Authenticated | Protected platform page | Render after server cookie validation |
| Invalid or expired session | Protected platform page | Redirect to `/login` |
| Any | `/api/...` | API handler returns its own `401` or `403`; middleware does not turn it into a page redirect |
| Any | `/dev/...` | Existing development-fixture boundary remains outside production route protection |

Protected pages include `/dashboard`, `/forms`, `/forms/new`, production Builder
routes, `/submissions`, `/approvals`, and `/administration`. Unknown non-API,
non-development application pages also default to protected. Return URLs accept
only local protected paths; external, protocol-relative, login, API, and dev
destinations fall back to `/dashboard`.

## User-visible states

- Login prevents duplicate submissions, uses browser password-manager metadata,
  reports Supabase authentication errors, and turns a network failure into an
  actionable connection error while restoring the submit button.
- The platform shell displays a session-verification state while browser auth is
  synchronizing with the server cookie.
- No active membership displays `Organization access is required` and retains
  the authenticated session.
- Tenant loading failure displays a retry action and does not sign the user out.
- The header includes the single intentional `Sign out` action.

## API behavior

Existing form API routes continue to derive the user from the server Supabase
session and authorize the requested organization through the application service.
The hosted browser proof asserted:

- no session: `GET /api/forms` returned `401`;
- authenticated user without membership: the same tenant request returned `403`;
- the `403` did not clear the valid Supabase session.

## Hosted browser verification

Command:

```bash
pnpm --filter @field/form-builder test:auth-hosted
```

Result: **2 focused hosted tests passed** against the linked Supabase development
project. Temporary users, organization, membership, forms, and versions were
removed after the run. No reusable credential is stored in the test or tracked
files.

The browser coverage verified all required cases:

1. unauthenticated `/` redirected to `/login`;
2. unauthenticated `/dashboard` redirected to `/login`;
3. unauthenticated `/forms` redirected to `/login`;
4. real password login redirected to `/dashboard`;
5. Dashboard to Forms to Dashboard preserved the same session;
6. refreshing `/dashboard` preserved the session;
7. refreshing `/forms` preserved the session;
8. authenticated `/login` redirected to `/dashboard`;
9. an authenticated user without membership saw the access/setup state and
   remained authenticated after a `403`;
10. logout cleared the session and redirected to `/login`;
11. login again after logout succeeded and returned to `/dashboard`.

The same member-user test also opened `/forms/new`, created a real hosted Form and
Draft V1, entered `/forms/[formId]/builder`, returned to Dashboard, refreshed,
logged out, and logged in again.

## Files changed

- Supabase public configuration and browser/server clients
- auth helper, service, context, route policy, and middleware
- root, login, protected platform layout, and platform shell
- membership and organization repository error propagation
- focused route/config unit tests and hosted browser test/configuration
- this verification record

## Final quality gates

| Gate | Result |
| --- | --- |
| `pnpm lint` | Passed across all seven workspace projects; no ESLint warnings or errors |
| `pnpm typecheck` | Passed across all seven workspace projects |
| `pnpm test` | Passed: 142 tests (68 engine, 26 renderer, 15 builder, 33 web) |
| `pnpm build` | Passed; Next production build includes middleware and every protected platform route |
| Form Engine Supabase imports | Zero |
| Renderer Supabase imports | Zero |
| Builder core Supabase imports | Zero |
| Production form-page Supabase persistence bypass | Zero |

After the final boundary scan removed an unused placeholder value from the
legacy environment metadata module, the focused web typecheck also passed.
