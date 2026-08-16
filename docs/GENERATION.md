# Board generation

How `src/domain/` turns a seed into a board, why it is built the way it is, and
what it guarantees. Written in Phase 3; `ROADMAP.md` §5 describes the pipeline
this replaced and §9.8 the variants it has to keep working for.

## Contents

- [The shape of the pipeline](#the-shape-of-the-pipeline)
- [Why guided placement, not rejection sampling](#why-guided-placement-not-rejection-sampling)
- [Growing islands](#growing-islands)
- [Seating the red numbers](#seating-the-red-numbers)
- [Balance rules](#balance-rules)
- [The retry loop](#the-retry-loop)
- [Guarantees](#guarantees)
- [Measured cost](#measured-cost)
- [Adding a variant](#adding-a-variant)

## The shape of the pipeline

`generateBoard(variant, options, rng)` in `src/domain/generate.ts` is the only
entry point. Everything it calls is a pure function whose last parameter is an
`Rng`, so a board is fully determined by its seed — the property the Angular
original could not offer, because it called `Math.random()` from inside four
separate services and therefore could not test its own generator for anything
but shape.

```
generate.ts        the two retry loops, and the only public entry point
  terrain.ts       draw the terrain bag, grow the islands, deal the terrain
  numbers.ts       seat the 6s and 8s, then deal the rest of the chits
  ports.ts         attach harbours to coastal land hexes
  validate.ts      the predicates a finished board must satisfy
```

It takes a `Variant` rather than the loose `(settings, options, rng)` that
`ROADMAP.md` §5 specified. Terrain placement needs the shape as well as the
settings, and `variants.ts` exists precisely to be the one place those two are
paired — passing the pair as a unit makes mispairing unrepresentable.

## Why guided placement, not rejection sampling

`ROADMAP.md` §5 specified pure rejection sampling, which is what the original
did: scatter the terrain at random, deal the chits at random, and throw the
whole board away until the island count and the no-adjacent-6/8 rule both happen
to hold.

§4.7 changed one thing about that. The original only counted islands of three
hexes or more, which meant a board rendered with five landmasses could report
three, and the islands slider lied. This port counts every connected component
of resource hexes, however small. §4.7 predicted that would cost acceptance rate
and asked for the effect to be measured before settling `maxAttempts`.

It was measured, over 300,000 Seafarers boards:

| islands | boards accepted | attempts per board |
| ------- | --------------- | ------------------ |
| 1       | 4.57%           | ~22                |
| 2       | 8.84%           | ~11                |
| 3       | 6.81%           | ~15                |
| 4       | 2.58%           | ~39                |
| 5       | 0.51%           | ~197               |
| 6       | 0.045%          | ~2,000             |
| 7       | 0.001%          | ~100,000           |

The original's slider runs 1–6. At the top of it, `maxAttempts: 1000` would have
failed roughly 64% of requests, and no budget makes seven islands reachable.
Raising the cap would have papered over the real problem: rejection sampling
spends all its effort discovering, over and over, that a random scatter is
almost never the board you asked for.

So both hard constraints are now satisfied **by construction** instead. Islands
are grown to the requested count, and the red numbers are seated before anything
else is dealt. What remains in the retry loop is only what genuinely benefits
from resampling.

## Growing islands

`placeTerrain` in `src/domain/terrain.ts`.

The bag is unchanged from the original and from §5: `min` of every terrain, then
a shuffled remainder holding `max - min` of each, truncated to the number of
slots. The remainder is deliberately larger than the slots left to fill, and the
leftovers go unplaced — that is what makes sea and gold counts vary between
boards (`ROADMAP.md` §11), and it is preserved exactly.

What changed is where the land goes:

1. **Draw the bag** and count how many resource terrains came out. Call it `L`.
   Desert and sea are not resource terrains, matching the original's
   `isResourceTerrain()`.
2. **Place `k` seeds** by greedy farthest-point sampling: start somewhere
   random, then repeatedly take the candidate furthest from everything chosen so
   far. Reject the layout if the best remaining candidate is within distance 2
   of an existing seed — two seeds any closer would merge on the first growth
   step. Spreading the seeds first is what makes six islands fit at all; seeded
   at random they clump, and a clumped seed has nowhere to grow.
3. **Grow every island to the size floor first**, one hex at a time, before any
   island takes a spare hex. Growing them to target one at a time instead lets
   an early island eat the room a later one needed.
4. **Round-robin the rest**: pick a random island that can still grow and give
   it one random legal frontier hex. A hex is legal for island `i` if it is on
   the board, unclaimed, and touches no _other_ island. That single separation
   rule is what makes the final count exact.
5. **Stop at `L`**, deal the resource terrains across all the land at once, and
   pour sea and desert into everything left over.

Boards with no island constraint — both Base Game boards, which have no sea and
so are always one landmass — skip growth entirely and scatter the bag as §5
wrote it. Growing a single island over 18 of 19 hexes would leave the desert
wherever the growth failed to reach, which is reliably the perimeter. That is a
board-character regression for no gain, so the branch stays.

## Seating the red numbers

`placeNumbers` in `src/domain/numbers.ts`.

The official rule is that 6 and 8 — the red numbers — may not touch. Dealing all
the chits at random and checking afterwards passes 23.4% of the time on
Seafarers and 13.3% on the Base Game, and that factor multiplies the cost of
every other constraint.

Instead, the reds are seated first, each onto a shuffled resource hex that has
no red neighbour yet; the remaining chits are then dealt freely onto whatever is
left. The distribution of everything except the reds is exactly what a plain
shuffle would give. Across 20,000 boards per variant this produced no violation
and no failure to seat.

Seating is greedy, not a search: on a board tight enough that the first red
takes the only hex the second one needed, `placeNumbers` returns `null` rather
than backtracking, and the caller deals again. That path is exercised by a
hand-built three-hex fixture in `numbers.test.ts`; it has never been observed on
a real board.

A chit bag too small to cover the board's resource hexes is a different kind of
problem — a mis-specified variant, not an unlucky board — so it throws.
`variants.test.ts` proves no shipped variant can reach it (`ROADMAP.md` §4.1).

## Balance rules

Three constraints beyond the official rule, all new in this port and all on by
default. They live in `BalanceRules` (`types.ts`) with the policy in
`DEFAULT_BALANCE` (`validate.ts`), and any of them can be relaxed per call.

| Rule                     | Default | What it prevents                           |
| ------------------------ | ------- | ------------------------------------------ |
| `minIslandSize`          | 2       | A lone hex counting as one of your islands |
| `noAdjacentEqualNumbers` | `true`  | Two 9s side by side                        |
| `maxVertexPips`          | 12      | One overpowered opening settlement spot    |

`minIslandSize` is the counterpart to §4.7. Now that a single hex counts toward
the requested total, the grower has to be stopped from producing one — otherwise
asking for six islands can hand back five real ones and a rock. It costs
nothing, because the grower enforces it while building rather than by rejection.

`maxVertexPips` is measured over `vertexTriples` in `hex.ts`: every place three
hexes meet, which is where a settlement goes. A 6 or 8 is worth 5 pips, a 2 or
12 one. Seafarers has 62 such vertices, the Base Game 24, and its 5–6 player
extension 42. Left unbounded, guided boards put a 13-pip vertex on 34% of
Seafarers boards and 54% of Base Game boards — see "Measured cost" below for
what the cap costs on the extension board, which is where it bites hardest.

The last two are the only rules still enforced by resampling — they depend on
the whole deal, so there is nothing to construct them from. Together they cost
roughly 5 to 17 re-deals, against a layout that is kept.

## The retry loop

Two nested bounded loops, because the constraints genuinely separate: the island
count depends only on the terrain layout, and every number rule depends only on
the deal laid over it. Re-dealing chits onto a layout that already has the right
islands is far cheaper than throwing the layout away.

```
for up to maxAttempts (default 1000) terrain layouts:
    grow a layout; if it failed, try another
    for up to 200 deals on that layout:
        deal the chits; if a red could not be seated, deal again
        check the balance rules; if one fails, deal again
        attach the ports; if the coast is too short, abandon the layout
        return the board
throw BoardGenerationError
```

One `Rng` threads through every attempt without being reset, so a rejected board
advances the stream rather than replaying it. The whole loop is still
deterministic from the seed, and a retry cannot loop forever reproducing the
same board.

`maxAttempts` stays at the 1000 `ROADMAP.md` §4.7 originally proposed. Guided
placement is what makes that number right again: it is now a runaway guard
rather than a budget anyone is expected to spend.

## Guarantees

Every board `generateBoard` returns satisfies all of the following.
`generate.test.ts` asserts them over a 200-seed sample per variant and per
islands setting.

- Every coordinate of the variant's shape is filled exactly once, and the hexes
  are keyed and ordered by that shape.
- Every terrain count lies within its `[min, max]`.
- Every resource hex carries a dice number; no sea or desert hex does.
- No number is dealt more often than the variant's bag holds it.
- No 6 or 8 is adjacent to a 6 or 8.
- No two adjacent hexes share a dice number.
- No vertex is worth more than 12 pips.
- The island count is exactly what was requested, and no island is smaller than
  two hexes.
- Every port sits on a resource hex, on a side facing sea or the edge of the
  board, and the ports placed are exactly the variant's bag.
- The same seed produces a byte-identical board, across runs and across process
  restarts.

## Measured cost

End to end, against the real implementation: 5,000 boards per configuration, one
shared `Rng`, default options.

| Configuration     | Boards | Failures | ms/board |
| ----------------- | ------ | -------- | -------- |
| Base Game         | 5,000  | 0        | 0.42     |
| Base Game 5–6     | 5,000  | 0        | 4.33     |
| Seafarers, 1 isle | 5,000  | 0        | 1.47     |
| Seafarers, 2      | 5,000  | 0        | 0.92     |
| Seafarers, 3      | 5,000  | 0        | 0.73     |
| Seafarers, 4      | 5,000  | 0        | 0.60     |
| Seafarers, 5      | 5,000  | 0        | 0.53     |
| Seafarers, 6      | 5,000  | 0        | 0.55     |

40,000 boards, no failures. One island is the _slowest_ Seafarers setting, not
the fastest: a single landmass concentrates the chits, so the pip cap and the
adjacent-numbers rule both bite harder and it takes more re-deals. Compare the
~2,000 attempts and ~40 ms that six islands cost under rejection sampling.

**The Base Game 5–6 player board is the most expensive in the app**, at ten
times its 3–4 player counterpart, and Phase 9 measured why rather than leaving
it as a surprise. It is 28 numbered hexes out of 30 with three of every middle
number — the densest deal here, and the one with the least room to satisfy a
rule. Relaxing `maxVertexPips` to infinity takes it from 4.33 ms to 1.86, so a
little over half the cost is the pip cap and the rest is board size and
`noAdjacentEqualNumbers`. Left uncapped, **57.4% of its boards carry a 13-pip
vertex**, against 44.7% for the 3–4 player board over the same run:

| Configuration | Vertices | 13-pip vertex, uncapped | ms/board capped | uncapped |
| ------------- | -------- | ----------------------- | --------------- | -------- |
| Base Game     | 24       | 44.7%                   | 0.42            | 0.26     |
| Base Game 5–6 | 42       | 57.4%                   | 4.33            | 1.86     |

The cap stays at 12. Four milliseconds on a request that renders one board is
not a cost worth trading a balance rule for, and the retry loop absorbs it with
no failures in 5,000 — the 200-deal ceiling per layout is nowhere near reached.
This is also a partial answer to the question Phase 10 is asked below: the pip
cap does reject more on a bigger board, and it is still affordable.

Terrain growth alone, single attempt, 3,000 layouts per setting:

| islands  | 1–3  | 4     | 5     | 6     | 7    |
| -------- | ---- | ----- | ----- | ----- | ---- |
| succeeds | 100% | 99.9% | 94.3% | 53.8% | 5.1% |

## Adding a variant

`ROADMAP.md` §9.8 is the contract: a variant is a shape plus a `MapSettings`, so
adding one is adding data to `shapes.ts`, `settings.ts` and `variants.ts` — no
new code paths in the generator. If a new variant requires touching
`terrain.ts`, `numbers.ts`, `ports.ts` or `validate.ts`, the abstraction leaked
and the right response is to fix the abstraction rather than special-case the
variant.

Two things to re-measure when Phase 10 adds the larger Seafarers frame, and to
record in the tables above:

- **The growth success rate at the top of the slider.** A bigger frame with more
  islands is where the farthest-point seeding gets tight, and it may want its
  own `maxAttempts`.
- **The pip cap.** More land means more vertices and a longer tail, so 12 pips
  may reject more than it usefully constrains.
