# catan-next

A Catan board generator — Base Game and Seafarers — built with Next.js, React
and inline SVG. It is a port of the Angular 9 app at
[`lukeludlow.github.io/catan`](https://lukeludlow.github.io/catan), rewritten
around axial hex coordinates rather than transliterated.

**The URL is the board.** Every board is a pure function of
`(variant, seed, islands)`, and all three live in the address bar:

```
/seafarers?seed=k3f9qz&islands=4
```

That link renders the same 42 hexes, the same chits and the same harbours on
every reload, on every device, for every person you send it to. The original
could not offer that — it called `Math.random()` from inside four services and
kept the board only as DOM it had already thrown away.

## Quick start

Node 22 (pinned in `.nvmrc` and `engines`), npm only — no yarn, pnpm or bun
lockfile is maintained here.

```bash
nvm use          # or any Node >= 22
npm ci
npm run dev      # http://localhost:3000
```

For the browser test tier you also need the engines once:

```bash
npx playwright install
```

## Scripts

| Command                | What it does                              |
| ---------------------- | ----------------------------------------- |
| `npm run dev`          | Dev server on port 3000                   |
| `npm run build`        | Production build                          |
| `npm start`            | Serve a production build                  |
| `npm test`             | Both test tiers, headless                 |
| `npm run test:unit`    | The fast tier only                        |
| `npm run test:browser` | The browser tier, headed and watching     |
| `npm run lint`         | ESLint                                    |
| `npm run typecheck`    | `tsc --noEmit`                            |
| `npm run format`       | Prettier, writing                         |
| `./verify.sh`          | **All of the above, in order, fail-fast** |

`./verify.sh` is the definition of done. It runs lint → format check → typecheck
→ unit tests → browser tests → build, and stops at the first red stage.
`.github/workflows/ci.yml` is a thin wrapper around that same script, so CI
cannot drift from what runs locally.

## Testing

**The file extension selects the tier**, which is the one convention worth
knowing before you add a test:

- `*.test.ts` → the `unit` project. Fast, `happy-dom`, no browser. This is where
  the generator's coverage lives.
- `*.test.tsx` → the `browser` project. Real Chromium, Firefox and WebKit via
  Playwright, for anything that renders.

Tests sit next to the code they cover — `foo.ts` beside `foo.test.ts`, no
`__tests__/` directories.

## Layout

```
src/
  app/          routes — server components; the board is generated here
  routing/      the query-string contract, both directions
  components/   presentational SVG board, plus the two client controls
  domain/       the generator: pure TypeScript, no React, no DOM
```

`src/domain/` is pure by enforcement rather than by convention — ESLint bans it
from importing React or route code, and nothing in it may call `Math.random()`.
See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the layers and the rules
that hold them apart.

## Docs

| File                                           | Answers                                            |
| ---------------------------------------------- | -------------------------------------------------- |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | How the code is organized, and what enforces it    |
| [`docs/GENERATION.md`](docs/GENERATION.md)     | How a seed becomes a board, and what it guarantees |
| [`docs/ROADMAP.md`](docs/ROADMAP.md)           | Why each decision was taken, phase by phase        |
| [`CLAUDE.md`](CLAUDE.md)                       | The house rules, in seven lines                    |

## Deployment

Vercel — **not yet live.** The deploy is Phase 7 of the roadmap; until it lands,
the running app is still the Angular one on GitHub Pages.
