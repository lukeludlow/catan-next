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

§4.1–4.6 are defects that exist in `~/ws/catan` today; do not carry them over.
§4.7 is an intentional change in behavior.

**4.1 Dice chit shortage.** Seafarers has 28 chits but `Sea: {min: 12}` allows
up to 30 resource hexes. When the bag empties, `getRandomElementFromArray([])`
returns `undefined`, the hex renders `seafarers/undefined.png`, and the board is
visibly broken. **Fix:** set `Sea: {min: 14, max: 19}`, capping resource hexes
at 28. Add a unit test asserting, for every variant's settings, that the chit
pool size is ≥ the maximum possible resource-hex count — so the invariant is
enforced rather than remembered.

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

The remaining rejection loop — regenerate the whole board until island count and
the 6/8 rule are both satisfied — is inherent to the design and stays. Bound it
with a `maxAttempts` (start at 1000, and revisit once §4.7's effect on the
acceptance rate is measured) and throw a typed error rather than spinning
forever, which is what the current code does when the islands slider asks for an
unlikely value.

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
export function pick<T>(items: readonly T[], rng: Rng): T;
```

`generateBoard(settings, options, rng)` in `src/domain/generate.ts` runs:

1. **`placeTerrain`** — build a minimums bag (each terrain × `min`), then a
   remainder bag (each terrain × `max - min`); shuffle both; fill the shuffled
   coordinate list. Preserves the original's variable sea/gold counts.
2. **`placeNumbers`** — build the chit bag from `settings.diceNumbers`, shuffle,
   deal onto shuffled resource hexes. Throw if the bag underruns (§4.1).
3. **`placePorts`** — shuffle the port bag and the eligible-hex list; for each
   port, pick a random side from the hex's sea-facing sides. Keep the original's
   deliberate model: **a port belongs to a land hex plus a side**, not to a sea
   tile.
4. **`validate`** — no two 6/8 hexes adjacent, and island count (DFS over
   connected resource hexes, **every component counted regardless of size**,
   §4.7) equals the requested count. Retry from step 1 on failure, up to
   `maxAttempts`.

Settings live in `src/domain/settings.ts` as two plain objects. Seafarers keeps
the original counts (with the §4.1 sea correction); Base Game gets the counts
from `readme_dev.md` — brick 3, desert 1, rock 3, sheep 4, tree 4, wheat 4;
chits 2×1, 3–6×2, 8–11×2, 12×1; ports 1 each of rock/wheat/tree/sheep/brick plus
4 "any".

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
  browser: { enabled: true, headless: true, provider: playwright(),
             instances: [{ browser: "chromium" }, { browser: "firefox" },
                         { browser: "webkit" }] } }
```

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
- `settings.test.ts` — the chit-pool invariant from §4.1, for both variants.
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
  write.

**Browser tier** — `BoardSvg.test.tsx` renders a board built from a fixed seed
and asserts the right number of hex polygons, that a 6 and an 8 are never
adjacent in the output, and that chits for 6/8 carry the red styling;
`BoardControls.test.tsx` asserts the slider and regenerate button update the
URL.

---

## 8. CI and deployment

**`verify.sh`** at the repo root, same `stage()` helper and fail-fast structure
as the reference's, running: `eslint .` → `prettier --check .` → `tsc --noEmit`
→ `vitest run --project unit` → `vitest run --project browser` → `next build`.

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
| 1   | Hex topology                                   | ⬜     |
| 2   | Randomness and settings                        | ⬜     |
| 3   | Generation pipeline                            | ⬜     |
| 4   | SVG rendering                                  | ⬜     |
| 5   | Routes and controls                            | ⬜     |
| 6   | Gate and CI                                    | ⬜     |
| 7   | Vercel deploy                                  | ⬜     |
| —   | _milestone: parity with the old app, deployed_ |        |
| 8   | Variant registry and player-count selector     | ⬜     |
| 9   | Base Game 5–6 player extension                 | ⬜     |
| 10  | Seafarers 5–6 player                           | ⬜     |

Phases 0–7 reach parity with the deployed Angular app. Phases 8–10 are new
capability the original never had (§9.8 explains why they are cheap once §3 has
landed) and can be picked up in later sessions without disturbing 0–7.

**Definition of done, every phase:** new code has co-located tests,
`./verify.sh` passes end to end (from Phase 6 onward; before that, the stages
that exist), and the work is committed. A phase that ends red does not count as
landed.

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

### Phase 2 — Randomness and settings

Deliverables: `src/domain/rng.ts` (§5) and `settings.ts` (both variants), with
tests.

**Done when:** the same seed reproduces an identical sequence across runs; the
shuffle is demonstrably unbiased and can leave an element in place (§4.3); and
the chit-pool invariant from §4.1 passes for both variants — written
**table-driven over a variant registry**, not as two hand-written cases, so the
5–6 player variants in Phases 9–10 are covered for free (§9.8).

### Phase 3 — Generation pipeline

Deliverables: `terrain.ts` → `numbers.ts` → `ports.ts` → `validate.ts` →
`generate.ts`, each with its test, in that order.

**Done when:** `generate.test.ts` shows a fixed seed producing a byte-identical
board across runs, and a ~200-seed sample where every board satisfies every
invariant — terrain counts within `[min, max]`, every resource hex numbered, no
sea or desert numbered, no adjacent 6/8, island count as requested, ports only
on sea-facing land. At this point the whole generator exists with **no React and
no DOM anywhere in it**.

### Phase 4 — SVG rendering

Deliverables: `src/domain/layout.ts`, `src/components/board/BoardSvg.tsx`,
`HexTile.tsx`, `NumberChit.tsx`, `PortMarker.tsx`, and `BoardSvg.test.tsx`.

**Done when:** a board is visible for the first time — the browser tier renders
a fixed-seed board across Chromium, Firefox, and WebKit, with the right polygon
count, correct `aria-label`s, red 6/8 chits, and no two 6/8 adjacent.

### Phase 5 — Routes and controls

Deliverables: `src/app/layout.tsx`, `globals.css`, `page.tsx` (home),
`base-game/page.tsx`, `seafarers/page.tsx`, `BoardControls.tsx`, and the
share-link affordance.

**Done when:** the manual checks in §10.3 all pass against `npm run dev`, and
`npm run build` shows the board routes as dynamic — confirming the generator
stayed on the server.

### Phase 6 — Gate and CI

Deliverables: `verify.sh`, `.github/workflows/ci.yml`, `README.md`, and any
`docs/ARCHITECTURE.md` detail that outgrew this file.

**Done when:** `./verify.sh` passes every stage from a clean `npm ci`, and the
workflow goes green on a pushed branch.

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

To make that true, one thing must be built correctly back in **Phase 2**: write
the §4.1 chit-pool invariant test as a **table-driven test over a variant
registry**, not as two hand-written cases. Then every variant added later is
covered by it for free, and a mis-specified new board fails loudly at test time
instead of rendering an `undefined` chit.

#### Phase 8 — Variant registry and player-count selector

Make the variant a first-class parameter rather than two hardcoded routes.

Deliverables: `src/domain/variants.ts` exporting a registry keyed by variant id
(`base-game`, `base-game-56`, `seafarers`, `seafarers-56`), each entry pairing a
shape with its settings and a display name; routes reworked to
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

Two things to watch, both consequences of §4.7 now counting every island:

- The bigger board makes stray single-hex islands **more** likely, so the
  acceptance rate of the rejection loop drops. Measure it before picking
  `maxAttempts` for this variant; it may need its own value rather than the
  shared default.
- Sea's `min` must again be set so the maximum possible resource-hex count stays
  within the chit pool (§4.1). Derive it rather than guess: the registry test
  will fail if it is wrong.

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

## 12. Out of scope

Not part of any phase above; listed to keep them bounded. Expansions beyond
Seafarers (Cities & Knights, Traders & Barbarians), published Seafarers
scenarios with fixed maps, a "fair board" / pip-balancing mode, robber
placement, saved board history, and any porting of the original's ~30 tile PNGs
(§6 replaces them with computed SVG).

Player-count support is **in** scope — Phases 8–10 (§9.8).
