import { describe, expect, test } from "vitest";
import { distance, key, neighborCoords, neighbors } from "@/domain/hex";
import type { Axial } from "@/domain/hex";
import {
    BASE_GAME_56_SHAPE,
    BASE_GAME_SHAPE,
    SEAFARERS_SHAPE,
} from "@/domain/shapes";

// The original's 13-row jagged Seafarers board, written out as the axial
// coordinates its own `convertHexCoordsToHexBlobCube` produced for each
// (row, col). Indexed [row][col], so the ported assertions below can name hexes
// the way `_models.tests/SeafarersMap.spec.ts` named them and the translation
// stays reviewable instead of hiding inside shapes.ts.
// Rows are kept one per line rather than let Prettier expand each coordinate
// pair — the point of this table is that it looks like the board.
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

// Reads as `original(3, 1)` — the same coordinates the Angular spec used.
function original(row: number, col: number): Axial {
    const [q, r] = ORIGINAL_LAYOUT[row][col];
    return { q, r };
}

function mapOf(shape: readonly Axial[]): Map<string, Axial> {
    return new Map(shape.map((coord) => [key(coord), coord]));
}

function sortedKeys(coords: readonly Axial[]): string[] {
    return coords.map(key).sort();
}

const VARIANTS = [
    { name: "base game", shape: BASE_GAME_SHAPE, hexCount: 19 },
    { name: "base game 5-6", shape: BASE_GAME_56_SHAPE, hexCount: 30 },
    { name: "seafarers", shape: SEAFARERS_SHAPE, hexCount: 42 },
] as const;

describe.each(VARIANTS)("$name shape", ({ shape, hexCount }) => {
    test(`has ${hexCount} hexes`, () => {
        expect(shape).toHaveLength(hexCount);
    });

    test("has no duplicate coordinates", () => {
        expect(new Set(shape.map(key)).size).toBe(shape.length);
    });

    test("adjacency is symmetric", () => {
        const hexes = mapOf(shape);

        for (const coord of shape) {
            for (const found of neighbors(hexes, coord)) {
                expect(sortedKeys(neighbors(hexes, found))).toContain(
                    key(coord),
                );
            }
        }
    });

    test("every hex has between 2 and 6 neighbors", () => {
        const hexes = mapOf(shape);

        for (const coord of shape) {
            const count = neighbors(hexes, coord).length;
            expect(count).toBeGreaterThanOrEqual(2);
            expect(count).toBeLessThanOrEqual(6);
        }
    });

    // A typo in one of the row ranges in shapes.ts would most likely show up as
    // a detached hex or a detached run of hexes, which the count and duplicate
    // checks above would both miss.
    test("is a single connected landmass", () => {
        const hexes = mapOf(shape);
        const seen = new Set([key(shape[0])]);
        const queue = [shape[0]];

        while (queue.length > 0) {
            for (const found of neighbors(hexes, queue.pop()!)) {
                if (!seen.has(key(found))) {
                    seen.add(key(found));
                    queue.push(found);
                }
            }
        }

        expect(seen.size).toBe(shape.length);
    });
});

describe("base game shape", () => {
    // Confirms the row ranges really do describe a hexagon of radius 2, rather
    // than trusting that the five ranges were transcribed correctly.
    test("is a hexagon of radius 2", () => {
        for (const coord of BASE_GAME_SHAPE) {
            expect(distance(coord, { q: 0, r: 0 })).toBeLessThanOrEqual(2);
        }
    });

    test("contains every coordinate within radius 2", () => {
        const hexes = mapOf(BASE_GAME_SHAPE);

        for (let q = -2; q <= 2; q++) {
            for (let r = -2; r <= 2; r++) {
                if (Math.abs(q + r) > 2) {
                    continue;
                }
                expect(hexes.has(key({ q, r }))).toBe(true);
            }
        }
    });
});

// The 5-6 player extension board. Nothing in the Angular original describes it
// (ROADMAP §9.8), so there is no characterization table to pin it against the
// way the Seafarers shape is pinned below — these assertions have to stand in
// for one, by checking the closed-form description in shapes.ts rather than
// restating the row ranges it was written from.
describe("base game 5-6 shape", () => {
    // The 3-4-5-6-5-4-3 of the physical board, which is the one fact about it
    // anyone can check by looking at the box.
    test("has rows of 3-4-5-6-5-4-3", () => {
        const lengths = new Map<number, number>();

        for (const { r } of BASE_GAME_56_SHAPE) {
            lengths.set(r, (lengths.get(r) ?? 0) + 1);
        }

        expect(
            [...lengths.entries()]
                .sort(([a], [b]) => a - b)
                .map(([, length]) => length),
        ).toEqual([3, 4, 5, 6, 5, 4, 3]);
    });

    // A semi-regular hexagon with sides alternating 3 and 4: three cube bounds,
    // two of width 6 and one of width 7. Both directions, so neither a stray
    // coordinate nor a missing one can hide.
    test("is the cube-bounded hexagon shapes.ts claims", () => {
        const withinBounds = ({ q, r }: Axial): boolean =>
            q >= -3 &&
            q <= 2 &&
            r >= -3 &&
            r <= 3 &&
            -q - r >= -2 &&
            -q - r <= 3;

        for (const coord of BASE_GAME_56_SHAPE) {
            expect(withinBounds(coord)).toBe(true);
        }

        const hexes = mapOf(BASE_GAME_56_SHAPE);

        for (let q = -3; q <= 2; q++) {
            for (let r = -3; r <= 3; r++) {
                if (!withinBounds({ q, r })) {
                    continue;
                }
                expect(hexes.has(key({ q, r }))).toBe(true);
            }
        }
    });

    // The extension adds tiles to the standard board rather than replacing it,
    // so the radius-2 hexagon has to sit inside this frame. Not arithmetic
    // either shape states about itself — it is only true because the two row
    // tables were written to the same origin.
    test("contains the 3-4 player board it extends", () => {
        const hexes = mapOf(BASE_GAME_56_SHAPE);

        for (const coord of BASE_GAME_SHAPE) {
            expect(hexes.has(key(coord))).toBe(true);
        }

        expect(BASE_GAME_56_SHAPE).toHaveLength(BASE_GAME_SHAPE.length + 11);
    });
});

describe("seafarers shape", () => {
    // Pins the shape to the original board rather than to this port's own row
    // ranges: if the two ever disagree, the port moved a hex.
    test("is exactly the original board's 42 hexes", () => {
        const fromOriginal = ORIGINAL_LAYOUT.flat().map(([q, r]) => ({ q, r }));

        expect(fromOriginal).toHaveLength(42);
        expect(sortedKeys(fromOriginal)).toEqual(sortedKeys(SEAFARERS_SHAPE));
    });

    // Ported from `_models.tests/SeafarersMap.spec.ts`, "list neighbors
    // simple". This is the characterization test ROADMAP §9 makes the gate for
    // the whole phase.
    test("hex (0,0) has exactly 3 neighbors: (1,0) (1,1) (2,1)", () => {
        const found = neighbors(mapOf(SEAFARERS_SHAPE), original(0, 0));

        expect(found).toHaveLength(3);
        expect(sortedKeys(found)).toEqual(
            sortedKeys([original(1, 0), original(1, 1), original(2, 1)]),
        );
    });

    // Ported from the same spec, "list neighbors for a middle hex odd row".
    test("hex (3,1) has exactly 6 neighbors, the expected six", () => {
        const found = neighbors(mapOf(SEAFARERS_SHAPE), original(3, 1));

        expect(found).toHaveLength(6);
        expect(sortedKeys(found)).toEqual(
            sortedKeys([
                original(2, 1),
                original(2, 2),
                original(1, 1),
                original(4, 1),
                original(4, 2),
                original(5, 1),
            ]),
        );
    });

    // ROADMAP §4.8: the original reported hex (1,0) as adjacent to itself and
    // gave hex (2,0) a duplicated neighbor. Both were artifacts of its
    // coordinate inverse, and both are asserted gone on the real board here.
    test("the two hexes the original's inverse got wrong are correct", () => {
        const hexes = mapOf(SEAFARERS_SHAPE);

        const westEdge = neighbors(hexes, original(1, 0));
        expect(sortedKeys(westEdge)).toEqual(
            sortedKeys([
                original(0, 0),
                original(2, 0),
                original(2, 1),
                original(3, 0),
            ]),
        );
        expect(sortedKeys(westEdge)).not.toContain(key(original(1, 0)));

        const corner = neighbors(hexes, original(2, 0));
        expect(sortedKeys(corner)).toEqual(
            sortedKeys([original(1, 0), original(3, 0), original(4, 0)]),
        );
    });

    test("no hex has an off-board neighbor in the map", () => {
        const hexes = mapOf(SEAFARERS_SHAPE);

        for (const coord of SEAFARERS_SHAPE) {
            const around = neighborCoords(coord);
            const onBoard = around.filter((c) => hexes.has(key(c)));
            expect(neighbors(hexes, coord)).toHaveLength(onBoard.length);
        }
    });
});
