// The islands slider and the regenerate button (ROADMAP §6) — the only
// component in the app that runs in the browser as anything but markup.
//
// It holds no board and calls no generator. Both controls do exactly one thing:
// push a new URL. The board that comes back is rendered on the server from the
// seed in that URL, which is what makes every board reachable by link and what
// keeps the generator off the wire. It is also the fix for §4.5, the original's
// regenerate leaving half the previous board's tiles on screen: there is no
// imperative teardown here to get wrong, only a navigation.
//
// The slider's bounds come from `variant.islands` rather than from a constant,
// so the control follows the registry — a variant with no sea gets no slider at
// all, and Phase 10 raising the ceiling to 7 needs no edit here.

"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { Variant } from "@/domain/variants";
import { boardHref, randomSeed } from "@/routing/boardUrl";
import type { BoardParams } from "@/routing/boardUrl";

export default function BoardControls({
    variant,
    params,
}: {
    variant: Variant;
    params: BoardParams;
}) {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();
    const range = variant.islands;

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

    const current = boardHref(variant, params);
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
        const href = boardHref(variant, next);

        if (href === pushed) {
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
            className="flex w-full flex-col gap-4 sm:flex-row sm:items-center sm:justify-between sm:gap-8"
            aria-busy={isPending}
        >
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
