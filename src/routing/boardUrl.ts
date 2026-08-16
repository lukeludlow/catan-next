// The query-string contract, both directions (ROADMAP §6, Phase 5).
//
// A board is a pure function of `(game, players, seed, islands)`, so those four
// are the app's entire state and they live in the URL rather than in React.
// That is what makes `?seed=abc123` render the same board on every reload and
// for every visitor — the property the Angular original could not offer,
// because its board existed only as DOM it had already thrown away.
//
// Reading and writing the query live in one module on purpose: they are two
// halves of one contract, and keeping them together lets the round-trip
// (`parseParams(boardHref(p)) === p`) and the redirect's fixed point be
// ordinary unit tests. Both are the reason the route file itself has almost
// nothing left to test — the same split Phase 4 made for `hexLabel.ts`, which
// exists so string logic is covered by the fast tier instead of by three
// browser launches.
//
// Phase 8 added `players`. It takes a `Game` where it used to take a `Variant`,
// because which variant a URL means is now something this module *decides*
// rather than something it is told — and deciding it is the first thing every
// function here has to do, since the islands range differs per player count.
//
// Not `src/domain/`: this is the app's URL shape, not the game's rules, and it
// is allowed the `Math.random()` that the domain is banned from.

import type { Rng } from "@/domain/rng";
import type { Game, PlayerCount, Variant } from "@/domain/variants";
import { variantFor } from "@/domain/variants";

// What Next hands a page as `searchParams`. Repeated keys arrive as an array.
export type Query = Record<string, string | string[] | undefined>;

export type BoardParams = {
    // An arbitrary string, hashed by `seedFromString`, so a hand-typed
    // `?seed=abc123` is as valid as a generated one.
    seed: string;
    // Always present, unlike `islands`: every board is for some number of
    // players, so every canonical address says which — a link to the 5-6 player
    // board is otherwise indistinguishable from a link to the 3-4 player one.
    players: PlayerCount;
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

// The player count a query asks for, or the game's default. Unlike `islands`
// this never reports "absent": a game always has a default board, and an
// unrecognised or not-offered count resolves to it rather than to `undefined`.
// `parseParams` reports absence separately, by comparing against the default.
function resolvePlayers(raw: string | undefined, game: Game): PlayerCount {
    const fallback = game.variants[0].players;
    const value = Number(raw);
    const offered = game.variants.find(
        (variant) => variant.players === value,
    )?.players;

    return offered ?? fallback;
}

// Which board a query is asking for, without inventing a seed for it. Exported
// for `generateMetadata`, which needs the variant's name and nothing else —
// going through `canonicalParams` there would mint a random seed it then throws
// away, on a code path that runs for every request.
export function playersFromQuery(query: Query, game: Game): PlayerCount {
    return resolvePlayers(first(query.players), game);
}

// Only what the query actually says, so a caller can tell "absent" from
// "defaulted" — which is what the redirect below needs in order to add the
// missing key rather than silently render a board at an address that does not
// describe it.
export function parseParams(query: Query, game: Game): Partial<BoardParams> {
    const seed = first(query.seed);
    const rawPlayers = first(query.players);
    const players = resolvePlayers(rawPlayers, game);
    const islands = parseIslands(
        first(query.islands),
        variantFor(game, players),
    );

    return {
        ...(seed === undefined || seed === "" ? {} : { seed }),
        // Reported only when the query names a count this game actually offers.
        // `?players=99` is not a request the address describes, so it is left
        // for `canonicalParams` to fill and for the redirect to correct.
        ...(rawPlayers !== undefined && String(players) === rawPlayers
            ? { players }
            : {}),
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
// fresh one, a missing or unusable player count becomes the game's default, and
// a missing or unusable islands value becomes the variant's default.
export function canonicalParams(
    query: Query,
    game: Game,
    rng: Rng = Math.random,
): BoardParams {
    const given = parseParams(query, game);
    const players = resolvePlayers(first(query.players), game);

    return {
        seed: given.seed ?? randomSeed(rng),
        players,
        ...islandsEntry(variantFor(game, players), given.islands),
    };
}

// The `islands` half of a `BoardParams`, present only when the variant has a
// range to clamp it into. Shared by `canonicalParams` and `paramsForPlayers` so
// switching player count cannot leave an islands value the new variant would
// never have produced.
function islandsEntry(
    variant: Variant,
    given: number | undefined,
): { islands?: number } {
    if (variant.islands === undefined) {
        return {};
    }

    const { min, max, default: fallback } = variant.islands;

    return { islands: given === undefined ? fallback : clamp(given, min, max) };
}

// The same board request at a different player count. The islands value is
// re-clamped against the target variant rather than carried over verbatim, so
// the control pushes an address that is already canonical instead of one that
// bounces through the route's redirect.
export function paramsForPlayers(
    game: Game,
    params: BoardParams,
    players: PlayerCount,
): BoardParams {
    return {
        seed: params.seed,
        players,
        ...islandsEntry(variantFor(game, players), params.islands),
    };
}

// One ordered list of key/value pairs, shared by the href builder and the
// canonicality check, so the two can never disagree about what a canonical URL
// looks like.
function queryEntries(game: Game, params: BoardParams): [string, string][] {
    const entries: [string, string][] = [
        ["seed", params.seed],
        ["players", String(params.players)],
    ];

    const variant = variantFor(game, params.players);

    if (variant.islands !== undefined && params.islands !== undefined) {
        entries.push(["islands", String(params.islands)]);
    }

    return entries;
}

export function boardHref(game: Game, params: BoardParams): string {
    const query = new URLSearchParams(queryEntries(game, params));

    return `/${game.id}?${query}`;
}

// Whether the address already spells out exactly these params. The route
// redirects when it does not, which is what turns a bare `/seafarers`, a
// clamped `?islands=99` and a repeated key into one shareable canonical URL —
// and `canonicalParams` being a fixed point of this is what makes that
// redirect provably terminate.
export function isCanonical(
    query: Query,
    game: Game,
    params: BoardParams,
): boolean {
    const expected = queryEntries(game, params);

    return (
        Object.keys(query).length === expected.length &&
        expected.every(([key, value]) => query[key] === value)
    );
}
