import { describe, expect, test } from "vitest";
import {
    DIRECTIONS,
    Direction,
    key,
    neighbor,
    neighborCoords,
    neighbors,
} from "@/domain/hex";
import type { Axial } from "@/domain/hex";

// Cube distance from the origin. A coordinate is adjacent to the origin iff
// this is 1, which is the property that makes DIRECTIONS a legal direction set.
function cubeLength({ q, r }: Axial): number {
    return (Math.abs(q) + Math.abs(r) + Math.abs(q + r)) / 2;
}

function mapOf(coords: readonly Axial[]): Map<string, Axial> {
    return new Map(coords.map((coord) => [key(coord), coord]));
}

describe("DIRECTIONS", () => {
    test("is six distinct steps", () => {
        expect(DIRECTIONS).toHaveLength(6);
        expect(new Set(DIRECTIONS.map(key)).size).toBe(6);
    });

    test("every step is one hex away", () => {
        for (const step of DIRECTIONS) {
            expect(cubeLength(step)).toBe(1);
        }
    });

    test("steps three apart are opposites", () => {
        for (let i = 0; i < 3; i++) {
            const step = DIRECTIONS[i];
            const opposite = DIRECTIONS[i + 3];
            expect({
                q: step.q + opposite.q,
                r: step.r + opposite.r,
            }).toEqual({ q: 0, r: 0 });
        }
    });

    test("the named directions index the step list", () => {
        expect(DIRECTIONS[Direction.East]).toEqual({ q: 1, r: 0 });
        expect(DIRECTIONS[Direction.NorthWest]).toEqual({ q: 0, r: -1 });
        expect(DIRECTIONS[Direction.SouthEast]).toEqual({ q: 0, r: 1 });
    });
});

describe("key", () => {
    test("is distinct for negative, zero, and positive coordinates", () => {
        const coords: Axial[] = [
            { q: 0, r: 0 },
            { q: -1, r: 0 },
            { q: 1, r: 0 },
            { q: 0, r: -1 },
            { q: 0, r: 1 },
            { q: -3, r: 6 },
        ];

        expect(new Set(coords.map(key)).size).toBe(coords.length);
    });

    test("does not confuse a negative q with a negative r", () => {
        expect(key({ q: -1, r: 2 })).not.toBe(key({ q: 1, r: -2 }));
        expect(key({ q: -1, r: 2 })).toBe("-1,2");
    });
});

describe("neighbor", () => {
    test("steps one hex in the named direction", () => {
        const origin = { q: 0, r: 0 };

        expect(neighbor(origin, Direction.East)).toEqual({ q: 1, r: 0 });
        expect(neighbor(origin, Direction.SouthWest)).toEqual({ q: -1, r: 1 });
    });

    test("stepping then stepping back returns to the start", () => {
        const start = { q: -3, r: 6 };
        const east = neighbor(start, Direction.East);

        expect(neighbor(east, Direction.West)).toEqual(start);
    });
});

describe("neighborCoords", () => {
    test("returns six distinct coordinates, none of them the input", () => {
        const at = { q: 2, r: -1 };
        const around = neighborCoords(at);

        expect(around).toHaveLength(6);
        expect(new Set(around.map(key)).size).toBe(6);
        expect(around.map(key)).not.toContain(key(at));
    });

    test("every coordinate is exactly one hex away", () => {
        const at = { q: -3, r: 4 };

        for (const coord of neighborCoords(at)) {
            expect(cubeLength({ q: coord.q - at.q, r: coord.r - at.r })).toBe(
                1,
            );
        }
    });
});

describe("neighbors", () => {
    test("returns the payload of each adjacent hex that exists", () => {
        const hexes = new Map([
            [key({ q: 0, r: 0 }), "centre"],
            [key({ q: 1, r: 0 }), "east"],
            [key({ q: 0, r: 1 }), "south east"],
        ]);

        expect(neighbors(hexes, { q: 0, r: 0 }).sort()).toEqual([
            "east",
            "south east",
        ]);
    });

    test("returns nothing for an isolated hex", () => {
        const hexes = mapOf([{ q: 5, r: 5 }]);

        expect(neighbors(hexes, { q: 5, r: 5 })).toEqual([]);
    });

    test("finds all six when the hex is surrounded", () => {
        const at = { q: 0, r: 0 };
        const hexes = mapOf([at, ...neighborCoords(at)]);

        expect(neighbors(hexes, at)).toHaveLength(6);
    });

    // Regression for ROADMAP §4.8. The original's coordinate inverse mapped an
    // off-board coordinate back onto the hex it started from, so hex (1, 0) of
    // the Seafarers board was reported as adjacent to itself.
    test("never reports a hex as its own neighbor", () => {
        const at = { q: -2, r: 1 };
        const hexes = mapOf([at, ...neighborCoords(at)]);

        expect(neighbors(hexes, at).map(key)).not.toContain(key(at));
    });

    // Regression for ROADMAP §4.8. Two off-board directions could invert onto
    // the same real hex, so hex (2, 0) had one neighbor listed twice — the same
    // duplicate-bias mechanism as §4.4.
    test("never lists the same neighbor twice", () => {
        const at = { q: -3, r: 2 };
        const hexes = mapOf([at, ...neighborCoords(at)]);
        const found = neighbors(hexes, at).map(key);

        expect(new Set(found).size).toBe(found.length);
    });
});
