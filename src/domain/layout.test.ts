import { describe, expect, test } from "vitest";
import { DIRECTIONS, key, neighbor } from "@/domain/hex";
import type { Axial, Direction } from "@/domain/hex";
import {
    HEX_INRADIUS,
    HEX_SIZE,
    HEX_WIDTH,
    boardViewBox,
    hexCenter,
    hexCorners,
    polygonPoints,
    sideAngle,
    sideMidpoint,
    viewBoxAttribute,
} from "@/domain/layout";
import type { Point } from "@/domain/layout";
import { ALL_VARIANTS } from "@/domain/variants";

// Corners are trigonometric, so equality between two hexes' shared corners is
// equality to within floating-point noise — the same corner reached from two
// different hexes comes out a few times 1e-15 apart. Six decimals is far
// tighter than any rendering cares about and far looser than that error. The
// `+ 0` matters: cos(90°) is a tiny *negative* number, and without it one hex
// would key a shared corner as "-0" and its neighbor as "0".
function pointKey({ x, y }: Point): string {
    const round = (value: number) => Number(value.toFixed(6)) + 0;

    return `${round(x)},${round(y)}`;
}

function distanceBetween(a: Point, b: Point): number {
    return Math.hypot(a.x - b.x, a.y - b.y);
}

const SIDES = DIRECTIONS.map((_, side) => side as Direction);

describe("hexCenter", () => {
    test("puts the origin hex at the origin", () => {
        expect(hexCenter({ q: 0, r: 0 })).toEqual({ x: 0, y: 0 });
    });

    test("is linear, so a neighbor's center is the center plus a step", () => {
        const at = { q: 2, r: -3 };

        for (const side of SIDES) {
            const step = hexCenter(DIRECTIONS[side]);
            const expected = hexCenter(neighbor(at, side));

            expect(hexCenter(at).x + step.x).toBeCloseTo(expected.x, 10);
            expect(hexCenter(at).y + step.y).toBeCloseTo(expected.y, 10);
        }
    });

    test("spaces every neighbor exactly one hex width away", () => {
        const at = { q: -1, r: 4 };

        for (const side of SIDES) {
            const gap = distanceBetween(
                hexCenter(at),
                hexCenter(neighbor(at, side)),
            );

            expect(gap).toBeCloseTo(HEX_WIDTH, 10);
        }
    });

    test("gives distinct centers to every hex of every variant", () => {
        for (const variant of ALL_VARIANTS) {
            const centers = new Set(
                variant.shape.map((coord) => pointKey(hexCenter(coord))),
            );

            expect(centers.size).toBe(variant.shape.length);
        }
    });
});

describe("hexCorners", () => {
    test("returns six distinct corners, each one size from the center", () => {
        const at = { q: 1, r: 1 };
        const center = hexCenter(at);
        const corners = hexCorners(at);

        expect(corners).toHaveLength(6);
        expect(new Set(corners.map(pointKey)).size).toBe(6);

        for (const corner of corners) {
            expect(distanceBetween(center, corner)).toBeCloseTo(HEX_SIZE, 10);
        }
    });

    test("is pointy-top: the extreme corners are directly above and below", () => {
        const corners = hexCorners({ q: 0, r: 0 });
        const top = corners.reduce((a, b) => (a.y < b.y ? a : b));
        const bottom = corners.reduce((a, b) => (a.y > b.y ? a : b));

        expect(top.x).toBeCloseTo(0, 10);
        expect(bottom.x).toBeCloseTo(0, 10);
        expect(top.y).toBeCloseTo(-HEX_SIZE, 10);
        expect(bottom.y).toBeCloseTo(HEX_SIZE, 10);
    });

    // The property that proves the tiling has neither gaps nor overlaps: if
    // neighbors shared fewer than two corners there would be a seam between
    // them, and if a non-neighbor shared any there would be an overlap.
    test("shares exactly two corners with each neighbor and none otherwise", () => {
        for (const variant of ALL_VARIANTS) {
            const adjacent = (a: Axial, b: Axial) =>
                SIDES.some((side) => key(neighbor(a, side)) === key(b));

            for (const coord of variant.shape) {
                const mine = new Set(hexCorners(coord).map(pointKey));

                for (const other of variant.shape) {
                    if (key(other) === key(coord)) {
                        continue;
                    }

                    const shared = hexCorners(other).filter((corner) =>
                        mine.has(pointKey(corner)),
                    );

                    expect(shared).toHaveLength(adjacent(coord, other) ? 2 : 0);
                }
            }
        }
    });
});

describe("sideMidpoint", () => {
    test("sits on the seam: equidistant from both centers, one inradius out", () => {
        const at = { q: -2, r: 2 };

        for (const side of SIDES) {
            const midpoint = sideMidpoint(at, side);
            const mine = hexCenter(at);
            const theirs = hexCenter(neighbor(at, side));

            expect(distanceBetween(midpoint, mine)).toBeCloseTo(
                HEX_INRADIUS,
                10,
            );
            expect(distanceBetween(midpoint, theirs)).toBeCloseTo(
                HEX_INRADIUS,
                10,
            );
        }
    });

    test("is the midpoint of the two corners that side shares", () => {
        const at = { q: 0, r: 0 };

        for (const side of SIDES) {
            const mine = hexCorners(at).map(pointKey);
            const shared = hexCorners(neighbor(at, side)).filter((corner) =>
                mine.includes(pointKey(corner)),
            );

            expect(shared).toHaveLength(2);

            const midpoint = sideMidpoint(at, side);

            expect(midpoint.x).toBeCloseTo((shared[0].x + shared[1].x) / 2, 10);
            expect(midpoint.y).toBeCloseTo((shared[0].y + shared[1].y) / 2, 10);
        }
    });
});

describe("sideAngle", () => {
    test("points from a hex's center at its neighbor's center", () => {
        const at = { q: 3, r: -1 };

        for (const side of SIDES) {
            const mine = hexCenter(at);
            const theirs = hexCenter(neighbor(at, side));
            const bearing =
                (Math.atan2(theirs.y - mine.y, theirs.x - mine.x) * 180) /
                Math.PI;

            expect(sideAngle(side)).toBeCloseTo(bearing, 10);
        }
    });

    // Pins the direction list's meaning to the rendered geometry: East really is
    // to the right, and NorthEast really is up and to the right (y grows down).
    test("names the compass directions the DIRECTIONS list claims", () => {
        expect(sideAngle(0)).toBeCloseTo(0, 10); // East
        expect(sideAngle(1)).toBeCloseTo(-60, 10); // NorthEast
        expect(sideAngle(2)).toBeCloseTo(-120, 10); // NorthWest
        expect(Math.abs(sideAngle(3))).toBeCloseTo(180, 10); // West
        expect(sideAngle(4)).toBeCloseTo(120, 10); // SouthWest
        expect(sideAngle(5)).toBeCloseTo(60, 10); // SouthEast
    });
});

describe("boardViewBox", () => {
    test("contains every corner of every hex, for every variant", () => {
        for (const variant of ALL_VARIANTS) {
            const box = boardViewBox(variant.shape);

            expect(box.width).toBeGreaterThan(0);
            expect(box.height).toBeGreaterThan(0);

            for (const corner of variant.shape.flatMap(hexCorners)) {
                expect(corner.x).toBeGreaterThanOrEqual(box.minX);
                expect(corner.y).toBeGreaterThanOrEqual(box.minY);
                expect(corner.x).toBeLessThanOrEqual(box.minX + box.width);
                expect(corner.y).toBeLessThanOrEqual(box.minY + box.height);
            }
        }
    });

    test("frames a lone hex as its bounding box plus padding", () => {
        const box = boardViewBox([{ q: 0, r: 0 }], 0);

        expect(box.minX).toBeCloseTo(-HEX_INRADIUS, 10);
        expect(box.minY).toBeCloseTo(-HEX_SIZE, 10);
        expect(box.width).toBeCloseTo(HEX_WIDTH, 10);
        expect(box.height).toBeCloseTo(HEX_SIZE * 2, 10);
    });

    test("pads on all four sides", () => {
        const tight = boardViewBox([{ q: 0, r: 0 }], 0);
        const padded = boardViewBox([{ q: 0, r: 0 }], 5);

        expect(padded.minX).toBeCloseTo(tight.minX - 5, 10);
        expect(padded.minY).toBeCloseTo(tight.minY - 5, 10);
        expect(padded.width).toBeCloseTo(tight.width + 10, 10);
        expect(padded.height).toBeCloseTo(tight.height + 10, 10);
    });

    test("survives an empty coordinate list rather than returning NaN", () => {
        expect(boardViewBox([])).toEqual({
            minX: 0,
            minY: 0,
            width: 0,
            height: 0,
        });
    });
});

describe("viewBoxAttribute", () => {
    test("emits four rounded numbers", () => {
        expect(
            viewBoxAttribute({
                minX: -8.660254,
                minY: -10,
                width: 17.320508,
                height: 20,
            }),
        ).toBe("-8.66 -10 17.321 20");
    });
});

describe("polygonPoints", () => {
    test("emits six rounded coordinate pairs", () => {
        expect(polygonPoints({ q: 0, r: 0 })).toBe(
            "8.66,-5 8.66,5 0,10 -8.66,5 -8.66,-5 0,-10",
        );
    });

    test("matches hexCorners for an off-origin hex", () => {
        const pairs = polygonPoints({ q: -2, r: 3 }).split(" ");
        const corners = hexCorners({ q: -2, r: 3 });

        expect(pairs).toHaveLength(6);

        pairs.forEach((pair, index) => {
            const [x, y] = pair.split(",").map(Number);

            expect(x).toBeCloseTo(corners[index].x, 3);
            expect(y).toBeCloseTo(corners[index].y, 3);
        });
    });

    // A stray "-0" or "1.0000000000000002" in the markup is harmless to render
    // and miserable to diff, which is the whole reason formatting lives in the
    // domain rather than in the component.
    test("never emits a negative zero or an exponent", () => {
        for (const variant of ALL_VARIANTS) {
            for (const coord of variant.shape) {
                expect(polygonPoints(coord)).not.toMatch(/-0[,\s]|-0$|e-/);
            }
        }
    });
});
