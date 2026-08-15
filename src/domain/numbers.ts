// Step two of the pipeline: deal the dice chits onto the resource hexes
// (ROADMAP §5, docs/GENERATION.md).
//
// The official rule is that no two red numbers — 6 and 8 — may touch. ROADMAP
// §5 enforced it the way the original did, by dealing at random and throwing
// the board away when it failed, which measured at a 23% pass rate on Seafarers
// and 13% on the Base Game. Seating the sixes and eights *first*, onto hexes
// that have no hot neighbour yet, makes the rule hold by construction: 20,000
// boards per variant during Phase 3 planning produced no violation and no
// unseatable deal.
//
// The remaining chits are dealt freely afterwards, so the distribution of
// everything except the reds is exactly what a plain shuffle would give.

import { key, neighbors } from "@/domain/hex";
import type { Rng } from "@/domain/rng";
import { shuffle } from "@/domain/rng";
import { RESOURCE_TERRAINS } from "@/domain/settings";
import type { Hex, MapSettings } from "@/domain/types";

// "Red" numbers in the physical game: the two most likely rolls, printed in red
// and forbidden from touching.
const HOT_NUMBERS: readonly number[] = [6, 8];

export function isHot(diceNumber: number | undefined): boolean {
    return diceNumber !== undefined && HOT_NUMBERS.includes(diceNumber);
}

function drawChitBag(settings: MapSettings): number[] {
    const bag: number[] = [];

    for (const [diceNumber, count] of Object.entries(settings.diceNumbers)) {
        for (let i = 0; i < count; i++) {
            bag.push(Number(diceNumber));
        }
    }

    return bag;
}

// Returns null when a red chit has nowhere legal to sit, which the caller
// treats as a failed deal. Sea and desert hexes never receive a number, exactly
// as the original's `isResourceTerrain()` decided.
export function placeNumbers(
    hexes: ReadonlyMap<string, Hex>,
    settings: MapSettings,
    rng: Rng,
): Map<string, Hex> | null {
    const bag = drawChitBag(settings);
    const resourceHexes = [...hexes.values()].filter((hex) =>
        RESOURCE_TERRAINS.includes(hex.terrain),
    );

    // ROADMAP §4.1. A variant whose chit pool cannot cover its own resource
    // hexes is a mis-specified variant, not an unlucky board — variants.test.ts
    // proves it cannot happen, so this throws rather than asking for a retry
    // that would never succeed. The original returned `undefined` here and let
    // it reach an `<img src="seafarers/undefined.png">`.
    if (bag.length < resourceHexes.length) {
        throw new Error(
            `chit bag holds ${bag.length} numbers but the board has ` +
                `${resourceHexes.length} resource hexes`,
        );
    }

    const order = shuffle(resourceHexes, rng);
    const hot = shuffle(
        bag.filter((diceNumber) => isHot(diceNumber)),
        rng,
    );
    const cold = shuffle(
        bag.filter((diceNumber) => !isHot(diceNumber)),
        rng,
    );
    const dealt = new Map<string, number>();

    for (const diceNumber of hot) {
        const seat = order.find(
            (hex) =>
                !dealt.has(key(hex.coord)) &&
                !neighbors(hexes, hex.coord).some((around) =>
                    isHot(dealt.get(key(around.coord))),
                ),
        );

        if (seat === undefined) {
            return null;
        }

        dealt.set(key(seat.coord), diceNumber);
    }

    let poured = 0;
    for (const hex of order) {
        if (!dealt.has(key(hex.coord))) {
            dealt.set(key(hex.coord), cold[poured++]);
        }
    }

    // Rebuilt in the input's order so the board keeps its canonical shape
    // ordering, and copied rather than mutated so a rejected deal leaves the
    // terrain layout untouched for the next attempt.
    return new Map(
        [...hexes].map(([coordKey, hex]) => {
            const diceNumber = dealt.get(coordKey);
            return [
                coordKey,
                diceNumber === undefined ? hex : { ...hex, diceNumber },
            ];
        }),
    );
}
