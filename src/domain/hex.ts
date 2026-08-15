// Axial coordinates and neighbor lookup (ROADMAP §3). The Angular original
// stored hexes in a 13-row jagged `Hex[][]` and answered "who is my neighbor"
// by converting offset (row, col) into cube coordinates and then converting
// *back* through two hand-written inverse functions full of special cases. The
// inverse is where its bugs lived: on the west edge it aliased off-board
// coordinates onto real hexes, so one hex came back as its own neighbor and
// another had a neighbor listed twice (ROADMAP §4.8). Keying by axial
// coordinate deletes the inverse outright — a neighbor is a key lookup.
//
// Everything here is generic over the hex payload rather than importing `Hex`
// from types.ts. Topology does not care what a hex contains, and keeping it
// that way leaves the module graph acyclic.

export type Axial = { q: number; r: number };

// Pointy-top axial unit vectors, in the same order as the original's
// `HexBlob.directions`, so any index ported from it still names the same side.
// This one list is what collapses the original's separate `HexSide` and
// `HexDirection` types into a single notion of direction (ROADMAP §3).
export const DIRECTIONS = [
    { q: 1, r: 0 }, // East
    { q: 1, r: -1 }, // NorthEast
    { q: 0, r: -1 }, // NorthWest
    { q: -1, r: 0 }, // West
    { q: -1, r: 1 }, // SouthWest
    { q: 0, r: 1 }, // SouthEast
] as const;

export const Direction = {
    East: 0,
    NorthEast: 1,
    NorthWest: 2,
    West: 3,
    SouthWest: 4,
    SouthEast: 5,
} as const;

export type Direction = (typeof Direction)[keyof typeof Direction];

// The board's `Map` key. There is deliberately no inverse of this function:
// every `Hex` carries its own `coord`, so nothing ever needs to parse a key
// back into a coordinate.
export function key({ q, r }: Axial): string {
    return `${q},${r}`;
}

export function neighbor({ q, r }: Axial, direction: Direction): Axial {
    const step = DIRECTIONS[direction];
    return { q: q + step.q, r: r + step.r };
}

// All six adjacent coordinates, whether or not they are on the board.
export function neighborCoords({ q, r }: Axial): Axial[] {
    return DIRECTIONS.map((step) => ({ q: q + step.q, r: r + step.r }));
}

// The adjacent hexes that exist. Off-board directions simply miss the map, so
// there is no bounds table and no per-row special case.
export function neighbors<T>(hexes: ReadonlyMap<string, T>, at: Axial): T[] {
    return neighborCoords(at)
        .map((coord) => hexes.get(key(coord)))
        .filter((hex): hex is T => hex !== undefined);
}

// Cube distance: half the L1 norm of the cube vector, where the third cube axis
// is the implied `-q - r`. Two hexes are adjacent iff this is 1, which is the
// property that makes DIRECTIONS a legal direction set. terrain.ts uses it to
// space island seeds apart before growing them.
export function distance(a: Axial, b: Axial): number {
    const q = a.q - b.q;
    const r = a.r - b.r;

    return (Math.abs(q) + Math.abs(r) + Math.abs(q + r)) / 2;
}

// Every vertex of the board, as the three mutually adjacent coordinates that
// meet there — which is what a Catan settlement sits on, and therefore the unit
// the pip-balance rule is expressed in (docs/GENERATION.md).
//
// Coordinates in, coordinates out: returning payloads would mean either
// constraining T to carry its own position or parsing keys, and there is
// deliberately no inverse of `key`. Callers hold the map and can look up what
// they need. Seafarers has 62 vertices, the Base Game 24.
export function vertexTriples(coords: readonly Axial[]): Axial[][] {
    const present = new Set(coords.map(key));
    const found = new Map<string, Axial[]>();

    for (const coord of coords) {
        for (let side = 0; side < DIRECTIONS.length; side++) {
            const corners = [
                coord,
                neighbor(coord, side as Direction),
                neighbor(coord, ((side + 1) % DIRECTIONS.length) as Direction),
            ];

            if (!corners.every((corner) => present.has(key(corner)))) {
                continue;
            }

            found.set(corners.map(key).sort().join(" "), corners);
        }
    }

    return [...found.values()];
}
