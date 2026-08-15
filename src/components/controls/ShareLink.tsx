// "Share this board" (ROADMAP §6) — the affordance the original could not
// offer at all, because its boards existed only as DOM built from
// `Math.random()` and were gone the moment you reloaded.
//
// There is nothing to compute here: the route redirects until the address bar
// spells out the seed, so the link is just the current location. The server
// passes the path it settled on and this only prefixes the origin, which is why
// the box is right on the very first paint instead of blank until an effect
// runs.
//
// A client component for one reason — `window.location.origin` and the
// clipboard both exist only in the browser.

"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

// The origin never changes within a page's life, so there is nothing to
// subscribe to — but this is still the right hook for it: it is the one way to
// read a browser-only value that has a *server* snapshot, so the server renders
// the path, the client renders the full URL, and hydration is told to expect
// the difference. An effect that called `setOrigin` would be the same thing
// with a wasted render, and is what `react-hooks/set-state-in-effect` objects
// to.
const subscribe = () => () => {};

export default function ShareLink({ href }: { href: string }) {
    const input = useRef<HTMLInputElement>(null);
    const [copied, setCopied] = useState(false);
    const origin = useSyncExternalStore(
        subscribe,
        () => window.location.origin,
        () => "",
    );

    useEffect(() => {
        if (!copied) {
            return;
        }

        const timer = setTimeout(() => setCopied(false), 2000);

        return () => clearTimeout(timer);
    }, [copied]);

    const url = `${origin}${href}`;

    async function copy(): Promise<void> {
        try {
            await navigator.clipboard.writeText(url);
            setCopied(true);
        } catch {
            // Denied permission, or an insecure context. Selecting the text
            // leaves the user one keystroke from copying it by hand, which
            // beats a button that silently does nothing.
            input.current?.select();
        }
    }

    return (
        <div className="flex w-full items-center gap-2">
            <label htmlFor="share" className="sr-only">
                link to this board
            </label>
            <input
                id="share"
                ref={input}
                type="text"
                readOnly
                value={url}
                onFocus={(event) => event.target.select()}
                className="min-h-11 min-w-0 flex-1 rounded-lg border border-black/15 bg-transparent px-3 font-mono text-xs dark:border-white/20"
            />
            <button
                type="button"
                className="min-h-11 shrink-0 rounded-lg border border-black/15 px-4 text-sm font-medium transition-opacity hover:opacity-70 dark:border-white/20"
                onClick={copy}
            >
                {copied ? "copied" : "copy"}
            </button>
        </div>
    );
}
