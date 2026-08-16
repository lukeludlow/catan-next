// The board route (ROADMAP §6, §9 Phases 5 and 8). A server component, and
// that is the entire point: the generator runs here and only the finished SVG
// crosses the wire, so a board is reproducible from its URL and no part of
// `src/domain/` ships to the browser.
//
// One `/[game]` segment rather than one route per board. Phase 5 landed this as
// `/[variant]`, when a variant and a game were the same thing; Phase 8 renamed
// it, because `/base-game` now means two boards and the player count picks
// between them from the query string. The URLs of the 3-4 player boards are
// unchanged either way, since the slugs are still the registry's own ids.
//
// No `generateStaticParams`: this page reads `searchParams` and redirects at
// request time, so it is dynamic by construction — which §10.4 requires — and a
// list of static params would be either dead weight or a fight with that. An
// unknown slug is turned away by the explicit `notFound()` below, which says so
// more plainly anyway.

import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import BoardSvg from "@/components/board/BoardSvg";
import BoardControls from "@/components/controls/BoardControls";
import ShareLink from "@/components/controls/ShareLink";
import { generateBoard } from "@/domain/generate";
import { mulberry32, seedFromString } from "@/domain/rng";
import { gameById, variantFor } from "@/domain/variants";
import {
    boardHref,
    canonicalParams,
    isCanonical,
    playersFromQuery,
} from "@/routing/boardUrl";

export async function generateMetadata({
    params,
    searchParams,
}: PageProps<"/[game]">): Promise<Metadata> {
    const game = gameById((await params).game);

    if (game === undefined) {
        return { title: "Board not found" };
    }

    const players = playersFromQuery(await searchParams, game);

    return {
        title: `${variantFor(game, players).name} — Catan Board Generator`,
    };
}

export default async function BoardPage({
    params,
    searchParams,
}: PageProps<"/[game]">) {
    const game = gameById((await params).game);

    if (game === undefined) {
        notFound();
    }

    const query = await searchParams;
    const boardParams = canonicalParams(query, game);

    // One comparison covers every way an address can fail to describe the board
    // it is about to show: no seed at all, no player count, an islands value
    // that had to be clamped, a repeated key, a tracking parameter. It cannot
    // loop, because `canonicalParams` is a fixed point of `isCanonical` —
    // asserted in boardUrl.test.ts rather than assumed here.
    if (!isCanonical(query, game, boardParams)) {
        redirect(boardHref(game, boardParams));
    }

    const variant = variantFor(game, boardParams.players);
    const board = generateBoard(
        variant,
        { islands: boardParams.islands },
        mulberry32(seedFromString(boardParams.seed)),
    );

    return (
        <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-5 px-4 py-6">
            <header className="flex items-baseline justify-between gap-4">
                <h1 className="text-xl font-semibold tracking-tight">
                    {variant.name}
                </h1>
                <Link
                    href="/"
                    className="text-sm underline underline-offset-4 opacity-70 hover:opacity-100"
                >
                    all boards
                </Link>
            </header>

            {/* Capped in viewport units, not pixels: a 42-hex board at the
                full width of this column is tall enough to push the controls
                off a laptop screen. The SVG's own `preserveAspectRatio`
                letterboxes it inside whatever box this leaves. */}
            <BoardSvg
                board={board}
                className="mx-auto block h-auto max-h-[62svh] w-full"
            />

            <BoardControls game={game} params={boardParams} />
            <ShareLink href={boardHref(game, boardParams)} />
        </main>
    );
}
