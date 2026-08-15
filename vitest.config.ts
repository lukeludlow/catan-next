import { defineConfig } from "vitest/config";
import { playwright } from "@vitest/browser-playwright";
import react from "@vitejs/plugin-react";
import path from "path";

// Two tiers (ROADMAP §7). The file extension selects the tier: pure-logic tests
// are .test.ts and run in the fast `unit` project; component tests are
// .test.tsx and run in the `browser` project against real browsers. Keeping the
// generator's tests in the fast tier is why src/domain/ is lint-banned from
// importing React at all.
export default defineConfig({
    plugins: [react()],
    resolve: {
        alias: {
            "@": path.resolve(import.meta.dirname, "src"),
        },
    },
    test: {
        projects: [
            {
                extends: true,
                test: {
                    name: "unit",
                    // happy-dom rather than node so the occasional DOM
                    // touchpoint (URL, DOMParser) works without a browser.
                    environment: "happy-dom",
                    include: ["src/**/*.test.ts"],
                },
            },
            {
                extends: true,
                test: {
                    name: "browser",
                    include: ["src/**/*.test.tsx"],
                    browser: {
                        enabled: true,
                        headless: true,
                        provider: playwright(),
                        // https://vitest.dev/config/browser/playwright
                        instances: [
                            { browser: "chromium" },
                            { browser: "firefox" },
                            { browser: "webkit" },
                        ],
                    },
                },
            },
        ],
    },
});
