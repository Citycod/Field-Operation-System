# Phase 3 Visual Form Builder verification

**Date:** 2026-09-30

**Branch:** `feat/form-builder-phase-3`

**Starting HEAD:** `22f985a29eac3688c6d013349e8c64f4ff0b38d1`

## Implemented contract

`packages/form-builder` is a reusable React package over the locked
`FormSchemaV1`. Builder state is the schema itself. Structural commands create
schema fields, sections, and tabs through typed factories, retain stable IDs,
and normalize order values. The package has no backend SDK, repository,
authentication, tenant, router, or request-object dependency.

The Design workspace implements:

- green/white enterprise shell and canonical builder navigation;
- ten approved field types and four approved tab types only;
- header columns, sections, widths, fields, and ordering;
- Form/Fields tab columns, sections, fields, and ordering;
- Details/Grid columns and row-operation configuration;
- Notes append-only, attribution, attachment, and visibility configuration;
- Documents multiple/required/delete, count, size, and extension configuration;
- repeated tab types with no tab-count limit;
- field, section, and tab property panels;
- engine validation before Preview and Save;
- direct Preview integration with the Phase 2 `FormRenderer`.

## Persistence

The existing `FormService.saveDraft` contract supports an authorized host
adapter: it checks active form-management membership, runs the Form Engine draft
validator, and writes through `FormRepository.saveDraft`. Phase 3 therefore
exposes an injected `onSave(schema)` callback. The builder does not bypass that
service and does not call Supabase directly.

The development route deliberately uses a local callback. Hosted draft saving
is not claimed by this phase because the demo has no authenticated organization,
form ID, or version ID context.

## Deferred navigation

Form Settings, Workflow, Rules, List View, and Versions are canonical shell
navigation labels. Selecting them gives an explicit later-phase notice; they are
not presented as implemented. Data Sources is not a top-level builder tab.

Rules execution, calculations execution, workflow/approvals, list-view backend,
version backend, data-source persistence, production storage, import/export,
templates, AI, offline behavior, and payments remain excluded.

## Automated coverage

Component and domain tests cover:

- header section creation and controlled layouts;
- section add/remove/reorder with stable IDs;
- field add/remove/reorder and property editing;
- every approved field factory and specialized safe defaults;
- every approved tab type and multiple tabs of the same type;
- tab reorder with stable IDs;
- Details/Grid columns and permissions;
- Notes and Documents configuration;
- invalid schema blocked from Preview and Save;
- Preview rendered by the Phase 2 renderer;
- host-callback save boundary;
- absence of unsupported types, business-specific labels, and Supabase imports.

The Chrome browser flow starts from the blank fixture, creates a header section
and fields, adds/configures a Details/Grid tab, adds Notes and Documents tabs,
uses the local save callback, and opens the generated schema in renderer Preview.

## Visual QA

Desktop captures at 1536 × 1080 were compared with the approved Header, Field,
Tab, Grid, Notes, and Attachments builder screens in the production UI/UX
handoff. The implementation preserves the dense three-column workspace, dark
green shell, white/light-gray panels, compact controls, thin borders, restrained
shadows, horizontal builder navigation, tab strip, and right-side properties.

Evidence:

- `phase3-qa/desktop-header-fields.png`
- `phase3-qa/desktop-details-grid.png`
- `phase3-qa/desktop-documents-config.png`
- `phase3-qa/desktop-renderer-preview.png`

## Final gates

| Gate                                  | Result                                                           |
| ------------------------------------- | ---------------------------------------------------------------- |
| Builder component/domain tests        | Passed: 14                                                       |
| Chrome authoring flow                 | Passed: 1                                                        |
| Full `pnpm lint`                      | Passed; no ESLint findings (existing Next.js deprecation notice) |
| Full `pnpm typecheck`                 | Passed                                                           |
| Full `pnpm test`                      | Passed: 126 tests (68 engine, 26 renderer, 14 builder, 18 web)   |
| Full `pnpm build`                     | Passed; all packages and 12 static Next.js pages generated       |
| Form Engine Supabase imports          | Zero                                                             |
| Renderer Supabase imports             | Zero                                                             |
| Builder core Supabase imports         | Zero                                                             |
| Builder business-specific core labels | Zero                                                             |
