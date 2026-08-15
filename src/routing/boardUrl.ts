// The query-string contract, both directions (ROADMAP §6, Phase 5).
//
// A board is a pure function of `(variant, seed, islands)`, so those three are
// the app's entire state and they live in the URL rather than in React. That is
// what makes `?seed=abc123` render the same board on every reload and for every
// visitor — the property the Angular original could not offer, because its
// board existed only as DOM it had already thrown away.
//
// Reading and writing the query live in one module on purpose: they are two
// halves of one contract, and keeping them together lets the round-trip
// (`parseParams(boardHref(p)) === p`) and the redirect's fixed point be
// ordinary unit tests. Both are the reason the route file itself has almost
// nothing left to test — the same split Phase 4 made for `hexLabel.ts`, which
// exists so string logic is covered by the fast tier instead of by three
// browser launches.
//
// Not `src/domain/`: this is the app's URL shape, not the game's rules, and it
// is allowed the `Math.random()` that the domain is banned from.

import type { Rng } from "@/domain/rng";
import type { Variant } from "@/domain/variants";

// What Next hands a page as `searchParams`. Repeated keys arrive as an array.
export type Query = Record<string, string | string[] | undefined>;

export type BoardParams = {
    // An arbitrary string, hashed by `seedFromString`, so a hand-typed
    // `?seed=abc123` is as valid as a generated one.
    seed: string;
    // Absent for a variant that declares no islands range — the Base Game has
    // no sea and is always one landmass, so the key would be a control with
    // nothing to control.
    islands?: number;
};

// Six base-36 characters: short enough to read out loud or type from a
// screenshot, and 2.2 billion of them, which is far more board than anyone
// will look at.
const SEED_LENGTH = 6;
const SEED_SPACE = 36 ** SEED_LENGTH;

// Takes an `Rng` for the same reason every generator function does — so a test
// can pin the value — but defaults to `Math.random`, because the caller that
// wants a *fresh* board is precisely the one with no seed to derive it from.
export function randomSeed(rng: Rng = Math.random): string {
    return Math.floor(rng() * SEED_SPACE)
        .toString(36)
        .padStart(SEED_LENGTH, "0");
}

// The first value wins when a key is repeated. `?seed=a&seed=b` is a
// malformed link rather than a request for two boards, and honoring the first
// half of it beats discarding both — the canonical redirect then rewrites the
// URL into single-valued form.
function first(value: string | string[] | undefined): string | undefined {
    return Array.isArray(value) ? value[0] : value;
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
}

// Only what the query actually says, so a caller can tell "absent" from
// "defaulted" — which is what the redirect below needs in order to add the
// missing key rather than silently render a board at an address that does not
// describe it.
export function parseParams(
    query: Query,
    variant: Variant,
): Partial<BoardParams> {
    const seed = first(query.seed);
    const islands = parseIslands(first(query.islands), variant);

    return {
        ...(seed === undefined || seed === "" ? {} : { seed }),
        ...(islands === undefined ? {} : { islands }),
    };
}

// Out-of-range values are clamped rather than rejected: a stale link asking
// for nine islands should still show a board, and the redirect will correct
// its address to the one it actually got.
function parseIslands(
    raw: string | undefined,
    variant: Variant,
): number | undefined {
    if (variant.islands === undefined || raw === undefined || raw === "") {
        return undefined;
    }

    // `Number("")` is 0, not NaN, which would clamp an empty `?islands=` up to
    // the range's minimum instead of leaving it to the default — hence the
    // empty check above rather than a bare `Number.isFinite` guard.
    const value = Number(raw);

    if (!Number.isFinite(value)) {
        return undefined;
    }

    const { min, max } = variant.islands;

    return clamp(Math.round(value), min, max);
}

// The params a URL *means*, with every gap filled: a missing seed becomes a
// fresh one, a missing or unusable islands value becomes the variant's default.
export function canonicalParams(
    query: Query,
    variant: Variant,
    rng: Rng = Math.random,
): BoardParams {
    const given = parseParams(query, variant);

    return {
        seed: given.seed ?? randomSeed(rng),
        ...(variant.islands === undefined
            ? {}
            : { islands: given.islands ?? variant.islands.default }),
    };
}

// One ordered list of key/value pairs, shared by the href builder and the
// canonicality check, so the two can never disagree about what a canonical URL
// looks like.
function queryEntries(
    variant: Variant,
    params: BoardParams,
): [string, string][] {
    const entries: [string, string][] = [["seed", params.seed]];

    if (variant.islands !== undefined && params.islands !== undefined) {
        entries.push(["islands", String(params.islands)]);
    }

    return entries;
}

export function boardHref(variant: Variant, params: BoardParams): string {
    const query = new URLSearchParams(queryEntries(variant, params));

    return `/${variant.id}?${query}`;
}

// Whether the address already spells out exactly these params. The route
// redirects when it does not, which is what turns a bare `/seafarers`, a
// clamped `?islands=99` and a repeated key into one shareable canonical URL —
// and `canonicalParams` being a fixed point of this is what makes that
// redirect provably terminate.
export function isCanonical(
    query: Query,
    variant: Variant,
    params: BoardParams,
): boolean {
    const expected = queryEntries(variant, params);

    return (
        Object.keys(query).length === expected.length &&
        expected.every(([key, value]) => query[key] === value)
    );
}
