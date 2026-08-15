import { afterEach, describe, expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import ShareLink from "@/components/controls/ShareLink";

// The share affordance is the one feature the original could not offer at all
// (ROADMAP §6), and its whole job is to hand back a URL that regenerates this
// exact board. So what these assert is the string in the box.

const HREF = "/seafarers?seed=abc123&islands=3";

// An own property on `navigator` shadows the real accessor and can be deleted
// to restore it, which is the only way to stub a clipboard that WebKit will not
// otherwise let a headless page write to.
function stubClipboard(writeText: (text: string) => Promise<void>): void {
    Object.defineProperty(navigator, "clipboard", {
        value: { writeText },
        configurable: true,
    });
}

afterEach(() => {
    Reflect.deleteProperty(navigator, "clipboard");
    vi.restoreAllMocks();
});

describe("ShareLink", () => {
    test("shows the board's full address, not just its path", async () => {
        const screen = await render(<ShareLink href={HREF} />);
        const box = screen.getByRole("textbox", { name: "link to this board" });

        await expect
            .element(box)
            .toHaveValue(`${window.location.origin}${HREF}`);
    });

    test("does not let the link be edited into a different board", async () => {
        const { container } = await render(<ShareLink href={HREF} />);

        expect(container.querySelector("input")?.readOnly).toBe(true);
    });

    test("copies that address to the clipboard", async () => {
        const written: string[] = [];

        stubClipboard(async (text) => {
            written.push(text);
        });

        const screen = await render(<ShareLink href={HREF} />);

        await screen.getByRole("button", { name: "copy" }).click();

        expect(written).toEqual([`${window.location.origin}${HREF}`]);

        await expect
            .element(screen.getByRole("button", { name: "copied" }))
            .toBeInTheDocument();
    });

    // A denied permission or an insecure context is the realistic failure, and
    // selecting the text leaves the user one keystroke away rather than
    // pressing a button that does nothing.
    test("selects the link when the clipboard refuses", async () => {
        stubClipboard(() => Promise.reject(new Error("denied")));

        const screen = await render(<ShareLink href={HREF} />);

        await screen.getByRole("button", { name: "copy" }).click();

        const input = screen.container.querySelector("input");

        expect(input?.selectionStart).toBe(0);
        expect(input?.selectionEnd).toBe(input?.value.length);

        // And it does not claim to have copied anything.
        await expect
            .element(screen.getByRole("button", { name: "copy" }))
            .toBeInTheDocument();
    });
});
