import { describe, expect, test } from "vitest";
import { BoardGenerationError, generateBoard } from "@/domain/generate";
import { key, neighbor, neighbors } from "@/domain/hex";
import { seaFacingSides } from "@/domain/ports";
import { mulberry32, seedFromString } from "@/domain/rng";
import { RESOURCE_TERRAINS } from "@/domain/settings";
import type { Board, MapSettings, PortResource } from "@/domain/types";
import {
    DEFAULT_BALANCE,
    countIslands,
    hasAdjacentEqualNumbers,
    hasAdjacentSixOrEight,
    islandSizes,
    maxVertexPips,
} from "@/domain/validate";
import { ALL_VARIANTS, VARIANTS } from "@/domain/variants";
import type { Variant } from "@/domain/variants";

// A board holds its hexes in a Map, which JSON.stringify renders as `{}`, so
// "byte-identical" needs a canonical form. Entries are already emitted in shape
// order by placeTerrain, so this is stable without sorting.
function serialize(board: Board): string {
    return JSON.stringify([...board.hexes.entries()]);
}

// A variant with sea takes an islands setting; one without passes none. Read off
// the registry rather than compared against an id — the id form silently sent
// Phase 10's second sea-bearing variant down the scatter branch, which is the
// mistake variants.ts:49 warns production code away from.
function islandsFor(variant: Variant): number | undefined {
    return variant.islands?.default;
}

function build(variant: Variant, seed: number, islands = islandsFor(variant)) {
    return generateBoard(variant, { islands }, mulberry32(seed));
}

function portBagOf(settings: MapSettings): PortResource[] {
    return Object.entries(settings.ports)
        .flatMap(([resource, count]) =>
            Array.from({ length: count }, () => resource as PortResource),
        )
        .sort();
}

// Every invariant the generator promises, in one place, so the seed sweeps
// below can assert all of them without restating any.
function expectValid(board: Board, variant: Variant, islands?: number): void {
    const { hexes } = board;
    const { settings } = variant;

    expect(hexes.size).toBe(variant.shape.length);

    const counts: Record<string, number> = {};
    const chits: Record<number, number> = {};

    for (const hex of hexes.values()) {
        counts[hex.terrain] = (counts[hex.terrain] ?? 0) + 1;

        const isResource = RESOURCE_TERRAINS.includes(hex.terrain);

        if (isResource) {
            expect(hex.diceNumber).toBeDefined();
            chits[hex.diceNumber as number] =
                (chits[hex.diceNumber as number] ?? 0) + 1;
        } else {
            expect(hex.diceNumber).toBeUndefined();
        }

        if (hex.port !== undefined) {
            expect(isResource).toBe(true);
            expect(seaFacingSides(hexes, hex.coord)).toContain(hex.port.side);

            const across = hexes.get(key(neighbor(hex.coord, hex.port.side)));
            expect(across === undefined || across.terrain === "sea").toBe(true);
        }
    }

    for (const [terrain, { min, max }] of Object.entries(
        settings.terrainCounts,
    )) {
        expect(counts[terrain] ?? 0).toBeGreaterThanOrEqual(min);
        expect(counts[terrain] ?? 0).toBeLessThanOrEqual(max);
    }

    for (const [diceNumber, count] of Object.entries(chits)) {
        expect(count).toBeLessThanOrEqual(
            settings.diceNumbers[Number(diceNumber)],
        );
    }

    const ports = [...hexes.values()]
        .filter((hex) => hex.port !== undefined)
        .map((hex) => hex.port?.resource)
        .sort();
    expect(ports).toEqual(portBagOf(settings));

    expect(hasAdjacentSixOrEight(hexes)).toBe(false);
    expect(hasAdjacentEqualNumbers(hexes)).toBe(false);
    expect(maxVertexPips(hexes)).toBeLessThanOrEqual(
        DEFAULT_BALANCE.maxVertexPips,
    );

    for (const size of islandSizes(hexes)) {
        expect(size).toBeGreaterThanOrEqual(DEFAULT_BALANCE.minIslandSize);
    }

    if (islands !== undefined) {
        expect(countIslands(hexes)).toBe(islands);
    }
}

// Table-driven over the registry, so the 5-6 player variants added in Phases
// 9-10 are held to every invariant here on the day they are added (ROADMAP
// §9.8) rather than needing their own suite.
describe.each(ALL_VARIANTS)("generateBoard: $name", (variant) => {
    // The payoff of seeding, and the test the Angular original could not write.
    test("produces a byte-identical board for the same seed", () => {
        expect(serialize(build(variant, 1234))).toBe(
            serialize(build(variant, 1234)),
        );
    });

    test("produces different boards for different seeds", () => {
        expect(serialize(build(variant, 1))).not.toBe(
            serialize(build(variant, 2)),
        );
    });

    test("accepts a seed derived from a URL string", () => {
        const fromString = () =>
            generateBoard(
                variant,
                { islands: islandsFor(variant) },
                mulberry32(seedFromString("abc123")),
            );

        expect(serialize(fromString())).toBe(serialize(fromString()));
    });

    test("fills the shape and nothing else", () => {
        const board = build(variant, 5);

        expect([...board.hexes.keys()]).toEqual(variant.shape.map(key));
    });

    test("carries the variant's own settings on the board", () => {
        expect(build(variant, 6).settings).toBe(variant.settings);
    });

    test("satisfies every invariant across a sample of seeds", () => {
        for (let seed = 0; seed < 200; seed++) {
            expectValid(build(variant, seed), variant, islandsFor(variant));
        }
    });
});

describe("generateBoard: board shapes", () => {
    test("renders 19 hexes for the base game and 42 for seafarers", () => {
        expect(build(VARIANTS["base-game"], 3).hexes.size).toBe(19);
        expect(build(VARIANTS.seafarers, 3).hexes.size).toBe(42);
    });

    // ROADMAP §11: kept as the original shipped it, despite readme_dev.md
    // documenting three deserts for Seafarers.
    test("gives seafarers no deserts and the base game exactly one", () => {
        const terrainsOf = (board: Board) =>
            [...board.hexes.values()].map((hex) => hex.terrain);

        expect(terrainsOf(build(VARIANTS.seafarers, 4))).not.toContain(
            "desert",
        );
        expect(
            terrainsOf(build(VARIANTS["base-game"], 4)).filter(
                (terrain) => terrain === "desert",
            ),
        ).toHaveLength(1);
    });
});

// The point of replacing rejection sampling: the top of the slider is now as
// cheap as the middle. Under ROADMAP §5's approach six islands accepted 0.045%
// of boards, so this test would not have finished — and seven, which the 5-6
// player frame offers, was unreachable at any budget.
//
// Generated from each variant's own range rather than written out, so no control
// can offer a setting this sweep has not proven. Phase 10's seventh setting
// needed no edit here, which is the same claim `variant.islands` makes about the
// slider itself.
const ISLAND_CASES = ALL_VARIANTS.flatMap((variant) => {
    const range = variant.islands;

    if (range === undefined) {
        return [];
    }

    return Array.from({ length: range.max - range.min + 1 }, (_, offset) => ({
        name: variant.name,
        variant,
        islands: range.min + offset,
    }));
});

describe.each(ISLAND_CASES)(
    "generateBoard: $name with $islands island(s)",
    ({ variant, islands }) => {
        test("hits the requested count on every seed", () => {
            for (let seed = 0; seed < 60; seed++) {
                const board = build(variant, seed, islands);

                expect(countIslands(board.hexes)).toBe(islands);
                expectValid(board, variant, islands);
            }
        });
    },
);

describe("generateBoard: the retry loop", () => {
    test("throws rather than spinning on an impossible request", () => {
        expect(() =>
            generateBoard(VARIANTS.seafarers, { islands: 30 }, mulberry32(1)),
        ).toThrow(BoardGenerationError);
    });

    test("reports what it could not build", () => {
        try {
            generateBoard(
                VARIANTS.seafarers,
                { islands: 30, maxAttempts: 5 },
                mulberry32(1),
            );
            expect.unreachable("should have thrown");
        } catch (error) {
            expect(error).toBeInstanceOf(BoardGenerationError);
            const failure = error as BoardGenerationError;

            expect(failure.variant).toBe("seafarers");
            expect(failure.islands).toBe(30);
            expect(failure.attempts).toBe(5);
            expect(failure.message).toMatch(/30 island\(s\) in 5 attempts/);
        }
    });

    test("respects a maxAttempts of 1", () => {
        expect(() =>
            generateBoard(
                VARIANTS.seafarers,
                { islands: 30, maxAttempts: 1 },
                mulberry32(1),
            ),
        ).toThrow(/in 1 attempts/);
    });

    // Guided placement is what makes this true; it is not true of a board dealt
    // at random. Kept small so the suite stays quick, but it is the assertion
    // that would catch the guidance being lost.
    test("finds a board on the first attempt most of the time", () => {
        const rng = mulberry32(77);
        let built = 0;

        for (let board = 0; board < 100; board++) {
            try {
                generateBoard(
                    VARIANTS.seafarers,
                    { islands: 3, maxAttempts: 1 },
                    rng,
                );
                built++;
            } catch {
                // A layout that could not be dealt within its deal budget.
            }
        }

        expect(built).toBeGreaterThan(80);
    });
});

describe("generateBoard: balance rules", () => {
    test("can be relaxed one rule at a time", () => {
        const relaxed = generateBoard(
            VARIANTS.seafarers,
            { islands: 3, balance: { noAdjacentEqualNumbers: false } },
            mulberry32(11),
        );

        // The other two still hold.
        expect(hasAdjacentSixOrEight(relaxed.hexes)).toBe(false);
        expect(maxVertexPips(relaxed.hexes)).toBeLessThanOrEqual(12);
    });

    // With the floor at 1 the grower is free to leave single-hex islands, which
    // ROADMAP §4.7 counts and the default policy forbids.
    test("allows single-hex islands when the floor is lowered", () => {
        const rng = mulberry32(23);
        const sizes = new Set<number>();

        for (let board = 0; board < 40; board++) {
            const generated = generateBoard(
                VARIANTS.seafarers,
                { islands: 5, balance: { minIslandSize: 1 } },
                rng,
            );

            islandSizes(generated.hexes).forEach((size) => sizes.add(size));
        }

        expect(sizes).toContain(1);
    });

    test("never leaves a lone hex under the default policy", () => {
        const rng = mulberry32(24);

        for (let board = 0; board < 40; board++) {
            const generated = generateBoard(
                VARIANTS.seafarers,
                { islands: 5 },
                rng,
            );

            expect(Math.min(...islandSizes(generated.hexes))).toBeGreaterThan(
                1,
            );
        }
    });
});

// ROADMAP §4.8 regressions, asserted on real generated boards rather than on a
// fixture: the original's coordinate inverse made one Seafarers hex its own
// neighbour and gave another a duplicate, which corrupted every adjacency rule
// downstream of it.
describe("generateBoard: adjacency regressions", () => {
    test("no hex is its own neighbour and none is listed twice", () => {
        const { hexes } = build(VARIANTS.seafarers, 99);

        for (const hex of hexes.values()) {
            const around = neighbors(hexes, hex.coord).map((other) =>
                key(other.coord),
            );

            expect(around).not.toContain(key(hex.coord));
            expect(new Set(around).size).toBe(around.length);
        }
    });
});
