import { describe, expect, test } from "vitest";
import { key, neighbors } from "@/domain/hex";
import { mulberry32 } from "@/domain/rng";
import { BASE_GAME_SETTINGS, RESOURCE_TERRAINS } from "@/domain/settings";
import { SEAFARERS_56_SETTINGS, SEAFARERS_SETTINGS } from "@/domain/settings";
import {
    BASE_GAME_SHAPE,
    SEAFARERS_56_SHAPE,
    SEAFARERS_SHAPE,
} from "@/domain/shapes";
import { placeTerrain } from "@/domain/terrain";
import type { Hex, Terrain } from "@/domain/types";

// Terrain placement is the one stage that can legitimately fail — a requested
// island layout may not fit — so every helper here takes the `| null` into
// account rather than asserting it away at the call site.
function seafarers(seed: number, islands?: number, minIslandSize = 2) {
    return placeTerrain(
        SEAFARERS_SHAPE,
        SEAFARERS_SETTINGS,
        { islands, minIslandSize },
        mulberry32(seed),
    );
}

function seafarers56(seed: number, islands?: number, minIslandSize = 2) {
    return placeTerrain(
        SEAFARERS_56_SHAPE,
        SEAFARERS_56_SETTINGS,
        { islands, minIslandSize },
        mulberry32(seed),
    );
}

function required(hexes: Map<string, Hex> | null): Map<string, Hex> {
    expect(hexes).not.toBeNull();
    return hexes as Map<string, Hex>;
}

function countBy(hexes: Map<string, Hex>): Record<string, number> {
    const counts: Record<string, number> = {};

    for (const hex of hexes.values()) {
        counts[hex.terrain] = (counts[hex.terrain] ?? 0) + 1;
    }

    return counts;
}

const isResource = (terrain: Terrain): boolean =>
    RESOURCE_TERRAINS.includes(terrain);

// The same connected-component walk validate.ts performs, restated here so this
// file proves the grower's contract without depending on the module that will
// later be asked to check it.
function islandSizes(hexes: Map<string, Hex>): number[] {
    const seen = new Set<string>();
    const sizes: number[] = [];

    for (const [coordKey, hex] of hexes) {
        if (!isResource(hex.terrain) || seen.has(coordKey)) {
            continue;
        }

        const stack = [hex];
        seen.add(coordKey);
        let size = 0;

        while (stack.length > 0) {
            const current = stack.pop() as Hex;
            size++;

            for (const around of neighbors(hexes, current.coord)) {
                if (
                    isResource(around.terrain) &&
                    !seen.has(key(around.coord))
                ) {
                    seen.add(key(around.coord));
                    stack.push(around);
                }
            }
        }

        sizes.push(size);
    }

    return sizes;
}

describe("placeTerrain", () => {
    test("fills every coordinate of the shape exactly once", () => {
        const hexes = required(seafarers(1, 3));

        expect(hexes.size).toBe(SEAFARERS_SHAPE.length);

        for (const coord of SEAFARERS_SHAPE) {
            expect(hexes.get(key(coord))?.coord).toEqual(coord);
        }
    });

    test("keys every hex by its own coordinate", () => {
        for (const [coordKey, hex] of required(seafarers(2, 4))) {
            expect(key(hex.coord)).toBe(coordKey);
        }
    });

    test("leaves every hex unnumbered and portless", () => {
        for (const hex of required(seafarers(3, 3)).values()) {
            expect(hex.diceNumber).toBeUndefined();
            expect(hex.port).toBeUndefined();
        }
    });

    test("is deterministic for a given seed", () => {
        expect([...required(seafarers(42, 3))]).toEqual([
            ...required(seafarers(42, 3)),
        ]);
    });

    test("produces different boards for different seeds", () => {
        expect([...required(seafarers(1, 3))]).not.toEqual([
            ...required(seafarers(2, 3)),
        ]);
    });

    // ROADMAP §5: `min` of every terrain is placed, then a remainder bag that
    // is larger than the slots left over, so the leftovers go unplaced.
    test("respects every terrain's min and max", () => {
        for (let seed = 0; seed < 50; seed++) {
            const counts = countBy(required(seafarers(seed, 3)));

            for (const [terrain, { min, max }] of Object.entries(
                SEAFARERS_SETTINGS.terrainCounts,
            )) {
                expect(counts[terrain] ?? 0).toBeGreaterThanOrEqual(min);
                expect(counts[terrain] ?? 0).toBeLessThanOrEqual(max);
            }
        }
    });

    // ROADMAP §11: the remainder bag is bigger than the slots it fills, which
    // is the mechanism that makes sea and gold counts differ between boards.
    test("varies the sea count between boards", () => {
        const seaCounts = new Set<number>();

        for (let seed = 0; seed < 50; seed++) {
            seaCounts.add(countBy(required(seafarers(seed, 3))).sea);
        }

        expect(seaCounts.size).toBeGreaterThan(1);
    });

    test("does not modify the shape it is given", () => {
        const before = structuredClone(SEAFARERS_SHAPE);
        seafarers(7, 5);

        expect(SEAFARERS_SHAPE).toEqual(before);
    });
});

// The whole reason placeTerrain grows islands instead of scattering terrain:
// the count is exact on the first attempt, at every setting the slider offers.
describe("island growth", () => {
    test.each([1, 2, 3, 4, 5, 6])("grows exactly %i island(s)", (islands) => {
        for (let seed = 0; seed < 40; seed++) {
            const hexes = seafarers(seed, islands);

            if (hexes === null) {
                continue;
            }

            expect(islandSizes(hexes)).toHaveLength(islands);
        }
    });

    test("honours the minimum island size", () => {
        for (let seed = 0; seed < 40; seed++) {
            const hexes = seafarers(seed, 5, 3);

            if (hexes === null) {
                continue;
            }

            for (const size of islandSizes(hexes)) {
                expect(size).toBeGreaterThanOrEqual(3);
            }
        }
    });

    // With a floor of 1 the grower may leave single-hex islands, which ROADMAP
    // §4.7 counts and the default rules then forbid. Both must be reachable.
    test("allows single-hex islands when the floor is 1", () => {
        const sizes = new Set<number>();

        for (let seed = 0; seed < 200; seed++) {
            const hexes = seafarers(seed, 6, 1);

            if (hexes !== null) {
                islandSizes(hexes).forEach((size) => sizes.add(size));
            }
        }

        expect(sizes).toContain(1);
    });

    // The budget that matters is generate.ts's, which retries on one shared
    // rng rather than reseeding. Single-attempt growth succeeds ~100% of the
    // time up to four islands, 94% at five and 54% at six, so a handful of
    // attempts covers the whole slider — against the ~640 that the rejection
    // sampling in ROADMAP §5 needed at six (docs/GENERATION.md).
    test.each([1, 2, 3, 4, 5, 6])(
        "grows %i island(s) within a few attempts, every time",
        (islands) => {
            const rng = mulberry32(2024);

            for (let board = 0; board < 200; board++) {
                let attempts = 0;
                let hexes = null;

                while (hexes === null && attempts < 40) {
                    attempts++;
                    hexes = placeTerrain(
                        SEAFARERS_SHAPE,
                        SEAFARERS_SETTINGS,
                        { islands, minIslandSize: 2 },
                        rng,
                    );
                }

                expect(hexes).not.toBeNull();
            }
        },
    );

    test("refuses a request the board cannot hold", () => {
        expect(seafarers(1, 0)).toBeNull();
        expect(seafarers(1, 30)).toBeNull();
        expect(seafarers(1, 6, 20)).toBeNull();
    });
});

// ROADMAP §9 Phase 10 flagged the larger frame as where farthest-point seeding
// would get tight, and the slider's new seventh setting as the place to look for
// it. Both sweeps are the 42-hex ones above, re-run against the 52-hex frame and
// carried one setting further.
describe("island growth on the 5-6 player frame", () => {
    test.each([1, 2, 3, 4, 5, 6, 7])(
        "grows exactly %i island(s)",
        (islands) => {
            for (let seed = 0; seed < 40; seed++) {
                const hexes = seafarers56(seed, islands);

                if (hexes === null) {
                    continue;
                }

                expect(islandSizes(hexes)).toHaveLength(islands);
            }
        },
    );

    test.each([1, 2, 3, 4, 5, 6, 7])(
        "grows %i island(s) within a few attempts, every time",
        (islands) => {
            const rng = mulberry32(2024);

            for (let board = 0; board < 200; board++) {
                let attempts = 0;
                let hexes = null;

                while (hexes === null && attempts < 40) {
                    attempts++;
                    hexes = placeTerrain(
                        SEAFARERS_56_SHAPE,
                        SEAFARERS_56_SETTINGS,
                        { islands, minIslandSize: 2 },
                        rng,
                    );
                }

                expect(hexes).not.toBeNull();
            }
        },
    );
});

describe("placeTerrain without an island constraint", () => {
    const baseGame = (seed: number) =>
        placeTerrain(
            BASE_GAME_SHAPE,
            BASE_GAME_SETTINGS,
            { minIslandSize: 2 },
            mulberry32(seed),
        );

    test("fills the base game board", () => {
        const hexes = required(baseGame(1));

        expect(hexes.size).toBe(19);
        expect(countBy(hexes)).toEqual({
            brick: 3,
            desert: 1,
            rock: 3,
            sheep: 4,
            tree: 4,
            wheat: 4,
        });
    });

    // With no sea in the bag the count is always 1, which is why the Base Game
    // passes no `islands` at all rather than passing 1.
    test("leaves the base game as a single landmass", () => {
        for (let seed = 0; seed < 30; seed++) {
            expect(islandSizes(required(baseGame(seed)))).toEqual([18]);
        }
    });

    // The scatter path exists so the desert is not pushed to the rim. Over
    // enough boards it should reach the centre hex too.
    test("can put the desert anywhere, including the centre", () => {
        const desertKeys = new Set<string>();

        for (let seed = 0; seed < 100; seed++) {
            for (const [coordKey, hex] of required(baseGame(seed))) {
                if (hex.terrain === "desert") {
                    desertKeys.add(coordKey);
                }
            }
        }

        expect(desertKeys).toContain(key({ q: 0, r: 0 }));
        expect(desertKeys.size).toBeGreaterThan(10);
    });

    test("is deterministic for a given seed", () => {
        expect([...required(baseGame(9))]).toEqual([...required(baseGame(9))]);
    });
});
