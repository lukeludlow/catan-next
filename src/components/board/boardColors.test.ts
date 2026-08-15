import { describe, expect, test } from "vitest";
import {
    TERRAIN_FILL,
    chitInk,
    portFill,
} from "@/components/board/boardColors";
import { RESOURCE_TERRAINS } from "@/domain/settings";
import type { Terrain } from "@/domain/types";

const TERRAINS: Terrain[] = [
    "brick",
    "desert",
    "gold",
    "rock",
    "sea",
    "sheep",
    "tree",
    "wheat",
];

describe("TERRAIN_FILL", () => {
    test("gives every terrain its own token", () => {
        expect(Object.keys(TERRAIN_FILL).sort()).toEqual([...TERRAINS].sort());
        expect(new Set(Object.values(TERRAIN_FILL)).size).toBe(TERRAINS.length);
    });

    test("names each token after its terrain", () => {
        for (const terrain of TERRAINS) {
            expect(TERRAIN_FILL[terrain]).toBe(`var(--terrain-${terrain})`);
        }
    });
});

describe("portFill", () => {
    test("colors a resource port like the resource it trades", () => {
        for (const terrain of RESOURCE_TERRAINS) {
            expect(portFill(terrain)).toBe(TERRAIN_FILL[terrain]);
        }
    });

    test("gives the 3:1 port a neutral of its own", () => {
        expect(portFill("any")).toBe("var(--port-any)");
        expect(Object.values(TERRAIN_FILL)).not.toContain(portFill("any"));
    });
});

describe("chitInk", () => {
    test("reddens 6 and 8 and nothing else", () => {
        const hot = [6, 8];

        for (const value of [2, 3, 4, 5, 6, 8, 9, 10, 11, 12]) {
            expect(chitInk(value)).toBe(
                hot.includes(value) ? "var(--chit-hot)" : "var(--chit-ink)",
            );
        }
    });
});
