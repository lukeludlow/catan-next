import { describe, expect, test, vi } from "vitest";
import { isValidElement } from "react";
import type { ReactElement, ReactNode } from "react";
import { Analytics } from "@vercel/analytics/next";
import RootLayout, { metadata } from "@/app/layout";

// The root layout is the one place analytics can be dropped without anyone
// noticing: `<Analytics />` renders nothing, so no visual test and no
// screenshot would ever catch its removal. This asserts it is in the tree.
//
// It runs in the fast `unit` tier rather than the browser tier because the
// layout renders <html>/<body>, which cannot be mounted inside a test page.
// Instead the component is called as the plain function it is and the returned
// React elements are walked as data — no renderer involved.

// `next/font/google` is a zero-byte webpack-loader target outside the Next
// compiler, so `Geist` would be `undefined` and calling it would throw. The
// `default: {}` entry follows the same Vite pre-bundling interop gotcha
// documented in BoardControls.test.tsx.
vi.mock("next/font/google", () => ({
    default: {},
    Geist: () => ({ variable: "--font-geist-sans" }),
    Geist_Mono: () => ({ variable: "--font-geist-mono" }),
}));

function renderLayout(): ReactElement {
    return RootLayout({
        children: null,
        params: Promise.resolve({}),
    }) as ReactElement;
}

function childrenOf(element: ReactElement): ReactNode[] {
    const { children } = element.props as { children?: ReactNode };
    return Array.isArray(children) ? children : [children];
}

function onlyChild(element: ReactElement): ReactElement {
    const [child] = childrenOf(element);
    expect(isValidElement(child)).toBe(true);
    return child as ReactElement;
}

describe("RootLayout", () => {
    test("renders <Analytics /> inside the body", () => {
        const body = onlyChild(renderLayout());

        expect(body.type).toBe("body");
        // Identity, not a name match: a renamed or re-exported component would
        // still satisfy a string comparison while sending nothing to Vercel.
        expect(
            childrenOf(body).some((child) => hasType(child, Analytics)),
        ).toBe(true);
    });

    test("keeps the document shell it is responsible for", () => {
        const html = renderLayout();

        expect(html.type).toBe("html");
        expect((html.props as { lang?: string }).lang).toBe("en");
        expect((html.props as { className?: string }).className).toContain(
            "antialiased",
        );

        const body = onlyChild(html);
        expect((body.props as { className?: string }).className).toBe(
            "min-h-full flex flex-col",
        );
    });
});

describe("metadata", () => {
    test("names the app and describes the seed contract", () => {
        expect(metadata.title).toBe("Catan Board Generator");
        expect(metadata.description).toContain("seed");
    });

    // The icons come from the app/ file conventions (icons.test.ts), so an
    // explicit `icons` block here would be a second, drifting source of truth.
    test("does not hand-write an icons block", () => {
        expect(metadata.icons).toBeUndefined();
    });
});

function hasType(child: ReactNode, type: unknown): boolean {
    return isValidElement(child) && child.type === type;
}
