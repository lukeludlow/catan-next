import { describe, expect, test } from "vitest";
import { playersLabel } from "@/components/controls/playersLabel";
import { ALL_VARIANTS } from "@/domain/variants";

describe("playersLabel", () => {
    // The gap between what the URL says and what a player reads: `?players=6`
    // is the 5-6 player board, not a six-player-only one.
    test("names the range, not the bound the URL carries", () => {
        expect(playersLabel(4)).toBe("3–4");
        expect(playersLabel(6)).toBe("5–6");
    });

    test("labels every variant in the registry", () => {
        for (const variant of ALL_VARIANTS) {
            expect(playersLabel(variant.players)).toMatch(/^\d–\d$/);
        }
    });
});
