# catan-next — Migration Roadmap

> The living plan for this repo, worked through over multiple sessions. Phase
> status markers in §9 are updated in place as phases land, and code comments
> cite this document by section number (`ROADMAP §4.1`), following the
> convention in `~/WebstormProjects/bulgogi-billys/docs/REFACTOR_PLAN.md`.

---

## Context

`~/ws/catan` is a 2020-era **Angular 9** app (TypeScript 3.8, Karma/Jasmine,
Protractor, TSLint) deployed to GitHub Pages. It generates random Catan boards —
a Base Game variant and a Seafarers variant — and is live at
`lukeludlow.github.io/catan`. The stack is four major Angular versions stale and
the entire toolchain is end-of-life.

This repo is a fresh Next.js implementation: it ports the generator domain
logic, and deploys to Vercel with automated testing.

`~/WebstormProjects/bulgogi-billys` is the standards reference. Important
caveat: **it is a Vite + React SPA, not a Next.js app.** Its conventions
transfer, its build and routing plumbing does not. Deliberately _not_ copied:
`vercel.json` SPA rewrites, `index.html`, `main.tsx` as a composition root,
`import.meta.env`/`VITE_*`, and `@tailwindcss/vite`.

The port is not a transliteration. The Angular code carries a set of real
defects (§4) that the new coordinate model deletes outright rather than
reproduces.

### Decisions locked with the user

| Decision   | Choice                                                      |
| ---------- | ----------------------------------------------------------- |
| Variants   | **Both**, driven by a shared `MapSettings` data object      |
| Rendering  | **Inline SVG** hex grid computed from axial coordinates     |
| Randomness | **Seeded PRNG**, board shareable via `?seed=`               |
| Testing    | **Vitest unit + browser projects**, mirroring the reference |

---

## 1. Stack

As installed in Phase 0:

- **Next.js 16.3.1** (App Router) + **React 19.2.8**
- **TypeScript 5.x**, `"strict": true` (the reference omits `strict` — we do not
  copy that gap)
- **Tailwind CSS 4** via `@tailwindcss/postcss` (the Next.js equivalent of the
  reference's Vite plugin), configured CSS-first in `globals.css`
- **Vitest 4.1** + **@vitest/browser-playwright 4.1** + `vitest-browser-react 2`
- **ESLint 9** flat config + **Prettier 3**
- **npm** — pnpm, yarn, and bun are all absent from this machine; the local
  toolchain is Node 22.21.1 / npm 10.9.4 / Vercel CLI 56.2.1

Pin what the reference left unpinned: `.nvmrc` (`22`) and `engines.node >=22`.

**Two versions were planned higher and walked back during Phase 0**, both for
real incompatibilities rather than caution:

- **TypeScript 7** (published, and the registry's `latest`) is unusable here:
  `typescript-eslint` peers on `typescript <6.1.0` and has no release that
  accepts 7.x. Revisit when it does.
- **ESLint 10** installs cleanly but crashes on any lint run —
  `eslint-config-next@16.3.1` bundles an `eslint-plugin-react` that calls the
  removed `context.getFilename()` API (`TypeError` in `react/display-name`). Its
  peer range says `>=9`, which is optimistic. Revisit when `eslint-config-next`
  ships a compatible plugin.

Because ESLint 9 is the working version, `typescript-eslint` is **not** a direct
dependency — `eslint-config-next/typescript` already supplies TS linting, and
the boundary rules in §2 use core ESLint's `no-restricted-imports`. That is one
fewer dependency than the reference carries.

---

## 2. Conventions adopted from `bulgogi-billys`

Copy these near-verbatim:

- **`.prettierrc`** exactly as-is — 4-space tabs, double quotes,
  `printWidth: 80`, `trailingComma: "all"`, `proseWrap: "always"`. Markdown is
  hard-wrapped at 80 too, including this file.
- **`eslint.config.mjs`** flat-config shape, including the
  `no-restricted-imports` boundary blocks. Retarget the globs: ban
  parent-relative imports repo-wide (`^\.\./` → "Use the `@/` alias"), and ban
  `^@/components/` and `^@/app/` from `src/domain/**` so the generator can never
  reach into React.
- **`@/*` path alias** to `./src/*`, no barrel files, every import names its
  file.
- **Naming**: `PascalCase.tsx` for components, `camelCase.ts` for everything
  else, `kebab-case/` for directories.
- **`export default function ComponentName()`** for components; named
  `export function` for all non-component modules.
- **Co-located tests** — `foo.ts` ↔ `foo.test.ts`, no `__tests__/` directories.
- **Rationale-first comments** — non-trivial modules open with a short block
  saying why they exist and what alternative was rejected. This is the reference
  project's defining convention and the most valuable one to carry over.
- **`verify.sh`** — the staged, fail-fast gate, same `stage()` helper.
- **`CLAUDE.md` + `docs/`** — terse repo instructions plus this document.

Deviate deliberately in three places: `"strict": true` in tsconfig, a real
GitHub Actions workflow (the reference has none, by documented choice), and a
Node version pin.

### 2.1 `CLAUDE.md` — written first, in Phase 0

The reference's `CLAUDE.md` is seven lines and deliberately terse. Keep that
register. Drop its two project-specific lines (the Catalyst UI Kit, database
schemas); keep testing discipline, mobile-first design, the `@docs/` pointer,
and the engineering-practices lines; add the rules that encode this roadmap's
architecture, so they bind every later phase rather than being retrofitted.

---

## 3. The core architectural change: axial coordinates

This is the load-bearing decision, and it is what makes the port worth doing
rather than copying.

The Angular code stores hexes in a **13-row jagged `Hex[][]`** and computes
neighbors by converting offset `(row, col)` into cube coordinates
(`convertHexCoordsToHexBlobCube`) and then converting _back_ through
`figureOutRow(q, r)` / `figureOutCol(q, r)` — two hand-written inverse functions
full of hardcoded special cases (`_maps/Seafarers/SeafarersMap.ts:81-175`). The
inverse is where the bugs live.

**The inverse is unnecessary.** Store the board as a `Map` keyed by axial
coordinate and neighbor lookup becomes a key lookup:

```ts
// src/domain/hex.ts
export type Axial = { q: number; r: number };

export const DIRECTIONS = [
    { q: 1, r: 0 }, // East
    { q: 1, r: -1 }, // NorthEast
    { q: 0, r: -1 }, // NorthWest
    { q: -1, r: 0 }, // West
    { q: -1, r: 1 }, // SouthWest
    { q: 0, r: 1 }, // SouthEast
] as const;

export function key({ q, r }: Axial): string {
    return `${q},${r}`;
}
```

A board is then `{ hexes: Map<string, Hex>; settings: MapSettings }`, and
`neighbors(board, hex)` maps `DIRECTIONS` over `key()` lookups. No inverse
function, no bounds table, no per-row special cases.

Consequences, all of them good:

- **Both variants become data.** Base Game is a hexagon of radius 2 (19 hexes);
  Seafarers is the 42-hex jagged shape. Each is just a list of axial coordinates
  in `src/domain/shapes.ts`. The old duplicate `BaseMapGenerator` — a separate
  5×5 code path sharing nothing with the Seafarers pipeline — is deleted, not
  ported.
- **`HexSide` and `HexDirection` collapse into one enum.** In the original these
  are separate types, which forced `findHexSidesTouchingSea` to maintain a
  hardcoded per-row/col edge table
  (`_generators/port-generator.service.ts:56-153`, ~100 lines). With one
  direction enum, "which sides touch sea" is three lines: a side touches sea iff
  the neighbor in that direction is `Sea` **or** absent from the map
  (off-board).
- **The Base Game's 6/8 adjacency bug disappears.** The original checks 8
  _square-grid_ offsets, not hex adjacency — it computes the correct `oddr`
  table and then never uses it
  (`_generators/base-map-generator.service.ts:69-91`). There is now exactly one
  `neighbors()` implementation, shared by both variants.

Port `_models.tests/SeafarersMap.spec.ts` first, as a characterization test: hex
`(0,0)` has exactly 3 neighbors; hex `(3,1)` has exactly 6, specifically
`(2,1) (2,2) (1,1) (4,1) (4,2) (5,1)`. Translate those offset coordinates to
axial and assert the same adjacency. If the new model reproduces that table, the
topology is right.

---

## 4. Corrections and deliberate changes

§4.2–4.6 and §4.8 are defects that exist in `~/ws/catan` today; do not carry
them over. §4.7 and §4.9 are intentional changes in behavior. §4.1 was believed
to be a defect and is not — see below.

**4.1 Dice chit shortage — investigated in Phase 2, and not real.** This section
originally claimed Seafarers could exhaust its 28-chit bag, because
`Sea: {min: 12}` appears to allow `42 − 12 = 30` resource hexes; the bag would
empty, `getRandomElementFromArray([])` would return `undefined`, and the hex
would render `seafarers/undefined.png`. The prescribed fix was
`Sea: {min: 14, max: 19}`.

That arithmetic ignores the per-terrain **maximums**. Resource hexes are capped
by the resource half of the bag —
`brick 5 + gold 2 + rock 5 + sheep 5 + tree 5 + wheat 5 = 27` — which is below
the 28-chit pool no matter what sea's minimum is. Replaying the original's
`TerrainGenerator` over 200,000 boards per configuration confirms it:

| Setting        | Resource hexes | Sea      | Chit pool | Underruns    |
| -------------- | -------------- | -------- | --------- | ------------ |
| `Sea.min = 12` | [23, 27]       | [15, 19] | 28        | 0 of 200,000 |
| `Sea.min = 14` | [23, 27]       | [15, 19] | 28        | 0 of 200,000 |

Sea's declared minimum of 12 is not even reachable: only 20 of the 24 remainder
tiles are drawn and 17 of them are resources, so at least 3 sea tiles always
come out of the remainder. Raising the minimum to 14 moves neither bound — it
only shifts the sea distribution slightly, which is a change in board character
rather than a fix.

**Decision (with the user):** keep `Sea: {min: 12, max: 19}` as the original
ships it. **Keep the test regardless** — `variants.test.ts` asserts, for every
variant in the registry, that the chit pool is ≥ the maximum possible
resource-hex count. That is what turns an invariant the original merely relied
on into one it is impossible to break silently, and it is what covers the
variants added in Phases 9–10 (§9.8).

**4.2 `removeFirstOccurrence` silently removes the last element** when nothing
matches (`findIndex` → `-1` → `splice(-1, 1)`), `_services/array.service.ts`.
**Fix:** the bag-and-shuffle approach in §5 removes the function entirely.

**4.3 Biased Fisher-Yates** in `BaseMapGenerator.generatePorts` —
`Math.random() * i` instead of `* (i + 1)`, so an element can never stay in
place. **Fix:** one correct seeded `shuffle()` in `src/domain/rng.ts`, used
everywhere.

**4.4 Duplicate sides bias port placement.** `findHexSidesTouchingSea`
concatenates an edge-of-map table with a sea-neighbor scan without deduping, so
a side reachable both ways is twice as likely to be chosen. **Fix:** falls out
of the §3 rewrite — one scan, no table.

**4.5 `clearAllElements()` iterates a live `HTMLCollection` while removing from
it** (`seafarers.component.ts:220`), leaving roughly half the previous board's
images on screen after each regenerate. **Fix:** React renders from state; the
imperative DOM code is gone.

**4.6 O(n) rejection sampling for coordinates.** Both `TerrainGenerator` and
`DiceNumberGenerator` pick random `(row, col)` pairs in a `while` loop until
they land on an unused hex, degrading badly as the board fills. **Fix:** shuffle
the list of eligible coordinates once and consume it with `pop()`.

**4.7 Every island counts, regardless of size** — a deliberate change from the
original, which required `island.size >= 3` and so silently ignored one- and
two-hex islands while still letting them appear on the board
(`_validators/island-counter.service.ts:35-41`). That made the islands slider
lie: a board rendered with five landmasses could report three. **Change:**
`countIslands` returns the number of connected components of resource hexes,
full stop — a lone resource hex surrounded by sea is an island.

Two consequences to expect while building Phase 3:

- The requested island count is now **harder to hit by chance**, because stray
  single hexes that used to be invisible to the validator now push the count
  over. Expect more rejection attempts per board; this is the main reason
  `maxAttempts` (below) needs to be generous.
- The fixture expectations ported from
  `_validators.tests/island-counter.service.spec.ts` must be **recomputed, not
  copied**. The original's "big fat test case" board asserts 2 islands under the
  old size-3 rule; under this rule its true component count may be higher. Count
  the components in the fixture by hand and assert that.

**Measured in Phase 3, and the rejection loop did not survive it.** The
acceptance rate was measured over 300,000 Seafarers boards, and the effect
predicted above is worse than "more attempts": at six islands — the top of the
original's slider — only 0.045% of boards are accepted, about 2,000 attempts
each, and seven islands is unreachable at any sane budget.

| islands | accepted | attempts |
| ------- | -------- | -------- |
| 3       | 6.81%    | ~15      |
| 5       | 0.51%    | ~197     |
| 6       | 0.045%   | ~2,000   |
| 7       | 0.001%   | ~100,000 |

Rather than raise `maxAttempts` to cover that, both hard constraints are now
satisfied **by construction**: islands are grown to the requested count and the
6s and 8s are seated before the rest of the chits are dealt. `maxAttempts` stays
at 1000 — guided placement is what makes that number right — and it still throws
a typed error (`BoardGenerationError`) rather than spinning forever, which is
what the original does when the slider asks for something unlikely. See
`GENERATION.md` for the algorithms, the measurements, and the three balance
rules added alongside them.

**4.8 `listNeighbors` is wrong for two of the 42 Seafarers hexes.** Found in
Phase 1 by running the original's own conversion, inverse, and bounds check
against a plain axial lookup for every hex: 40 agree, 2 do not. Both are on the
west edge, and both have the same cause — `figureOutRow`/`figureOutCol` map an
_off-board_ coordinate onto a real hex instead of rejecting it, because the
inverse is a lookup table with no notion of which coordinates exist.

- Hex `(1,0)`: off-board `(-3,1)` inverts to `(1,0)`, so **the hex is returned
  as its own neighbor**. Any adjacency rule that compares a hex to its neighbors
  — the 6/8 check — is therefore comparing that hex against itself.
- Hex `(2,0)`: off-board `(-3,1)` inverts to `(1,0)`, which is _also_ its
  genuine west neighbor, so **that neighbor is listed twice**. This is the same
  duplicate-bias mechanism as §4.4, in `listNeighbors` rather than in the port
  edge table.

**Fix:** both vanish under §3 — an off-board direction simply misses the map.
`hex.test.ts` keeps a regression for each (no hex is its own neighbor; no
neighbor appears twice), and `shapes.test.ts` asserts the corrected neighbor
sets for these two hexes by name.

**4.9 Three balance rules the original never had** — added in Phase 3, on by
default, and a deliberate change in what a generated board looks like rather
than a fix to anything. They are enforceable at all only because §4.7's
measurements forced the generator to be guided rather than to resample
(`GENERATION.md`); under rejection sampling they would have compounded an
already 0.045% acceptance rate into nothing.

| Rule                     | Default | What it prevents                           |
| ------------------------ | ------- | ------------------------------------------ |
| `minIslandSize`          | 2       | A lone hex counting as one of your islands |
| `noAdjacentEqualNumbers` | `true`  | Two 9s side by side                        |
| `maxVertexPips`          | 12      | One overpowered opening settlement spot    |

`minIslandSize` is the direct counterpart to §4.7: now that a single hex counts
toward the requested total, the generator has to be stopped from producing one,
or asking for six islands hands back five real ones and a rock. All three live
in `BalanceRules` and can be relaxed per call, which is what keeps the
original's exact behavior reproducible for comparison.

---

## 5. Generation pipeline

Pure functions, no classes, no DI container, plain serializable data. Every
function that needs randomness takes an `Rng` as its **last parameter** — never
calls `Math.random()` directly.

```ts
// src/domain/rng.ts
export type Rng = () => number;
export function mulberry32(seed: number): Rng; // seeded PRNG
export function seedFromString(seed: string): number;
export function shuffle<T>(items: readonly T[], rng: Rng): T[]; // correct Fisher-Yates
export function pick<T>(items: readonly T[], rng: Rng): T; // throws on an empty array
```

`pick` throwing is deliberate: the original returned `undefined` from an empty
bag and let it travel to an `<img src>`. One correct `shuffle` also replaces
`removeFirstOccurrence` outright (§4.2) — a bag is shuffled once and consumed,
so nothing is ever removed by predicate.

`generateBoard(variant, options, rng)` in `src/domain/generate.ts` runs:

1. **`placeTerrain`** — build a minimums bag (each terrain × `min`), then a
   remainder bag (each terrain × `max - min`); shuffle both. Grow the requested
   number of islands from spaced seeds and deal the resource terrains over them,
   or scatter the whole bag when no island count is requested. Preserves the
   original's variable sea/gold counts.
2. **`placeNumbers`** — build the chit bag from `settings.diceNumbers`, seat the
   6s and 8s apart, then deal the rest onto the remaining resource hexes. Throw
   if the bag underruns (§4.1).
3. **`placePorts`** — shuffle the port bag and the eligible-hex list; for each
   port, pick a random side from the hex's sea-facing sides. Keep the original's
   deliberate model: **a port belongs to a land hex plus a side**, not to a sea
   tile.
4. **`validate`** — no two 6/8 hexes adjacent, island count (DFS over connected
   resource hexes, **every component counted regardless of size**, §4.7) equal
   to the requested count, and the three balance rules of §4.9. Re-deal on a
   number failure, re-grow on a layout failure, up to `maxAttempts`.

It takes the `Variant` rather than a bare `MapSettings` because step 1 needs the
shape too, and `variants.ts` is the one place the two are paired — passing them
as a unit makes mispairing unrepresentable.

**`docs/GENERATION.md` is the design document for all of this**: why guided
placement replaced the rejection sampling this section originally specified, the
island-growth and chit-seating algorithms, the balance rules, the guarantees
every board carries, and the measured cost. Read it before changing any of
`terrain.ts`, `numbers.ts`, `ports.ts`, `validate.ts` or `generate.ts`.

Settings live in `src/domain/settings.ts` as two plain objects. Seafarers keeps
the original counts unchanged (§4.1); Base Game gets the counts from
`readme_dev.md` — brick 3, desert 1, rock 3, sheep 4, tree 4, wheat 4; chits
2×1, 3–6×2, 8–11×2, 12×1; ports 1 each of rock/wheat/tree/sheep/brick plus 4
"any".

The original's `requiredHexesCount` field is **not** ported — a hex count stored
in the settings can disagree with the shape it describes. The count comes from
the shape, and `src/domain/variants.ts` is the one place the two are paired.
Port counts are plain numbers rather than `{min, max}` ranges: every port count
in every variant is exact, and the original only ever read the `max` of its own
port ranges.

Note the original disables deserts on Seafarers (`Desert: {min: 0, max: 0}`)
even though `readme_dev.md` documents 3, and there is no robber anywhere. Keep
the current behavior; record the discrepancy in §11.

---

## 6. Rendering

`src/domain/layout.ts` holds pointy-top hex geometry — axial → pixel center, and
the six polygon vertices — following the redblobgames layout math the original
already cites. No magic percentage offsets, no background PNG, and none of the
~30 tile images need to be carried over.

Split the tree so the server does the work:

- **`src/app/seafarers/page.tsx`** (and `base-game/page.tsx`) — **server
  components**. Read `searchParams` for `seed` and `islands`, call
  `generateBoard`, render `<BoardSvg board={...} />`. Deterministic output for a
  given URL, and the generator never ships to the browser.
- **`src/components/board/BoardSvg.tsx`** — pure presentational SVG. One
  `<polygon>` per hex filled from a terrain color token, a `<NumberChit>` per
  numbered hex (red text for 6 and 8, per Catan convention), a `<PortMarker>`
  rotated to its side. Give each hex an `aria-label` like `"wheat 8"` so
  component tests can assert board contents by role and name rather than by
  pixel.
- **`src/components/controls/BoardControls.tsx`** — the only `"use client"`
  component. Islands slider and a Regenerate button that pushes a fresh random
  seed into the URL via `useRouter`.

When `seed` is absent the server picks one at random. Surface the resulting seed
in a copyable "share this board" link — the feature the original could not offer
at all.

Home page (`src/app/page.tsx`): two links, Base Game and Seafarers, replacing
the old radio-button-plus-generate-button flow.

---

## 7. Testing

Mirror the reference's tiering rule exactly — **the file extension selects the
tier**:

```ts
// vitest.config.ts — two projects
{ name: "unit",    environment: "happy-dom", include: ["src/**/*.test.ts"] }
{ name: "browser", include: ["src/**/*.test.tsx"],
  setupFiles: ["./src/test/browserSetup.ts"],
  browser: { enabled: true, headless: true, provider: playwright(),
             instances: [{ browser: "chromium" }, { browser: "firefox" },
                         { browser: "webkit" }] } }
```

The browser project's setup file loads `globals.css` and nothing else (added in
Phase 4). The board draws in CSS custom properties, so without the stylesheet in
the page every `var()` would resolve to black and no color assertion could fail.

Scripts follow the reference: `test` runs both projects, plus `test:unit` and
`test:browser` (headed, watch). No coverage gate, matching the reference — the
`CLAUDE.md` rule "everything that can be tested should be tested" carries the
intent instead.

**Unit tier** — the generator domain, and this is where the real coverage lives:

- `hex.test.ts` — the ported adjacency characterization table from §3.
- `rng.test.ts` — same seed produces identical sequences; `shuffle` is unbiased
  over many trials and can leave an element in place (§4.3).
- `shapes.test.ts` — Base Game has 19 hexes, Seafarers 42; no duplicate
  coordinates; every hex's neighbors are symmetric.
- `variants.test.ts` — the chit-pool invariant from §4.1 and its neighbors,
  table-driven over the variant registry so every variant is covered (§9.8).
  `settings.test.ts` pins the transcribed counts themselves.
- `terrain.test.ts` / `numbers.test.ts` / `ports.test.ts` — per-terrain counts
  land within `[min, max]`; every resource hex gets a chit and no sea or desert
  hex does; ports only attach to sea-facing land hexes.
- `validate.test.ts` — hand-built fixture boards for the 6/8 rule and island
  counting, ported from `_validators.tests/`. Reuse the original's "big fat test
  case" 42-hex board as a fixture, but **recompute its expected island count**
  under §4.7 rather than copying the old `2`. Add cases the original could not
  express: a single isolated resource hex counts as one island, and two hexes
  touching only at a corner (not sharing an edge) count as two.
- `generate.test.ts` — **the payoff of seeding**: the same seed yields a
  byte-identical board, different seeds differ, and every board from a sample of
  ~200 seeds satisfies all invariants. This is the test the original could not
  write. Table-driven over the variant registry, and repeated across every
  islands setting the slider offers — which is only affordable because §4.9's
  guided placement made six islands as cheap as three.

**Browser tier** — `BoardSvg.test.tsx` renders a board built from a fixed seed
and asserts the right number of hex polygons, that a 6 and an 8 are never
adjacent in the output, and that chits for 6/8 carry the red styling;
`BoardControls.test.tsx` asserts the slider and regenerate button update the
URL.

---

## 8. The gate, CI, and deployment

**`verify.sh`** at the repo root, same `stage()` helper and fail-fast structure
as the reference's, running: `eslint .` → `prettier --check .` → `tsc --noEmit`
→ `vitest run --project unit` → `vitest run --project browser` → `next build`.

The gate and the CI that wraps it land at different times on purpose. Every
stage above already works as of Phase 0, so **`verify.sh` lands in Phase 1.5**
and each phase from 2 onward ends on one command instead of five remembered
ones. CI and Vercel stay in Phases 6 and 7: the workflow is a thin wrapper with
nothing to wrap until the gate has proven itself locally, and there is no reason
to be debugging a runner while the generator is still being written.

**`.github/workflows/ci.yml`** — the reference deliberately has no CI; we add
one here, and it is a thin wrapper so the two never drift: checkout,
`setup-node@v4` with Node 22 and npm cache, `npm ci`,
`npx playwright install --with-deps`, then `./verify.sh`. Triggers on push to
`main` and on pull requests.

**Vercel** — `git init`, first commit, create the GitHub remote, then link via
`vercel link` and `vercel git connect` (CLI 56.2.1 is already installed).
Next.js needs no `vercel.json`; the reference's SPA rewrite block is meaningless
here and must not be copied.

Leave the old GitHub Pages deployment at `lukeludlow.github.io/catan` running
until the Vercel deploy is verified.

---

## 9. Phased roadmap

Each phase is one session's work and ends in a committable, verifiable state.
Update the status column in place as phases land.

| #   | Phase                                          | Status |
| --- | ---------------------------------------------- | ------ |
| 0   | Repo bootstrap and standards                   | ✅     |
| 1   | Hex topology                                   | ✅     |
| 1.5 | The local gate (`verify.sh`)                   | ✅     |
| 2   | Randomness and settings                        | ✅     |
| 3   | Generation pipeline                            | ✅     |
| 4   | SVG rendering                                  | ✅     |
| 5   | Routes and controls                            | ⬜     |
| 6   | CI and docs                                    | ⬜     |
| 7   | Vercel deploy                                  | ⬜     |
| —   | _milestone: parity with the old app, deployed_ |        |
| 8   | Variant registry and player-count selector     | ⬜     |
| 9   | Base Game 5–6 player extension                 | ⬜     |
| 10  | Seafarers 5–6 player                           | ⬜     |

Phases 0–7 reach parity with the deployed Angular app. Phases 8–10 are new
capability the original never had (§9.8 explains why they are cheap once §3 has
landed) and can be picked up in later sessions without disturbing 0–7.

**Definition of done, every phase:** new code has co-located tests,
`./verify.sh` passes end to end, and the work is committed. Phases 0 and 1
predate the script and run its stages by hand instead. A phase that ends red
does not count as landed.

### Phase 0 — Repo bootstrap and standards

`CLAUDE.md` is written **first, before any other file**, so every later phase is
authored under its rules rather than retrofitted to them.

Deliverables: `git init` + first commit; `CLAUDE.md` (§2.1); this file at
`docs/ROADMAP.md`; `create-next-app` scaffold (TypeScript, App Router, Tailwind,
`src/`, `@/*` alias); generated configs replaced with the §2 versions
(`.prettierrc`, `.prettierignore`, `eslint.config.js`, `tsconfig.json` with
`strict`, `.nvmrc`, `engines`); `vitest.config.ts` with both projects (§7) and a
single trivial passing test to prove each tier runs.

**Done when:** `npm run test:unit` and `npm run test:browser` both execute and
pass, `npx eslint .` and `npx prettier --check .` are clean, and
`npx tsc --noEmit` is clean.

### Phase 1 — Hex topology

The riskiest phase, and everything downstream depends on it.

Deliverables: `src/domain/types.ts`, `hex.ts` (§3), `shapes.ts` (both variant
coordinate lists), plus `hex.test.ts` and `shapes.test.ts`.

**Done when:** the adjacency characterization table ported from
`_models.tests/SeafarersMap.spec.ts` passes — hex `(0,0)` has exactly 3
neighbors, hex `(3,1)` has exactly 6 and they are the expected six. Base Game is
19 hexes, Seafarers 42, no duplicate coordinates, adjacency symmetric. **Do not
start Phase 2 until this passes.**

### Phase 1.5 — The local gate

Pulled forward out of Phase 6 (§8). Every stage it runs already works, and the
phases that follow are where a silent regression is most likely, so the gate
should exist before them rather than after.

Deliverables: `verify.sh` at the repo root, executable, no arguments — the
reference's `stage()` helper and fail-fast structure, minus its `--dist`/`--db`
flags, which have no analogue here.

**Done when:** `./verify.sh` runs all six stages green in the §8 order, and
fails closed — breaking one file's formatting stops the run at `✘ FAIL format`
with exit code 1 rather than carrying on. From here on this script is the
definition of done, and no phase lands without it passing.

### Phase 2 — Randomness and settings

Deliverables: `src/domain/rng.ts` (§5), `settings.ts` (both variants), and
`variants.ts` — the registry, pulled forward out of Phase 8 because §9.8's
table-driven invariant only works if the registry lives in source rather than in
a test file. With tests.

**Done when:** the same seed reproduces an identical sequence across runs; the
shuffle is demonstrably unbiased and can leave an element in place (§4.3); and
the chit-pool invariant from §4.1 passes for both variants — written
**table-driven over a variant registry**, not as two hand-written cases, so the
5–6 player variants in Phases 9–10 are covered for free (§9.8).

### Phase 3 — Generation pipeline

Deliverables: `terrain.ts` → `numbers.ts` → `ports.ts` → `validate.ts` →
`generate.ts`, each with its test, in that order. Plus `distance` and
`vertexTriples` in `hex.ts`, `BalanceRules` in `types.ts`, and
`docs/GENERATION.md`.

**Done when:** `generate.test.ts` shows a fixed seed producing a byte-identical
board across runs, and a ~200-seed sample where every board satisfies every
invariant — terrain counts within `[min, max]`, every resource hex numbered, no
sea or desert numbered, no adjacent 6/8, island count as requested, ports only
on sea-facing land. At this point the whole generator exists with **no React and
no DOM anywhere in it**.

**Landed.** The rejection sampling §5 specified was measured and replaced with
guided placement — see §4.7, §4.9 and `GENERATION.md`. Beyond the invariants
above, every board also satisfies the three balance rules, and a 35,000-board
sweep across both variants and every islands setting produced no failure at
0.42–1.47 ms per board.

### Phase 4 — SVG rendering

Deliverables: `src/domain/layout.ts`, `src/components/board/BoardSvg.tsx`,
`HexTile.tsx`, `NumberChit.tsx`, `PortMarker.tsx`, and `BoardSvg.test.tsx`.

**Done when:** a board is visible for the first time — the browser tier renders
a fixed-seed board across Chromium, Firefox, and WebKit, with the right polygon
count, correct `aria-label`s, red 6/8 chits, and no two 6/8 adjacent.

**Landed.** Three decisions worth recording, all taken during the phase:

- **The palette is CSS custom properties** (`--terrain-wheat` and friends) in
  `globals.css`, referenced from a single `boardColors.ts` whose
  `Record<Terrain, string>` is what makes a missing terrain a type error. They
  live in the plain `:root` block rather than in `@theme`, because Tailwind v4
  drops theme tokens it cannot see used and nothing here uses a utility class.
  Terrain colors do not get a dark-scheme override — only `--hex-stroke` does.
- **Shapes are filled through `style={{ fill }}`, never a `fill="var(…)"`
  presentation attribute**, which is not honored across all three browsers in
  the tier. This is the one line in the phase that a reviewer might "simplify"
  back into a bug, so each component says so where it happens.
- **Tiles carry `data-q`/`data-r`/`data-number`.** The 6/8 rule is a claim about
  what is on screen, so `BoardSvg.test.tsx` reads the coordinates back out of
  the DOM and checks it there; asserting against the `Board` the markup was
  built from would only prove the generator right a second time.

Two deliverables were added beyond the list above: `hexLabel.ts` and
`boardColors.ts` are plain `.ts` modules precisely so their logic — accessible
names, and which numbers are red — is covered by the fast unit tier rather than
by three browser launches. The browser project gained a `setupFiles` entry
(`src/test/browserSetup.ts`) that imports `globals.css`; without the stylesheet
in the page, every `var()` would resolve to black and no color assertion could
fail. `src/test/smoke.test.tsx` is deleted, as its own comment anticipated.

### Phase 5 — Routes and controls

Deliverables: `src/app/layout.tsx`, `globals.css`, `page.tsx` (home),
`base-game/page.tsx`, `seafarers/page.tsx`, `BoardControls.tsx`, and the
share-link affordance.

**Done when:** the manual checks in §10.3 all pass against `npm run dev`, and
`npm run build` shows the board routes as dynamic — confirming the generator
stayed on the server.

### Phase 6 — CI and docs

`verify.sh` itself landed back in Phase 1.5; what is left is running it
somewhere other than this laptop.

Deliverables: `.github/workflows/ci.yml`, `README.md`, and any
`docs/ARCHITECTURE.md` detail that outgrew this file.

**Done when:** the workflow goes green on a pushed branch — which is also the
first time `./verify.sh` runs from a clean `npm ci` and a cold
`npx playwright install --with-deps`, the two things a local run never
exercises.

### Phase 7 — Vercel deploy

Deliverables: GitHub remote, `vercel link`, `vercel git connect`, production
deploy.

**Done when:** a pull request produces a working preview deploy, `main` deploys
to production, and the deployed board pages behave identically to local. Only
then consider retiring the GitHub Pages deployment.

### 9.8 Player-count support (Phases 8–10)

**First, a correction to expectations.** The current `~/ws/catan` does **not**
support a 5–6 player extension. Searching the whole repo for
`player|extension|expansion` returns nothing, and `shouldCreateHexForPosition`
in `_generators/base-map-generator.service.ts:243` produces a 3-4-5-4-3 mask —
19 hexes, the standard 3–4 player board. So this is **new functionality**, not
something to port. Budget for it accordingly.

The good news is that §3 makes it cheap. A variant is fully described by two
pieces of data — a list of axial coordinates and a `MapSettings` object — so
adding one is adding data and tests, with **no new code paths in the
generator**. If Phase 9 or 10 requires touching `terrain.ts`, `numbers.ts`,
`ports.ts`, or `validate.ts`, that is a signal the abstraction from Phase 1
leaked, and the right response is to fix the abstraction rather than
special-case the variant.

To make that true, one thing had to be built correctly back in **Phase 2**, and
was: `src/domain/variants.ts` holds the registry, and `variants.test.ts` is
table-driven over it rather than over two hand-written cases. Every variant
added later is covered for free by the chit-pool invariant, the fillability
check, and the port-capacity check, so a mis-specified new board fails loudly at
test time instead of rendering an `undefined` chit. Phase 2 proved that by
mutation: mispairing Seafarers' settings with the Base Game shape fails the
suite immediately.

#### Phase 8 — Variant registry and player-count selector

Make the variant a first-class parameter rather than two hardcoded routes.

Deliverables: the Phase 2 registry in `src/domain/variants.ts` extended to all
four ids (`base-game`, `base-game-56`, `seafarers`, `seafarers-56`), each entry
pairing a shape with its settings and a display name; routes reworked to
`src/app/[variant]/page.tsx` with `generateStaticParams` over the registry; a
player-count control in `BoardControls.tsx` that switches between the 3–4 and
5–6 entries of the current game and encodes it in the URL (`?players=6`), so a
shared link carries the player count along with the seed.

**Done when:** the two existing variants render through the registry with no
behavior change, the URL round-trips variant + players + seed, and an unknown
variant slug returns a 404 rather than throwing.

#### Phase 9 — Base Game 5–6 player extension

The physical 5–6 player extension board is **30 land hexes**, laid out in rows
of 3-4-5-6-5-4-3, with **2 deserts** and therefore **28 number chits**.

Deliverables: the 30-coordinate shape in `shapes.ts`; a `baseGame56` entry in
`settings.ts`; tests.

Terrain counts to encode — wood 6, wheat 6, sheep 6, brick 5, ore 5, desert 2
(30 total). The chit distribution is 2×2, 3×3, 4×3, 5×3, 6×3, 8×3, 9×3, 10×3,
11×3, 12×2 — 28 chits, which is coincidentally the same distribution Seafarers
uses, so it can be shared rather than duplicated.

**Verify the harbour counts against the physical box before encoding them.** The
tile and chit numbers above are solid; the 5–6 player harbour mix is not, and
guessing there would produce a board that looks right and plays wrong. The
chit-pool invariant test will catch an inconsistent tile/chit pair, but nothing
automated can catch a wrong port count — it has to be read off the components.

**Done when:** the board renders 30 hexes with 2 deserts and 28 chits, no
adjacent 6/8, and the registry test from §9.8 passes for the new entry without
any change to the generator modules.

#### Phase 10 — Seafarers 5–6 player

Larger frame, more sea, more land, scaled bags — the same freeform island
generator this app already uses, not a fixed published scenario. Note that real
Seafarers ships as a set of named scenarios with prescribed maps ("New Shores",
"The Four Islands", …); this app has always generated freeform islands with a
requested island count instead, and Phase 10 keeps that model rather than
implementing scenarios.

Deliverables: the expanded shape in `shapes.ts`; a `seafarers56` entry in
`settings.ts`; tests.

Two things to watch, and re-measure into `GENERATION.md`:

- The bigger frame is where the farthest-point seeding gets tight, so growth may
  stall more often at the top of the slider and this variant may want its own
  `maxAttempts` rather than the shared default. (Single-hex islands are no
  longer the risk they were under §4.7 — §4.9's size floor removes them at
  construction — but a larger board with more islands is exactly where the
  grower has the least room.)
- Sea's `min` must again be set so the maximum possible resource-hex count stays
  within the chit pool (§4.1). Derive it rather than guess: the registry test
  will fail if it is wrong.
- More land means more vertices and a longer pip tail, so §4.9's 12-pip cap may
  reject more than it usefully constrains. Re-measure before shipping.

**The slider is worth extending to 7.** Rejection sampling could not reach seven
islands at all; guided growth succeeds on 5.1% of single attempts, which the
retry loop covers comfortably. Measure it against the 5–6 player frame before
exposing it in Phase 8's controls.

**Done when:** the variant generates within a sane attempt budget across a
~200-seed sample at every islands setting the slider offers, and all invariants
hold.

---

## 10. Verification

**10.1** `./verify.sh` passes every stage from a clean `npm ci`.

**10.2** `npm run test:unit` — the determinism test is the key one: same seed
in, identical board out, across repeated runs and across Node restarts.

**10.3** `npm run dev`, then check by hand:

- `/seafarers?seed=abc123` renders the same board on every reload.
- Changing the islands slider regenerates, and the number of landmasses you can
  count on screen matches the requested value — **including any single-hex
  islands** (§4.7). This is the check that would have failed on the original.
- Regenerate produces a different board and a new `?seed=` in the URL, with **no
  leftover tiles from the previous board** (§4.5).
- No hex ever shows a missing or `undefined` number chit (§4.1) — exercise this
  across a few dozen seeds.
- `/base-game` renders 19 hexes; `/seafarers` renders 42.
- The layout holds on a phone-width viewport (the `CLAUDE.md` mobile-first
  rule).

**10.4** `npm run build` succeeds and the route summary shows the board pages as
dynamic.

**10.5** Compare a few generated boards side by side against the live
`lukeludlow.github.io/catan` for plausibility: tile counts, chit distribution,
no adjacent 6/8.

**10.6** Push to a branch, confirm the Vercel preview deploy builds and CI goes
green, then merge and verify production.

---

## 11. Known behavior carried forward deliberately

Recorded so a future reader does not "fix" them by accident:

- **Seafarers has no deserts.** `Desert: {min: 0, max: 0}` in the original,
  despite `readme_dev.md` documenting 3. Kept as-is.
- **There is no robber.** The original never places one.
- **Ports attach to a land hex plus a side**, not to a sea tile as in physical
  Catan. A deliberate modeling choice, kept.
- **Terrain counts vary run to run.** The remainder bag is larger than the
  number of slots left to fill, so leftovers go unplaced — this is what makes
  sea and gold counts differ between boards, and it is intentional.

Not carried forward, and equally deliberate: the three balance rules of §4.9 are
**new**, so a board from this app will not look like one from
`lukeludlow.github.io/catan` even at the same island count. Islands are blobbier
and never a lone hex, adjacent hexes never share a number, and no single
settlement spot is worth more than 12 pips. §10.5's side-by-side comparison
should check tile counts and chit distribution for plausibility, not expect the
two generators to agree on board character.

## 12. Out of scope

Not part of any phase above; listed to keep them bounded. Expansions beyond
Seafarers (Cities & Knights, Traders & Barbarians), published Seafarers
scenarios with fixed maps, a "fair board" / pip-balancing mode, robber
placement, saved board history, and any porting of the original's ~30 tile PNGs
(§6 replaces them with computed SVG).

Player-count support is **in** scope — Phases 8–10 (§9.8).
