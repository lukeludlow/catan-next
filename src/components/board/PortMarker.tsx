// A harbour, drawn as a wedge on the side of its hex pointing out to sea
// (ROADMAP §6, §11 — a port belongs to a land hex plus a side here, not to a
// sea tile as in physical Catan).
//
// The wedge is drawn once in local coordinates pointing east, then translated
// and rotated into place by `sideAngle`. Drawing six differently-shaped wedges,
// or looking the offsets up in a per-side table, is exactly the pattern that
// produced the original's port bug (ROADMAP §4.4).
//
// It deliberately stops short of the tile edge. Hexes render in document order,
// so anything crossing the outline could be painted over by a later tile — and
// keeping decorations inside their own hex is what lets each tile stay a single
// labelled group instead of the board needing a second drawing pass.

import { HEX_STROKE, portFill } from "@/components/board/boardColors";
import {
    HEX_SIZE,
    hexCenter,
    sideAngle,
    sideMidpoint,
    svgNumber,
} from "@/domain/layout";
import type { Axial } from "@/domain/hex";
import type { Port } from "@/domain/types";

// How far out along the side the wedge sits, as a fraction of the distance from
// the hex's center to the middle of that side. REACH + LENGTH stays under 1 so
// the tip stops short of the outline.
const REACH = 0.58;
const LENGTH = HEX_SIZE * 0.3;
const HALF_WIDTH = HEX_SIZE * 0.26;

// Pointing east, tip at +x, so a rotation by `sideAngle` aims it at the sea.
const WEDGE = `M 0 ${-HALF_WIDTH} L ${LENGTH} 0 L 0 ${HALF_WIDTH} Z`;

export default function PortMarker({
    coord,
    port,
}: {
    coord: Axial;
    port: Port;
}) {
    const center = hexCenter(coord);
    const edge = sideMidpoint(coord, port.side);
    const x = svgNumber(center.x + (edge.x - center.x) * REACH);
    const y = svgNumber(center.y + (edge.y - center.y) * REACH);
    const angle = svgNumber(sideAngle(port.side));

    return (
        <path
            d={WEDGE}
            transform={`translate(${x} ${y}) rotate(${angle})`}
            strokeWidth={HEX_SIZE * 0.03}
            // The outline is what keeps a harbour readable when it happens to
            // sit on a tile its own color — a rock port on a rock hex.
            // See NumberChit: an inline style, not a `fill` attribute.
            style={{ fill: portFill(port.resource), stroke: HEX_STROKE }}
        />
    );
}
