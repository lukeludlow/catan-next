import { describe, expect, test } from "vitest";
import { render } from "vitest-browser-react";
import BoardSvg from "@/components/board/BoardSvg";
import {
    CHIT_FACE,
    HEX_STROKE,
    TERRAIN_FILL,
    chitInk,
    portFill,
} from "@/components/board/boardColors";
import { hexLabel } from "@/components/board/hexLabel";
import { generateBoard } from "@/domain/generate";
import { key, neighborCoords } from "@/domain/hex";
import { sideAngle, svgNumber } from "@/domain/layout";
import { isHot } from "@/domain/numbers";
import { mulberry32 } from "@/domain/rng";
import type { Board, Terrain } from "@/domain/types";
import { ALL_VARIANTS, VARIANTS } from "@/domain/variants";
import type { Variant } from "@/domain/variants";

// The browser tier's whole job (ROADMAP §9, Phase 4): prove that a board
// generated from a fixed seed reaches the screen intact, in Chromium, Firefox
// and WebKit. Everything below is asserted against the *rendered DOM* rather
// than against the `Board` the markup was built from — checking the object
// would only prove the generator right a second time, and the generator already
// has 200-seed sweeps of its own in generate.test.ts.

const SEED = 20260815;

function build(variant: Variant, seed = SEED): Board {
    return generateBoard(
        variant,
        // Off the registry, never an id comparison (variants.ts:49): a variant
        // with sea wants an islands count, and there are two of them as of
        // Phase 10.
        { islands: variant.islands?.default },
        mulberry32(seed),
    );
}

const CASES = ALL_VARIANTS.map(
    (variant) => [variant.name, variant] as [string, Variant],
);

function tilesOf(container: HTMLElement): HTMLElement[] {
    return [...container.querySelectorAll<HTMLElement>('g[role="img"]')];
}

// Resolves a `var(--token)` reference the way the browser would, so assertions
// track globals.css instead of hardcoding "rgb(185, 28, 28)" and drifting from
// it the first time the palette is touched.
function resolve(token: string): string {
    const probe = document.createElement("span");
    probe.style.color = token;
    document.body.append(probe);

    const color = getComputedStyle(probe).color;
    probe.remove();

    return color;
}

function tokenName(token: string): string {
    return token.replace(/^var\(/, "").replace(/\)$/, "");
}

describe("BoardSvg", () => {
    test.each(CASES)(
        "draws one polygon per hex of the %s",
        async (_, variant) => {
            const { container } = await render(
                <BoardSvg board={build(variant)} />,
            );

            expect(container.querySelectorAll("polygon")).toHaveLength(
                variant.shape.length,
            );
            expect(tilesOf(container)).toHaveLength(variant.shape.length);
        },
    );

    test.each(CASES)(
        "frames the %s board in its own viewBox",
        async (_, variant) => {
            const { container } = await render(
                <BoardSvg board={build(variant)} />,
            );
            const svg = container.querySelector("svg");

            expect(svg?.getAttribute("role")).toBe("group");

            const box =
                svg?.getAttribute("viewBox")?.split(" ").map(Number) ?? [];

            expect(box).toHaveLength(4);
            expect(box.every(Number.isFinite)).toBe(true);
            expect(box[2]).toBeGreaterThan(0);
            expect(box[3]).toBeGreaterThan(0);
        },
    );

    test.each(CASES)(
        "names every tile of the %s after its contents",
        async (_, variant) => {
            const board = build(variant);
            const { container } = await render(<BoardSvg board={board} />);

            const rendered = tilesOf(container)
                .map((tile) => tile.getAttribute("aria-label") ?? "")
                .sort();
            const expected = [...board.hexes.values()].map(hexLabel).sort();

            expect(rendered).toEqual(expected);
        },
    );

    // The point of the labels (ROADMAP §6): a test can ask the board what is on
    // it by role and name, which no amount of `<img src="wheat.png">` allowed.
    test("finds a named tile by role and accessible name", async () => {
        const board = build(VARIANTS.seafarers);
        const labels = [...board.hexes.values()].map(hexLabel);
        const unique = labels.find(
            (label) => labels.filter((other) => other === label).length === 1,
        );

        expect(unique).toBeDefined();

        const screen = await render(<BoardSvg board={board} />);

        await expect
            .element(screen.getByRole("img", { name: unique }))
            .toBeInTheDocument();
    });

    test("puts a chit on every numbered hex and on no other", async () => {
        const board = build(VARIANTS.seafarers);
        const { container } = await render(<BoardSvg board={board} />);

        for (const tile of tilesOf(container)) {
            const number = tile.getAttribute("data-number");
            const text = tile.querySelector("text");

            if (number === null) {
                expect(text).toBeNull();
                expect(tile.querySelector("circle")).toBeNull();
            } else {
                expect(text?.textContent).toBe(number);
                expect(tile.querySelectorAll("circle")).toHaveLength(1);
            }
        }

        // Sea and desert produce nothing, so they never carry a chit — the rule
        // numbers.ts enforces, restated where it is visible.
        const bare = tilesOf(container).filter(
            (tile) => tile.getAttribute("data-number") === null,
        );

        expect(bare.length).toBeGreaterThan(0);

        for (const tile of bare) {
            expect(tile.getAttribute("aria-label")).toMatch(/^(sea|desert)\b/);
        }
    });

    test("renders 6 and 8 in red and every other number in ink", async () => {
        const { container } = await render(
            <BoardSvg board={build(VARIANTS.seafarers)} />,
        );

        const hot = resolve(chitInk(6));
        const cold = resolve(chitInk(5));

        expect(hot).not.toBe(cold);

        const numbered = tilesOf(container).filter(
            (tile) => tile.getAttribute("data-number") !== null,
        );

        expect(numbered.length).toBeGreaterThan(0);

        for (const tile of numbered) {
            const value = Number(tile.getAttribute("data-number"));
            const text = tile.querySelector("text");

            expect(getComputedStyle(text as Element).fill).toBe(
                isHot(value) ? hot : cold,
            );
        }
    });

    // The official rule, checked against what is on screen rather than against
    // the board object — and reading the coordinates back out of the DOM is the
    // only way to do that.
    test("never draws a 6 next to an 8", async () => {
        const { container } = await render(
            <BoardSvg board={build(VARIANTS.seafarers)} />,
        );

        const drawn = new Map<string, number>();

        for (const tile of tilesOf(container)) {
            const number = tile.getAttribute("data-number");

            if (number !== null) {
                drawn.set(
                    key({
                        q: Number(tile.getAttribute("data-q")),
                        r: Number(tile.getAttribute("data-r")),
                    }),
                    Number(number),
                );
            }
        }

        expect(drawn.size).toBeGreaterThan(0);

        for (const tile of tilesOf(container)) {
            const coord = {
                q: Number(tile.getAttribute("data-q")),
                r: Number(tile.getAttribute("data-r")),
            };

            if (!isHot(drawn.get(key(coord)))) {
                continue;
            }

            for (const around of neighborCoords(coord)) {
                expect(isHot(drawn.get(key(around)))).toBe(false);
            }
        }
    });

    test("points each port out through the side it belongs to", async () => {
        const board = build(VARIANTS.seafarers);
        const { container } = await render(<BoardSvg board={board} />);

        const ported = [...board.hexes.values()].flatMap((hex) =>
            hex.port === undefined
                ? []
                : [{ coord: hex.coord, port: hex.port }],
        );

        expect(container.querySelectorAll("path")).toHaveLength(ported.length);

        for (const { coord, port } of ported) {
            const tile = container.querySelector(
                `g[data-q="${coord.q}"][data-r="${coord.r}"]`,
            );
            const marker = tile?.querySelector("path");

            expect(marker?.getAttribute("transform")).toContain(
                `rotate(${svgNumber(sideAngle(port.side))})`,
            );
        }
    });

    test.each(CASES)(
        "fills every %s tile from its terrain's token",
        async (_, variant) => {
            const board = build(variant);
            const { container } = await render(<BoardSvg board={board} />);

            for (const tile of tilesOf(container)) {
                const hex = board.hexes.get(
                    key({
                        q: Number(tile.getAttribute("data-q")),
                        r: Number(tile.getAttribute("data-r")),
                    }),
                );

                if (hex === undefined) {
                    throw new Error(
                        "a tile was drawn at a coordinate off the board",
                    );
                }

                expect(
                    getComputedStyle(tile.querySelector("polygon") as Element)
                        .fill,
                ).toBe(resolve(TERRAIN_FILL[hex.terrain]));
            }
        },
    );

    // TypeScript can prove boardColors covers every terrain; it cannot prove
    // globals.css does. An undefined custom property is not an error — the fill
    // silently falls back to black — so this is the only place that gap shows.
    test("defines every color token it draws with", async () => {
        await render(<BoardSvg board={build(VARIANTS.seafarers)} />);

        const tokens = [
            ...Object.values(TERRAIN_FILL),
            CHIT_FACE,
            HEX_STROKE,
            chitInk(6),
            chitInk(5),
            portFill("any"),
        ];

        for (const token of tokens) {
            const declared = getComputedStyle(
                document.documentElement,
            ).getPropertyValue(tokenName(token));

            expect(declared.trim(), `${token} is not defined`).not.toBe("");
        }
    });

    test("gives each terrain a color of its own", async () => {
        await render(<BoardSvg board={build(VARIANTS.seafarers)} />);

        const terrains = Object.keys(TERRAIN_FILL) as Terrain[];
        const colors = terrains.map((terrain) =>
            resolve(TERRAIN_FILL[terrain]),
        );

        expect(new Set(colors).size).toBe(terrains.length);
    });
});
