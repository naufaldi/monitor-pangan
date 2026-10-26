# UI consistency verification — 26 October 2026

Local implementation on `fix/ui-consistency-issues`, based on `a986af4`.
The coordinator used three GPT-6.1 Sol workers with high reasoning and reused
the same agents for integration fixes. Validation completed locally before PR
delivery. Production deployment remains outside this change.

| Work area | Result |
| --- | --- |
| #34, build | Exact TanStack pins remove the older router core. Client, server, six-route prerender and social HTML stamping pass. |
| #22–#27 under #31, UI adoption | Routes and components use the existing shared controls, panels, figures, table helpers, selection styles and layout. Official data badges are neutral. |
| #28, copy and formatting | Indonesian percentages, rounded unsigned zero and shared direction glyphs have regression coverage. English UI captions were replaced. |
| #29, mobile | All six routes fit 390px and 1280px. Fields and nav links measure 44px high. Price cells do not wrap. SVG axis text renders at 11 CSS pixels at both widths. |
| #30, data-backed audit | Seeded local reports, map pins, place cards, both outlet medians, pending admin and reviewed admin views were exercised. Loading, error, retry and confirmed-empty states were checked. |

## Environment and evidence

The audit served the production client build from local Wrangler on
`127.0.0.1:8791`. It used an isolated D1/R2 state directory under the ignored
`data/repairs/ui-issues/` directory. Existing local databases were not changed.
The fixture contains six synthetic reviewed rice reports and one pending report.
The local official-price lane uses the checked-in September 16 snapshot.
No survey-completion markers were invented and no upstream price source was fetched.

Successful requests used the real local Worker and D1. Public report responses
exclude the pending report. The admin queue returns 401 without authorization;
the isolated test key returns one pending report and six reviewed reports.
Both province medians remain available when switching between Pasar and Ritel.
Map pins expose place names, and selecting a pin opens its place card.

Delayed-request and HTTP 503 scenarios intercepted `window.fetch` in the audit
browser only. They confirm loading does not claim emptiness and that retry
recovers through the real local API. These checks do not establish production
availability. DOM form submission and DOM control events were used after Orca's
native click/keypress commands did not trigger the expected browser actions.

The audit also found and fixed the PIHPS badge appearing on `/admin/` after
the local asset server's redirect from `/admin`.

Raw measurements, interaction assertions, screenshots and the isolated fixture
remain in `data/repairs/ui-issues/` for local inspection. Selected evidence is
stored alongside this document.

- [Measured layouts and interaction checks](./verification.json)
- [Local HTTP and authorization checks](./http-verification.json)
- [Mobile map](./home-390.png), [mobile chart](./tren-390.png)
- [Pending admin reports](./admin-pending-390.png), [reviewed admin reports](./admin-reviewed-390.png)
- [Focused navigation link](./focus-nav-390.png)

The final browser check confirms a solid 2px ink focus outline with a 2px offset.
Focusing the last nav link scrolls it to approximately x=386 in the 390px
viewport, leaving space for the ring. The file input label also shows a solid
2px ring. The expanded trend table with a selected province stays within the
viewport and retains its horizontal-scroll wrapper.

## Checks and limits

- `pnpm typecheck` passes.
- `pnpm build` passes with prerender enabled for all six routes.
- Explicit targeted Vitest runs pass for shared primitives and layout, formatting,
  source copy, rendered data UI, chart calculations, province colors, search,
  report helpers and the existing report-store behavior.
- The percentage, empty-highlight and focus-helper regressions failed before
  their fixes and passed afterward. Local checks used explicit test targets;
  PR CI runs the full suite.
- Browser layouts were inspected at 390×844 and 1280×844. Scrollable table
  contents and clipped Leaflet tiles were excluded from page-overflow failures.
- Citizen submission stays disabled when Turnstile is absent. A live Turnstile
  submission and photo upload were not exercised.
- Existing large-bundle and nonfatal circular-dependency warnings remain.

Performance is assessed as not materially affected by the UI adoption: serving
queries and successful fetch flows are unchanged, and most changes reuse markup
and styles. The chart adds one measured-width observer with cleanup; its keyboard
detail interaction still updates the selected date and price. This is a code-based
assessment, not a latency benchmark or a production-performance improvement claim.
