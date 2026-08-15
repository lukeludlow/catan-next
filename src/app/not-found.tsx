// Reached by `notFound()` in the board route when a URL names a variant the
// registry does not have — the one 404 this app can produce, and worth four
// lines so a mistyped address offers the way back rather than Next's default.

import Link from "next/link";

export default function NotFound() {
    return (
        <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-start justify-center gap-3 px-4 py-12">
            <h1 className="text-2xl font-semibold tracking-tight">
                No such board
            </h1>
            <p className="opacity-70">
                That address does not name a game this generator knows.
            </p>
            <Link href="/" className="min-h-11 underline underline-offset-4">
                see the boards it does
            </Link>
        </main>
    );
}
