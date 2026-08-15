// The dice chit on a resource hex: a disc with the number on it, red for 6 and
// 8 (ROADMAP §6). The original shipped a PNG per number; here it is two SVG
// elements, which is what lets the board scale to any size and lets a test read
// the number back out as text.

import { CHIT_FACE, HEX_STROKE, chitInk } from "@/components/board/boardColors";
import { HEX_SIZE, svgNumber } from "@/domain/layout";
import type { Point } from "@/domain/layout";

const RADIUS = HEX_SIZE * 0.34;

export default function NumberChit({
    center,
    value,
}: {
    center: Point;
    value: number;
}) {
    const x = svgNumber(center.x);
    const y = svgNumber(center.y);

    return (
        <>
            <circle
                cx={x}
                cy={y}
                r={RADIUS}
                strokeWidth={HEX_SIZE * 0.03}
                // `style` rather than a `fill` attribute: `fill="var(--x)"` on a
                // presentation attribute is not honored across all three
                // browsers the test tier runs, while an inline style is.
                style={{ fill: CHIT_FACE, stroke: HEX_STROKE }}
            />
            <text
                x={x}
                y={y}
                // Vertical centering by shifted baseline rather than by
                // `dominant-baseline: central`, which WebKit has historically
                // been inconsistent about.
                dy="0.35em"
                textAnchor="middle"
                fontSize={HEX_SIZE * 0.42}
                fontWeight={700}
                style={{ fill: chitInk(value) }}
            >
                {value}
            </text>
        </>
    );
}
