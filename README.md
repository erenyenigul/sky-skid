# Sky Skid

A sliding puzzle game: a small robot dashes across sky platforms until something stops it. Collect every coin, then reach the flag, in as few dashes as you can. Built with Three.js (WebGPU), and every shipped level is proven by Z3.

```bash
npm install
npm run dev        # play it
npm run verify     # re-prove all shipped levels with Z3
npm run playtest   # simulate the 5 bots (--players, --days, --seed)
npm test           # unit tests and Z3 encoding tests
npm run e2e        # browser tests (needs `npx playwright install chromium`)
```

Regenerating levels: `npm run levels`, then `npm run calibrate`, then `npm run verify`.

Controls: arrows, WASD or swipe. `Esc` menu, `R` restart, `H` hint, `Enter` next.

## Publishing to GitHub Pages

`.github/workflows/deploy.yml` tests, builds and publishes the game on every push to `main`. In the repository, set **Settings → Pages → Source** to **GitHub Actions** once. The game then appears at `https://<username>.github.io/<repo>/`.

## Architecture

Dependencies point inward: `presentation` and `infrastructure` depend on `application`, which depends on `domain`.

| Layer | Path | Holds |
| --- | --- | --- |
| Domain | `src/domain` | Board, dash rules, BFS solver. Pure, no dependencies. |
| Application | `src/application` | Level session, progression, rewards, level selection. Used by both the game and the bots. |
| Infrastructure | `src/infrastructure` | Save data and audio. |
| Presentation | `src/presentation` | Three.js scene, Preact HUD, controller. |
| Tools | `tools` | Z3 encoding, level generator, calibration, bots, simulator. |

See [docs/GAME_DESIGN.md](docs/GAME_DESIGN.md) for the design rationale and what the proofs and bots do and don't show.
