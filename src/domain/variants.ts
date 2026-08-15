// The variant registry (ROADMAP §9.8). A variant is fully described by two
// pieces of data — a list of axial coordinates and a `MapSettings` — so adding
// one is adding data, with no new code paths in the generator. This file is
// what makes that literally true by being the only place the two halves are
// paired.
//
// It lands in Phase 2 rather than Phase 8, its original home, for one reason:
// §9.8 requires the chit-pool invariant to be table-driven over a registry so
// that every variant added later is covered by it the day it is added. A table
// living in the test file would not do that. Phase 8 extends this registry with
// the 5-6 player entries and drives the routes from it.

import type { Axial } from "@/domain/hex";
import { BASE_GAME_SETTINGS, SEAFARERS_SETTINGS } from "@/domain/settings";
import { BASE_GAME_SHAPE, SEAFARERS_SHAPE } from "@/domain/shapes";
import type { MapSettings } from "@/domain/types";

// Doubles as the URL segment in Phase 8's `/[variant]` route, which is why
// these are kebab-case strings rather than an enum.
export type VariantId = "base-game" | "seafarers";

// What the islands control is allowed to ask this variant for, or `undefined`
// when the variant has no sea and is therefore always one landmass. Data on the
// registry rather than a constant inside the control, for the same reason the
// shape and the settings are: Phase 10 expects to raise the ceiling to 7 for
// the larger Seafarers frame, and a control that reads the range off the
// variant needs no edit to follow. Whether a slider is drawn at all is
// `variant.islands !== undefined`, never a comparison against an id.
export type IslandRange = { min: number; max: number; default: number };

export type Variant = {
    id: VariantId;
    name: string;
    shape: readonly Axial[];
    settings: MapSettings;
    islands?: IslandRange;
};

export const VARIANTS: Readonly<Record<VariantId, Variant>> = {
    "base-game": {
        id: "base-game",
        name: "Base Game",
        shape: BASE_GAME_SHAPE,
        settings: BASE_GAME_SETTINGS,
    },
    seafarers: {
        id: "seafarers",
        name: "Seafarers",
        shape: SEAFARERS_SHAPE,
        settings: SEAFARERS_SETTINGS,
        // The original's slider, transcribed: floor 1, ceil 6, starting at 3
        // (`_seafarers/seafarers.component.ts:17`). generate.test.ts already
        // sweeps every value in that range at 60 seeds each, so the control
        // cannot offer a setting the generator has not been proven to hit.
        islands: { min: 1, max: 6, default: 3 },
    },
};

export const ALL_VARIANTS: readonly Variant[] = Object.values(VARIANTS);

// Lookup by an untrusted string — a URL segment. A search rather than an index
// with a cast, because `VARIANTS[slug as VariantId]` types the result as a
// `Variant` that is really `undefined`, which is exactly the lie that would
// send an unknown slug into the generator instead of into a 404.
export function variantById(id: string): Variant | undefined {
    return ALL_VARIANTS.find((variant) => variant.id === id);
}
