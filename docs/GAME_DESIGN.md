# Sky Skid: design notes

**Goal:** make people keep playing. Sessions should end because the player chose to stop, never because the game ran out of challenge or made them wait.

## Core loop

Look at the board → plan a route → dash (under a second) → see the result → try for fewer dashes → next level. A full loop takes 10–40 seconds, so "one more" is always a small commitment.

## Rules

You dash in a straight line until something stops you. The flag only opens once every coin is collected.

| Tile | Behaviour | Teaches |
| --- | --- | --- |
| Brick | Stops you | Using obstacles as brakes |
| Gap | You fall, and that dash is rewound | Checking the whole line first |
| Tall grass | Stops you on the tile | Stopping mid-line |
| Crumbling platform | Holds for one crossing | Planning order; a wrong route can lock you out |
| Cloud pair | Warps you to the twin and stops | Non-local routes |

## Design decisions and why

| Theory | Decision |
| --- | --- |
| **Fun is learning patterns; boredom is mastery** (Koster, *A Theory of Fun*) | A new rule every 7–8 levels for five zones. Each level must prove the zone's new tile is needed, so a new rule can't be ignored. |
| **Flow: challenge tracks skill** (Csikszentmihalyi) | Level choice follows the player: perfect clears move difficulty up, struggles move it down, and repeated struggles bring an easier level. |
| **Competence and autonomy** (Self-Determination Theory) | Par is the proven minimum, so three stars means truly perfect. Players can always leave a level through a limited hint or a skip. |
| **Frictionless failure** | Falls rewind one dash. Undo and restart are instant, with no confirmation. One buffered input keeps fast play responsive. |
| **Near-miss pull** | Finishing just over par says "only 1 move away from perfect!" and makes Retry the highlighted button. |
| **Variable rewards** (Hopson, *Behavioral Game Design*) | Stars fill a chest that holds a random skin, weighted by rarity. |
| **Goal gradient and endowed progress** | The chest bar starts part-filled and stays visible. |
| **Feedback feel** | Rising pitch for coins in the same dash, landing squash, camera shake, particles. |
| **Reason to come back** | A daily level with a day streak, the same for everyone on a given date. |

**Left out on purpose:** energy timers, paid continues, fake countdowns and streak-loss threats. They raise short-term numbers by making the game worse, and there is no monetisation here for them to serve.

## What Z3 proves

`tools/z3Encoding.ts` models the rules as bounded transitions over position, coins and cracked platforms, then checks each level.

| # | Property | Method | Strength |
| --- | --- | --- | --- |
| P1 | Level can be completed | SAT, and the witness is replayed through the real engine | Full |
| P2 | Par is the true minimum | UNSAT at every shorter length | Full |
| P3 | The featured tile is required | UNSAT with that tile forbidden | **Bounded** to par + 8 dashes by Z3; the generator's BFS also checks it exhaustively |
| P4 | Gaps are real threats | A lethal dash is reachable within par moves | Full |

An independent BFS must agree with Z3 on every par. The two share `traceDash` and the rules it encodes, so a bug in those rules could get past both; unit tests cover them separately.

P4 only applies to zone 1, the zone that features gaps. Soft-locks are allowed by design: crumbling platforms can make a level unwinnable, and the game detects that with BFS at runtime and tells the player to undo.

## Bots

| Bot | Plays by | Stands in for |
| --- | --- | --- |
| Naive | Random legal moves | First-time player, not yet thinking ahead |
| Casual | 1 move ahead, 25% slips | Relaxed player |
| Decent | 4 moves ahead, 8% slips | Engaged player |
| Pro | 8 moves ahead, 2% slips, replays for stars | Expert |
| Oracle | Perfect (BFS) | Upper limit on skill |

Bots use the same `LevelSession` and progression code as the real game. On top sits an **assumed** engagement model in `tools/simulation.ts`: rewards refill a budget, falls and flat stretches drain it, and the bot quits at zero.

**The move-playing is real; the quitting is a model.** Use it to find difficulty spikes, broken progression and regressions between builds. It can't show that people will enjoy the game or how long they'll stay: the retention figures come from constants we chose. That takes real players.

### What the bots already changed

- Free hints let the random-move bot autoplay to the final zone, so hints became limited, with a skip as the way out.
- Once the endless zone was used up, one level was served about 4 times per player. Replays now rotate through levels not played recently.
- A difficulty formula based on random-walk win rate mislabelled levels, including a zone opener that Casual needed hints for 93% of the time. Difficulty now comes from the attempts Casual and Decent actually need (`npm run calibrate`).

## Known gaps

- Content runs out: the endless zone has 60 levels, after which it replays them. The bots reach that point within a few sessions, so the next step is more levels.
- No music: the Kenney kits used here don't include any.
- No real-player data yet. The first thing to measure is where people actually quit.
