// The domain's data vocabulary (ROADMAP §5). Deliberately value-free — types
// only — so every other module can import it without risking a cycle, and so it
// carries no behavior that would need a test of its own. Phase 2 adds the
// settings values, Phase 3 the functions that build a `Board`.
//
// Plain serializable data, not the original's classes with getters and setters:
// a board should survive `JSON.stringify`, and the generator is a pipeline of
// pure functions rather than a graph of injectable services.

import type { Axial, Direction } from "@/domain/hex";

// The original also had a `Terrain.Empty` for unfilled slots in its fixed
// `Hex[][]`. There are no unfilled slots here — a hex that is not on the board
// is absent from the map — so the empty case is gone.
export type Terrain =
    "brick" | "desert" | "gold" | "rock" | "sea" | "sheep" | "tree" | "wheat";

// The original overloaded its terrain enum with an `Any` member so ports could
// reuse it, which meant "any" was silently eligible for terrain bags. Splitting
// the type keeps that impossible.
export type PortResource = Terrain | "any";

// A port belongs to a land hex plus one of its sides, rather than to a sea tile
// as in physical Catan — a deliberate modeling choice carried over from the
// original (ROADMAP §11).
export type Port = {
    resource: PortResource;
    side: Direction;
};

export type Hex = {
    coord: Axial;
    terrain: Terrain;
    diceNumber?: number;
    port?: Port;
};

export type TerrainCount = { min: number; max: number };

export type MapSettings = {
    // A range per terrain: the generator places `min` of each, then fills the
    // rest of the board from a remainder bag, which is what makes sea and gold
    // counts vary between boards (ROADMAP §11).
    terrainCounts: Readonly<Record<Terrain, TerrainCount>>;
    // How many chits of each dice number the variant ships. There is no 7.
    diceNumbers: Readonly<Record<number, number>>;
    // Exact counts, not ranges. Every port count in every variant is fixed, and
    // the original only ever read the `max` of its own port ranges
    // (`_generators/port-generator.service.ts:29`) — so a range here would be a
    // field nothing reads.
    ports: Readonly<Partial<Record<PortResource, number>>>;
};

export type Board = {
    hexes: Map<string, Hex>;
    settings: MapSettings;
};
