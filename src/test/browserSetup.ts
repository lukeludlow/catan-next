// Loads the app's stylesheet into the browser test tier (ROADMAP §7).
//
// The board's colors are CSS custom properties (`--terrain-wheat` and friends,
// defined in globals.css), so without this every `var()` in the rendered SVG
// would resolve to nothing and a test could not tell a red 6 from a black one.
// Importing the stylesheet from the setup file rather than from each test keeps
// the tests about the board, and Vite runs it through the same PostCSS and
// Tailwind pipeline the app uses — so a token that works here works in `next
// build` too.
//
// Not named `*.test.ts`, so the unit project's include glob leaves it alone.

import "@/app/globals.css";
