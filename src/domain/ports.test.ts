import { describe, expect, test } from "vitest";
import { Direction, key, neighbor } from "@/domain/hex";
import type { Axial } from "@/domain/hex";
import { placePorts, seaFacingSides } from "@/domain/ports";
import { mulberry32 } from "@/domain/rng";
import {
    BASE_GAME_SETTINGS,
    RESOURCE_TERRAINS,
    SEAFARERS_SETTINGS,
} from "@/domain/settings";
import { BASE_GAME_SHAPE, SEAFARERS_SHAPE } from "@/domain/shapes";
import { placeTerrain } from "@/domain/terrain";
import type { Hex, MapSettings, PortResource, Terrain } from "@/domain/types";

function boardOf(terrains: Record<string, Terrain>): Map<string, Hex> {
    return new Map(
        Object.entries(terrains).map(([coordKey, terrain]) => {
            const [q, r] = coordKey.split(",").map(Number);
            const coord: Axial = { q, r };
            return [key(coord), { coord, terrain }];
        }),
    );
}

function layout(seed: number, islands?: number): Map<string, Hex> {
    const hexes = placeTerrain(
        islands === undefined ? BASE_GAME_SHAPE : SEAFARERS_SHAPE,
        islands === undefined ? BASE_GAME_SETTINGS : SEAFARERS_SETTINGS,
        { islands, minIslandSize: 2 },
        mulberry32(seed),
    );

    expect(hexes).not.toBeNull();
    return hexes as Map<string, Hex>;
}

function harboured(
    hexes: Map<string, Hex>,
    settings: MapSettings,
    seed: number,
): Map<string, Hex> {
    const withPorts = placePorts(hexes, settings, mulberry32(seed));

    expect(withPorts).not.toBeNull();
    return withPorts as Map<string, Hex>;
}

function portBagOf(settings: MapSettings): PortResource[] {
    return Object.entries(settings.ports)
        .flatMap(([resource, count]) =>
            Array.from({ length: count }, () => resource as PortResource),
        )
        .sort();
}

describe("seaFacingSides", () => {
    test("finds every side of a lone hex", () => {
        const alone = boardOf({ "0,0": "wheat" });

        expect(seaFacingSides(alone, { q: 0, r: 0 })).toEqual([
            0, 1, 2, 3, 4, 5,
        ]);
    });

    test("finds no side of a fully enclosed hex", () => {
        const enclosed = boardOf({
            "0,0": "wheat",
            "1,0": "tree",
            "1,-1": "tree",
            "0,-1": "tree",
            "-1,0": "tree",
            "-1,1": "tree",
            "0,1": "tree",
        });

        expect(seaFacingSides(enclosed, { q: 0, r: 0 })).toEqual([]);
    });

    // ROADMAP §3: off-board and open water are the same thing to a harbour,
    // which is what deletes the original's hundred-line edge table.
    test("treats an off-board neighbour and a sea neighbour alike", () => {
        const coast = boardOf({ "0,0": "wheat", "1,0": "sea" });

        expect(seaFacingSides(coast, { q: 0, r: 0 })).toContain(Direction.East);
        expect(seaFacingSides(coast, { q: 0, r: 0 })).toHaveLength(6);
    });

    test("skips the sides that face land", () => {
        const coast = boardOf({
            "0,0": "wheat",
            "1,0": "tree",
            "0,1": "sea",
        });
        const sides = seaFacingSides(coast, { q: 0, r: 0 });

        expect(sides).not.toContain(Direction.East);
        expect(sides).toContain(Direction.SouthEast);
        expect(sides).toHaveLength(5);
    });

    // ROADMAP §4.4. The original concatenated an edge table with a sea-neighbour
    // scan without deduplicating, so a side reachable both ways came up twice
    // and was twice as likely to be chosen.
    test("never lists the same side twice", () => {
        const hexes = layout(1, 3);

        for (const hex of hexes.values()) {
            const sides = seaFacingSides(hexes, hex.coord);

            expect(new Set(sides).size).toBe(sides.length);
        }
    });
});

describe("placePorts", () => {
    test("places exactly the bag the variant ships", () => {
        const withPorts = harboured(layout(2, 3), SEAFARERS_SETTINGS, 2);
        const placed = [...withPorts.values()]
            .filter((hex) => hex.port !== undefined)
            .map((hex) => hex.port?.resource)
            .sort();

        expect(placed).toEqual(portBagOf(SEAFARERS_SETTINGS));
    });

    test("places the base game bag too", () => {
        const withPorts = harboured(layout(3), BASE_GAME_SETTINGS, 3);
        const placed = [...withPorts.values()]
            .filter((hex) => hex.port !== undefined)
            .map((hex) => hex.port?.resource)
            .sort();

        expect(placed).toEqual(portBagOf(BASE_GAME_SETTINGS));
    });

    test("never puts two ports on the same hex", () => {
        const withPorts = harboured(layout(4, 4), SEAFARERS_SETTINGS, 4);
        const hosts = [...withPorts.values()].filter(
            (hex) => hex.port !== undefined,
        );

        expect(hosts).toHaveLength(portBagOf(SEAFARERS_SETTINGS).length);
    });

    // Ports attach to land, never to sea or desert
    // (`_generators/port-generator.service.ts:155`).
    test("attaches every port to a resource hex on a sea-facing side", () => {
        for (let seed = 0; seed < 50; seed++) {
            const withPorts = harboured(
                layout(seed, 3),
                SEAFARERS_SETTINGS,
                seed,
            );

            for (const hex of withPorts.values()) {
                if (hex.port === undefined) {
                    continue;
                }

                expect(RESOURCE_TERRAINS).toContain(hex.terrain);
                expect(seaFacingSides(withPorts, hex.coord)).toContain(
                    hex.port.side,
                );
            }
        }
    });

    test("points every port at sea or off the board", () => {
        const withPorts = harboured(layout(5, 3), SEAFARERS_SETTINGS, 5);

        for (const hex of withPorts.values()) {
            if (hex.port === undefined) {
                continue;
            }

            const across = withPorts.get(
                key(neighbor(hex.coord, hex.port.side)),
            );

            expect(across === undefined || across.terrain === "sea").toBe(true);
        }
    });

    test("is deterministic for a given seed", () => {
        const hexes = layout(6, 3);

        expect([...harboured(hexes, SEAFARERS_SETTINGS, 6)]).toEqual([
            ...harboured(hexes, SEAFARERS_SETTINGS, 6),
        ]);
    });

    test("does not modify the layout it is given", () => {
        const hexes = layout(7, 3);
        const before = structuredClone([...hexes]);

        placePorts(hexes, SEAFARERS_SETTINGS, mulberry32(7));

        expect([...hexes]).toEqual(before);
    });

    test("keeps the input's coordinate ordering", () => {
        const hexes = layout(8, 3);

        expect([...harboured(hexes, SEAFARERS_SETTINGS, 8).keys()]).toEqual([
            ...hexes.keys(),
        ]);
    });

    // Rather than shipping a board with harbours silently missing, which is
    // what the original's bag-underrun behaviour amounted to.
    test("refuses a board with fewer coastal hexes than ports", () => {
        const tiny = boardOf({ "0,0": "wheat", "5,0": "wheat" });

        expect(placePorts(tiny, BASE_GAME_SETTINGS, mulberry32(9))).toBeNull();
    });

    // A resource hex with no sea-facing side is not a candidate, so an inland
    // hex cannot host a harbour even when the board has plenty of room.
    test("ignores landlocked resource hexes", () => {
        const donut = boardOf({
            "0,0": "wheat",
            "1,0": "tree",
            "1,-1": "tree",
            "0,-1": "tree",
            "-1,0": "tree",
            "-1,1": "tree",
            "0,1": "tree",
        });
        const onePort: MapSettings = {
            ...BASE_GAME_SETTINGS,
            ports: { any: 6 },
        };
        const withPorts = placePorts(donut, onePort, mulberry32(10));

        expect(withPorts).not.toBeNull();
        expect(withPorts?.get("0,0")?.port).toBeUndefined();
        expect(
            [...(withPorts ?? []).values()].filter(
                (hex) => hex.port !== undefined,
            ),
        ).toHaveLength(6);
    });
});
