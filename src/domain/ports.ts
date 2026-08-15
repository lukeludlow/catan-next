// Step three of the pipeline: attach the harbours (ROADMAP §5).
//
// A port belongs to a land hex plus one of its sides, rather than to a sea tile
// as in physical Catan. That is the original's modeling choice and it is kept
// deliberately (ROADMAP §11).
//
// This module is where the axial rewrite pays off most visibly. The original
// answered "which sides of this hex touch sea" from a hardcoded per-row/col
// edge table roughly a hundred lines long, then concatenated it with a
// sea-neighbour scan without deduplicating — so a side reachable both ways was
// twice as likely to be chosen (ROADMAP §4.4). Here it is one scan over the six
// directions, and the bias has nowhere to come from.

import { DIRECTIONS, key, neighbor } from "@/domain/hex";
import type { Axial, Direction } from "@/domain/hex";
import type { Rng } from "@/domain/rng";
import { pick, shuffle } from "@/domain/rng";
import { RESOURCE_TERRAINS } from "@/domain/settings";
import type { Hex, MapSettings, PortResource } from "@/domain/types";

// A side faces sea if the neighbour there is sea *or* is not on the board at
// all. Off-board and open water are the same thing to a harbour, and treating
// them alike is what removes the need for a bounds table.
export function seaFacingSides(
    hexes: ReadonlyMap<string, Hex>,
    at: Axial,
): Direction[] {
    const sides: Direction[] = [];

    for (let side = 0; side < DIRECTIONS.length; side++) {
        const across = hexes.get(key(neighbor(at, side as Direction)));

        if (across === undefined || across.terrain === "sea") {
            sides.push(side as Direction);
        }
    }

    return sides;
}

function drawPortBag(settings: MapSettings): PortResource[] {
    const bag: PortResource[] = [];

    for (const [resource, count] of Object.entries(settings.ports)) {
        for (let i = 0; i < count; i++) {
            bag.push(resource as PortResource);
        }
    }

    return bag;
}

// Returns null when the layout has fewer coastal resource hexes than the
// variant has harbours. variants.test.ts already proves the bag fits the
// *smallest* resource-hex count a variant can produce, so this is close to
// unreachable — but quietly dropping a port is exactly the class of defect this
// port of the app exists to remove, so it refuses the board instead.
export function placePorts(
    hexes: ReadonlyMap<string, Hex>,
    settings: MapSettings,
    rng: Rng,
): Map<string, Hex> | null {
    const bag = drawPortBag(settings);
    const coastal = [...hexes.values()].filter(
        (hex) =>
            RESOURCE_TERRAINS.includes(hex.terrain) &&
            seaFacingSides(hexes, hex.coord).length > 0,
    );

    if (coastal.length < bag.length) {
        return null;
    }

    const hosts = shuffle(coastal, rng);
    const ports = new Map<string, Hex["port"]>();

    shuffle(bag, rng).forEach((resource, index) => {
        const host = hosts[index];

        ports.set(key(host.coord), {
            resource,
            side: pick(seaFacingSides(hexes, host.coord), rng),
        });
    });

    return new Map(
        [...hexes].map(([coordKey, hex]) => {
            const port = ports.get(coordKey);
            return [coordKey, port === undefined ? hex : { ...hex, port }];
        }),
    );
}
