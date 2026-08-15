import { describe, expect, test } from "vitest";
import { key, neighbors } from "@/domain/hex";
import type { Axial } from "@/domain/hex";
import { isHot, placeNumbers } from "@/domain/numbers";
import { mulberry32 } from "@/domain/rng";
import {
    BASE_GAME_SETTINGS,
    RESOURCE_TERRAINS,
    SEAFARERS_SETTINGS,
} from "@/domain/settings";
import { BASE_GAME_SHAPE, SEAFARERS_SHAPE } from "@/domain/shapes";
import { placeTerrain } from "@/domain/terrain";
import type { Hex, MapSettings, Terrain } from "@/domain/types";

// A deal only makes sense on top of a terrain layout, so these helpers build
// one the same way generate.ts will and hand the result straight over.
function layout(seed: number, islands?: number): Map<string, Hex> {
    const hexes = placeTerrain(
        islands === undefined ? BASE_GAME_SHAPE : SEAFARERS_SHAPE,
        islands === undefined ? BASE_GAME_SETTINGS : SEAFARERS_SETTINGS,
        { islands, minIslandSize: 2 },
        mulberry32(seed),
    );

    expect(hexes).not.toBeNull();
    return hexes as Map<string, Hex>;
}

function dealt(
    hexes: Map<string, Hex>,
    settings: MapSettings,
    seed: number,
): Map<string, Hex> {
    const numbered = placeNumbers(hexes, settings, mulberry32(seed));

    expect(numbered).not.toBeNull();
    return numbered as Map<string, Hex>;
}

function boardOf(terrains: Record<string, Terrain>): Map<string, Hex> {
    return new Map(
        Object.entries(terrains).map(([coordKey, terrain]) => {
            const [q, r] = coordKey.split(",").map(Number);
            const coord: Axial = { q, r };
            return [key(coord), { coord, terrain }];
        }),
    );
}

const isResource = (terrain: Terrain): boolean =>
    RESOURCE_TERRAINS.includes(terrain);

describe("isHot", () => {
    test("names only the two red numbers", () => {
        expect([2, 3, 4, 5, 6, 8, 9, 10, 11, 12].filter(isHot)).toEqual([6, 8]);
    });

    test("treats an unnumbered hex as cold", () => {
        expect(isHot(undefined)).toBe(false);
    });
});

describe("placeNumbers", () => {
    test("numbers every resource hex and nothing else", () => {
        for (const hex of dealt(layout(1, 3), SEAFARERS_SETTINGS, 1).values()) {
            if (isResource(hex.terrain)) {
                expect(hex.diceNumber).toBeDefined();
            } else {
                expect(hex.diceNumber).toBeUndefined();
            }
        }
    });

    // ROADMAP §11: Seafarers ships no deserts, so the Base Game is the only
    // board where the desert case is exercised at all.
    test("leaves the base game desert unnumbered", () => {
        const numbered = dealt(layout(4), BASE_GAME_SETTINGS, 4);
        const desert = [...numbered.values()].find(
            (hex) => hex.terrain === "desert",
        );

        expect(desert?.diceNumber).toBeUndefined();
        expect(
            [...numbered.values()].filter(
                (hex) => hex.diceNumber !== undefined,
            ),
        ).toHaveLength(18);
    });

    test("deals chits the variant actually ships", () => {
        const numbered = dealt(layout(5), BASE_GAME_SETTINGS, 5);
        const counts: Record<number, number> = {};

        for (const hex of numbered.values()) {
            if (hex.diceNumber !== undefined) {
                counts[hex.diceNumber] = (counts[hex.diceNumber] ?? 0) + 1;
            }
        }

        // The Base Game's 18 chits exactly fill its 18 resource hexes, so the
        // whole bag is dealt and the counts must match the settings verbatim.
        expect(counts).toEqual(BASE_GAME_SETTINGS.diceNumbers);
    });

    test("never deals a chit the variant does not ship", () => {
        const numbered = dealt(layout(6, 3), SEAFARERS_SETTINGS, 6);

        for (const hex of numbered.values()) {
            if (hex.diceNumber === undefined) {
                continue;
            }

            expect(
                SEAFARERS_SETTINGS.diceNumbers[hex.diceNumber],
            ).toBeGreaterThan(0);
        }
    });

    test("never deals more of a number than the bag holds", () => {
        const numbered = dealt(layout(7, 4), SEAFARERS_SETTINGS, 7);
        const counts: Record<number, number> = {};

        for (const hex of numbered.values()) {
            if (hex.diceNumber !== undefined) {
                counts[hex.diceNumber] = (counts[hex.diceNumber] ?? 0) + 1;
            }
        }

        for (const [diceNumber, count] of Object.entries(counts)) {
            expect(count).toBeLessThanOrEqual(
                SEAFARERS_SETTINGS.diceNumbers[Number(diceNumber)],
            );
        }
    });

    // The whole point of seating the reds first. A plain shuffle satisfies this
    // 23% of the time on Seafarers and 13% on the Base Game
    // (docs/GENERATION.md); guided seating satisfies it always.
    test("never puts a 6 or an 8 next to a 6 or an 8", () => {
        for (let seed = 0; seed < 100; seed++) {
            const numbered = dealt(layout(seed, 3), SEAFARERS_SETTINGS, seed);

            for (const hex of numbered.values()) {
                if (!isHot(hex.diceNumber)) {
                    continue;
                }

                for (const around of neighbors(numbered, hex.coord)) {
                    expect(isHot(around.diceNumber)).toBe(false);
                }
            }
        }
    });

    test("seats the reds on the base game too", () => {
        for (let seed = 0; seed < 100; seed++) {
            const numbered = dealt(layout(seed), BASE_GAME_SETTINGS, seed);

            for (const hex of numbered.values()) {
                if (!isHot(hex.diceNumber)) {
                    continue;
                }

                for (const around of neighbors(numbered, hex.coord)) {
                    expect(isHot(around.diceNumber)).toBe(false);
                }
            }
        }
    });

    test("is deterministic for a given seed", () => {
        const hexes = layout(8, 3);

        expect([...dealt(hexes, SEAFARERS_SETTINGS, 8)]).toEqual([
            ...dealt(hexes, SEAFARERS_SETTINGS, 8),
        ]);
    });

    test("produces different deals for different seeds", () => {
        const hexes = layout(9, 3);

        expect([...dealt(hexes, SEAFARERS_SETTINGS, 9)]).not.toEqual([
            ...dealt(hexes, SEAFARERS_SETTINGS, 10),
        ]);
    });

    test("does not modify the layout it is given", () => {
        const hexes = layout(11, 3);
        const before = structuredClone([...hexes]);

        placeNumbers(hexes, SEAFARERS_SETTINGS, mulberry32(11));

        expect([...hexes]).toEqual(before);
    });

    test("keeps the input's coordinate ordering", () => {
        const hexes = layout(12, 3);

        expect([...dealt(hexes, SEAFARERS_SETTINGS, 12).keys()]).toEqual([
            ...hexes.keys(),
        ]);
    });

    // ROADMAP §4.1. variants.test.ts proves no shipped variant can reach this,
    // so it is a mis-specified variant rather than an unlucky board — hence an
    // exception instead of the `null` an unseatable red returns.
    test("throws when the chit bag cannot cover the resource hexes", () => {
        const starved: MapSettings = {
            ...BASE_GAME_SETTINGS,
            diceNumbers: { 5: 2 },
        };

        expect(() => placeNumbers(layout(13), starved, mulberry32(13))).toThrow(
            /chit bag holds 2/,
        );
    });

    // Six mutually adjacent resource hexes around a centre cannot seat the Base
    // Game's four reds, so the deal is refused rather than shipped in breach of
    // the rule. generate.ts retries; it does not fall back to a broken board.
    test("returns null when a red has nowhere legal to sit", () => {
        const cramped = boardOf({
            "0,0": "wheat",
            "1,0": "wheat",
            "1,-1": "wheat",
            "0,-1": "wheat",
            "-1,0": "wheat",
            "-1,1": "wheat",
            "0,1": "wheat",
        });
        const tight: MapSettings = {
            ...BASE_GAME_SETTINGS,
            diceNumbers: { 6: 3, 8: 3, 5: 1 },
        };

        expect(placeNumbers(cramped, tight, mulberry32(14))).toBeNull();
    });

    test("seats reds on hexes that cannot touch", () => {
        const scattered = boardOf({
            "0,0": "wheat",
            "5,0": "wheat",
            "0,5": "wheat",
        });
        const threeReds: MapSettings = {
            ...BASE_GAME_SETTINGS,
            diceNumbers: { 6: 2, 8: 1 },
        };
        const numbered = placeNumbers(scattered, threeReds, mulberry32(15));

        expect(numbered).not.toBeNull();
        expect(
            [...(numbered ?? []).values()].map((hex) => hex.diceNumber).sort(),
        ).toEqual([6, 6, 8]);
    });

    // Seating is greedy over a shuffled order, not a search: on a board tight
    // enough that the first red can occupy the only hex the second one needed,
    // it gives up rather than backtracking. That is the `null`-and-retry
    // contract, and it is why generate.ts re-deals. Three hexes in a line hold
    // two reds only if both ends are taken first, so roughly a third of orders
    // fail — while 20,000 real Seafarers and Base Game boards produced none
    // (docs/GENERATION.md).
    test("gives up rather than backtracking, and succeeds on a re-deal", () => {
        const line = boardOf({
            "0,0": "wheat",
            "1,0": "wheat",
            "2,0": "wheat",
        });
        const twoReds: MapSettings = {
            ...BASE_GAME_SETTINGS,
            diceNumbers: { 6: 1, 8: 1, 5: 1 },
        };
        const rng = mulberry32(15);
        const deals = Array.from({ length: 20 }, () =>
            placeNumbers(line, twoReds, rng),
        );

        expect(deals.some((deal) => deal === null)).toBe(true);

        const seated = deals.filter((deal) => deal !== null);
        expect(seated.length).toBeGreaterThan(0);

        // Whenever it does seat them, the middle hex holds the cold chit — the
        // only arrangement the rule allows.
        for (const deal of seated) {
            expect(deal?.get("1,0")?.diceNumber).toBe(5);
        }
    });
});
