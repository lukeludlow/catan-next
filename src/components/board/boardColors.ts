// Every color the board draws with, as `var()` references into the tokens
// defined in `src/app/globals.css` (ROADMAP §6). One module rather than colors
// scattered across four components, because the palette is a single design
// decision and because `Record<Terrain, string>` makes TypeScript reject a
// terrain that has no color — the one half of this that a type can check.
//
// The other half it cannot: a token named here but missing from the stylesheet
// would silently render nothing. BoardSvg.test.tsx closes that gap by asserting
// in a real browser that every terrain resolves to an actual color.
//
// Two rejected alternatives:
//   - Literal hex colors here instead of `var()`. Simpler to test, but the
//     palette would then live in TypeScript where no stylesheet, theme, or
//     media query can reach it.
//   - Tailwind classes on the SVG shapes. Utilities would have to be generated
//     for eight fills that are never used anywhere else, and the values would
//     end up half in a config and half in markup.

import { isHot } from "@/domain/numbers";
import type { PortResource, Terrain } from "@/domain/types";

export const TERRAIN_FILL: Record<Terrain, string> = {
    brick: "var(--terrain-brick)",
    desert: "var(--terrain-desert)",
    gold: "var(--terrain-gold)",
    rock: "var(--terrain-rock)",
    sea: "var(--terrain-sea)",
    sheep: "var(--terrain-sheep)",
    tree: "var(--terrain-tree)",
    wheat: "var(--terrain-wheat)",
};

export const HEX_STROKE = "var(--hex-stroke)";
export const CHIT_FACE = "var(--chit-face)";

// A harbour is colored by what it trades, so a player can read the board
// without a legend. The 3:1 port trades nothing in particular and gets a
// neutral of its own rather than borrowing a terrain's color.
export function portFill(resource: PortResource): string {
    return resource === "any" ? "var(--port-any)" : TERRAIN_FILL[resource];
}

// 6 and 8 are red, per Catan convention. Routed through the domain's `isHot`
// rather than re-testing `value === 6 || value === 8`: which numbers are hot is
// game knowledge, and numbers.ts already seats those chits by it.
export function chitInk(diceNumber: number): string {
    return isHot(diceNumber) ? "var(--chit-hot)" : "var(--chit-ink)";
}
