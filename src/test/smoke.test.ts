import { expect, test } from "vitest";

// Proves the fast `unit` tier is wired (ROADMAP §7): .test.ts files run, and
// they run under happy-dom rather than bare node. Phase 1 replaces this with
// the real hex-topology tests.
test("the unit tier runs under happy-dom", () => {
    expect(typeof document).toBe("object");
    expect(document.createElement("div").tagName).toBe("DIV");
});
