import { describe, expect, test } from "vitest";
import { RESOURCE_TERRAINS } from "@/domain/settings";
import type { MapSettings, Terrain } from "@/domain/types";
import {
    ALL_GAMES,
    ALL_VARIANTS,
    GAMES,
    VARIANTS,
    gameById,
    variantById,
    variantFor,
} from "@/domain/variants";
import type { Game, GameId, Variant, VariantId } from "@/domain/variants";

// These helpers mirror the bag algorithm the generator will run in Phase 3:
// place `min` of every terrain, then fill the remaining slots from a bag
// holding `max - min` of each. So the number of resource hexes on a finished
// board is bounded by the resource half of that bag, never by the board size
// alone — which is exactly the arithmetic ROADMAP §4.1 originally got wrong.

function sumOver(
    settings: MapSettings,
    terrains: readonly Terrain[],
    of: (count: { min: number; max: number }) => number,
): number {
    return terrains.reduce(
        (total, terrain) => total + of(settings.terrainCounts[terrain]),
        0,
    );
}

function terrainsOf(settings: MapSettings): Terrain[] {
    return Object.keys(settings.terrainCounts) as Terrain[];
}

function otherTerrains(settings: MapSettings): Terrain[] {
    return terrainsOf(settings).filter(
        (terrain) => !RESOURCE_TERRAINS.includes(terrain),
    );
}

function slotsFilledFromRemainder({ shape, settings }: Variant): number {
    return shape.length - sumOver(settings, terrainsOf(settings), (c) => c.min);
}

// The most resource hexes any board of this variant can end up with: every
// resource minimum, plus as much of the resource remainder as there are slots
// to hold it.
function maxResourceHexes(variant: Variant): number {
    const { settings } = variant;

    return (
        sumOver(settings, RESOURCE_TERRAINS, (c) => c.min) +
        Math.min(
            slotsFilledFromRemainder(variant),
            sumOver(settings, RESOURCE_TERRAINS, (c) => c.max - c.min),
        )
    );
}

// The mirror: the fewest, reached when the remainder bag gives up as much sea
// and desert as it can.
function minResourceHexes(variant: Variant): number {
    const { shape, settings } = variant;
    const others = otherTerrains(settings);

    return (
        shape.length -
        sumOver(settings, others, (c) => c.min) -
        Math.min(
            slotsFilledFromRemainder(variant),
            sumOver(settings, others, (c) => c.max - c.min),
        )
    );
}

function chitPoolSize(settings: MapSettings): number {
    return Object.values(settings.diceNumbers).reduce((a, b) => a + b, 0);
}

function portCount(settings: MapSettings): number {
    return Object.values(settings.ports).reduce((a, b) => a + b, 0);
}

// ROADMAP §9.8: table-driven over the registry rather than written out per
// variant, so the 5-6 player boards added in Phases 9-10 are covered by every
// invariant below on the day they are added, and a mis-specified variant fails
// here instead of rendering a broken board.
describe.each(ALL_VARIANTS)("$name", (variant) => {
    const { shape, settings } = variant;

    // ROADMAP §4.1. The invariant the original relied on without stating: a
    // board can never contain more resource hexes than there are chits to put
    // on them. Both variants satisfy it today — Seafarers 27 against 28, Base
    // Game 18 against 18, with no slack at all — which is precisely why it is
    // worth pinning before anyone adds a third variant.
    test("has at least one dice chit per possible resource hex", () => {
        expect(maxResourceHexes(variant)).toBeLessThanOrEqual(
            chitPoolSize(settings),
        );
    });

    // What the original's `requiredHexesCount` asserted implicitly, and could
    // get wrong because it was a separate number from the board it described.
    test("has enough terrain to fill the board, and not too much", () => {
        const mins = sumOver(settings, terrainsOf(settings), (c) => c.min);
        const maxes = sumOver(settings, terrainsOf(settings), (c) => c.max);

        expect(mins).toBeLessThanOrEqual(shape.length);
        expect(shape.length).toBeLessThanOrEqual(maxes);
    });

    // Ports attach to land, never to sea or desert
    // (`_generators/port-generator.service.ts:155`), so the port bag has to fit
    // on the smallest board of resource hexes the variant can produce.
    test("has somewhere to put every port", () => {
        expect(portCount(settings)).toBeLessThanOrEqual(
            minResourceHexes(variant),
        );
    });

    test("declares a count for every terrain", () => {
        expect(terrainsOf(settings).sort()).toEqual([
            "brick",
            "desert",
            "gold",
            "rock",
            "sea",
            "sheep",
            "tree",
            "wheat",
        ]);
    });

    test("has sane terrain counts", () => {
        for (const terrain of terrainsOf(settings)) {
            const { min, max } = settings.terrainCounts[terrain];

            expect(min).toBeGreaterThanOrEqual(0);
            expect(min).toBeLessThanOrEqual(max);
        }
    });

    test("has sane dice numbers", () => {
        for (const [number, count] of Object.entries(settings.diceNumbers)) {
            expect(Number(number)).toBeGreaterThanOrEqual(2);
            expect(Number(number)).toBeLessThanOrEqual(12);
            expect(Number(number)).not.toBe(7);
            expect(count).toBeGreaterThan(0);
        }
    });

    test("has at least one port", () => {
        expect(portCount(settings)).toBeGreaterThan(0);

        for (const count of Object.values(settings.ports)) {
            expect(count).toBeGreaterThan(0);
        }
    });

    // The islands control reads its bounds off the registry (Phase 5), so a
    // range that disagreed with itself would put a setting on screen that the
    // generator cannot satisfy.
    test("offers a sane islands range, or none at all", () => {
        if (variant.islands === undefined) {
            return;
        }

        const { min, max, default: fallback } = variant.islands;

        expect(min).toBeGreaterThanOrEqual(1);
        expect(min).toBeLessThanOrEqual(fallback);
        expect(fallback).toBeLessThanOrEqual(max);
    });

    // A slider on a board that cannot contain sea would be a control with
    // nothing to control: with no sea in the bag every hex is land and the
    // board is one landmass whatever the URL asks for.
    test("offers an islands range only if it can have sea", () => {
        expect(variant.islands !== undefined).toBe(
            settings.terrainCounts.sea.max > 0,
        );
    });

    // The whole board is land minus the sea maximum, so an islands ceiling
    // above that is unreachable however many attempts the generator spends.
    test("cannot ask for more islands than it has land", () => {
        if (variant.islands === undefined) {
            return;
        }

        expect(variant.islands.max).toBeLessThanOrEqual(
            shape.length - settings.terrainCounts.sea.min,
        );
    });
});

describe("the registry", () => {
    test("holds every variant", () => {
        expect(Object.keys(VARIANTS).sort()).toEqual([
            "base-game",
            "base-game-56",
            "seafarers",
            "seafarers-56",
        ]);
    });

    test("keys every entry by its own id", () => {
        for (const [id, variant] of Object.entries(VARIANTS)) {
            expect(variant.id).toBe(id as VariantId);
        }
    });

    test("gives every variant a distinct display name", () => {
        const names = ALL_VARIANTS.map((variant) => variant.name);

        expect(new Set(names).size).toBe(names.length);
    });

    // The pairing is the whole point of this file: a variant whose settings and
    // shape came from different boards would pass every test above.
    test("pairs each variant with a board of the expected size", () => {
        expect(VARIANTS["base-game"].shape).toHaveLength(19);
        expect(VARIANTS["base-game-56"].shape).toHaveLength(30);
        expect(VARIANTS.seafarers.shape).toHaveLength(42);
        expect(VARIANTS["seafarers-56"].shape).toHaveLength(52);
    });

    test("finds every variant by its own id", () => {
        for (const variant of ALL_VARIANTS) {
            expect(variantById(variant.id)).toBe(variant);
        }
    });
});

// The second axis, added in Phase 8: a game is what the URL names, a variant is
// one game at one player count. Everything here exists to keep the two halves
// of that split from drifting apart — a variant listed under the wrong game, or
// a game listing a variant the registry does not hold, would both render a
// board at an address that cannot reach it.
describe("the games", () => {
    test("holds every game", () => {
        expect(Object.keys(GAMES).sort()).toEqual(["base-game", "seafarers"]);
    });

    test("keys every entry by its own id", () => {
        for (const [id, game] of Object.entries(GAMES)) {
            expect(game.id).toBe(id as GameId);
        }
    });

    // What the `/[game]` route does with a URL segment, and the reason it can
    // 404 rather than generate a board for a game that does not exist.
    test("finds every game by its own id", () => {
        for (const game of ALL_GAMES) {
            expect(gameById(game.id)).toBe(game);
        }
    });

    test.each(["", "nonsense", "Seafarers", "base game", "__proto__"])(
        "does not find a game for %o",
        (slug) => {
            expect(gameById(slug)).toBeUndefined();
        },
    );

    // Both directions of the back-reference. Without this a variant could claim
    // a game that does not list it, and its home-page card would link to a
    // board it never reaches.
    test("lists exactly the variants that name it", () => {
        for (const game of ALL_GAMES) {
            expect(game.variants).toEqual(
                ALL_VARIANTS.filter((variant) => variant.game === game.id),
            );
        }
    });

    test("holds only variants the registry knows", () => {
        for (const game of ALL_GAMES) {
            for (const variant of game.variants) {
                expect(VARIANTS[variant.id]).toBe(variant);
            }
        }
    });

    describe.each(ALL_GAMES)("$id", (game: Game) => {
        test("offers at least one board", () => {
            expect(game.variants.length).toBeGreaterThan(0);
        });

        // Ascending, because the first entry is the default the URL falls back
        // to and the toggle draws them left to right in this order.
        test("orders its boards by ascending, distinct player count", () => {
            const players = game.variants.map((variant) => variant.players);

            expect(players).toEqual([...players].sort((a, b) => a - b));
            expect(new Set(players).size).toBe(players.length);
        });

        test("defaults to the 3-4 player board", () => {
            expect(game.variants[0].players).toBe(4);
        });

        test("resolves every count it offers, and falls back otherwise", () => {
            for (const variant of game.variants) {
                expect(variantFor(game, variant.players)).toBe(variant);
            }

            for (const players of [4, 6] as const) {
                expect(game.variants).toContain(variantFor(game, players));
            }
        });
    });
});
