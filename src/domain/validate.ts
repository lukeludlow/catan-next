// Step four of the pipeline: the predicates a finished board must satisfy
// (ROADMAP §5, docs/GENERATION.md). Questions only — no retry loop, no
// generation. generate.ts owns the loop; this file owns the answers.
//
// Two of these are checks the generator now satisfies by construction rather
// than by luck: islands are grown to the requested count and the reds are
// seated apart before anything else is dealt. They stay here anyway, and
// generate.ts still runs them, because "the algorithm should make this true" is
// a claim worth verifying on every board rather than trusting.

import { key, neighbors, vertexTriples } from "@/domain/hex";
import { isHot } from "@/domain/numbers";
import { RESOURCE_TERRAINS } from "@/domain/settings";
import type { BalanceRules, Hex } from "@/domain/types";

export const DEFAULT_BALANCE: BalanceRules = {
    minIslandSize: 2,
    noAdjacentEqualNumbers: true,
    maxVertexPips: 12,
};

// How many of the 36 dice-roll combinations produce this number — the dots
// printed under it on the chit, and the standard measure of how good a hex is.
export function pipsFor(diceNumber: number): number {
    return 6 - Math.abs(7 - diceNumber);
}

function isResource(hex: Hex): boolean {
    return RESOURCE_TERRAINS.includes(hex.terrain);
}

// The size of every connected landmass, where a landmass is a connected
// component of *resource* hexes.
//
// ROADMAP §4.7: every component counts, whatever its size. The original
// required `island.size >= 3` and so silently ignored one- and two-hex islands
// while still drawing them, which made its islands slider lie. Desert is not a
// resource terrain — matching the original's `isResourceTerrain()` exactly — so
// a desert splits a landmass in two.
//
// Iterative rather than the original's recursion: a 5-6 player Seafarers board
// (Phase 10) is large enough that a recursive walk over one big island is worth
// not having to think about.
export function islandSizes(hexes: ReadonlyMap<string, Hex>): number[] {
    const seen = new Set<string>();
    const sizes: number[] = [];

    for (const [coordKey, hex] of hexes) {
        if (!isResource(hex) || seen.has(coordKey)) {
            continue;
        }

        const stack: Hex[] = [hex];
        seen.add(coordKey);
        let size = 0;

        while (stack.length > 0) {
            const current = stack.pop() as Hex;
            size++;

            for (const around of neighbors(hexes, current.coord)) {
                if (isResource(around) && !seen.has(key(around.coord))) {
                    seen.add(key(around.coord));
                    stack.push(around);
                }
            }
        }

        sizes.push(size);
    }

    return sizes;
}

export function countIslands(hexes: ReadonlyMap<string, Hex>): number {
    return islandSizes(hexes).length;
}

// The official rule: the two red numbers may not touch.
export function hasAdjacentSixOrEight(
    hexes: ReadonlyMap<string, Hex>,
): boolean {
    for (const hex of hexes.values()) {
        if (!isHot(hex.diceNumber)) {
            continue;
        }

        if (
            neighbors(hexes, hex.coord).some((around) =>
                isHot(around.diceNumber),
            )
        ) {
            return true;
        }
    }

    return false;
}

// A balance rule, not a rule of Catan: two 9s side by side are legal but dull.
export function hasAdjacentEqualNumbers(
    hexes: ReadonlyMap<string, Hex>,
): boolean {
    for (const hex of hexes.values()) {
        if (hex.diceNumber === undefined) {
            continue;
        }

        if (
            neighbors(hexes, hex.coord).some(
                (around) => around.diceNumber === hex.diceNumber,
            )
        ) {
            return true;
        }
    }

    return false;
}

// The value of the best settlement spot on the board, in pips. A vertex where
// three hexes meet is worth the sum of their pips; a vertex touching sea,
// desert or the edge of the board is worth less, and is not what this bounds.
export function maxVertexPips(hexes: ReadonlyMap<string, Hex>): number {
    const coords = [...hexes.values()].map((hex) => hex.coord);
    let best = 0;

    for (const corners of vertexTriples(coords)) {
        const pips = corners.reduce((total, corner) => {
            const diceNumber = hexes.get(key(corner))?.diceNumber;
            return total + (diceNumber === undefined ? 0 : pipsFor(diceNumber));
        }, 0);

        best = Math.max(best, pips);
    }

    return best;
}

export type BoardConstraints = BalanceRules & {
    // Absent means the board is not held to an island count, which is the Base
    // Game — it has no sea, so the count is always 1.
    islands?: number;
};

export function isValidBoard(
    hexes: ReadonlyMap<string, Hex>,
    constraints: BoardConstraints,
): boolean {
    const sizes = islandSizes(hexes);

    if (
        constraints.islands !== undefined &&
        sizes.length !== constraints.islands
    ) {
        return false;
    }

    if (sizes.some((size) => size < constraints.minIslandSize)) {
        return false;
    }

    if (hasAdjacentSixOrEight(hexes)) {
        return false;
    }

    if (constraints.noAdjacentEqualNumbers && hasAdjacentEqualNumbers(hexes)) {
        return false;
    }

    return maxVertexPips(hexes) <= constraints.maxVertexPips;
}
