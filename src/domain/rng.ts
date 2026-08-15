// Seeded randomness (ROADMAP §5). `src/domain/` may never call `Math.random()`
// — every function that needs randomness takes an `Rng` as its last parameter —
// so a board is fully determined by its seed and a shared `?seed=` link renders
// the same board for everyone. The Angular original had no such property: it
// reached for `Math.random()` from inside four different services, which is why
// it could not test its own generator for anything but shape.
//
// This module also deletes two of the original's defects rather than porting
// them. Its Fisher-Yates was biased (`Math.random() * i`, so an element could
// never stay where it was — ROADMAP §4.3), and `removeFirstOccurrence` silently
// removed the *last* element when nothing matched (§4.2). One correct `shuffle`
// replaces both: draw from a bag by shuffling it once and consuming it, and
// there is nothing left to remove by predicate.

// Uniform in [0, 1), the same contract as `Math.random()`, so an `Rng` can be
// swapped for it in a scratch script without anything else changing.
export type Rng = () => number;

// mulberry32: one 32-bit word of state, which makes it auditable at a glance
// and trivially reproducible across machines and Node versions. A larger
// generator (xorshift128+, PCG) would buy statistical quality this app has no
// use for — the consumers are a shuffle and an index pick.
export function mulberry32(seed: number): Rng {
    let state = seed >>> 0;

    return () => {
        state = (state + 0x6d2b79f5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// FNV-1a over the char codes, then murmur3's finalizer. The finalizer is the
// point: FNV-1a alone leaves near-identical short strings with near-identical
// hashes, so `?seed=board1` and `?seed=board2` would start the generator two
// steps apart and produce visibly similar boards.
export function seedFromString(seed: string): number {
    let hash = 2166136261;

    for (let i = 0; i < seed.length; i++) {
        hash ^= seed.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }

    hash ^= hash >>> 16;
    hash = Math.imul(hash, 2246822507);
    hash ^= hash >>> 13;
    hash = Math.imul(hash, 3266489909);
    hash ^= hash >>> 16;

    return hash >>> 0;
}

// Fisher-Yates, correct: `i + 1` so index `i` can be chosen and an element can
// stay in place (§4.3). Copies rather than shuffling in place — the caller's
// bag is usually a `const` settings array that must survive being drawn from
// twice.
export function shuffle<T>(items: readonly T[], rng: Rng): T[] {
    const shuffled = [...items];

    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    return shuffled;
}

// Throws on an empty array rather than returning `undefined`. The original's
// `getRandomElementFromArray` returned `undefined` and let it travel all the
// way to an `<img src="seafarers/undefined.png">` (§4.1); an exception here
// fails the board that caused it instead of rendering it broken.
export function pick<T>(items: readonly T[], rng: Rng): T {
    if (items.length === 0) {
        throw new Error("pick() was called on an empty array");
    }

    return items[Math.floor(rng() * items.length)];
}
