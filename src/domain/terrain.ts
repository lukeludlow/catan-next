// Step one of the pipeline: decide what terrain sits on every coordinate of a
// shape (ROADMAP §5, docs/GENERATION.md).
//
// ROADMAP §5 prescribed pure rejection sampling — scatter the terrain bag at
// random and throw the board away until the island count happens to match. That
// was measured during Phase 3 planning and rejected: once §4.7 made every
// island count, six islands came up in 0.16% of layouts, so the top of the
// original's slider needed ~640 attempts and seven islands was unreachable at
// any sane budget. Islands are therefore *grown* instead of hoped for, and the
// count is exact by construction on the first attempt.
//
// The bag itself is untouched by that change: minimums first, then a shuffled
// remainder that is deliberately larger than the slots left to fill, which is
// what keeps sea and gold counts varying between boards (§11).

import { distance, key, neighborCoords } from "@/domain/hex";
import type { Axial } from "@/domain/hex";
import type { Rng } from "@/domain/rng";
import { shuffle } from "@/domain/rng";
import { RESOURCE_TERRAINS } from "@/domain/settings";
import type { Hex, MapSettings, Terrain } from "@/domain/types";

export type TerrainOptions = {
    // Absent means "no island constraint", which is the Base Game: with no sea
    // in its bag every board is one landmass, so there is nothing to steer.
    islands?: number;
    minIslandSize: number;
};

// Seeds must start at least this far apart. Two seeds at distance 2 have room
// for one sea hex between them; at distance 1 they would be adjacent and their
// islands would merge on the first growth step.
const MIN_SEED_DISTANCE = 2;

function isResource(terrain: Terrain): boolean {
    return RESOURCE_TERRAINS.includes(terrain);
}

// The original's bag, unchanged: `min` of every terrain, then as much of the
// `max - min` remainder as there are slots. Both halves are shuffled, so which
// terrains survive the truncation is random rather than declaration order.
function drawTerrainBag(
    settings: MapSettings,
    slots: number,
    rng: Rng,
): Terrain[] {
    const minimums: Terrain[] = [];
    const remainder: Terrain[] = [];

    for (const [terrain, count] of Object.entries(settings.terrainCounts)) {
        for (let i = 0; i < count.min; i++) {
            minimums.push(terrain as Terrain);
        }
        for (let i = 0; i < count.max - count.min; i++) {
            remainder.push(terrain as Terrain);
        }
    }

    return [...shuffle(minimums, rng), ...shuffle(remainder, rng)].slice(
        0,
        slots,
    );
}

// Greedy farthest-point sampling: start somewhere random, then repeatedly take
// the candidate furthest from everything chosen so far. Spreading the seeds
// before growing anything is what makes six islands fit — seeded at random they
// clump, and a clumped seed has nowhere to grow.
function placeSeeds(
    coords: readonly Axial[],
    count: number,
    rng: Rng,
): Axial[] | null {
    const pool = shuffle(coords, rng);
    const seeds: Axial[] = [pool[0]];

    while (seeds.length < count) {
        let best: Axial | null = null;
        let bestSpacing = -1;

        for (const candidate of pool) {
            const spacing = Math.min(
                ...seeds.map((seed) => distance(candidate, seed)),
            );

            if (spacing > bestSpacing) {
                bestSpacing = spacing;
                best = candidate;
            }
        }

        if (best === null || bestSpacing < MIN_SEED_DISTANCE) {
            return null;
        }

        seeds.push(best);
    }

    return seeds;
}

// Grow `islands` landmasses covering exactly `landCount` coordinates, keeping
// them pairwise disconnected. Returns the coordinates of each island, or null
// if the shape could not accommodate the request.
function growIslands(
    coords: readonly Axial[],
    landCount: number,
    islands: number,
    minIslandSize: number,
    rng: Rng,
): Axial[][] | null {
    if (islands < 1 || islands * minIslandSize > landCount) {
        return null;
    }

    const onBoard = new Set(coords.map(key));
    const seeds = placeSeeds(coords, islands, rng);

    if (seeds === null) {
        return null;
    }

    const owner = new Map<string, number>();
    const members: Axial[][] = seeds.map((seed, island) => {
        owner.set(key(seed), island);
        return [seed];
    });
    const growable = new Set(members.map((_, island) => island));
    let claimed = islands;

    // A coordinate may join island `i` only if it is on the board, unclaimed,
    // and touches no *other* island. That single rule is what keeps the islands
    // separate, and therefore what makes the final count exact.
    const frontierOf = (island: number): Axial[] => {
        const frontier = new Map<string, Axial>();

        for (const member of members[island]) {
            for (const candidate of neighborCoords(member)) {
                const candidateKey = key(candidate);

                if (!onBoard.has(candidateKey) || owner.has(candidateKey)) {
                    continue;
                }

                const touchesAnother = neighborCoords(candidate).some(
                    (around) => {
                        const other = owner.get(key(around));
                        return other !== undefined && other !== island;
                    },
                );

                if (!touchesAnother) {
                    frontier.set(candidateKey, candidate);
                }
            }
        }

        return [...frontier.values()];
    };

    const growOnce = (island: number): boolean => {
        const frontier = frontierOf(island);

        if (frontier.length === 0) {
            growable.delete(island);
            return false;
        }

        const claim = shuffle(frontier, rng)[0];
        owner.set(key(claim), island);
        members[island].push(claim);
        claimed++;
        return true;
    };

    // Every island reaches the size floor before any island takes a spare hex.
    // Growing them to target one at a time instead lets an early island eat the
    // room a later one needed.
    for (let size = 2; size <= minIslandSize; size++) {
        for (let island = 0; island < islands; island++) {
            if (members[island].length < size && !growOnce(island)) {
                return null;
            }
        }
    }

    while (claimed < landCount && growable.size > 0) {
        growOnce(shuffle([...growable], rng)[0]);
    }

    return claimed === landCount ? members : null;
}

export function placeTerrain(
    shape: readonly Axial[],
    settings: MapSettings,
    options: TerrainOptions,
    rng: Rng,
): Map<string, Hex> | null {
    const bag = drawTerrainBag(settings, shape.length, rng);
    const land = shuffle(bag.filter(isResource), rng);
    const water = shuffle(
        bag.filter((terrain) => !isResource(terrain)),
        rng,
    );

    const terrainOf = new Map<string, Terrain>();

    if (options.islands === undefined) {
        // No island constraint: scatter the whole bag, exactly as ROADMAP §5
        // wrote it. Growing a single island over the Base Game's 18 resource
        // hexes would leave its one desert wherever the growth failed to reach,
        // which is reliably the perimeter — a board-character regression for no
        // gain.
        const scattered = [...land, ...water];

        shuffle(shape, rng).forEach((coord, index) => {
            terrainOf.set(key(coord), scattered[index]);
        });
    } else {
        const grown = growIslands(
            shape,
            land.length,
            options.islands,
            options.minIslandSize,
            rng,
        );

        if (grown === null) {
            return null;
        }

        // Which island a hex belongs to says nothing about what grows on it, so
        // the resource bag is dealt across all the land at once rather than
        // island by island.
        shuffle(grown.flat(), rng).forEach((coord, index) => {
            terrainOf.set(key(coord), land[index]);
        });
    }

    // Emitted in shape order, not in the order the bags were consumed, so a
    // board serializes the same way whichever branch built it.
    const hexes = new Map<string, Hex>();
    let poured = 0;

    for (const coord of shape) {
        const terrain = terrainOf.get(key(coord)) ?? water[poured++];
        hexes.set(key(coord), { coord, terrain });
    }

    return hexes;
}
