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

export type Variant = {
    id: VariantId;
    name: string;
    shape: readonly Axial[];
    settings: MapSettings;
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
    },
};

export const ALL_VARIANTS: readonly Variant[] = Object.values(VARIANTS);
