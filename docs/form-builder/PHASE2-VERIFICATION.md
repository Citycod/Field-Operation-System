# Phase 2 — Generic Form Renderer verification

**Date:** 2026-09-30

**Branch:** `feat/form-renderer-phase-2`
**Baseline:** locked Phase 1 commit `6b9e7579bc8bdc92841d4eaf099031b8b46f8458`

Phase 2 implements a reusable React renderer over the locked `FormSchemaV1`.
It adds no Builder, persistence, Supabase calls, rules/calculation execution,
approval runtime, submission storage, production file storage, or
business-specific behavior.

## Placement and API

The renderer lives in `packages/form-renderer`. Keeping React presentation in a
separate workspace package preserves the React-free domain boundary in
`packages/form-engine` and lets Preview and future Runtime screens share one
renderer. Its public API provides:

- `FormRenderer` with `edit`, `preview`, and `readOnly` modes.
- Controlled or uncontrolled `RendererValue` state.
- `onChange`, validated local `onSubmit`, and preview-only `onPreview` callbacks.
- An injected asynchronous `LookupProvider` with loading, empty, error, retry,
  and cancellation behavior.
- A JSON-safe inspection helper that removes browser `File` handles.

Production authorization, server validation, persistence, and tenant filtering
remain host responsibilities. Preview never calls the submission callback.

## Implemented behavior

- Header/Main information sections, 1–4 controlled columns, locked fractional
  section/field widths, field ordering, required indicators, and empty states.
- Ten-field registry: text, textarea, number, currency, date, dropdown,
  checkbox, lookup, file, and calculated display.
- Unlimited ordered tabs, custom names, and multiple instances of Form,
  Details, Notes, and Documents types.
- Form-tab sections and responsive field layouts.
- Details columns and stable local row IDs; add/edit/delete controls enforce
  schema flags and min/max bounds in both UI and state transition logic.
- Append-only local Notes UI with configured author/timestamp/attachment display.
- Local Documents UI with multiple/single selection, extension, size, count,
  required, and pre-submit-delete behavior.
- Required/type/date/dropdown/text-length/number-bound/file validation, an
  accessible error summary, field messages, and focus links.
- Accessible tabs with arrow/Home/End navigation, labeled controls, visible
  focus, scroll-contained grids/tab strips, and responsive compact layouts.
- Defensive draft-schema validation plus malformed optional-setting checks.

## Deliberate schema/scope limits

The locked Details schema has no row-numbering option and no line-detail
definition, so Phase 2 does not invent either property. Details columns also do
not expose the conceptual width/validation/default fields in the locked
TypeScript contract. The renderer uses only properties represented in Phase 1.

Calculated controls show supplied values read-only. Rules and calculations are
not executed, and the renderer displays a notice when a schema contains them.
Arbitrary configured regular expressions are not executed; a future safe pattern
policy belongs with authoritative server/client validation design. Notes and file
handles remain local/demo data only. Lookup persistence belongs to Phase 4.

## Development route and visual QA

`/dev/form-renderer` uses a generic operations-request fixture. It includes every
field type, repeated Details tabs, Form, Notes, Documents, lookup-provider data,
empty/invalid fixtures, sample values, preview/read-only/local-runtime modes, and
desktop/tablet/mobile widths. The route is development-only unless an explicit
`FORM_RENDERER_DEMO=true` production build opts in; it is not in navigation.

Visual authority was the supplied handoff's S01 runtime and S08 preview screens.
The implementation preserves their green/white enterprise treatment, compact
controls, thin section borders, main-information area above horizontal tabs,
dense grid, contextual actions, preview settings panel, and responsive runtime
stacking. It does not copy Purchase Requisition labels into renderer core.

Chrome QA covered the complete desktop interaction flow and responsive 390px and
768px layouts. All three browser tests passed with no page errors or page-level
horizontal overflow. Captures are under `phase2-qa/`:

- `desktop-preview.png`, `desktop-grid.png`, `desktop-notes.png`,
  `desktop-documents.png`, `desktop-read-only.png`, `desktop-runtime.png`
- `390-preview.png`, `390-grid.png`, `768-preview.png`, `768-grid.png`

## Automated coverage

The renderer component suite covers configured Header sections/fields; all ten
field types; controlled/uncontrolled state; schema replacement; unlimited and
repeated tab types; Form sections; Details columns and row permissions; stable
rows; required and boundary validation; read-only and preview modes; keyboard
tabs; invalid/unknown schemas; empty schema areas; lookup failure/retry; local
Notes/Documents; file metadata serialization; prototype-like tab keys; and the
absence of Supabase, Next request APIs, and sample business labels in core.

Browser coverage verifies preview errors, sample data, row CRUD, empty grids,
Notes, Documents, safe output, read-only and runtime modes, empty/invalid schemas,
keyboard navigation, and responsive overflow.

## Quality gates

| Gate | Result |
| --- | --- |
| Renderer component tests | 26 passed |
| Chrome interaction/responsive QA | 3 passed |
| `pnpm lint` | Passed; no ESLint findings (existing Next.js deprecation notice) |
| `pnpm typecheck` | Passed |
| `pnpm test` | 112 passed: 68 engine + 26 renderer + 18 web |
| `pnpm build` | Passed; renderer package and Next.js production build |
| `packages/form-engine` Supabase imports | Zero |
| Renderer Supabase imports | Zero |

Phase 3 Builder is not included in this change.
