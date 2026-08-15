// The board outlines, as plain axial coordinate lists (ROADMAP §3). Both
// variants are data rather than code: the original carried a separate
// `BaseMapGenerator` with its own 5x5 grid walk that shared nothing with the
// Seafarers pipeline, and that duplicate code path is deleted rather than
// ported.
//
// Every row of both shapes turns out to be a contiguous run of q, so one
// helper describes both — and will describe the 5-6 player boards in Phases
// 9-10 too. Note this is a *description* of an axial shape, not a revival of
// offset math: no row parity rule, no coordinate conversion, no inverse.

import type { Axial } from "@/domain/hex";

type Row = { r: number; from: number; to: number };

function hexRows(rows: readonly Row[]): readonly Axial[] {
    return rows.flatMap(({ r, from, to }) => {
        const row: Axial[] = [];
        for (let q = from; q <= to; q++) {
            row.push({ q, r });
        }
        return row;
    });
}

// The standard 19-hex board: a hexagon of radius 2. Equivalent to the
// 3-4-5-4-3 mask that `shouldCreateHexForPosition` built in the original's
// base-map-generator.service.ts, and shapes.test.ts checks the radius directly
// rather than trusting these ranges.
export const BASE_GAME_SHAPE: readonly Axial[] = hexRows([
    { r: -2, from: 0, to: 2 },
    { r: -1, from: -1, to: 2 },
    { r: 0, from: -2, to: 2 },
    { r: 1, from: -2, to: 1 },
    { r: 2, from: -2, to: 0 },
]);

// The 42-hex Seafarers frame. These are the very coordinates the original's
// `convertHexCoordsToHexBlobCube` already produced for its 13 jagged rows — its
// (q, r) pairs were a valid axial system all along, which is why the port needs
// only to drop the inverse. shapes.test.ts pins this to a literal table of the
// original's (row, col) hexes so the translation stays reviewable.
export const SEAFARERS_SHAPE: readonly Axial[] = hexRows([
    { r: -1, from: 1, to: 3 },
    { r: 0, from: -1, to: 3 },
    { r: 1, from: -2, to: 3 },
    { r: 2, from: -3, to: 3 },
    { r: 3, from: -3, to: 3 },
    { r: 4, from: -3, to: 2 },
    { r: 5, from: -3, to: 1 },
    { r: 6, from: -3, to: -1 },
]);
