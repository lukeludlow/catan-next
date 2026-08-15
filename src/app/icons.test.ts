import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

// These three files are binaries copied out of the retired Angular app, and
// Next serves them purely by filename — nothing imports them, so nothing
// typechecks them and a truncated or wrong-format copy would still build and
// still deploy, just with a broken icon. This asserts the bytes.
//
// Magic numbers rather than an image decoder: the failure modes worth catching
// (empty file, half a copy, the scaffold default left in place) are all visible
// in the header and the length, and a decoder would be a dependency added to
// test three static files.

const APP_DIR = path.resolve(import.meta.dirname);

// `00 00 01 00` — the ICONDIR reserved+type fields of a Windows icon.
const ICO_MAGIC = Buffer.from([0x00, 0x00, 0x01, 0x00]);
// `\x89PNG` — the first half of the PNG signature.
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

// The create-next-app favicon, byte for byte. If this size comes back, the
// Vercel triangle is being served again.
const SCAFFOLD_FAVICON_BYTES = 25931;

const ICONS = [
    { file: "favicon.ico", magic: ICO_MAGIC },
    { file: "icon.png", magic: PNG_MAGIC },
    { file: "apple-icon.png", magic: PNG_MAGIC },
];

describe.each(ICONS)("$file", ({ file, magic }) => {
    const bytes = (): Buffer => readFileSync(path.join(APP_DIR, file));

    test("exists and is not empty", () => {
        expect(bytes().byteLength).toBeGreaterThan(0);
    });

    test("starts with the right magic number", () => {
        expect(bytes().subarray(0, magic.byteLength)).toEqual(magic);
    });
});

test("favicon.ico is the board icon, not the scaffold default", () => {
    const favicon = readFileSync(path.join(APP_DIR, "favicon.ico"));
    expect(favicon.byteLength).not.toBe(SCAFFOLD_FAVICON_BYTES);
});
