# Visual Form Builder — Phase 3

`@field/form-builder` is a reusable React editor for the existing
`FormSchemaV1` contract from `@field/form-engine`. It does not define a second
schema model. Every builder operation returns a complete `FormSchemaV1`, and
Preview passes that schema directly to the Phase 2 `FormRenderer`.

```tsx
import { FormBuilder } from "@field/form-builder";
import "@field/form-builder/styles.css";
import "@field/form-renderer/styles.css";

<FormBuilder
  initialSchema={draft.schema_jsonb}
  onChange={(schema) => keepLocalDraft(schema)}
  onSave={(schema) => authorizedHost.saveDraft(schema)}
/>;
```

## Supported authoring

- Header columns, sections, section widths, fields, and ordering.
- Form-tab columns, sections, fields, and ordering.
- Details/Grid columns and local row add/edit/delete configuration.
- Notes append-only, attribution, attachment, and visibility configuration.
- Documents multiple/required/delete, count, size, and extension configuration.
- All ten locked field types and all four locked tab types.
- Repeated tab types and unbounded tab creation.
- Stable field, section, and tab IDs when labels, properties, or order change.
- Draft validation before Preview or Save.
- Renderer-backed Preview using the exact local schema.

Reordering uses explicit accessible controls. The locked schema stores order and
controlled layout values; it does not require a drag-and-drop transport format.

## Persistence boundary

The builder owns local draft editing state. `onSave` is an injected host
callback. The current web architecture can adapt it to the existing
`FormService.saveDraft`, which performs membership authorization and draft
validation before calling the repository. The builder does not import Supabase,
repositories, Next.js request objects, authentication, or tenant context.

The development fixture uses a local callback and does not persist anything.
The route is available at `/dev/form-builder` in development. Default production
builds return 404 unless `FORM_BUILDER_DEMO=true` is explicitly set at build
time.

## Phase boundary

The canonical navigation includes later modules so the approved shell remains
recognizable. Form Settings, Workflow, Rules, List View, and Versions display an
explicit later-phase notice; they do not claim working behavior. This package
does not implement data-source persistence, rules, calculation execution,
workflow, approvals, list-view persistence, versions, templates, import/export,
AI, offline behavior, or production files.

Lookup fields store only the existing safe `lookupConfig`. A later authorized
data-source adapter provides runtime values. Calculated fields store only the
existing declarative `calculationConfig`; no arbitrary JavaScript is accepted or
executed.

## Verification

From the repository root:

```bash
pnpm --filter @field/form-builder test
pnpm --filter @field/form-builder test:browser
```

The browser suite starts the Next.js development route on localhost port 3100
and stores desktop visual-QA captures in `docs/form-builder/phase3-qa/`.
