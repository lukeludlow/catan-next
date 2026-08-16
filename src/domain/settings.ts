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

// 28 chits: 2x2, 3-6 x3, 8-11 x3, 12x2. All three of the larger boards deal
// from this bag. For Seafarers and the Base Game 5-6 player extension that is a
// coincidence of two boxes; for Seafarers 5-6 it is the same 28 arrived at a
// third way, because its rules have you set the Seafarers discs aside and use
// CATAN's 18 plus CATAN 5-6's 10 instead. Three ways to the same bag is worth
// naming once rather than typing three times. settings.test.ts still pins each
// variant's bag against its own literal, so sharing the object cannot let one
// drift unnoticed.
const EXTENSION_DICE_NUMBERS: MapSettings["diceNumbers"] = {
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
};

// The 5-6 player extension (ROADMAP §9 Phase 9). Exact counts summing to 30,
// like the 3-4 player board and unlike Seafarers: 28 resource hexes against a
// 28-chit pool, again with nothing spare.
//
// ROADMAP §11: the tile and chit counts are read off the physical components,
// but the 11-harbour mix is *not* verified against the box — it is the 3-4
// player board's nine with the extension's two extra harbours assumed generic.
// Nothing automated can catch a wrong port count, so it is flagged rather than
// presented as transcribed.
export const BASE_GAME_56_SETTINGS: MapSettings = {
    terrainCounts: {
        brick: { min: 5, max: 5 },
        desert: { min: 2, max: 2 },
        gold: { min: 0, max: 0 },
        rock: { min: 5, max: 5 },
        sea: { min: 0, max: 0 },
        sheep: { min: 6, max: 6 },
        tree: { min: 6, max: 6 },
        wheat: { min: 6, max: 6 },
    },
    diceNumbers: EXTENSION_DICE_NUMBERS,
    ports: { brick: 1, rock: 1, sheep: 1, tree: 1, wheat: 1, any: 6 },
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
    diceNumbers: EXTENSION_DICE_NUMBERS,
    ports: { brick: 1, rock: 1, sheep: 1, tree: 1, wheat: 1, any: 5 },
};

// Seafarers for 5-6 players (ROADMAP §9 Phase 10). The maxes are what three
// boxes hold between them — the Seafarers box, the CATAN 5-6 extension, and the
// Seafarers 5-6 extension's 7 sea, 2 gold and 1 desert — so each resource is
// 5+2, gold is 2+2 and sea is 19+7. The mins keep the 3-4 board's proportion of
// roughly two fifths of the max.
//
// The chit bag does *not* grow with the board, which is the fact this variant is
// really built around: the 5-6 extension ships no number tokens, and its rules
// have you use CATAN's plus CATAN 5-6's — the same 28. So a 5-6 player Seafarers
// board is a bigger *ocean* rather than much more land, and it is bounded by 28
// resource hexes exactly as the 3-4 board is bounded by 27.
export const SEAFARERS_56_SETTINGS: MapSettings = {
    terrainCounts: {
        brick: { min: 3, max: 7 },
        // ROADMAP §11, as seafarers: no deserts, and no robber to put on one.
        desert: { min: 0, max: 0 },
        gold: { min: 0, max: 4 },
        rock: { min: 3, max: 7 },
        // Derived rather than chosen (ROADMAP §9 Phase 10): land is whatever the
        // 52-hex frame has left over after sea, so the sea minimum is what caps
        // the resource hexes. 52 - 24 = 28, the chit pool exactly — one lower
        // and a board could want a 29th chit that does not exist.
        sea: { min: 24, max: 26 },
        sheep: { min: 3, max: 7 },
        tree: { min: 3, max: 7 },
        wheat: { min: 3, max: 7 },
    },
    diceNumbers: EXTENSION_DICE_NUMBERS,
    // ROADMAP §11, and the same caveat as the Base Game extension: the box lists
    // "2 harbor tokens" without saying which, so both are taken generic on top
    // of Seafarers' ten. Every other number in this object is checkable by a
    // test; this one is only checkable against the components.
    ports: { brick: 1, rock: 1, sheep: 1, tree: 1, wheat: 1, any: 7 },
};
