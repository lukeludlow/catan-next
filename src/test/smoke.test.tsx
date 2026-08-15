import { expect, test } from "vitest";
import { render } from "vitest-browser-react";

// Proves the `browser` tier is wired (ROADMAP §7): .test.tsx files render React
// in real Chromium, Firefox, and WebKit. Phase 4 replaces this with BoardSvg's
// tests.
test("the browser tier renders React in a real browser", async () => {
    const screen = await render(<p>catan-next</p>);

    await expect.element(screen.getByText("catan-next")).toBeInTheDocument();
});
