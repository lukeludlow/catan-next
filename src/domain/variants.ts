// The variant registry (ROADMAP §9.8). A variant is fully described by two
// pieces of data — a list of axial coordinates and a `MapSettings` — so adding
// one is adding data, with no new code paths in the generator. This file is
// what makes that literally true by being the only place the two halves are
// paired.
//
// It lands in Phase 2 rather than Phase 8, its original home, for one reason:
// §9.8 requires the chit-pool invariant to be table-driven over a registry so
// that every variant added later is covered by it the day it is added. A table
// living in the test file would not do that.
//
// Phase 8 added the second axis. A *game* is what the URL names; a *variant* is
// one game at one player count. Until then the two were the same thing and
// `Variant.id` doubled as the route slug, which stops working the moment
// `/base-game` has to mean two different boards. Splitting them is what lets
// the player count be a query parameter (`?players=6`) rather than a second
// route — so a shared link carries it, and switching player count keeps the
// seed.

import type { Axial } from "@/domain/hex";
import {
    BASE_GAME_56_SETTINGS,
    BASE_GAME_SETTINGS,
    SEAFARERS_56_SETTINGS,
    SEAFARERS_SETTINGS,
} from "@/domain/settings";
import {
    BASE_GAME_56_SHAPE,
    BASE_GAME_SHAPE,
    SEAFARERS_56_SHAPE,
    SEAFARERS_SHAPE,
} from "@/domain/shapes";
import type { MapSettings } from "@/domain/types";

// The URL segment, which is why these are kebab-case strings rather than an
// enum. A game is not rendered anywhere and so carries no display name: the
// heading, the title and the home page card all name a *variant*.
export type GameId = "base-game" | "seafarers";

export type VariantId =
    "base-game" | "base-game-56" | "seafarers" | "seafarers-56";

// 4 means the 3-4 player board, 6 the 5-6 player extension. The physical boxes
// are labelled by their upper bound, and so is `?players=`.
export type PlayerCount = 4 | 6;

// What the islands control is allowed to ask this variant for, or `undefined`
// when the variant has no sea and is therefore always one landmass. Data on the
// registry rather than a constant inside the control, for the same reason the
// shape and the settings are — and Phase 10 collected on that: the 5-6 player
// Seafarers frame raised the ceiling to 7, and neither the slider nor the URL
// parser was edited to follow. Whether a slider is drawn at all is
// `variant.islands !== undefined`, never a comparison against an id.
export type IslandRange = { min: number; max: number; default: number };

export type Variant = {
    id: VariantId;
    // The one name a reader ever sees: the home page card, the `<h1>` and the
    // document title. "Base Game", "Base Game Extension", "Seafarers",
    // "Seafarers Extension".
    name: string;
    // Which route segment this variant lives under. The back-reference is what
    // lets anything holding a variant build its own address without first
    // searching the games for the one that lists it.
    game: GameId;
    players: PlayerCount;
    shape: readonly Axial[];
    settings: MapSettings;
    islands?: IslandRange;
};

// A list rather than a `Record<PlayerCount, Variant>`, because a game need not
// offer both. Both do as of Phase 10, but the list is what let Seafarers ship
// with one entry for two phases without a hole in a record.
// It is also what the player control keys off — `variants.length > 1` decides
// whether the control is drawn at all, in the same spirit as
// `variant.islands !== undefined` deciding the slider. No control ever compares
// against an id.
export type Game = {
    id: GameId;
    // Ascending by player count; the first entry is what a URL without an
    // explicit (or with an unusable) `?players=` resolves to.
    variants: readonly Variant[];
};

export const VARIANTS: Readonly<Record<VariantId, Variant>> = {
    "base-game": {
        id: "base-game",
        name: "Base Game",
        game: "base-game",
        players: 4,
        shape: BASE_GAME_SHAPE,
        settings: BASE_GAME_SETTINGS,
    },
    "base-game-56": {
        id: "base-game-56",
        name: "Base Game Extension",
        game: "base-game",
        players: 6,
        shape: BASE_GAME_56_SHAPE,
        settings: BASE_GAME_56_SETTINGS,
    },
    seafarers: {
        id: "seafarers",
        name: "Seafarers",
        game: "seafarers",
        players: 4,
        shape: SEAFARERS_SHAPE,
        settings: SEAFARERS_SETTINGS,
        // The original's slider, transcribed: floor 1, ceil 6, starting at 3
        // (`_seafarers/seafarers.component.ts:17`). generate.test.ts already
        // sweeps every value in that range at 60 seeds each, so the control
        // cannot offer a setting the generator has not been proven to hit.
        islands: { min: 1, max: 6, default: 3 },
    },
    "seafarers-56": {
        id: "seafarers-56",
        name: "Seafarers Extension",
        game: "seafarers",
        players: 6,
        shape: SEAFARERS_56_SHAPE,
        settings: SEAFARERS_56_SETTINGS,
        // One higher than the 3-4 board, and the ceiling is a property of the
        // frame rather than of the game: this one is ten hexes larger and nearly
        // all of them ocean, so seeds have room to spread and single-attempt
        // growth at seven islands succeeds 92.8% of the time — against 5.1% on
        // the 42-hex frame, which is why that board stays at 6. Seven was
        // unreachable at any budget under ROADMAP §5's rejection sampling.
        // GENERATION.md carries both measurements.
        islands: { min: 1, max: 7, default: 3 },
    },
};

export const ALL_VARIANTS: readonly Variant[] = Object.values(VARIANTS);

export const GAMES: Readonly<Record<GameId, Game>> = {
    "base-game": {
        id: "base-game",
        variants: [VARIANTS["base-game"], VARIANTS["base-game-56"]],
    },
    seafarers: {
        id: "seafarers",
        variants: [VARIANTS.seafarers, VARIANTS["seafarers-56"]],
    },
};

export const ALL_GAMES: readonly Game[] = Object.values(GAMES);

// Lookup by an untrusted string — a URL segment. A search rather than an index
// with a cast, because `GAMES[slug as GameId]` types the result as a `Game`
// that is really `undefined`, which is exactly the lie that would send an
// unknown slug into the generator instead of into a 404.
export function gameById(id: string): Game | undefined {
    return ALL_GAMES.find((game) => game.id === id);
}

export function variantById(id: string): Variant | undefined {
    return ALL_VARIANTS.find((variant) => variant.id === id);
}

// Total, deliberately: a player count this game does not offer resolves to its
// default board rather than to `undefined`. `?players=6` on a game that has no
// 5-6 entry yet is a stale or hand-edited link, and the canonical redirect then
// rewrites the address to the board it actually got — the same lenient posture
// `parseIslands` takes for `?islands=99`.
export function variantFor(game: Game, players: PlayerCount): Variant {
    return (
        game.variants.find((variant) => variant.players === players) ??
        game.variants[0]
    );
}
