# Phase 3.6 Responsive UX Verification

**Branch:** `feat/responsive-platform-stabilization`

**Starting commit:** `0d6c0bb07cced5bcc3d97bfa928c43f5a05bff50`

**Scope:** responsive stabilization only; no Phase 4 functionality was added.

## Pre-change audit

The production routes and shared components were inspected in source and in a hosted browser session before implementation.

| Area                   | Observed issue                                                                                                                                                      | Resulting change                                                                                                                                                                          |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Platform shell         | The 256px fixed sidebar remained present at 390px and 768px. At 390px it left a narrow content strip and clipped header actions, headings, cards, and form content. | Desktop retains the full sidebar. Tablet and mobile use an accessible modal navigation drawer. Main content receives the full viewport width below 1024px.                                |
| Platform header        | Tenant, role, user email, notifications, and sign-out were forced into one row without truncation rules.                                                            | The header now uses bounded/truncated context text, breakpoint-based secondary metadata, compact actions, and a reachable mobile menu/sign-out control.                                   |
| Dashboard              | Cards were compressed by the fixed sidebar, and tenant identifiers could wrap one character per line.                                                               | Cards use one, two, or three columns by breakpoint. Identifiers break safely and the main action fills the mobile width.                                                                  |
| Form Library           | The desktop table and header actions had no mobile presentation.                                                                                                    | Desktop keeps the dense table with controlled internal scrolling. Mobile uses stacked lifecycle cards and full-width search/actions.                                                      |
| Create Form            | Desktop padding and side-by-side actions were unnecessarily tight on phones.                                                                                        | Form padding scales by breakpoint and actions stack at mobile touch sizes.                                                                                                                |
| Builder                | The desktop grid used a 470px minimum canvas at tablet widths, and mobile exposed the full three-column authoring workspace.                                        | Tablet uses a bounded two-column palette/canvas layout with Properties below. Mobile shows an intentional authoring guidance state with Preview access.                                   |
| Builder tablet palette | The initial responsive pass still allowed two-column component labels to extend beyond the 180px palette.                                                           | The tablet palette now uses one column; a browser geometry assertion verifies that every control stays inside the panel.                                                                  |
| Builder overlays       | Add Tab and Preview lacked small-viewport height limits and mobile action layout.                                                                                   | Dialogs use viewport-aware maximum height and internal scrolling. Actions and tab types reflow, Escape closes overlays, background scrolling is locked, and focus returns to the trigger. |
| Renderer / Preview     | Core section collapse and grid scrolling already existed, but footer actions, file rows, and section headings could be crowded at phone width.                      | Mobile actions, notes, files, headings, and uploads stack with reachable touch targets. Grid overflow remains contained within the grid region.                                           |
| Administration         | Tenant and membership UUIDs could force narrow layouts wider than the viewport.                                                                                     | Long identifiers wrap safely and membership rows stack on mobile.                                                                                                                         |

The Login page already fit at 1536px and 390px. Its authentication behavior and password-manager-compatible input metadata were left unchanged.

## Implementation boundaries

- Authentication, session refresh, tenant resolution, and route protection remain unchanged.
- Form creation and draft persistence still use the existing API, application service, and repository boundary.
- The production Builder still reuses `@field/form-builder` and Preview still reuses `@field/form-renderer`.
- No Data Sources, Rules, Workflow, submission persistence, publishing UI, or other Phase 4 work was introduced.
- No direct Supabase dependency was added to Form Engine, Form Renderer, or Builder core.

## Browser verification

The hosted responsive scenario creates a temporary confirmed Supabase Auth user, active Business Admin membership, organization, and form. It signs in through the real Login page, exercises the production create/save/Preview flow, and removes the fixture afterward.

Command:

```bash
pnpm --filter @field/form-builder test:responsive-hosted
```

Result: **1 passed**. The scenario verified:

- unauthenticated Login at 390×844 and 1536×1080;
- authenticated Dashboard at 390×844, 768×1024, and 1536×1080;
- mobile/tablet drawer open, Escape/button close, focus return, tenant selector visibility, and sign-out visibility;
- Form Library and Create Form at mobile and desktop widths;
- production Builder at desktop, tablet, and mobile;
- real hosted form creation and draft save;
- intentional Builder mobile guidance with Preview access;
- Renderer Preview at desktop and mobile;
- Details/Grid row add and delete controls at 390×844;
- return to the populated Form Library;
- Approvals and Administration at 390×844;
- no page-level horizontal overflow for every captured state;
- no uncaught browser page errors.

The focused tablet Builder check also passed:

```bash
pnpm --filter @field/form-builder exec playwright test \
  --config=playwright.config.ts \
  --grep "keeps tablet authoring controls"
```

It verifies palette control boundaries, reachable Properties content, and absence of page-level overflow at 768×1024.

## Visual evidence

Evidence is stored in [`docs/qa/responsive`](./qa/responsive/).

| Surface                  | Evidence                                                                                     |
| ------------------------ | -------------------------------------------------------------------------------------------- |
| Login                    | `login-desktop.png`, `login-mobile.png`                                                      |
| Dashboard                | `dashboard-desktop.png`, `dashboard-tablet.png`, `dashboard-mobile.png`                      |
| Platform shell           | `platform-shell-desktop.png`, `platform-shell-tablet.png`, `platform-shell-mobile.png`       |
| Form Library             | `form-library-desktop.png`, `form-library-mobile.png`, `form-library-populated-mobile.png`   |
| Create Form              | `create-form-desktop.png`, `create-form-mobile.png`                                          |
| Builder                  | `builder-desktop.png`, `builder-tablet.png`, `builder-tablet-core.png`, `builder-mobile.png` |
| Renderer / Preview       | `preview-desktop.png`, `preview-mobile.png`                                                  |
| Details/Grid             | `details-grid-mobile.png`                                                                    |
| Operational placeholders | `approvals-mobile.png`, `administration-mobile.png`                                          |

## Accessibility checks

- Mobile navigation uses a labelled modal dialog with explicit open/close controls.
- Escape closes the navigation and Builder overlays.
- Focus returns to the navigation or Preview trigger after closing.
- Tenant selection exposes expanded and selected state to assistive technology.
- Horizontal tab and grid regions remain internally scrollable without widening the page.
- Focus-visible behavior remains present in Builder and Renderer controls.
- Mobile primary actions use at least 40–44px control height where adjusted.

## Final quality gates

The final repository gates are recorded after the implementation and visual checks:

```text
pnpm lint      — passed; final Web follow-up reported no warnings or errors
pnpm typecheck — passed across all seven workspace projects
pnpm test      — passed; 13 files and 143 tests
pnpm build     — passed; all packages and 14 Next.js routes built successfully
```
