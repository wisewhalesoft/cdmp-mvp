# CDMP e2e (Playwright) — Acceptance / Fidelity Ring

This is constraint #1 of the Uncle-Bob ring (see the repo-root `CLAUDE.md` and the
`test-generator` agent instructions): executable Playwright tests that assert the
**adjudicated design** — the prototype under `/prototypes` reconciled with each
feature spec's Acceptance Criteria (`docs/specs/features/F###-*.md`) — against the
**live, running frontend**.

## Ground rules (do not violate these when adding specs here)

- **Authored blind to implementation.** Specs in `tests/` are written from `prototypes/*.html`
  + `docs/specs/features/F###-*.md` (+ architecture docs when a feature has one), never from
  reading `apps/api/src` or `apps/web/src` production code. If a spec/prototype conflict or
  ambiguity is found, it gets flagged in `docs/test-specs/risks-and-gaps.md`, not silently
  resolved by peeking at the implementation.
- **`test-generator` is the sole author of everything under `e2e/`.** Implementation agents
  (backend/frontend) write production code only; if a test here looks wrong or blocks a
  legitimate implementation, they message `test-generator` to re-adjudicate it against the
  prototype/spec — they do not edit it themselves.
- **Assert the adjudicated design, not the raw prototype**, where a feature spec records a
  deviation (see each `F###-*.md` spec's "裁決偏離" / assumptions section).

## Running

```bash
cd e2e
npm install
npx playwright install chromium   # first time only
cp .env.example .env              # adjust E2E_BASE_URL / credentials for your environment
npm run test:e2e:list             # static check: specs parse and enumerate correctly
npm run test:e2e                  # full run — requires the app to be up (see below)
```

The app must be reachable at `E2E_BASE_URL` (default `http://localhost:5173`, the Vite dev
server; its own `/api` proxy forwards to the API — see `apps/web/vite.config.ts`). Either:

- `npm run dev` at the repo root (concurrently runs `api:dev` + `web:dev`), or
- `docker compose up` (adjust `E2E_BASE_URL` to the mapped `cdmp-web` port, default `5174`).

Either way the API needs a reachable database (dev MSSQL is an **external** database per
`docker-compose.yml`'s comments — this is not spun up by this ring).

## Auth strategy

`global-setup.ts` drives a real Chromium browser through the actual login page (matching
`prototypes/01-login.html`'s field labels) for two personas — `admin@cdmp.test` and
`user@cdmp.test` (both from `apps/api/src/database/seeds/seed.ts`, the dev/CI bootstrap seed;
**not** real employee credentials) — and captures `storageState` for each. Real login (not a
minted JWT) is used deliberately so this file never needs to assume how/where the frontend
stores its token — Playwright's `storageState()` captures whatever the browser actually holds
after a real login flow, and this also exercises the real login integration as a side effect.

Per `docs/specs/features/F079-set-dept-ratio.md` BR-7 ("`admin` OR `business_role='director'`"),
the `admin` account is access-equivalent to a director for every E07 write-side endpoint this
ring touches, so it is used to cover all "director-capable" fidelity scenarios.

**Known gap** (tracked in `docs/test-specs/risks-and-gaps.md`, section "F117 部門比例設定頁僅提供
「有在職處長」之部門設定測試風險與待決問題", R-F117-01): the dev seed has no
`business_role='director'` or `'section_chief'` fixture account, so this ring has no real-login
persona for those two roles specifically. This does not leave any Acceptance Criterion
uncovered — see that risks-and-gaps.md entry for exactly which other ring layer covers each
role-gated scenario instead (mostly: backend Integration tests using self-contained SQLite
fixtures, and frontend Component tests with a mocked `businessRole`).

## F117 data strategy (why some specs use `page.route()` instead of real API calls)

`tests/fidelity-f117-dept-ratio.spec.ts` intercepts `GET /api/v1/assignment/lists**` and
`GET /api/v1/assignment/ratios/dept/**` with fixed responses mirroring
`prototypes/29a-dept-ratio-config.html`'s own built-in demo scenarios, while still driving a
real browser against the real running frontend build (so routing/proxy/build drift is still
caught). This is a deliberate choice, not a shortcut: there is no dev/CI seed data guaranteed
to contain a `stage='dept_ratio'` list with an orphan-department fixture, and this ring must
not write/wipe rows in the shared dev database (see project memory
`feedback_mssql_e2e_tests_wipe_dev_cdmp_tables`). The backend business rules this bypasses
(BR-1~BR-9) are independently proven correct — with a **real** HTTP+Guard+SQLite round-trip,
not mocks — by `apps/api/test/f117-dept-ratio-director-filter.e2e-spec.ts`. Full detail and the
tradeoff rationale: `docs/test-specs/risks-and-gaps.md`, R-F117-02.

This spec self-restricts to the `admin` project via a `test.beforeEach` + `test.skip(testInfo.project.name !== 'admin', ...)`
guard inside its `test.describe` block — so a plain `npm run test:e2e` (no `--project` filter) correctly **skips** (not fails)
it under the `user` project instead of asserting that an unprivileged persona should see director-only UI. See
`docs/test-specs/risks-and-gaps.md`, R-F117-06.

## Adding a new feature's fidelity spec

1. Read the feature's prototype(s) (via `docs/ui-ux-design-overview.md`'s Feature→prototype
   map) + its spec's Acceptance Criteria. Do not read the production implementation.
2. One file per feature: `tests/fidelity-F###-<slug>.spec.ts`.
3. Prefer real backend calls when a stable fixture exists; fall back to `page.route()`
   interception (as F117 does) when it doesn't, and document why in this README +
   `docs/test-specs/risks-and-gaps.md` — don't do it silently.
4. Update `docs/test-specs/features/F###-test.md`'s AC→scenario table.
