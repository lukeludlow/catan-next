import { beforeEach, describe, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import BoardControls from "@/components/controls/BoardControls";
import { ALL_VARIANTS, VARIANTS } from "@/domain/variants";
import type { Variant } from "@/domain/variants";
import { parseParams } from "@/routing/boardUrl";
import type { BoardParams, Query } from "@/routing/boardUrl";

// The controls' entire contract is the URL they push (ROADMAP §6), so that is
// what these assert — against the href a real click or key press produced, not
// against a handler called directly.
//
// `useRouter` is mocked because it throws outside an app-router context. The
// mock is the smallest possible one: a `push` spy, since navigation itself is
// Next's to test and the board that comes back is rendered on the server.

const { push } = vi.hoisted(() => ({ push: vi.fn() }));

// The `default` entry is not decoration: Vite pre-bundles next/navigation, and
// the optimized module's interop imports a default binding that a factory
// returning only `useRouter` would not provide.
vi.mock("next/navigation", () => ({
    default: {},
    useRouter: () => ({ push }),
}));

const SEAFARERS = VARIANTS.seafarers;
const BASE_GAME = VARIANTS["base-game"];

const CASES = ALL_VARIANTS.map(
    (variant) => [variant.name, variant] as [string, Variant],
);

function paramsFor(variant: Variant): BoardParams {
    return {
        seed: "abc123",
        ...(variant.islands === undefined
            ? {}
            : { islands: variant.islands.default }),
    };
}

// Reads the pushed href back through the module the route parses it with, so
// these tests describe the board that would be generated rather than a string.
function pushed(call = 0): { path: string; params: Partial<BoardParams> } {
    const href = push.mock.calls[call][0] as string;
    const url = new URL(href, "http://board.test");
    const variant =
        ALL_VARIANTS.find((entry) => `/${entry.id}` === url.pathname) ??
        SEAFARERS;

    return {
        path: url.pathname,
        params: parseParams(
            Object.fromEntries(url.searchParams) as Query,
            variant,
        ),
    };
}

async function pressArrowRight(container: HTMLElement): Promise<void> {
    const slider = container.querySelector<HTMLInputElement>("#islands");

    if (slider === null) {
        throw new Error("no islands slider was rendered");
    }

    slider.focus();
    // A real key press rather than a synthesized change event: this is the
    // interaction that has to fire `change` and then `keyup`, and the commit
    // hangs off the second of those.
    await userEvent.keyboard("{ArrowRight}");
}

describe("BoardControls", () => {
    beforeEach(() => {
        push.mockClear();
    });

    test.each(CASES)("gives the %s a regenerate button", async (_, variant) => {
        const screen = await render(
            <BoardControls variant={variant} params={paramsFor(variant)} />,
        );

        await expect
            .element(screen.getByRole("button", { name: "regenerate" }))
            .toBeInTheDocument();
    });

    test("offers the islands slider the registry's bounds", async () => {
        const { container } = await render(
            <BoardControls variant={SEAFARERS} params={paramsFor(SEAFARERS)} />,
        );
        const slider = container.querySelector<HTMLInputElement>("#islands");

        expect(slider?.min).toBe(String(SEAFARERS.islands?.min));
        expect(slider?.max).toBe(String(SEAFARERS.islands?.max));
        expect(slider?.value).toBe(String(SEAFARERS.islands?.default));
    });

    // A board with no sea is always one landmass, so a slider would be a
    // control with nothing to control.
    test("draws no slider for a variant with no islands range", async () => {
        const { container } = await render(
            <BoardControls variant={BASE_GAME} params={paramsFor(BASE_GAME)} />,
        );

        expect(container.querySelector("#islands")).toBeNull();
        expect(container.querySelector('input[type="range"]')).toBeNull();
    });

    test("pushes the new island count when the slider is moved", async () => {
        const params = paramsFor(SEAFARERS);
        const { container } = await render(
            <BoardControls variant={SEAFARERS} params={params} />,
        );

        await pressArrowRight(container);

        expect(push).toHaveBeenCalledTimes(1);
        expect(pushed().path).toBe("/seafarers");
        expect(pushed().params.islands).toBe((params.islands ?? 0) + 1);
    });

    // The decision behind keeping the seed: the same board can be compared at
    // two island counts, and the URL stays reproducible either way.
    test("keeps the seed when the slider is moved", async () => {
        const { container } = await render(
            <BoardControls variant={SEAFARERS} params={paramsFor(SEAFARERS)} />,
        );

        await pressArrowRight(container);

        expect(pushed().params.seed).toBe("abc123");
    });

    // A gesture ends in more than one commit handler — a key press releases and
    // then the control is blurred — and each one must not add a history entry
    // that goes back to the board already on screen.
    test("pushes one address per gesture, not one per handler", async () => {
        const { container } = await render(
            <BoardControls variant={SEAFARERS} params={paramsFor(SEAFARERS)} />,
        );

        await pressArrowRight(container);
        container.querySelector<HTMLInputElement>("#islands")?.blur();

        expect(push).toHaveBeenCalledTimes(1);
    });

    // The other half of that guard: it remembers only until a navigation
    // lands. Going back to a board and then leaving it the same way again is a
    // real request for a real board, not a duplicate.
    test("pushes the same address again after a navigation lands", async () => {
        const params = paramsFor(SEAFARERS);
        const { container, rerender } = await render(
            <BoardControls variant={SEAFARERS} params={params} />,
        );

        const at = (islands: number) => (
            <BoardControls
                variant={SEAFARERS}
                params={{ ...params, islands }}
            />
        );
        const start = params.islands ?? 0;

        await pressArrowRight(container);
        // The navigation landing, then a Back button: the props follow the URL
        // both ways.
        await rerender(at(start + 1));
        await rerender(at(start));
        await pressArrowRight(container);

        expect(push).toHaveBeenCalledTimes(2);
        expect(pushed(0).params).toEqual(pushed(1).params);
    });

    test("pushes a fresh seed when regenerate is clicked", async () => {
        const screen = await render(
            <BoardControls variant={SEAFARERS} params={paramsFor(SEAFARERS)} />,
        );

        await screen.getByRole("button", { name: "regenerate" }).click();

        expect(push).toHaveBeenCalledTimes(1);
        expect(pushed().params.seed).not.toBe("abc123");
        expect(pushed().params.seed).toMatch(/^[0-9a-z]{6}$/);
    });

    test("keeps the island count when regenerate is clicked", async () => {
        const params = paramsFor(SEAFARERS);
        const screen = await render(
            <BoardControls variant={SEAFARERS} params={params} />,
        );

        await screen.getByRole("button", { name: "regenerate" }).click();

        expect(pushed().params.islands).toBe(params.islands);
    });

    test("regenerates somewhere new every time", async () => {
        const screen = await render(
            <BoardControls variant={SEAFARERS} params={paramsFor(SEAFARERS)} />,
        );
        const button = screen.getByRole("button", { name: "regenerate" });

        await button.click();
        await button.click();

        expect(pushed(0).params.seed).not.toBe(pushed(1).params.seed);
    });

    test("addresses the base game without an islands key", async () => {
        const screen = await render(
            <BoardControls variant={BASE_GAME} params={paramsFor(BASE_GAME)} />,
        );

        await screen.getByRole("button", { name: "regenerate" }).click();

        expect(pushed().path).toBe("/base-game");
        expect(pushed().params.islands).toBeUndefined();
    });
});
