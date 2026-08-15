import { describe, expect, test } from "vitest";
import { hexLabel } from "@/components/board/hexLabel";
import { Direction } from "@/domain/hex";
import { generateBoard } from "@/domain/generate";
import { mulberry32 } from "@/domain/rng";
import type { Hex } from "@/domain/types";
import { VARIANTS } from "@/domain/variants";

const at = { q: 0, r: 0 };

describe("hexLabel", () => {
    test.each<[string, Hex]>([
        ["sea", { coord: at, terrain: "sea" }],
        ["desert", { coord: at, terrain: "desert" }],
        ["wheat 8", { coord: at, terrain: "wheat", diceNumber: 8 }],
        ["gold 2", { coord: at, terrain: "gold", diceNumber: 2 }],
        [
            "sheep 5, brick port",
            {
                coord: at,
                terrain: "sheep",
                diceNumber: 5,
                port: { resource: "brick", side: Direction.East },
            },
        ],
        [
            "rock 9, any port",
            {
                coord: at,
                terrain: "rock",
                diceNumber: 9,
                port: { resource: "any", side: Direction.SouthWest },
            },
        ],
    ])("names a hex %o", (expected, hex) => {
        expect(hexLabel(hex)).toBe(expected);
    });

    // The side a port sits on is visible in the rendering, not in the name: a
    // player asking "what is on this tile" does not care, and putting it in the
    // name would make every label a compass reading.
    test("does not depend on which side a port is attached to", () => {
        const hex: Hex = {
            coord: at,
            terrain: "tree",
            diceNumber: 4,
            port: { resource: "any", side: Direction.NorthWest },
        };

        expect(hexLabel(hex)).toBe(
            hexLabel({
                ...hex,
                port: { resource: "any", side: Direction.SouthEast },
            }),
        );
    });

    // Names have to be unique enough to query by, but there is no reason for
    // them to be *unique* — two wheat 8s can coexist. What matters is that a
    // real board produces no empty or "undefined"-bearing name (ROADMAP §4.1).
    test("names every hex of a real board without an undefined in sight", () => {
        const board = generateBoard(
            VARIANTS.seafarers,
            { islands: 3 },
            mulberry32(20260815),
        );

        for (const hex of board.hexes.values()) {
            const label = hexLabel(hex);

            expect(label).not.toBe("");
            expect(label).not.toMatch(/undefined|NaN/);
        }
    });
});
