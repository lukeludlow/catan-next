# Architecture

How this repo is organized, and what enforces it. Written in Phase 6, when
`ROADMAP.md` had grown into a good record of _when and why_ each decision was
taken and a poor answer to _where does the code live_.

The division of labour between the three documents:

- **This file** — the layers, the boundaries, and what stops them leaking.
- **[`GENERATION.md`](GENERATION.md)** — how a seed becomes a board, and what
  every board is guaranteed to satisfy.
- **[`ROADMAP.md`](ROADMAP.md)** — the phase history, the defects in the Angular
  original, and the measurements behind the algorithms.

## Contents

- [The layers](#the-layers)
- [The rules that hold them apart](#the-rules-that-hold-them-apart)
- [Variants are data](#variants-are-data)
- [Axial coordinates](#axial-coordinates)
- [The two test tiers](#the-two-test-tiers)
- [The gate](#the-gate)

## The layers

```
src/app/          request → board → SVG, on the server
src/routing/      the query-string contract, both directions
src/components/   the board as markup, and the two client controls
src/domain/       the generator: pure TypeScript
```

Dependencies point downward only. `domain` knows nothing about the other three;
`components` know about `domain`'s types; `app` composes all of them.

### `src/app/` — routes

One dynamic route, `[variant]/page.tsx`, plus a home page listing the registry
and a `not-found.tsx`. It is a **server component**, and that is the point:
`generateBoard` runs on the server and only the finished SVG crosses the wire,
so the generator never ships to the browser and a board is reproducible from its
address.

The route's whole job is four steps — look the variant up, canonicalize the
query, redirect if the address does not already describe the board, generate and
render. There is deliberately no `generateStaticParams`: reading `searchParams`
makes the page dynamic by construction, and an unknown slug is turned away with
an explicit `notFound()`.

### `src/routing/` — the query contract

`boardUrl.ts` owns both directions of `(variant, seed, islands) ↔ URL`:
`parseParams` and `canonicalParams` read, `boardHref` writes, and `isCanonical`
decides whether the route should redirect. Keeping both halves in one module is
what lets the round trip and the redirect's fixed point be ordinary unit tests,
and it is why the route file has almost nothing testable left in it.

It lives outside `src/domain/` because it describes the _app's_ URL shape rather
than the game's rules — and because it is allowed the `Math.random()` that the
domain is banned from, for the caller that wants a fresh seed and by definition
has nothing to derive one from.

### `src/components/` — rendering

`board/` is pure presentation: `BoardSvg.tsx` lays out one `HexTile` per hex,
each with a `NumberChit` and `PortMarker` as applicable. It receives a finished
`Board` and computes no game state. Geometry comes from `domain/layout.ts`
(pointy-top axial → pixel), colors from `boardColors.ts`, accessible names from
`hexLabel.ts`.

`controls/` holds the only two `"use client"` files in the repo —
`BoardControls.tsx` (islands slider, regenerate) and `ShareLink.tsx`. Both do
one thing: change the URL. There is no client-side board state to hold, because
the URL _is_ the state.

Two rendering details that look like accidents and are not, both flagged in the
code where they happen:

- Shapes are filled through `style={{ fill }}`, never a `fill="var(…)"`
  presentation attribute, which is not honored across all three browsers in the
  test tier.
- Tiles carry `data-q` / `data-r` / `data-number`, so component tests can assert
  the no-adjacent-6/8 rule against what is actually on screen rather than
  against the `Board` the markup was built from.

### `src/domain/` — the generator

Pure TypeScript: no React, no DOM, no I/O, no `Math.random()`. Roughly in
dependency order:

| Module                               | Responsibility                               |
| ------------------------------------ | -------------------------------------------- |
| `hex.ts`                             | Axial coordinates, neighbors, distance       |
| `types.ts`                           | The data vocabulary — types only             |
| `shapes.ts`                          | Each variant's coordinate list               |
| `settings.ts`                        | Each variant's bag contents                  |
| `variants.ts`                        | The registry: shape + settings, paired       |
| `rng.ts`                             | Seeded PRNG, `shuffle`, `pick`               |
| `terrain.ts` `numbers.ts` `ports.ts` | The three placement steps                    |
| `validate.ts`                        | The predicates a finished board must satisfy |
| `generate.ts`                        | The retry loops, and the only entry point    |
| `layout.ts`                          | Hex geometry for the SVG                     |

`generateBoard(variant, options, rng)` is the single public entry point.
`GENERATION.md` is the design document for everything under it.

## The rules that hold them apart

Each of these is enforced by a tool, not by good intentions:

**The domain imports no React and no route code.** `eslint.config.mjs` restricts
`^@/(components|app)/` inside `src/domain/**`. The whole testing strategy
depends on the generator staying runnable in the fast tier, so this is a lint
error rather than a convention.

**No parent-relative imports, anywhere.** `^\.\./` is banned repo-wide; every
import goes through the `@/` alias and names its file. There are no barrel
files.

**Randomness is a parameter.** Anything needing it takes an `Rng` as its
**last** argument, so every board is reproducible from its seed. The one
deliberate exception is `routing/boardUrl.ts`, which says so in its header.

**Rendering happens on the server by default.** `"use client"` appears in
exactly two files. If it appears in a third, that is a claim worth justifying in
the file's header comment.

**Non-trivial modules open with a rationale comment** saying why they exist and
what alternative was rejected. This is the repo's defining convention;
`ROADMAP.md` §2 explains where it came from.

## Variants are data

A variant is fully described by two pieces of data — a list of axial coordinates
(`shapes.ts`) and a `MapSettings` (`settings.ts`) — and `variants.ts` is the
only place the two are paired. Adding a board is therefore adding a registry
entry, with **no new code paths in the generator**.

That is load-bearing rather than aspirational. `variants.test.ts` is
table-driven over the registry, so the chit-pool, fillability and port-capacity
invariants cover every variant the day it is added, and a mis-specified board
fails at test time rather than rendering an `undefined` chit. Both the home page
and the `/[variant]` route read the registry too, so neither needs touching
either.

If adding a variant requires editing `terrain.ts`, `numbers.ts`, `ports.ts` or
`validate.ts`, the abstraction has leaked and the right response is to fix the
abstraction — see `ROADMAP.md` §9.8.

## Axial coordinates

The board is a `Map<string, Hex>` keyed by `"q,r"`, and `neighbors()` is six key
lookups over a constant `DIRECTIONS` table. A hex that is not on the board is
simply absent from the map, which is what makes "off-board" and "is sea"
collapse into the same three-line check when finding a coastal side.

There is **no inverse function** — no `(q, r) → (row, col)`, no bounds table, no
per-row special cases. That inverse is where the original's bugs lived (two of
its 42 Seafarers hexes had wrong neighbor lists), and never reintroducing it is
the single most important constraint in this repo. `ROADMAP.md` §3 makes the
full argument.

## The two test tiers

**The file extension selects the tier**, configured in `vitest.config.ts`:

| Extension    | Project   | Environment                              |
| ------------ | --------- | ---------------------------------------- |
| `*.test.ts`  | `unit`    | `happy-dom`, fast                        |
| `*.test.tsx` | `browser` | Chromium, Firefox, WebKit via Playwright |

Tests are co-located — `foo.ts` beside `foo.test.ts`, no `__tests__/`.

This split is why some logic lives in plain `.ts` modules that a component could
just as easily have inlined: `hexLabel.ts`, `boardColors.ts` and `boardUrl.ts`
exist so that string and color logic is covered by the fast tier instead of by
three browser launches. When something in a component is worth testing on its
own, extracting it into a `.ts` module is the idiom.

The browser project loads `src/test/browserSetup.ts`, which imports
`globals.css` and nothing else. The board draws in CSS custom properties, so
without the stylesheet in the page every `var()` would resolve to black and no
color assertion could fail.

## The gate

`./verify.sh` runs six stages, fail-fast, in this order:

```
eslint .  →  prettier --check .  →  typegen + tsc --noEmit
          →  vitest unit  →  vitest browser  →  next build
```

It is the definition of done: no phase lands without it green.
`.github/workflows/ci.yml` is a thin wrapper that installs Node, `npm ci`s,
installs the Playwright engines and calls the same script — so CI and local
cannot disagree about what passing means.

The typecheck stage goes through `npm run typecheck`, which runs `next typegen`
before `tsc`. `PageProps` and `LayoutProps` are globals Next generates into
`.next/types/`; a machine that has ever run `next dev` has them and a clean
checkout does not, so without the typegen the stage passes forever locally and
fails on a fresh clone.
