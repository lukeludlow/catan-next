// The generator's entry point (ROADMAP §5, docs/GENERATION.md). Everything
// below it is a pure function of its arguments and an `Rng`, so a board is
// fully determined by its seed and a shared `?seed=` link renders the same
// board for everyone — the property the Angular original could not offer,
// because it reached for `Math.random()` from inside four separate services.
//
// It takes a `Variant` rather than the loose `(settings, options, rng)` ROADMAP
// §5 wrote, because terrain placement needs the shape too and variants.ts
// exists precisely to be the one place a shape is paired with its settings.
// Passing the pair as a unit makes mispairing unrepresentable.
//
// Two nested bounded loops, because the constraints genuinely separate: the
// island count depends only on the terrain layout, and every number rule
// depends only on the deal laid over it. Re-dealing chits onto a layout that
// already has the right islands is far cheaper than throwing the layout away.

import { placeNumbers } from "@/domain/numbers";
import { placePorts } from "@/domain/ports";
import type { Rng } from "@/domain/rng";
import { placeTerrain } from "@/domain/terrain";
import type { BalanceRules, Board } from "@/domain/types";
import { DEFAULT_BALANCE, isValidBoard } from "@/domain/validate";
import type { Variant } from "@/domain/variants";

// Terrain layouts to try. Guided growth makes the first one succeed most of the
// time — measured at ~100% up to four islands, 94% at five and 54% at six — so
// this is a runaway guard rather than a budget anyone is expected to spend.
const DEFAULT_MAX_ATTEMPTS = 1000;

// Chit deals to try per layout before giving up on the layout itself. The reds
// are seated by construction; what costs deals here is the pip cap and the
// no-adjacent-equal-numbers rule, which together take around five to seventeen
// deals depending on how concentrated the land is.
const DEALS_PER_LAYOUT = 200;

export type GenerateOptions = {
    // Absent means the board is not held to an island count, which is the Base
    // Game: with no sea in its bag it is always one landmass.
    islands?: number;
    maxAttempts?: number;
    // Merged over DEFAULT_BALANCE, so a caller can relax one rule without
    // restating the other two.
    balance?: Partial<BalanceRules>;
};

// Thrown rather than spinning forever, which is what the original did when its
// islands slider asked for something unlikely (ROADMAP §4.7).
export class BoardGenerationError extends Error {
    readonly variant: string;
    readonly islands: number | undefined;
    readonly attempts: number;

    constructor(
        variant: string,
        islands: number | undefined,
        attempts: number,
    ) {
        super(
            `could not generate a ${variant} board` +
                (islands === undefined ? "" : ` with ${islands} island(s)`) +
                ` in ${attempts} attempts`,
        );
        this.name = "BoardGenerationError";
        this.variant = variant;
        this.islands = islands;
        this.attempts = attempts;
    }
}

export function generateBoard(
    variant: Variant,
    options: GenerateOptions,
    rng: Rng,
): Board {
    const { shape, settings } = variant;
    const { islands } = options;
    const balance = { ...DEFAULT_BALANCE, ...options.balance };
    const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;

    // One rng threads through every attempt without being reset, so a rejected
    // board advances the stream rather than replaying it — the whole loop is
    // still deterministic from the seed, and a retry cannot loop forever
    // producing the same board.
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const terrain = placeTerrain(
            shape,
            settings,
            { islands, minIslandSize: balance.minIslandSize },
            rng,
        );

        if (terrain === null) {
            continue;
        }

        for (let deal = 0; deal < DEALS_PER_LAYOUT; deal++) {
            const numbered = placeNumbers(terrain, settings, rng);

            if (
                numbered === null ||
                !isValidBoard(numbered, { ...balance, islands })
            ) {
                continue;
            }

            const withPorts = placePorts(numbered, settings, rng);

            // A shortage of coastal hexes is a property of the layout, not of
            // the deal, so there is nothing to gain from dealing again.
            if (withPorts === null) {
                break;
            }

            return { hexes: withPorts, settings };
        }
    }

    throw new BoardGenerationError(variant.id, islands, maxAttempts);
}
