import { describe, expect, test } from "vitest";
import { mulberry32 } from "@/domain/rng";
import { ALL_GAMES, GAMES, variantFor } from "@/domain/variants";
import type { Game } from "@/domain/variants";
import {
    boardHref,
    canonicalParams,
    isCanonical,
    paramsForPlayers,
    parseParams,
    playersFromQuery,
    randomSeed,
} from "@/routing/boardUrl";
import type { BoardParams, Query } from "@/routing/boardUrl";

// The URL is the app's whole state model (ROADMAP §6), so these are the tests
// that stand in for the route file itself: a server component cannot be
// rendered in either tier, but every decision it makes lives here.

const SEAFARERS = GAMES.seafarers;
const BASE_GAME = GAMES["base-game"];

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

    // The player half of the contract. `parseParams` reports a count only when
    // the address really names one this game offers, so the redirect can tell a
    // link that is already explicit from one it has to complete.
    test.each(["", "six", "5", "99", "-6"])(
        "does not report an unusable ?players=%s",
        (raw) => {
            expect(
                parseParams({ players: raw }, SEAFARERS).players,
            ).toBeUndefined();
        },
    );

    // A test for "a count this game does not offer" stood here until Phase 10,
    // guarded by an assertion that such a count still existed. Every game now
    // offers both, so the case is unrepresentable and the test is gone rather
    // than passing on an empty search — which is what its own comment asked for.

    test.each(ALL_GAMES)("$id: reports the counts it offers", (game: Game) => {
        for (const variant of game.variants) {
            expect(
                parseParams({ players: String(variant.players) }, game).players,
            ).toBe(variant.players);
        }
    });
});

describe("playersFromQuery", () => {
    test("falls back to the game's default board", () => {
        expect(playersFromQuery({}, SEAFARERS)).toBe(
            SEAFARERS.variants[0].players,
        );
        expect(playersFromQuery({ players: "nonsense" }, SEAFARERS)).toBe(
            SEAFARERS.variants[0].players,
        );
    });

    test.each(ALL_GAMES)("$id: reads a count it offers", (game: Game) => {
        for (const variant of game.variants) {
            expect(
                playersFromQuery({ players: String(variant.players) }, game),
            ).toBe(variant.players);
        }
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

    test("always states a player count", () => {
        expect(canonicalParams({}, SEAFARERS).players).toBe(
            SEAFARERS.variants[0].players,
        );
        expect(canonicalParams({}, BASE_GAME).players).toBe(
            BASE_GAME.variants[0].players,
        );
    });

    test("falls back to the variant's default island count", () => {
        expect(canonicalParams({}, SEAFARERS).islands).toBe(
            variantFor(SEAFARERS, 4).islands?.default,
        );
    });

    test("leaves islands off a variant that declares no range", () => {
        expect(canonicalParams({ islands: "4" }, BASE_GAME)).toEqual({
            seed: expect.any(String),
            players: 4,
        });
    });
});

describe("paramsForPlayers", () => {
    test.each(ALL_GAMES)(
        "$id: keeps the seed and re-derives islands",
        (game: Game) => {
            const from: BoardParams = canonicalParams(
                { seed: "abc123" },
                game,
                mulberry32(1),
            );

            for (const variant of game.variants) {
                const next = paramsForPlayers(game, from, variant.players);

                expect(next.seed).toBe("abc123");
                expect(next.players).toBe(variant.players);

                // The islands key follows the *target* variant, not the one it
                // came from: a range that does not exist there drops the key,
                // and a narrower one clamps into it.
                if (variant.islands === undefined) {
                    expect(next.islands).toBeUndefined();
                } else {
                    expect(next.islands).toBeGreaterThanOrEqual(
                        variant.islands.min,
                    );
                    expect(next.islands).toBeLessThanOrEqual(
                        variant.islands.max,
                    );
                }
            }
        },
    );

    // The clamp above, made concrete on the one pairing where it bites: only the
    // 5-6 player Seafarers board offers seven islands, so coming back down to
    // the 3-4 board has to land on six rather than carry an unreachable setting
    // into a URL the route would then have to redirect.
    test("clamps a count the smaller board cannot offer", () => {
        const [small, large] = SEAFARERS.variants;
        const from: BoardParams = {
            seed: "abc123",
            players: large.players,
            islands: large.islands?.max,
        };

        expect(from.islands).toBe(7);
        expect(paramsForPlayers(SEAFARERS, from, small.players).islands).toBe(
            small.islands?.max,
        );
    });

    test("is what the control pushes, so the address needs no redirect", () => {
        const from = canonicalParams({ seed: "abc123" }, SEAFARERS);
        const next = paramsForPlayers(SEAFARERS, from, 4);

        expect(
            isCanonical(queryOf(boardHref(SEAFARERS, next)), SEAFARERS, next),
        ).toBe(true);
    });
});

describe("boardHref", () => {
    test("addresses the game by its own id, and states the players", () => {
        expect(
            boardHref(SEAFARERS, { seed: "abc123", players: 4, islands: 3 }),
        ).toBe("/seafarers?seed=abc123&players=4&islands=3");
    });

    test("omits islands for a variant that declares no range", () => {
        expect(
            boardHref(BASE_GAME, { seed: "abc123", players: 4, islands: 3 }),
        ).toBe("/base-game?seed=abc123&players=4");
    });

    test("escapes a seed that would otherwise break the query", () => {
        const href = boardHref(SEAFARERS, {
            seed: "a&b=c d",
            players: 4,
            islands: 3,
        });

        expect(href).not.toContain("a&b=c d");
        expect(queryOf(href).seed).toBe("a&b=c d");
    });
});

// The two properties the route depends on, table-driven over every board the
// registry offers so a variant added in Phases 9-10 is covered the day it is
// added (ROADMAP §9.8).
const BOARDS = ALL_GAMES.flatMap((game) =>
    game.variants.map((variant) => ({ game, variant, name: variant.name })),
);

describe.each(BOARDS)("$name: the round trip", ({ game, variant }) => {
    const params: BoardParams = paramsForPlayers(
        game,
        canonicalParams({ seed: "abc123" }, game, mulberry32(1)),
        variant.players,
    );

    test("reads back exactly what it wrote", () => {
        expect(parseParams(queryOf(boardHref(game, params)), game)).toEqual(
            params,
        );
    });

    // Why the redirect cannot loop: the address a canonical URL redirects to
    // is itself.
    test("recognizes its own href as canonical", () => {
        expect(
            isCanonical(queryOf(boardHref(game, params)), game, params),
        ).toBe(true);
    });

    test("canonicalizing a canonical query changes nothing", () => {
        const query = queryOf(boardHref(game, params));

        expect(canonicalParams(query, game, mulberry32(99))).toEqual(params);
    });
});

describe("isCanonical", () => {
    const params: BoardParams = { seed: "abc123", players: 4, islands: 3 };

    test("rejects a bare address, so a seedless visit gets one", () => {
        expect(isCanonical({}, SEAFARERS, params)).toBe(false);
    });

    test("rejects an address missing the islands it rendered", () => {
        expect(
            isCanonical({ seed: "abc123", players: "4" }, SEAFARERS, params),
        ).toBe(false);
    });

    // The Phase 5 link shape. It still resolves to a board; it just is not the
    // address that board now lives at.
    test("rejects an address predating the players key", () => {
        expect(
            isCanonical({ seed: "abc123", islands: "3" }, SEAFARERS, params),
        ).toBe(false);
    });

    test("rejects an address whose islands value was clamped", () => {
        const query = { seed: "abc123", players: "4", islands: "99" };
        const canonical = canonicalParams(query, SEAFARERS);

        expect(canonical.islands).toBe(6);
        expect(isCanonical(query, SEAFARERS, canonical)).toBe(false);
    });

    test("rejects an address carrying a key the board does not read", () => {
        expect(
            isCanonical(
                {
                    seed: "abc123",
                    players: "4",
                    islands: "3",
                    ref: "twitter",
                },
                SEAFARERS,
                params,
            ),
        ).toBe(false);
    });

    test("rejects an islands key on a variant that has no range", () => {
        expect(
            isCanonical(
                { seed: "abc123", players: "4", islands: "3" },
                BASE_GAME,
                { seed: "abc123", players: 4 },
            ),
        ).toBe(false);
    });
});
