// Pointy-top hex geometry (ROADMAP §6): axial coordinate → pixel center, and
// the six polygon corners. The redblobgames layout math the Angular original
// already cited, except the original never actually used it — it positioned ~30
// tile PNGs with hand-tuned percentage offsets over a background image, which is
// why its board could not be resized or reasoned about. Computing the polygon
// instead deletes every image and every magic offset.
//
// This lives in src/domain/ rather than next to the components because it is
// arithmetic: no DOM, no React, no units. That keeps it in the fast test tier,
// where the tiling properties (neighbors touch, corners are shared, nothing
// overlaps) can be checked exhaustively over both board shapes.
//
// Not to be confused with `vertexTriples` in hex.ts: that answers "which hexes
// meet at a settlement spot" in coordinates, this answers "where do I draw"
// in pixels. Neither is derived from the other.

import { DIRECTIONS } from "@/domain/hex";
import type { Axial, Direction } from "@/domain/hex";

export type Point = { x: number; y: number };

// Circumradius, in arbitrary user units. Every consumer draws inside a viewBox
// computed from this same constant, so the value only sets the precision of the
// numbers in the markup — the rendered size comes from the SVG's CSS box.
export const HEX_SIZE = 10;

// Distance between the centers of two adjacent hexes, and therefore the width of
// a pointy-top hex. Exported because it is the natural unit for sizing anything
// drawn on a tile (chits, port markers) without restating the √3.
export const HEX_WIDTH = Math.sqrt(3) * HEX_SIZE;

// Half the height of a hex measured flat-side to flat-side: the radius of the
// inscribed circle, and how far an edge midpoint sits from the center.
export const HEX_INRADIUS = HEX_WIDTH / 2;

const CORNER_COUNT = 6;

function degreesToRadians(degrees: number): number {
    return (degrees * Math.PI) / 180;
}

// Linear in (q, r) with no constant term, which is the property `sideAngle` and
// `sideMidpoint` below rely on: the pixel offset to a neighbor is the center of
// that neighbor's unit direction vector.
export function hexCenter({ q, r }: Axial): Point {
    return {
        x: HEX_WIDTH * (q + r / 2),
        y: HEX_SIZE * 1.5 * r,
    };
}

// The six corners, counter-clockwise from the east-north-east one. Pointy-top
// means the first corner sits at -30° rather than at 0°.
export function hexCorners(coord: Axial): Point[] {
    const center = hexCenter(coord);

    return Array.from({ length: CORNER_COUNT }, (_, i) => {
        const angle = degreesToRadians(60 * i - 30);

        return {
            x: center.x + HEX_SIZE * Math.cos(angle),
            y: center.y + HEX_SIZE * Math.sin(angle),
        };
    });
}

// Where the center of a side sits, in pixels. Derived from `hexCenter` of the
// direction vector rather than from a second table of offsets: ROADMAP §4.4 and
// §4.8 are both bugs where a second hand-written table disagreed with the first
// one, and there is no reason to open that door again here.
export function sideMidpoint(coord: Axial, side: Direction): Point {
    const center = hexCenter(coord);
    const step = hexCenter(DIRECTIONS[side]);

    return {
        x: center.x + step.x / 2,
        y: center.y + step.y / 2,
    };
}

// The rotation, in degrees, that turns "pointing east" into "pointing out
// through this side" — what a port marker needs. Screen coordinates, so y grows
// downward and positive angles turn clockwise. Independent of which hex is
// asking, because every hex has the same six sides.
export function sideAngle(side: Direction): number {
    const step = hexCenter(DIRECTIONS[side]);

    return (Math.atan2(step.y, step.x) * 180) / Math.PI;
}

export type ViewBox = {
    minX: number;
    minY: number;
    width: number;
    height: number;
};

// Bounds tight around every corner of every hex, so a board of any shape frames
// itself. No per-variant tuning, which is what lets Phases 9-10 add a shape
// without touching the renderer.
export function boardViewBox(
    coords: readonly Axial[],
    padding = HEX_SIZE * 0.1,
): ViewBox {
    const corners = coords.flatMap(hexCorners);

    if (corners.length === 0) {
        return { minX: 0, minY: 0, width: 0, height: 0 };
    }

    const xs = corners.map((corner) => corner.x);
    const ys = corners.map((corner) => corner.y);
    const minX = Math.min(...xs) - padding;
    const minY = Math.min(...ys) - padding;

    return {
        minX,
        minY,
        width: Math.max(...xs) + padding - minX,
        height: Math.max(...ys) + padding - minY,
    };
}

// Trigonometry leaves tails like 8.660254037844387 on every corner, and every
// one of them would land verbatim in an SVG attribute. Three decimals is a
// thousandth of a hex — far below anything a screen can show. `+ 0` normalizes
// the negative zero that cos(90°) produces.
export function svgNumber(value: number): number {
    return Number(value.toFixed(3)) + 0;
}

// The `viewBox` attribute's four-number string.
export function viewBoxAttribute(box: ViewBox): string {
    return [box.minX, box.minY, box.width, box.height].map(svgNumber).join(" ");
}

// A hex's outline as an SVG `points` attribute. Formatting lives here beside
// the geometry rather than in the component, so it is covered by the fast test
// tier instead of only by a three-browser run.
export function polygonPoints(coord: Axial): string {
    return hexCorners(coord)
        .map(({ x, y }) => `${svgNumber(x)},${svgNumber(y)}`)
        .join(" ");
}
