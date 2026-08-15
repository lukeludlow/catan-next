import { describe, expect, test } from "vitest";
import { RESOURCE_TERRAINS } from "@/domain/settings";
import type { MapSettings, Terrain } from "@/domain/types";
import { ALL_VARIANTS, VARIANTS } from "@/domain/variants";
import type { Variant, VariantId } from "@/domain/variants";

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
});

describe("the registry", () => {
    test("holds both variants", () => {
        expect(Object.keys(VARIANTS).sort()).toEqual([
            "base-game",
            "seafarers",
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
        expect(VARIANTS.seafarers.shape).toHaveLength(42);
    });
});
