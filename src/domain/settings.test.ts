import { describe, expect, test } from "vitest";
import {
    BASE_GAME_56_SETTINGS,
    BASE_GAME_SETTINGS,
    RESOURCE_TERRAINS,
    SEAFARERS_SETTINGS,
} from "@/domain/settings";

// The invariants that hold across every variant live in variants.test.ts, where
// they are table-driven over the registry (ROADMAP §9.8). What is left here is
// pinning the transcription: these numbers were copied by hand out of the
// Angular app and readme_dev.md, and a digit typed wrong would otherwise show
// up as a board that looks plausible and plays wrong.

describe("base game settings", () => {
    // readme_dev.md, and the `tiles` map in
    // `_generators/base-map-generator.service.ts:117`.
    test("has the standard 19-tile mix", () => {
        expect(BASE_GAME_SETTINGS.terrainCounts).toEqual({
            brick: { min: 3, max: 3 },
            desert: { min: 1, max: 1 },
            gold: { min: 0, max: 0 },
            rock: { min: 3, max: 3 },
            sea: { min: 0, max: 0 },
            sheep: { min: 4, max: 4 },
            tree: { min: 4, max: 4 },
            wheat: { min: 4, max: 4 },
        });
    });

    test("fixes every tile count exactly", () => {
        for (const { min, max } of Object.values(
            BASE_GAME_SETTINGS.terrainCounts,
        )) {
            expect(min).toBe(max);
        }
    });

    test("has 18 chits for its 18 numbered tiles", () => {
        expect(BASE_GAME_SETTINGS.diceNumbers).toEqual({
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
        });
    });

    test("has nine ports, four of them any", () => {
        expect(BASE_GAME_SETTINGS.ports).toEqual({
            brick: 1,
            rock: 1,
            sheep: 1,
            tree: 1,
            wheat: 1,
            any: 4,
        });
    });
});

describe("base game 5-6 settings", () => {
    // The extension's own eleven tiles on top of the standard nineteen: two
    // each of field, forest, pasture, hill and mountain, plus a second desert.
    test("has the 30-tile mix of the extension board", () => {
        expect(BASE_GAME_56_SETTINGS.terrainCounts).toEqual({
            brick: { min: 5, max: 5 },
            desert: { min: 2, max: 2 },
            gold: { min: 0, max: 0 },
            rock: { min: 5, max: 5 },
            sea: { min: 0, max: 0 },
            sheep: { min: 6, max: 6 },
            tree: { min: 6, max: 6 },
            wheat: { min: 6, max: 6 },
        });
    });

    test("fixes every tile count exactly, and they sum to 30", () => {
        const counts = Object.values(BASE_GAME_56_SETTINGS.terrainCounts);

        for (const { min, max } of counts) {
            expect(min).toBe(max);
        }

        expect(counts.reduce((total, { min }) => total + min, 0)).toBe(30);
    });

    test("has 28 chits for its 28 numbered tiles", () => {
        expect(BASE_GAME_56_SETTINGS.diceNumbers).toEqual({
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
        });
    });

    // ROADMAP §11: the one number here that was *not* read off the components.
    // The chit-pool invariant in variants.test.ts catches an inconsistent
    // tile/chit pair; nothing automated can catch a wrong port count, so this
    // test pins the assumption rather than a transcription.
    test("has eleven ports, six of them any", () => {
        expect(BASE_GAME_56_SETTINGS.ports).toEqual({
            brick: 1,
            rock: 1,
            sheep: 1,
            tree: 1,
            wheat: 1,
            any: 6,
        });
    });

    // The two 28-chit variants share one bag object in settings.ts. Each is
    // pinned against its own literal above, so this only records that the
    // sharing is deliberate — and would fail loudly if one were ever edited in
    // the belief that it stood alone.
    test("draws from the same chit bag as seafarers", () => {
        expect(BASE_GAME_56_SETTINGS.diceNumbers).toEqual(
            SEAFARERS_SETTINGS.diceNumbers,
        );
    });
});

describe("seafarers settings", () => {
    // `_maps/Seafarers/SeafarersSettings.ts`, unchanged. ROADMAP §4.1 once
    // called for raising sea's minimum to 14; Phase 2 showed the shortage that
    // prompted it does not exist, so the original numbers stand.
    test("has the original's variable tile mix", () => {
        expect(SEAFARERS_SETTINGS.terrainCounts).toEqual({
            brick: { min: 2, max: 5 },
            desert: { min: 0, max: 0 },
            gold: { min: 0, max: 2 },
            rock: { min: 2, max: 5 },
            sea: { min: 12, max: 19 },
            sheep: { min: 2, max: 5 },
            tree: { min: 2, max: 5 },
            wheat: { min: 2, max: 5 },
        });
    });

    // ROADMAP §11, recorded so nobody "fixes" it: the original disables deserts
    // on Seafarers even though its own readme documents three, and there is no
    // robber anywhere in the app.
    test("has no deserts", () => {
        expect(SEAFARERS_SETTINGS.terrainCounts.desert).toEqual({
            min: 0,
            max: 0,
        });
    });

    test("has 28 chits", () => {
        expect(SEAFARERS_SETTINGS.diceNumbers).toEqual({
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
        });
    });

    test("has ten ports, five of them any", () => {
        expect(SEAFARERS_SETTINGS.ports).toEqual({
            brick: 1,
            rock: 1,
            sheep: 1,
            tree: 1,
            wheat: 1,
            any: 5,
        });
    });
});

describe("RESOURCE_TERRAINS", () => {
    // `_models/Hex.ts:59`. Sea and desert are the two terrains that produce
    // nothing, and so take no chit and carry no port.
    test("is every terrain except sea and desert", () => {
        expect([...RESOURCE_TERRAINS].sort()).toEqual([
            "brick",
            "gold",
            "rock",
            "sheep",
            "tree",
            "wheat",
        ]);
    });
});
