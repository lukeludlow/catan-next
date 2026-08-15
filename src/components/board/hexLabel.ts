// The accessible name of a single tile (ROADMAP §6): "wheat 8", "sea",
// "sheep 5, brick port". Giving every hex a name is what lets the component
// tests assert board *contents* by role and name instead of by pixel — the
// Angular original could only ever be tested for the number of `<img>` tags it
// emitted, because an image of a tile says nothing about what tile it is.
//
// A module of its own rather than a helper inside HexTile.tsx, for one reason:
// as pure string logic in a `.ts` file it is covered by the fast unit tier,
// where a table of cases costs nothing. Inside the component it would only be
// reachable through three browser launches (ROADMAP §7).

import type { Hex } from "@/domain/types";

export function hexLabel(hex: Hex): string {
    const terrain =
        hex.diceNumber === undefined
            ? hex.terrain
            : `${hex.terrain} ${hex.diceNumber}`;

    return hex.port === undefined
        ? terrain
        : `${terrain}, ${hex.port.resource} port`;
}
