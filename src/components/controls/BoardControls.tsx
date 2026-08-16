// The player-count toggle, the islands slider and the regenerate button
// (ROADMAP §6, §9 Phase 8) — the only component in the app that runs in the
// browser as anything but markup.
//
// It holds no board and calls no generator. Every control does exactly one
// thing: push a new URL. The board that comes back is rendered on the server
// from the seed in that URL, which is what makes every board reachable by link
// and what keeps the generator off the wire. It is also the fix for §4.5, the
// original's regenerate leaving half the previous board's tiles on screen:
// there is no imperative teardown here to get wrong, only a navigation.
//
// Both optional controls are drawn from registry data rather than from an id
// comparison: the slider's bounds are `variant.islands`, and the toggle appears
// only when `game.variants.length > 1`. So a variant with no sea gets no
// slider, a game with one player count gets no toggle, and Phase 10 adding the
// 5-6 player Seafarers entry needs no edit here.

"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { playersLabel } from "@/components/controls/playersLabel";
import type { Game } from "@/domain/variants";
import { variantFor } from "@/domain/variants";
import { boardHref, paramsForPlayers, randomSeed } from "@/routing/boardUrl";
import type { BoardParams } from "@/routing/boardUrl";

export default function BoardControls({
    game,
    params,
}: {
    game: Game;
    params: BoardParams;
}) {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();
    const range = variantFor(game, params.players).islands;

    // The value under the thumb while a drag is in progress. It is local so the
    // thumb tracks the finger at 60fps without asking the server for a board on
    // every step; `commit` is what turns a finished gesture into one navigation.
    const [dragged, setDragged] = useState(params.islands);
    // The last address pushed, which is not the same as the one on screen:
    // between a push and the server's answer they disagree, and every commit
    // handler that fires in that window — a keyup followed by a blur is the
    // ordinary case — would otherwise push the identical URL again and leave a
    // history entry that goes nowhere. State rather than a ref, because it is
    // cleared below during render and a ref may not be.
    const [pushed, setPushed] = useState<string | null>(null);

    const current = boardHref(game, params);
    // React's documented "adjust state when a prop changes" pattern, in place
    // of an effect. Whenever a navigation lands — the server's answer, or a
    // Back button — the thumb follows the URL rather than keeping a stale
    // value, and the guard above forgets what it pushed, so returning to a
    // board and leaving it again the same way still navigates.
    const [seen, setSeen] = useState(current);

    if (seen !== current) {
        setSeen(current);
        setDragged(params.islands);
        setPushed(null);
    }

    function go(next: BoardParams): void {
        const href = boardHref(game, next);

        // Never push the address already in the bar. `pushed` covers the window
        // between a push and the server's answer; `current` covers a control
        // that was operated without changing anything — selecting the player
        // count already selected, which a radio group makes one tap away.
        if (href === pushed || href === current) {
            return;
        }

        setPushed(href);
        startTransition(() => router.push(href));
    }

    // Committed on pointer/key release rather than on every `change`, so one
    // drag across the slider is one board rather than five.
    function commit(): void {
        if (dragged !== undefined && dragged !== params.islands) {
            go({ ...params, islands: dragged });
        }
    }

    return (
        <div
            className="flex w-full flex-col gap-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6"
            aria-busy={isPending}
        >
            {game.variants.length > 1 && (
                // A radio group of buttons rather than a `<select>`: two
                // options both worth showing, and each one is a 44px touch
                // target per the mobile-first rule in CLAUDE.md.
                <div
                    role="radiogroup"
                    aria-label="players"
                    // `self-start` so the pill hugs its two options when the
                    // row stacks on a phone, rather than stretching to the
                    // column width with both buttons bunched at one end.
                    className="flex shrink-0 self-start rounded-full border border-black/15 p-1 sm:self-auto dark:border-white/20"
                >
                    {game.variants.map((option) => {
                        const selected = option.players === params.players;

                        return (
                            <button
                                key={option.id}
                                type="button"
                                role="radio"
                                aria-checked={selected}
                                className={`min-h-11 rounded-full px-4 text-sm font-medium tabular-nums transition-colors ${
                                    selected
                                        ? "bg-[var(--terrain-sea)] text-white"
                                        : "opacity-70 hover:opacity-100"
                                }`}
                                onClick={() =>
                                    go(
                                        paramsForPlayers(
                                            game,
                                            params,
                                            option.players,
                                        ),
                                    )
                                }
                            >
                                {playersLabel(option.players)}
                            </button>
                        );
                    })}
                </div>
            )}
            {range !== undefined && dragged !== undefined && (
                <div className="flex flex-1 items-center gap-3">
                    <label
                        htmlFor="islands"
                        className="shrink-0 text-sm font-medium"
                    >
                        islands
                    </label>
                    <input
                        id="islands"
                        type="range"
                        className="h-11 min-w-0 flex-1 accent-[var(--terrain-sea)]"
                        min={range.min}
                        max={range.max}
                        step={1}
                        value={dragged}
                        onChange={(event) =>
                            setDragged(Number(event.target.value))
                        }
                        onPointerUp={commit}
                        onKeyUp={commit}
                        onBlur={commit}
                    />
                    <output
                        htmlFor="islands"
                        className="w-4 shrink-0 text-right text-sm tabular-nums"
                    >
                        {dragged}
                    </output>
                </div>
            )}
            <button
                type="button"
                // 44px tall on touch, per the mobile-first rule in CLAUDE.md.
                className="min-h-11 shrink-0 rounded-full bg-[var(--terrain-sea)] px-6 font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
                disabled={isPending}
                onClick={() => go({ ...params, seed: randomSeed() })}
            >
                {isPending ? "generating…" : "regenerate"}
            </button>
        </div>
    );
}
