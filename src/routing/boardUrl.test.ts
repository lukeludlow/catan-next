import { describe, expect, test } from "vitest";
import { mulberry32 } from "@/domain/rng";
import { ALL_VARIANTS, VARIANTS } from "@/domain/variants";
import type { Variant } from "@/domain/variants";
import {
    boardHref,
    canonicalParams,
    isCanonical,
    parseParams,
    randomSeed,
} from "@/routing/boardUrl";
import type { BoardParams, Query } from "@/routing/boardUrl";

// The URL is the app's whole state model (ROADMAP §6), so these are the tests
// that stand in for the route file itself: a server component cannot be
// rendered in either tier, but every decision it makes lives here.

const SEAFARERS = VARIANTS.seafarers;
const BASE_GAME = VARIANTS["base-game"];

// Reads a built href back the way Next hands one to a page, which is what
// makes the round-trip below a statement about real URLs rather than about two
// functions agreeing on an object.
function queryOf(href: string): Query {
    return Object.fromEntries(new URL(href, "http://board.test").searchParams);
}

describe("randomSeed", () => {
    test("is six base-36 characters", () => {
        for (let seed = 0; seed < 500; seed++) {
            expect(randomSeed(mulberry32(seed))).toMatch(/^[0-9a-z]{6}$/);
        }
    });

    test("pads rather than shortening the smallest values", () => {
        expect(randomSeed(() => 0)).toBe("000000");
    });

    test("stays inside the space it claims", () => {
        expect(randomSeed(() => 0.9999999)).toMatch(/^[0-9a-z]{6}$/);
    });

    test("is reproducible from an rng, and varies without one", () => {
        expect(randomSeed(mulberry32(7))).toBe(randomSeed(mulberry32(7)));

        const drawn = new Set(Array.from({ length: 200 }, () => randomSeed()));

        expect(drawn.size).toBeGreaterThan(190);
    });
});

describe("parseParams", () => {
    test("reports nothing for an empty query", () => {
        expect(parseParams({}, SEAFARERS)).toEqual({});
    });

    test("keeps an arbitrary seed string verbatim", () => {
        expect(parseParams({ seed: "abc123" }, SEAFARERS).seed).toBe("abc123");
    });

    test("ignores an empty seed", () => {
        expect(parseParams({ seed: "" }, SEAFARERS).seed).toBeUndefined();
    });

    // A repeated key is a malformed link, not a request for two boards.
    test("takes the first of a repeated key", () => {
        expect(parseParams({ seed: ["a", "b"] }, SEAFARERS).seed).toBe("a");
    });

    test("reads an islands value in range", () => {
        expect(parseParams({ islands: "5" }, SEAFARERS).islands).toBe(5);
    });

    // A stale link asking for nine islands should still show a board; the
    // redirect then corrects its address to the one it actually got.
    test.each([
        ["99", 6],
        ["0", 1],
        ["-4", 1],
        ["4.4", 4],
    ])("clamps ?islands=%s to %i", (raw, expected) => {
        expect(parseParams({ islands: raw }, SEAFARERS).islands).toBe(expected);
    });

    test.each(["", "many", "NaN", "Infinity"])(
        "ignores an unusable ?islands=%s",
        (raw) => {
            expect(
                parseParams({ islands: raw }, SEAFARERS).islands,
            ).toBeUndefined();
        },
    );

    // No sea in the bag means one landmass whatever the URL asks for, so the
    // key is dropped rather than honored.
    test("ignores islands entirely for a variant that has no range", () => {
        expect(
            parseParams({ islands: "4" }, BASE_GAME).islands,
        ).toBeUndefined();
    });
});

describe("canonicalParams", () => {
    test("invents a seed when the query has none", () => {
        expect(canonicalParams({}, SEAFARERS, mulberry32(1)).seed).toBe(
            randomSeed(mulberry32(1)),
        );
    });

    test("keeps the seed the query already has", () => {
        expect(canonicalParams({ seed: "abc123" }, SEAFARERS).seed).toBe(
            "abc123",
        );
    });

    test("falls back to the variant's default island count", () => {
        expect(canonicalParams({}, SEAFARERS).islands).toBe(
            SEAFARERS.islands?.default,
        );
    });

    test("leaves islands off a variant that declares no range", () => {
        expect(canonicalParams({ islands: "4" }, BASE_GAME)).toEqual({
            seed: expect.any(String),
        });
    });
});

describe("boardHref", () => {
    test("addresses the variant by its own id", () => {
        expect(boardHref(SEAFARERS, { seed: "abc123", islands: 3 })).toBe(
            "/seafarers?seed=abc123&islands=3",
        );
    });

    test("omits islands for a variant that declares no range", () => {
        expect(boardHref(BASE_GAME, { seed: "abc123", islands: 3 })).toBe(
            "/base-game?seed=abc123",
        );
    });

    test("escapes a seed that would otherwise break the query", () => {
        const href = boardHref(SEAFARERS, { seed: "a&b=c d", islands: 3 });

        expect(href).not.toContain("a&b=c d");
        expect(queryOf(href).seed).toBe("a&b=c d");
    });
});

// The two properties the route depends on, table-driven so a variant added in
// Phases 9-10 is covered the day it is added (ROADMAP §9.8).
describe.each(ALL_VARIANTS)("$name: the round trip", (variant: Variant) => {
    const params: BoardParams = canonicalParams(
        { seed: "abc123" },
        variant,
        mulberry32(1),
    );

    test("reads back exactly what it wrote", () => {
        expect(
            parseParams(queryOf(boardHref(variant, params)), variant),
        ).toEqual(params);
    });

    // Why the redirect cannot loop: the address a canonical URL redirects to
    // is itself.
    test("recognizes its own href as canonical", () => {
        expect(
            isCanonical(queryOf(boardHref(variant, params)), variant, params),
        ).toBe(true);
    });

    test("canonicalizing a canonical query changes nothing", () => {
        const query = queryOf(boardHref(variant, params));

        expect(canonicalParams(query, variant, mulberry32(99))).toEqual(params);
    });
});

describe("isCanonical", () => {
    const params: BoardParams = { seed: "abc123", islands: 3 };

    test("rejects a bare address, so a seedless visit gets one", () => {
        expect(isCanonical({}, SEAFARERS, params)).toBe(false);
    });

    test("rejects an address missing the islands it rendered", () => {
        expect(isCanonical({ seed: "abc123" }, SEAFARERS, params)).toBe(false);
    });

    test("rejects an address whose islands value was clamped", () => {
        const query = { seed: "abc123", islands: "99" };
        const canonical = canonicalParams(query, SEAFARERS);

        expect(canonical.islands).toBe(6);
        expect(isCanonical(query, SEAFARERS, canonical)).toBe(false);
    });

    test("rejects an address carrying a key the board does not read", () => {
        expect(
            isCanonical(
                { seed: "abc123", islands: "3", ref: "twitter" },
                SEAFARERS,
                params,
            ),
        ).toBe(false);
    });

    test("rejects an islands key on a variant that has no range", () => {
        expect(
            isCanonical({ seed: "abc123", islands: "3" }, BASE_GAME, {
                seed: "abc123",
            }),
        ).toBe(false);
    });
});
