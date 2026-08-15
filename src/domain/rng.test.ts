import { describe, expect, test } from "vitest";
import { mulberry32, pick, seedFromString, shuffle } from "@/domain/rng";
import type { Rng } from "@/domain/rng";

function draw(rng: Rng, count: number): number[] {
    return Array.from({ length: count }, () => rng());
}

// Every permutation of the given length, as joined strings, so a test can ask
// whether the shuffle is capable of producing all of them.
function permutationsOf(items: readonly number[]): Set<string> {
    if (items.length <= 1) {
        return new Set([items.join("")]);
    }

    const found = new Set<string>();
    for (let i = 0; i < items.length; i++) {
        const rest = [...items.slice(0, i), ...items.slice(i + 1)];
        for (const tail of permutationsOf(rest)) {
            found.add(`${items[i]}${tail}`);
        }
    }
    return found;
}

describe("mulberry32", () => {
    test("the same seed produces the same sequence", () => {
        expect(draw(mulberry32(12345), 20)).toEqual(
            draw(mulberry32(12345), 20),
        );
    });

    test("different seeds produce different sequences", () => {
        expect(draw(mulberry32(1), 20)).not.toEqual(draw(mulberry32(2), 20));
    });

    // The pinned sequence. A refactor that changes the algorithm would still
    // pass every property test above while silently invalidating every board
    // anyone has shared by URL, so the exact numbers are the assertion.
    test("produces its documented sequence for a known seed", () => {
        expect(draw(mulberry32(12345), 5)).toEqual([
            0.9797282677609473, 0.3067522644996643, 0.484205421525985,
            0.817934412509203, 0.5094283693470061,
        ]);
    });

    test("every value is in [0, 1)", () => {
        for (const value of draw(mulberry32(7), 100_000)) {
            expect(value).toBeGreaterThanOrEqual(0);
            expect(value).toBeLessThan(1);
        }
    });

    // A generator stuck in a short cycle, or biased toward one end of the
    // range, satisfies the bounds check above and fails this one.
    test("fills the range evenly", () => {
        const draws = 100_000;
        const buckets = new Array<number>(10).fill(0);

        for (const value of draw(mulberry32(7), draws)) {
            buckets[Math.floor(value * 10)]++;
        }

        for (const count of buckets) {
            expect(count).toBeGreaterThan(draws * 0.09);
            expect(count).toBeLessThan(draws * 0.11);
        }
    });
});

describe("seedFromString", () => {
    test("is deterministic", () => {
        expect(seedFromString("catan")).toBe(seedFromString("catan"));
    });

    test("returns a 32-bit unsigned integer", () => {
        for (const text of ["", "a", "catan", "a much longer seed string"]) {
            const seed = seedFromString(text);

            expect(Number.isInteger(seed)).toBe(true);
            expect(seed).toBeGreaterThanOrEqual(0);
            expect(seed).toBeLessThanOrEqual(0xffffffff);
        }
    });

    test("depends on the order of the characters", () => {
        expect(seedFromString("abc")).not.toBe(seedFromString("acb"));
    });

    test("has no collisions across ten thousand seeds", () => {
        const seeds = Array.from({ length: 10_000 }, (_, i) =>
            seedFromString(`seed-${i}`),
        );

        expect(new Set(seeds).size).toBe(seeds.length);
    });

    // The reason the hash carries a finalizer. Without it, `seed-0` through
    // `seed-99` would all land in the same corner of the range and start the
    // generator at nearly the same point, so consecutive seeds would produce
    // visibly similar boards.
    test("spreads near-identical strings across the whole range", () => {
        const buckets = new Set<number>();

        for (let i = 0; i < 100; i++) {
            buckets.add(Math.floor(seedFromString(`seed-${i}`) / 2 ** 28));
        }

        expect(buckets.size).toBe(16);
    });
});

describe("shuffle", () => {
    test("returns a permutation of the input", () => {
        const items = [1, 2, 3, 4, 5, 6, 7, 8];
        const shuffled = shuffle(items, mulberry32(1));

        expect([...shuffled].sort()).toEqual([...items].sort());
    });

    test("does not modify the input", () => {
        const items = [1, 2, 3, 4, 5];
        shuffle(items, mulberry32(1));

        expect(items).toEqual([1, 2, 3, 4, 5]);
    });

    test("is deterministic for a given seed", () => {
        const items = [1, 2, 3, 4, 5, 6, 7, 8];

        expect(shuffle(items, mulberry32(42))).toEqual(
            shuffle(items, mulberry32(42)),
        );
    });

    test("handles empty and single-element arrays", () => {
        expect(shuffle([], mulberry32(1))).toEqual([]);
        expect(shuffle(["only"], mulberry32(1))).toEqual(["only"]);
    });

    // ROADMAP §4.3. The original's Fisher-Yates used `Math.random() * i` rather
    // than `* (i + 1)`, so the element at index i could never be chosen to stay
    // put. That does not merely skew the odds — it makes most orderings
    // unreachable: of the six orderings of three items, the biased version can
    // only ever produce two.
    test("can produce every ordering", () => {
        const items = [0, 1, 2];
        const rng = mulberry32(99);
        const seen = new Set<string>();

        for (let i = 0; i < 1_000; i++) {
            seen.add(shuffle(items, rng).join(""));
        }

        expect(seen).toEqual(permutationsOf(items));
    });

    test("can leave every element in place", () => {
        const items = [0, 1, 2, 3];
        const rng = mulberry32(4);
        const unchanged = Array.from({ length: 1_000 }, () =>
            shuffle(items, rng),
        ).filter((shuffled) => shuffled.join("") === items.join(""));

        expect(unchanged.length).toBeGreaterThan(0);
    });

    test("produces every ordering about equally often", () => {
        const items = [0, 1, 2];
        const trials = 60_000;
        const rng = mulberry32(99);
        const counts = new Map<string, number>();

        for (let i = 0; i < trials; i++) {
            const ordering = shuffle(items, rng).join("");
            counts.set(ordering, (counts.get(ordering) ?? 0) + 1);
        }

        const expected = trials / 6;
        for (const count of counts.values()) {
            expect(count).toBeGreaterThan(expected * 0.9);
            expect(count).toBeLessThan(expected * 1.1);
        }
    });
});

describe("pick", () => {
    test("returns an element of the array", () => {
        const items = ["brick", "rock", "sheep"];
        const rng = mulberry32(3);

        for (let i = 0; i < 100; i++) {
            expect(items).toContain(pick(items, rng));
        }
    });

    test("is deterministic for a given seed", () => {
        const items = ["brick", "rock", "sheep", "tree", "wheat"];
        const first = Array.from({ length: 10 }, () =>
            pick(items, mulberry32(8)),
        );
        const second = Array.from({ length: 10 }, () =>
            pick(items, mulberry32(8)),
        );

        expect(first).toEqual(second);
    });

    test("can return any element, including the last", () => {
        const items = [0, 1, 2, 3, 4];
        const rng = mulberry32(5);
        const seen = new Set(
            Array.from({ length: 500 }, () => pick(items, rng)),
        );

        expect(seen.size).toBe(items.length);
    });

    // §4.1: the original returned `undefined` here and rendered it as an image
    // filename. An empty bag is a bug in the caller, so it throws.
    test("throws on an empty array", () => {
        expect(() => pick([], mulberry32(1))).toThrow(/empty/);
    });
});
