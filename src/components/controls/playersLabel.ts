// How a player count reads to a human. `?players=6` names the 5-6 player
// extension, because the physical boxes are labelled by their upper bound and
// the URL follows them — but "6" on its own in a control would look like it
// excluded a five-player game.
//
// A plain `.ts` module rather than a string inside the control, for the reason
// `hexLabel.ts` is one (ROADMAP §9 Phase 4): the fast unit tier covers it,
// instead of three browser launches.

import type { PlayerCount } from "@/domain/variants";

export function playersLabel(players: PlayerCount): string {
    return players === 4 ? "3–4" : "5–6";
}
