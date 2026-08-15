import { describe, expect, test } from "vitest";
import {
    DIRECTIONS,
    Direction,
    distance,
    key,
    neighbor,
    neighborCoords,
    neighbors,
    vertexTriples,
} from "@/domain/hex";
import type { Axial } from "@/domain/hex";
import { BASE_GAME_SHAPE, SEAFARERS_SHAPE } from "@/domain/shapes";

const ORIGIN: Axial = { q: 0, r: 0 };

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
            expect(distance(step, ORIGIN)).toBe(1);
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
            expect(distance(coord, at)).toBe(1);
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

describe("distance", () => {
    test("is zero from a hex to itself", () => {
        expect(distance({ q: -3, r: 4 }, { q: -3, r: 4 })).toBe(0);
    });

    test("is one between adjacent hexes and symmetric", () => {
        const at = { q: 2, r: -1 };

        for (const coord of neighborCoords(at)) {
            expect(distance(at, coord)).toBe(1);
            expect(distance(coord, at)).toBe(1);
        }
    });

    // The third cube axis is the implied -q - r, so a step that changes q and r
    // in the same direction covers two hexes rather than one. A naive
    // (|dq| + |dr|) / 2 would call this 2 as well, but would call (1, 1) a
    // distance of 1 — the case that separates cube distance from L1.
    test("counts diagonal steps along the implied third axis", () => {
        expect(distance({ q: 0, r: 0 }, { q: 2, r: 0 })).toBe(2);
        expect(distance({ q: 0, r: 0 }, { q: 1, r: 1 })).toBe(2);
        expect(distance({ q: 0, r: 0 }, { q: -3, r: 6 })).toBe(6);
    });

    test("agrees with counting neighbor steps", () => {
        const start = { q: 1, r: -1 };
        const twoEast = neighbor(
            neighbor(start, Direction.East),
            Direction.East,
        );

        expect(distance(start, twoEast)).toBe(2);
    });
});

describe("vertexTriples", () => {
    test("finds nothing when no three hexes meet", () => {
        expect(vertexTriples([])).toEqual([]);
        expect(vertexTriples([{ q: 0, r: 0 }])).toEqual([]);
        expect(
            vertexTriples([
                { q: 0, r: 0 },
                { q: 1, r: 0 },
            ]),
        ).toEqual([]);
    });

    test("finds the single vertex where three hexes meet", () => {
        const triple = vertexTriples([
            { q: 0, r: 0 },
            { q: 1, r: 0 },
            { q: 0, r: 1 },
        ]);

        expect(triple).toHaveLength(1);
        expect(triple[0].map(key).sort()).toEqual(["0,0", "0,1", "1,0"]);
    });

    // A hex surrounded by all six neighbors sits on six vertices, one per pair
    // of consecutive directions — and each is found three times over, once from
    // every corner, so this is also the deduplication test.
    test("finds six vertices around a fully surrounded hex", () => {
        const at = { q: 0, r: 0 };

        expect(vertexTriples([at, ...neighborCoords(at)])).toHaveLength(6);
    });

    test("returns three mutually adjacent coordinates per vertex", () => {
        for (const corners of vertexTriples(SEAFARERS_SHAPE)) {
            expect(corners).toHaveLength(3);
            expect(distance(corners[0], corners[1])).toBe(1);
            expect(distance(corners[1], corners[2])).toBe(1);
            expect(distance(corners[0], corners[2])).toBe(1);
        }
    });

    test("never returns the same vertex twice", () => {
        const ids = vertexTriples(SEAFARERS_SHAPE).map((corners) =>
            corners.map(key).sort().join(" "),
        );

        expect(new Set(ids).size).toBe(ids.length);
    });

    // Pinned so a change to either shape that quietly alters how many
    // settlement spots exist shows up here rather than in a balance rule.
    test("counts the vertices of both boards", () => {
        expect(vertexTriples(BASE_GAME_SHAPE)).toHaveLength(24);
        expect(vertexTriples(SEAFARERS_SHAPE)).toHaveLength(62);
    });
});
