// The two variants' bag contents (ROADMAP §5), ported from the Angular
// original: Seafarers from `_maps/Seafarers/SeafarersSettings.ts`, Base Game
// from the `tiles` and `diceNumbers` maps hardcoded inside
// `_generators/base-map-generator.service.ts:117`. Pulling the Base Game's
// numbers out of that generator and into data is what lets both variants share
// one pipeline in Phase 3 instead of the two unrelated code paths the original
// carried.
//
// The original's `requiredHexesCount` field is deliberately not ported. A hex
// count that lives in the settings can disagree with the shape it is paired
// with; here the count comes from the shape itself, and variants.ts is what
// pairs the two.

import type { MapSettings, Terrain } from "@/domain/types";

// The terrains that produce something, and therefore the ones that take a dice
// chit and can carry a port. Sea and desert are the exceptions, exactly as in
// the original's `Hex.isResourceTerrain()` (`_models/Hex.ts:59`). Variant-
// independent Catan data, so it lives here rather than being restated by each
// module that needs it.
export const RESOURCE_TERRAINS: readonly Terrain[] = [
    "brick",
    "gold",
    "rock",
    "sheep",
    "tree",
    "wheat",
];

// Every count is exact (min === max) and they sum to exactly 19 — the standard
// board has a fixed tile mix, unlike Seafarers.
export const BASE_GAME_SETTINGS: MapSettings = {
    terrainCounts: {
        brick: { min: 3, max: 3 },
        desert: { min: 1, max: 1 },
        gold: { min: 0, max: 0 },
        rock: { min: 3, max: 3 },
        sea: { min: 0, max: 0 },
        sheep: { min: 4, max: 4 },
        tree: { min: 4, max: 4 },
        wheat: { min: 4, max: 4 },
    },
    // 18 chits for 18 resource hexes (19 tiles less the desert) — exactly
    // enough, with nothing spare. variants.test.ts asserts that rather than
    // leaving it to be rediscovered.
    diceNumbers: {
        2: 1,
        3: 2,
        4: 2,
        5: 2,
        6: 2,
        8: 2,
        9: 2,
        10: 2,
        11: 2,
        12: 1,
    },
    ports: { brick: 1, rock: 1, sheep: 1, tree: 1, wheat: 1, any: 4 },
};

export const SEAFARERS_SETTINGS: MapSettings = {
    terrainCounts: {
        brick: { min: 2, max: 5 },
        // ROADMAP §11: the original sets Seafarers' deserts to zero even though
        // its own readme_dev.md documents 3, and there is no robber anywhere in
        // the app. Kept as it shipped — this is not an oversight to fix.
        desert: { min: 0, max: 0 },
        gold: { min: 0, max: 2 },
        rock: { min: 2, max: 5 },
        // ROADMAP §4.1: an earlier reading of this file concluded that a sea
        // minimum of 12 let resource hexes outnumber the chits. It does not —
        // the terrain maxes cap resources at 27 against a 28-chit pool — so the
        // original's numbers stand unchanged.
        sea: { min: 12, max: 19 },
        sheep: { min: 2, max: 5 },
        tree: { min: 2, max: 5 },
        wheat: { min: 2, max: 5 },
    },
    diceNumbers: {
        2: 2,
        3: 3,
        4: 3,
        5: 3,
        6: 3,
        8: 3,
        9: 3,
        10: 3,
        11: 3,
        12: 2,
    },
    ports: { brick: 1, rock: 1, sheep: 1, tree: 1, wheat: 1, any: 5 },
};
