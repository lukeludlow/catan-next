// The board, as one scalable SVG (ROADMAP §6). Purely presentational and
// deliberately not a client component: the page generates the board on the
// server and this renders it, so the generator never ships to the browser.
//
// Nothing about it is sized in pixels. The viewBox is computed from the shape's
// own bounds, so a 19-hex Base Game board and a 42-hex Seafarers board — and
// the 5-6 player shapes of Phases 9-10 — each frame themselves, and the CSS box
// decides how large that framing is drawn. That is what replaces the original's
// background image and its hand-tuned percentage offsets, which could only ever
// be right at one size.

import HexTile from "@/components/board/HexTile";
import { key } from "@/domain/hex";
import { boardViewBox, viewBoxAttribute } from "@/domain/layout";
import type { Board } from "@/domain/types";

export default function BoardSvg({
    board,
    className = "block h-auto w-full",
}: {
    board: Board;
    className?: string;
}) {
    const hexes = [...board.hexes.values()];

    return (
        <svg
            // A container role, not `img`: `img` would collapse the whole board
            // into one node and hide every tile's name from the tree.
            role="group"
            viewBox={viewBoxAttribute(
                boardViewBox(hexes.map((hex) => hex.coord)),
            )}
            preserveAspectRatio="xMidYMid meet"
            className={className}
        >
            {hexes.map((hex) => (
                <HexTile key={key(hex.coord)} hex={hex} />
            ))}
        </svg>
    );
}
