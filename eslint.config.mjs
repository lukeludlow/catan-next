import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// Import boundaries (ROADMAP §2). ESLint replaces rather than merges rule
// options across matching config blocks, so every block that restricts imports
// must restate the shared parent-import ban.
const noParentImports = {
    regex: "^\\.\\./",
    message: "Use the @/ alias instead of parent-relative imports.",
};
const noReactImports = {
    regex: "^@/(components|app)/",
    message:
        "src/domain/ is pure TypeScript and must not import React or route code.",
};

const eslintConfig = defineConfig([
    ...nextVitals,
    ...nextTs,
    globalIgnores([
        // Default ignores of eslint-config-next.
        ".next/**",
        "out/**",
        "build/**",
        "next-env.d.ts",
    ]),
    {
        files: ["**/*.{ts,tsx,mts}"],
        rules: {
            "no-restricted-imports": ["error", { patterns: [noParentImports] }],
        },
    },
    {
        // The generator is pure: no React, no DOM, no route imports. Enforced
        // here rather than by convention, because the whole testing strategy
        // (ROADMAP §7) depends on the domain staying runnable in the fast tier.
        files: ["src/domain/**"],
        rules: {
            "no-restricted-imports": [
                "error",
                { patterns: [noParentImports, noReactImports] },
            ],
        },
    },
]);

export default eslintConfig;
