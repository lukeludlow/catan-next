// The board outlines, as plain axial coordinate lists (ROADMAP §3). Both
// variants are data rather than code: the original carried a separate
// `BaseMapGenerator` with its own 5x5 grid walk that shared nothing with the
// Seafarers pipeline, and that duplicate code path is deleted rather than
// ported.
//
// Every row of every shape turns out to be a contiguous run of q, so one helper
// describes all four, the 5-6 player boards of Phases 9-10 included. Note this
// is a *description* of an axial shape, not a revival of offset math: no row
// parity rule, no coordinate conversion, no inverse.

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

// The 30-hex Base Game 5-6 player extension: rows of 3-4-5-6-5-4-3 (ROADMAP §9
// Phase 9). Unlike the two shapes either side of it, this one is not a
// transcription of anything — the Angular original has no 5-6 player support at
// all (§9.8) — so it is written as a shape with a closed-form description
// instead: the cube-bounded hexagon `q ∈ [-3,2]`, `r ∈ [-3,3]`,
// `s = -q-r ∈ [-2,3]`. That is a semi-regular hexagon with sides alternating 3
// and 4, which is what the physical extension board is, and shapes.test.ts
// checks those bounds in both directions rather than trusting the row table
// below to have been typed correctly.
export const BASE_GAME_56_SHAPE: readonly Axial[] = hexRows([
    { r: -3, from: 0, to: 2 },
    { r: -2, from: -1, to: 2 },
    { r: -1, from: -2, to: 2 },
    { r: 0, from: -3, to: 2 },
    { r: 1, from: -3, to: 1 },
    { r: 2, from: -3, to: 0 },
    { r: 3, from: -3, to: -1 },
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

// The 52-hex Seafarers 5-6 player frame (ROADMAP §9 Phase 10). Like the Base
// Game extension above there is no original to transcribe, but unlike it this
// one is not invented from a closed form either: it is the 42-hex frame with one
// hex added to the trailing edge of every row and one more at each of the two
// short caps. That is ten hexes, which is exactly what the physical 5-6 player
// extension box holds — 7 sea, 2 gold and a desert — so the frame grows by its
// components rather than by a number someone liked.
//
// Three properties follow, and shapes.test.ts checks all three rather than
// restating the row table:
//
//   - it contains SEAFARERS_SHAPE, and is exactly 10 hexes larger;
//   - it is point-symmetric about (0, 2.5), i.e. `(q, r) -> (-q, 5 - r)` maps it
//     onto itself. So is SEAFARERS_SHAPE, which is why the test asserts it for
//     both — a property invented to fit one new shape would prove nothing;
//   - it is the cube-bounded region `q ∈ [-4,4]`, `r ∈ [-1,6]`,
//     `s = -q-r ∈ [-6,1]`.
//
// The last one was not the goal and is worth flagging as a coincidence: the
// 42-hex frame it extends is *not* cube-bounded — (0,-1) sits inside its bounds
// and off its board — and adding the ten hexes is what happens to regularize the
// outline. The test takes the free bidirectional check anyway.
export const SEAFARERS_56_SHAPE: readonly Axial[] = hexRows([
    { r: -1, from: 0, to: 4 },
    { r: 0, from: -1, to: 4 },
    { r: 1, from: -2, to: 4 },
    { r: 2, from: -3, to: 4 },
    { r: 3, from: -4, to: 3 },
    { r: 4, from: -4, to: 2 },
    { r: 5, from: -4, to: 1 },
    { r: 6, from: -4, to: 0 },
]);
