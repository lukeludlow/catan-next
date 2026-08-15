// The home page (ROADMAP §6): one link per variant, replacing the original's
// radio-buttons-then-generate flow. Driven off the registry rather than written
// out, so the 5-6 player boards of Phases 9-10 appear here the day they are
// added to `variants.ts` and this file is never touched again.

import Link from "next/link";
import { ALL_VARIANTS } from "@/domain/variants";

export default function Home() {
    return (
        <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-8 px-4 py-12">
            <div className="flex flex-col gap-2">
                <h1 className="text-3xl font-semibold tracking-tight">
                    Catan board generator
                </h1>
                <p className="opacity-70">
                    Every board is a link. Share the address and the same board
                    comes back.
                </p>
            </div>

            <nav className="flex flex-col gap-3 sm:flex-row">
                {ALL_VARIANTS.map((variant) => (
                    <Link
                        key={variant.id}
                        href={`/${variant.id}`}
                        className="flex min-h-11 flex-1 items-center justify-between gap-4 rounded-xl border border-black/15 px-5 py-4 transition-colors hover:border-[var(--terrain-sea)] dark:border-white/20"
                    >
                        <span className="font-medium">{variant.name}</span>
                        <span className="text-sm opacity-60">
                            {variant.shape.length} hexes
                        </span>
                    </Link>
                ))}
            </nav>
        </main>
    );
}
