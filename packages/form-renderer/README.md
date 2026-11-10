# Generic Form Renderer — Phase 2

React presentation over the existing `@field/form-engine` FormSchemaV1 contract.
This package has no backend SDK, router, request, authentication, or persistence
integration. It reuses `@field/ui` controls and is deliberately separate from the
React-free domain package.

```tsx
import { FormRenderer, type RendererValue } from '@field/form-renderer';
import '@field/form-renderer/styles.css';

<FormRenderer
  schema={schema}
  mode="preview"
  lookupProvider={async (config, { signal, fieldId }) => localOptions}
  onPreview={(value: RendererValue) => inspectLocalValues(value)}
/>
```

The host supplies shared UI styles (the application already includes the shared
UI Tailwind sources). All renderer-specific styles are scoped under `.fr-root`.

## State and boundaries

- Modes: `edit`, `preview`, `readOnly`. Preview is interactive but never invokes
  `onSubmit`; `onPreview` is explicitly a local/testing callback.
- Uncontrolled: `initialValue` initializes local state. Changing schema resets
  local state; remount with a new React key to reset values for the same schema.
- Controlled: provide `value` and `onChange`. Values are keyed by schema field
  keys; details/notes/documents are keyed by tab keys. Each row has a stable ID.
- `onSubmit` receives valid local values; the host owns authorization, validation,
  and any later persistence. This callback does not imply a saved submission.
- `LocalFile` contains metadata and an optional browser `File` handle. No upload,
  URL creation, or storage access occurs. `toOutputPayload` drops file handles
  for JSON-safe inspection; it is not a persisted submission API contract.
- Lookup options come from an injected asynchronous provider, with abort signals,
  loading/empty/error/retry states. The provider owns tenant-safe data access.
- Notes are append-only local state. Their author/visibility are display metadata,
  not authenticated audit identity or security filtering. The host must supply
  only authorized data when real integration is introduced.

## Supported behavior

All ten locked field types, configured headers/sections and 1–4 columns, section
and field fractional widths, custom/multiple tabs of all four types, read-only
controls, local grid row permissions and bounds, required values, text lengths,
numeric bounds, date/option checks, file extension/size/count limits, and safe
schema rejection. Inputs and error summaries are labeled; tab navigation supports
arrows/Home/End. Wide tables and tab strips scroll within their containers.

The renderer calls the existing draft validator before traversal and also guards
optional presentation properties that the locked v1 validator does not validate.
It does not change the locked schema or the Phase 1 validators.

## Deliberate limits

- No builder, rule/calculation engine, approval runtime, submission persistence,
  data-source backend, or file-storage integration.
- Calculated controls display supplied values read-only; they never recompute.
  A notice identifies schemas whose rules/calculations are not being executed.
- Arbitrary regular-expression validators are not executed. Pattern validation
  requires a future safe validation policy; basic required/type/bound checks run.
- The locked `DetailsTabConfig` has no row-numbering or line-detail configuration.
  Neither feature is invented here. Row IDs remain stable; delete buttons have
  accessible row-position labels, not a new numbering schema option.
- Detail columns have no width/validation/default configuration in the locked
  type, so only their represented options and permissions are used.
- Header section and field widths follow the locked `full/half/third/quarter`
  contract (ADR-025), rather than the earlier conceptual numeric-width examples.
- Local row permissions are UX safeguards. Server authorization and validation
  remain mandatory before later production persistence.

## Development and verification

At the repository root:

```bash
pnpm install
pnpm dev:web
# Open http://localhost:3000/dev/form-renderer
pnpm --filter @field/form-renderer test
pnpm --filter @field/form-renderer test:browser
```

The fixture route is available in development only. For an explicitly opted-in
local production demo build, set `FORM_RENDERER_DEMO=true` at build time. Default
production builds return 404 for the demo; no production navigation is changed.

Browser tests use installed Google Chrome (`channel: chrome`) and start Next.js
on localhost:3100. They write QA screenshots under
`docs/form-builder/phase2-qa/`. No Supabase environment is needed for this demo.
