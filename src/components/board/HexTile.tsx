// One tile: the polygon, and whatever sits on it (ROADMAP §6).
//
// Each tile is a single `role="img"` group carrying its own accessible name, so
// a test — or a screen reader — can ask the board what is on it by name rather
// than by pixel. The original could only be inspected as a pile of `<img>` tags
// whose `src` was the only clue to what they showed.
//
// The `data-*` coordinates are there so a rendering can be checked against the
// rules the generator promises — "no two 6/8 adjacent" is a statement about the
// board on screen, and asserting it against the `Board` object the markup was
// built from would only prove the generator right twice.

import NumberChit from "@/components/board/NumberChit";
import PortMarker from "@/components/board/PortMarker";
import { HEX_STROKE, TERRAIN_FILL } from "@/components/board/boardColors";
import { hexLabel } from "@/components/board/hexLabel";
import { HEX_SIZE, hexCenter, polygonPoints } from "@/domain/layout";
import type { Hex } from "@/domain/types";

export default function HexTile({ hex }: { hex: Hex }) {
    return (
        <g
            role="img"
            aria-label={hexLabel(hex)}
            data-q={hex.coord.q}
            data-r={hex.coord.r}
            data-number={hex.diceNumber}
        >
            <polygon
                points={polygonPoints(hex.coord)}
                strokeWidth={HEX_SIZE * 0.03}
                // See NumberChit: an inline style, not a `fill` attribute.
                style={{
                    fill: TERRAIN_FILL[hex.terrain],
                    stroke: HEX_STROKE,
                }}
            />
            {hex.port !== undefined && (
                <PortMarker coord={hex.coord} port={hex.port} />
            )}
            {hex.diceNumber !== undefined && (
                <NumberChit
                    center={hexCenter(hex.coord)}
                    value={hex.diceNumber}
                />
            )}
        </g>
    );
}
