import { describe, expect, test } from "vitest";
import { key } from "@/domain/hex";
import type { Axial } from "@/domain/hex";
import type { Hex, Terrain } from "@/domain/types";
import {
    DEFAULT_BALANCE,
    countIslands,
    hasAdjacentEqualNumbers,
    hasAdjacentSixOrEight,
    islandSizes,
    isValidBoard,
    maxVertexPips,
    pipsFor,
} from "@/domain/validate";

// The original's 13-row jagged Seafarers board as axial coordinates, so the
// fixtures ported from `_validators.tests/` can name hexes by the (row, col)
// their spec used. The same table appears at the top of shapes.test.ts, which
// is where it is checked against SEAFARERS_SHAPE; there are no barrel files and
// importing across test files would be worse than restating it.
// prettier-ignore
const ORIGINAL_LAYOUT: readonly (readonly (readonly [number, number])[])[] = [
    [[-1, 0], [1, -1]],                        // row 0
    [[-2, 1], [0, 0], [2, -1]],                // row 1
    [[-3, 2], [-1, 1], [1, 0], [3, -1]],       // row 2
    [[-2, 2], [0, 1], [2, 0]],                 // row 3
    [[-3, 3], [-1, 2], [1, 1], [3, 0]],        // row 4
    [[-2, 3], [0, 2], [2, 1]],                 // row 5
    [[-3, 4], [-1, 3], [1, 2], [3, 1]],        // row 6
    [[-2, 4], [0, 3], [2, 2]],                 // row 7
    [[-3, 5], [-1, 4], [1, 3], [3, 2]],        // row 8
    [[-2, 5], [0, 4], [2, 3]],                 // row 9
    [[-3, 6], [-1, 5], [1, 4], [3, 3]],        // row 10
    [[-2, 6], [0, 5], [2, 4]],                 // row 11
    [[-1, 6], [1, 5]],                         // row 12
];

// Builds a 42-hex board from the original's `map.setHexTerrain(row, col, ...)`
// calls, so a ported fixture reads in the same order as the spec it came from.
function originalBoard(terrains: readonly Terrain[][]): Map<string, Hex> {
    const hexes = new Map<string, Hex>();

    ORIGINAL_LAYOUT.forEach((row, rowIndex) => {
        row.forEach(([q, r], colIndex) => {
            const coord: Axial = { q, r };
            hexes.set(key(coord), {
                coord,
                terrain: terrains[rowIndex][colIndex],
            });
        });
    });

    return hexes;
}

// A small hand-built board. Keys are "q,r"; a `number` suffix after a colon in
// the value is the dice chit, so "wheat:6" is a wheat hex carrying a 6.
function boardOf(cells: Record<string, string>): Map<string, Hex> {
    return new Map(
        Object.entries(cells).map(([coordKey, spec]) => {
            const [q, r] = coordKey.split(",").map(Number);
            const [terrain, diceNumber] = spec.split(":");
            const coord: Axial = { q, r };

            return [
                key(coord),
                {
                    coord,
                    terrain: terrain as Terrain,
                    ...(diceNumber === undefined
                        ? {}
                        : { diceNumber: Number(diceNumber) }),
                },
            ];
        }),
    );
}

describe("pipsFor", () => {
    test("counts the dice combinations that produce each number", () => {
        expect([2, 3, 4, 5, 6, 8, 9, 10, 11, 12].map(pipsFor)).toEqual([
            1, 2, 3, 4, 5, 5, 4, 3, 2, 1,
        ]);
    });

    test("is symmetric about seven", () => {
        for (const diceNumber of [2, 3, 4, 5, 6]) {
            expect(pipsFor(diceNumber)).toBe(pipsFor(14 - diceNumber));
        }
    });
});

describe("countIslands", () => {
    test("counts nothing on an empty board", () => {
        expect(countIslands(new Map())).toBe(0);
    });

    test("counts nothing on an all-sea board", () => {
        expect(countIslands(boardOf({ "0,0": "sea", "1,0": "sea" }))).toBe(0);
    });

    // ROADMAP §4.7, and the case the original explicitly could not express: it
    // required `island.size >= 3`, so a lone hex was drawn on the board but not
    // counted, and the islands slider lied about what the player could see.
    test("counts a single isolated resource hex as one island", () => {
        expect(
            countIslands(
                boardOf({ "0,0": "gold", "2,0": "sea", "3,0": "sea" }),
            ),
        ).toBe(1);
    });

    test("counts a two-hex island, which the original discarded", () => {
        expect(countIslands(boardOf({ "0,0": "gold", "1,0": "gold" }))).toBe(1);
        expect(islandSizes(boardOf({ "0,0": "gold", "1,0": "gold" }))).toEqual([
            2,
        ]);
    });

    // Hexes sharing only a corner are not neighbours. (2, 0) is two steps east
    // of (0, 0), so they meet at a vertex but no edge.
    test("counts hexes touching only at a corner as two islands", () => {
        expect(
            countIslands(
                boardOf({ "0,0": "gold", "1,0": "sea", "2,0": "gold" }),
            ),
        ).toBe(2);
    });

    test("joins hexes that share an edge", () => {
        expect(
            countIslands(
                boardOf({ "0,0": "gold", "1,0": "gold", "2,0": "gold" }),
            ),
        ).toBe(1);
    });

    // Desert is not a resource terrain — the original's `isResourceTerrain()`
    // excluded it, and this port keeps that — so a desert isthmus does not join
    // the land on either side of it.
    test("does not let a desert connect two landmasses", () => {
        expect(
            countIslands(
                boardOf({ "0,0": "gold", "1,0": "desert", "2,0": "gold" }),
            ),
        ).toBe(2);
    });

    test("counts every direction of adjacency", () => {
        expect(
            countIslands(
                boardOf({
                    "0,0": "gold",
                    "1,0": "gold",
                    "1,-1": "gold",
                    "0,-1": "gold",
                    "-1,0": "gold",
                    "-1,1": "gold",
                    "0,1": "gold",
                }),
            ),
        ).toBe(1);
    });
});

// Ported from `~/ws/catan/src/app/_validators.tests/island-counter.service.spec.ts`.
describe("the original's island-counter fixtures", () => {
    // Its "big fat test case", terrain for terrain. ROADMAP §4.7 warned the
    // expected count had to be recomputed rather than copied, because the
    // original's size-3 rule may have been hiding components. It was
    // recomputed: the answer is 2 either way. The two components are 23 and 3
    // hexes, both clear of the old threshold, so this fixture never exercised
    // the rule that §4.7 removed — which makes it a clean characterization test
    // that the new counter agrees with the old one where the old one was right.
    test("counts the big fat test case as two islands", () => {
        const board = originalBoard([
            ["sheep", "rock"],
            ["gold", "tree", "rock"],
            ["sheep", "wheat", "sea", "sea"],
            ["sea", "sea", "rock"],
            ["brick", "sea", "sea", "rock"],
            ["wheat", "sea", "wheat"],
            ["tree", "wheat", "sheep", "sea"],
            ["sea", "sheep", "sea"],
            ["brick", "rock", "gold", "sea"],
            ["sea", "desert", "sea"],
            ["brick", "tree", "sea", "wheat"],
            ["tree", "sea", "brick"],
            ["tree", "sheep"],
        ]);

        expect(countIslands(board)).toBe(2);
        expect(islandSizes(board).sort((a, b) => b - a)).toEqual([23, 3]);
    });

    // The original's "islands are composed of at least three hexes" case, and
    // the one place its rule and this one actually disagree. It asserted 2. The
    // board holds two three-hex chains plus a pair of golds at rows 7 and 9 of
    // column 0, which are adjacent to each other and to nothing else — a
    // genuine two-hex island the original drew and refused to count. Under
    // §4.7 the answer is 3. This is the test the old app could not write.
    test("counts the two-hex island the original discarded", () => {
        const gold: readonly (readonly [number, number])[] = [
            [2, 1],
            [3, 1],
            [4, 1],
            [8, 2],
            [9, 2],
            [10, 2],
            [7, 0],
            [9, 0],
        ];
        const board = originalBoard(
            ORIGINAL_LAYOUT.map((row, rowIndex) =>
                row.map((_, colIndex) =>
                    gold.some(([r, c]) => r === rowIndex && c === colIndex)
                        ? ("gold" as Terrain)
                        : ("sea" as Terrain),
                ),
            ),
        );

        expect(countIslands(board)).toBe(3);
        expect(islandSizes(board).sort((a, b) => b - a)).toEqual([3, 3, 2]);
    });
});

describe("hasAdjacentSixOrEight", () => {
    test("is false on a board with no reds", () => {
        expect(
            hasAdjacentSixOrEight(
                boardOf({ "0,0": "wheat:5", "1,0": "tree:9" }),
            ),
        ).toBe(false);
    });

    test("is false when the reds are apart", () => {
        expect(
            hasAdjacentSixOrEight(
                boardOf({ "0,0": "wheat:6", "1,0": "tree:9", "2,0": "rock:8" }),
            ),
        ).toBe(false);
    });

    test("catches a six touching an eight", () => {
        expect(
            hasAdjacentSixOrEight(
                boardOf({ "0,0": "wheat:6", "1,0": "tree:8" }),
            ),
        ).toBe(true);
    });

    test("catches two sixes touching", () => {
        expect(
            hasAdjacentSixOrEight(
                boardOf({ "0,0": "wheat:6", "0,1": "tree:6" }),
            ),
        ).toBe(true);
    });

    // ROADMAP §4.8. The original's coordinate inverse returned hex (1, 0) of the
    // Seafarers board as its own neighbour, so a lone 6 there collided with
    // itself and the board was rejected for no reason.
    test("does not let a lone red collide with itself", () => {
        expect(hasAdjacentSixOrEight(boardOf({ "0,0": "wheat:6" }))).toBe(
            false,
        );
    });

    test("ignores unnumbered hexes between two reds", () => {
        expect(
            hasAdjacentSixOrEight(
                boardOf({ "0,0": "wheat:6", "1,0": "sea", "2,0": "rock:8" }),
            ),
        ).toBe(false);
    });
});

describe("hasAdjacentEqualNumbers", () => {
    test("catches two nines side by side", () => {
        expect(
            hasAdjacentEqualNumbers(
                boardOf({ "0,0": "wheat:9", "1,0": "tree:9" }),
            ),
        ).toBe(true);
    });

    test("allows the same number twice when apart", () => {
        expect(
            hasAdjacentEqualNumbers(
                boardOf({ "0,0": "wheat:9", "2,0": "tree:9" }),
            ),
        ).toBe(false);
    });

    // Two sea hexes both have `diceNumber` undefined, which must not read as a
    // matching pair.
    test("does not treat two unnumbered hexes as equal", () => {
        expect(
            hasAdjacentEqualNumbers(boardOf({ "0,0": "sea", "1,0": "sea" })),
        ).toBe(false);
    });
});

describe("maxVertexPips", () => {
    test("is zero when no three hexes meet", () => {
        expect(
            maxVertexPips(boardOf({ "0,0": "wheat:6", "1,0": "tree:8" })),
        ).toBe(0);
    });

    test("sums the three hexes meeting at a vertex", () => {
        // 6 and 8 are five pips each, 5 is four: fourteen in total.
        expect(
            maxVertexPips(
                boardOf({
                    "0,0": "wheat:6",
                    "1,0": "tree:8",
                    "0,1": "rock:5",
                }),
            ),
        ).toBe(14);
    });

    test("counts an unnumbered hex as nothing", () => {
        expect(
            maxVertexPips(
                boardOf({ "0,0": "wheat:6", "1,0": "sea", "0,1": "rock:5" }),
            ),
        ).toBe(9);
    });

    // Three vertices exist here: (0,0)+(1,0)+(0,1) is worth 3, (0,0)+(1,0)+(1,-1)
    // is worth 7, and (0,0)+(1,-1)+(0,-1) is worth 11. The last one wins.
    test("reports the best vertex, not the first", () => {
        expect(
            maxVertexPips(
                boardOf({
                    "0,0": "wheat:2",
                    "1,0": "tree:2",
                    "0,1": "rock:2",
                    "1,-1": "sheep:6",
                    "0,-1": "brick:6",
                }),
            ),
        ).toBe(11);
    });
});

describe("isValidBoard", () => {
    const island = {
        "0,0": "wheat:5",
        "1,0": "tree:9",
        "2,0": "rock:4",
    };

    test("accepts a board that breaks no rule", () => {
        expect(
            isValidBoard(boardOf(island), {
                ...DEFAULT_BALANCE,
                islands: 1,
            }),
        ).toBe(true);
    });

    test("rejects the wrong number of islands", () => {
        expect(
            isValidBoard(boardOf(island), {
                ...DEFAULT_BALANCE,
                islands: 2,
            }),
        ).toBe(false);
    });

    test("skips the island check when no count is requested", () => {
        expect(isValidBoard(boardOf(island), DEFAULT_BALANCE)).toBe(true);
    });

    test("rejects an island below the size floor", () => {
        const lone = { ...island, "5,0": "gold:3" };

        expect(
            isValidBoard(boardOf(lone), { ...DEFAULT_BALANCE, islands: 2 }),
        ).toBe(false);
        expect(
            isValidBoard(boardOf(lone), {
                ...DEFAULT_BALANCE,
                minIslandSize: 1,
                islands: 2,
            }),
        ).toBe(true);
    });

    test("rejects adjacent reds whatever the balance rules say", () => {
        const reds = { "0,0": "wheat:6", "1,0": "tree:8" };

        expect(
            isValidBoard(boardOf(reds), {
                minIslandSize: 1,
                noAdjacentEqualNumbers: false,
                maxVertexPips: 99,
            }),
        ).toBe(false);
    });

    test("applies the adjacent-equal-numbers rule only when asked", () => {
        const twins = { "0,0": "wheat:9", "1,0": "tree:9" };

        expect(
            isValidBoard(boardOf(twins), {
                ...DEFAULT_BALANCE,
                minIslandSize: 1,
            }),
        ).toBe(false);
        expect(
            isValidBoard(boardOf(twins), {
                ...DEFAULT_BALANCE,
                minIslandSize: 1,
                noAdjacentEqualNumbers: false,
            }),
        ).toBe(true);
    });

    // 5 + 4 + 4 = 13 pips on one vertex, while breaking no other rule: only one
    // red, and the two four-pip hexes carry different numbers.
    test("rejects a vertex worth more than the cap", () => {
        const rich = {
            "0,0": "wheat:6",
            "1,0": "tree:5",
            "0,1": "rock:9",
        };

        expect(maxVertexPips(boardOf(rich))).toBe(13);
        expect(
            isValidBoard(boardOf(rich), {
                ...DEFAULT_BALANCE,
                minIslandSize: 1,
            }),
        ).toBe(false);
        expect(
            isValidBoard(boardOf(rich), {
                ...DEFAULT_BALANCE,
                minIslandSize: 1,
                maxVertexPips: 13,
            }),
        ).toBe(true);
    });
});

describe("DEFAULT_BALANCE", () => {
    // Pinned because these three numbers are the whole of the balance policy,
    // and changing one silently changes every board the app produces.
    test("is the policy documented in docs/GENERATION.md", () => {
        expect(DEFAULT_BALANCE).toEqual({
            minIslandSize: 2,
            noAdjacentEqualNumbers: true,
            maxVertexPips: 12,
        });
    });
});
