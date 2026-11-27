# Hexball — architecture & maintenance guide (v2.66)

Hexball is a turn-based tactical football prototype. It ships as **one self-contained HTML page** (inline CSS, JS and
fonts; no network calls), published three ways: the installable web app on GitHub Pages (`dist/pwa`), a single
download-and-open file (`dist/hexball-offline.html`) and the "Hexball Tactics" claude.ai artifact (`dist/hexball.html`). The source is small plain-script modules that the build
concatenates in a fixed order inside one IIFE — no bundler, no imports, every top-level name is shared.

```
npm start        # build + serve the installable app at http://localhost:8080 (service worker works on localhost)
npm run build    # src/ → dist/: hexball.html (artifact), hexball.test.html (test hooks, 8× speed), hexball-offline.html, pwa/
npm run dev      # rebuild on every save in src/ (with `npm run serve` alongside)
npm run quick    # ~15 s: unit + behaviour lock + game-screen UI — run after each small change
npm test         # ~30 s: everything, suites in parallel (unit, replay, ui, start, smoke) — before publishing
                 #   node test/run.mjs ui smoke   → just those suites; node test/smoke.mjs dist/hexball.test.html <name> → one test
npm run replay   # node test/replay.mjs record|check — fixed-dice CPU matches; `check` fails on any log difference
npm run sim      # CPU vs CPU balance numbers            [npm run sim -- 20]
npm run keeper   # shots, saves, conversion by keeper position (cover / adj / open)
npm run shots    # shot map: rows from goal, in-box share
npm run mix      # CPU action mix per plan, kick-off variety
npm run defence  # turn outcomes, React windows, contests, how the ball was won (incl. clearances)  [node test/defence.mjs 10 sla-ars = 11v11]
npm run rhythm   # pacing/agency: spells, quiet turns, windows, contest odds, mini-games (seeded 1..N)  [DEF=respond PITCH=wide npm run rhythm -- 20]
npm run unused   # top-level JS names and CSS classes nothing references
npm run situations  # the shot set-ups (odds per aim spot + pictures) behind the Shot Situations page [-- outDir]
npm run format   # prettier
```

Setup: `npm install` (acorn, prettier, Playwright), then `npx playwright install chromium` once for the browser the
suites drive. The suites last matched the game at v2.47; see the test-repair note in `design-notes.md` before relying on them.

## Modules (load order = build order)

| Module | What lives there |
|---|---|
| `config.js` | **All tunables.** Board (`R`; `COLS`, `ROWS`, `MIDC`, `MIDR`, `BOXW`, `GOALW`, `KOC` centre-spot column, `GKC` keeper home column set by `sizeBoard(cols, rows, goalW, boxW)`; pitches in `PITCHES` (classic 9 × 13 goal 3, wide 10 × 15 goal 4) with their own 7v7 shape, 6v6/5v5 overrides and lineup slots, `PITCH` + `pitchNow()`), match lineups (`MATCHES` team sheets + suggested `pick`, `setLineup(k, picks)` swaps `ROSTER`/`PL`/`FORM`/`TEAMS`/`KO` and rebuilds the SVG; `lineUp()` places a picked 7 on `SLOTS7`), pass ranges/tiers (`RANGE`, `TIER`, `PRESS`, `FALL`), shot zones (`ZN`), teams/roster (`ROSTER`, `PL`, `RAR`), formations (`FORM`; per size `DROP`, `FORMS`; `SIZE`), movement (`MOVE`, `DRIBBLE`, `SECOND_RUN`, `GNG_RUN`), playback (`ORDER_MAX`, `LOB_FRAMES`, `GROUND_SPEED`, `DELAY`, `CONTROL`), defence (`PREPARE_*`, `WIN_*` incl. `WIN_EVERY`, `CLEAR_*`, `MARKS`, `MARK_RANGE`, `COMMIT`, `AUTO_GO`), keeper (`KEEPER_IN_LINE`, `KEEPER_ONE_OFF`), look (`SLOWMO`), plan limits (`KICKS` = one pass or shot, `MAX_RUNNERS` incl. dribblers), cards (`CROSS_AS`), practice (`WIN_ALL`), `CPU_OLD`. |
| `util.js` | helpers (`rnd` dice / `crnd` CPU choices — two streams from the turn seed, `pc`, `nm`, `other`, `key`, `same`, `mine`, `onPitch`), timing (`SPEED`, `wait`, `sleep`), `reduce`. |
| `hex.js` | hex maths: offset↔cube, `hd`, `nbrs`, `hexLine`, `shadowOf`, `px`, goal hexes (`goalCols`, `goalHex`, `goalPx`), `aimHex` / `aimX` (aim spot as a hex and in px). |
| `board-state.js` | queries on a board snapshot `st = {pos, ball, loose}`: `reach`, `mv`, `occ/at`, `pathFrom`, `truncPath`, `project`/`baseSt`; restarts: `keeperTakes`, `clearBox`, `onsideBack`. |
| `rules.js` | **pure odds**: `passEval`, `dribbleEval`, `shotEval` (+`zoneMods`), `saveP`/`keeperCols`/`kRel`, `assistOf`, `controlled`, `tackleP`, `clearP`, `comB`, `defReach`, `crossOK`, `dCrit`. No DOM, no state writes. |
| `plan.js` | attacker planning: limits (`canRun`, `cardOK`, `setCool`, `bothTouches`, `finished`), `addAction`, `describe`, timing lines, `planState`. |
| `game.js` | state `S` (`makeState`, `freshUI`), turn lifecycle `newGame → startTurn → goPlan → goReact → resolveTurn`, `turnover`, `restart` (box clear + onside), `goal`, `clearPlay`, `log`, `gate`, `banner`. |
| `gamelog.js` | technical log `gl()`, `planTxt`, `snapshot`/`stateText`/`copyState`/`loadState`, `SCENARIOS` (presets), `rewind` (Retry my last attack / Go back one turn, from `S.snaps`; `SAME_DICE` keeps the seed). |
| `playback.js` | the frame resolver: `playPlan`, `prepareWindow`/`prepareMove`, React windows (`pauseB`, budgets, every `WIN_EVERY` frames), clearances (`maybeClear`/`clearance`), movers, orders (`addOrder`, `stepOrders`), ball flight (`launch`, `advanceFlight` with `passPt`/`leanIn`, `land` with `adjustToScatter`/`pounceDef`), touches (`nextTouch`), `takeShot`, tackles. |
| `marking.js` | `goalSide`, `markStep`, `marksNow`, `setMark`/`canMark`, `stepMarks`, `cpuMarks`. |
| `duel.js` | `contact` (collision ring), duel overlay + timing tap (`duel`), practice wins (`practiceWin`). |
| `cpu.js` / `cpu-attack.js` / `cpu-defend.js` | CPU: `cpuPlanB` → `cpuPlanV2` (runs + 1–2 touch combos; old greedy `cpuPlan` for loose balls), `cpuPrepare`, `cpuOrdersB`, `cpuKeeperSpot`, `xgOf`/`bestXg`; defence scoring `cpuDefMoves` (`DF` weights), `cpuMarkBest`. |
| `anim.js` | drawing only: `tweenEl`/`tweenBall`, lob arcs, one rAF clock (`FRAME_MS`), `popWord`, `slowmo`. |
| `ui-board.js` | SVG board: `initBoard`, tokens (`renderTokens`, `tokPx`, `ballDir`), shot aim/curl, overlays (`renderOverlay`; v2.26: dribble hexes + tap-again-to-pass (`canPassNow`, `ui.flip`, `canFlipBack` in ui-input.js), range outlines `edgeOf`, arrow colours `chanceCls`, `laneThreats`, danger zone when `DANGER`). |
| `ui-panels.js` | header (`renderHeader`), panel + step list (`renderPanel`, `planList`), action bar (`renderBar`), More (`renderMore`, match feed `renderFeed`), pop-ups (`renderPop`; tap-a-space window `spaceWin`: Through / Pass / Cross, then ground or air; goal picker `goalPick`/`zoneInfo`/`keeperRange`), player card. |
| `ui-input.js` | taps: `onHex`, `onGoal`, `onAct` (buttons by `data-a`); start screen (`startGame`, `showStart`); More controls. |
| `main.js` | wiring at load. |
| `index.html`, `styles.css` | page template (`%%CSS%%`, `%%JS%%`) and the dark theme tokens at `:root`. |

Rule of thumb: **rules.js and board-state.js are pure** (take a board, return numbers) so they stay unit-testable.
Anything that animates or changes `S` belongs in playback/game; anything that draws belongs in anim/ui-*.

## State (`S`) — the parts that matter

- `mode` `'cpu' | 'hot' | 'sim'`, `attack` `'H'|'A'`, `score`, `turn`, `phase` (`idle`, `gate`, `plan`, `cpuplan`, `react`, `resolve`, `over`, `scnend`).
- Board: `pos {pid:[c,r]}` (keepers included), `ball` (carrier) or `loose` ([c,r]).
- Plan: `plan[]` — `{type:'move', pid, path, ball}`, `{type:'pass', from, to|target, kind, through?}`, `{type:'gng', from, to, ret, path}`, `{type:'cross', from, to, kind, zone}`, `{type:'shot', pid, zone}`. `ball:true` = a touch.
- Turn carry-overs: `cool` (cards resting), `tired`, `out`/`outNext` (beaten after losing the ball), `marks`/`marksOf`, `counter`, `kickoff`/`koBlock`, `seed`, `snap` + `snaps` (start-of-turn snapshots).
- Defence in play: `prepped`, `orders[]`, `budget`, `win`, `lastLeft`, `sent`, `frame`, `tk`, `com` (defenders who moved: commit bonus).
- Playback scratch (wiped by `clearPlay()`): `movers`, `bq`, `fl`/`flight`, `lpass`, `onCollect`, `scattered`, `flRest`/`ballMs` (pass timing on screen).
- `ui` (`freshUI()`): selection and pop-up state; `log`/`logAll` (narrative), `glog` (technical log, the source of the match feed).

## Turn flow

1. **Plan** (attacker): one pass or shot (`KICKS`; v2.24 `kickMax()`: two when the first is a ground pass, the second a pass or shot, no card), dribbles before/after it, up to `MAX_RUNNERS` moving players counting dribblers (one may move twice). Limits in plan.js: `kicks`/`kickUsed`, `runsOf`/`runnerSet`/`canRun`.
2. **Prepare**: the defence sees the players and moves up to `PREPARE_PLAYERS` × `PREPARE_STEPS` hex (keeper included). Not on a counter. v2.25 `DEF_MODE = 'respond'` (start screen → Defence): no Prepare; React windows after frames 1, 3, 5… (`pauseB`); Anticipate `S.read = {pid, of}` (`readPid`, `doRead`; bonus in `passEval`/`dribbleEval`/`shotEval`/`passP`, jumps in `advanceFlight`/`land`/`dribCheck`, used up in `duel`/`takeShot`); challenges `challengeOK`, `doPress` (`S.press`, `pressOn`), `doBlock` (`S.block`, `blockHex`), tackle from next to him (`{tackle, from}`), the tackle timing game `tackleGame` in duel.js; CPU `cpuRead` + press/tackle in `cpuOrdersB`. Sims: `DEF=respond npm run sim -- 20`.
3. **Playback** (`playPlan`), per frame: `nextTouch → stepMovers → stepOrders → stepMarks → advanceFlight → dribCheck → render → pauseB`. A React window opens every `WIN_EVERY` (2) frames. A defender who wins a contest may clear it (`maybeClear`), which ends the play.
4. End: `startTurn()` (keep the ball) / `turnover()` / `restart()` (save, wide: box clear, then onside) / `goal()`.

## How to…

- **Tune a number**: change it in `config.js`, run `npm test` (the behaviour check will fail — expected for a rule change), then `npm run sim -- 20` / `npm run keeper -- 30` and compare. When the change is intended, `npm run replay -- record`.
- **Refactor without changing play**: `npm test` must stay green including `replay check` (12 fixed-dice matches, logs must be identical).
- **Add a card**: action in `plan.js` (`addAction`, `cardOK`/`setCool`), odds in `rules.js`, pop-up in `ui-panels.js renderPop`, taps in `ui-input.js`, resolution in `playback.js nextTouch`, CPU use in `cpu-attack.js touchOpts`, text in `describe`/`ballActTxt`/`planTxt`, feed row in `feedRow`. Add a unit test and a UI test.
- **Add a defender action**: button in `renderBar` (react) + `onAct`, odds in `rules.js`, resolution in `playback.js`, CPU choice in `cpuOrdersB`.
- **Add a match lineup**: an entry in `MATCHES` (teams, the team sheet via `P11`, a suggested `pick` of 7 per team incl. a keeper) and an `<option value="m:key">` in the start screen's Team size. The squad screen (`showSquad`/`renderSquad` in ui-input.js) does the rest.
- **Shot odds** live in rules.js: `goalAngle`, `shotEval` (on target, pressure, blockers incl. `close`), `saveP(z, gkPos, att, dg, ref, as, shooterPos)` (keeper position, closing the angle, behind = 0), crit in `shotEval`; keeper hands in playback.js (`foesOn` includes the keeper in his box, `isKeeper`, `claimOrClear`, the rush in `dribCheck`) and the matching odds in `passEval`/`dribbleEval`. Tunables: `SHOT_*`, `KEEPER_*` in config.js. Check a change with `node tools/shot-situations.mjs` and `npm run defence -- 20`.
- **Never hard-code board coordinates**: use `MIDC`/`MIDR`/`COLS`/`ROWS`/`BOXW`/`GOALW`/`KOC`/`GKC`, `goalCols()` (the board changes size). On an even-width board `MIDC` is x.5: a hex needs `KOC` (centre spot) or `GKC` (keeper's line); `px()` takes the fractional column for drawing.
- **Add a pitch**: an entry in `PITCHES` (cols, rows, goal, box, a 7v7 `form`, `forms` for 6v6/5v5, `slots` for match lineups) and an option in the start screen's `#stPitch`. Sims on it: `PITCH=wide npm run sim -- 20`.
- **Change the look**: tokens at `:root` in `styles.css`; `npm run unused` lists dead CSS classes.

## Tests

- `test/rules.test.mjs` — pure modules in a `vm` sandbox; `board({...})` builds a position.
- `test/smoke.mjs` — real taps through the v2 UI: plan limits, cross card, defence Prepare/React, save-state replay, preset, start on defence, a full match vs CPU.
- `test/start.mjs` — start screen + a CPU match at each team size. `test/ui.mjs` — game screen (steps ×, retry, win all duels, goal picker, onside, scatter pounce, keeper falloff, match feed).
- `test/replay.mjs` + `test/replay-baseline.json` — the behaviour lock (12 matches, 4 at a time). It also checks rules
  every match must keep whatever the dice: React windows only on the 2-frame clock, at most one pass or shot per plan
  (it caught the CPU shooting after its Give & Go), no match past turn 150, no page errors — add cheap log checks
  there for new rules.
- `test/run.mjs` — the runner behind `npm test` / `npm run quick`: builds once, runs suites side by side, prints only
  the failures.
- Dev loop: `npm run quick` while working; `npm test` before publishing; a rule change → `npm run replay -- record`
  once you're happy with the new behaviour, plus a unit test for the new odds.
- Test hooks: `window.__hexball` (see `build.mjs`).

## Releasing (what a session ends with)

Work on a branch; `main` is what's live (every push to `main` deploys `dist/pwa` to GitHub Pages via
`.github/workflows/pages.yml`).

1. `npm test` green; `npm run replay -- record` first if play changed on purpose (and commit the new baseline).
2. A line in `design-notes.md` (Recent decisions); this file too if the structure moved. Bump `version` in
   `package.json` (shown in the game under More).
3. Commit, open a pull request, merge to `main` → the app updates on phones the next time they open it online.
4. Optional, to look at a build on the phone before merging: publish `dist/hexball.html` to the "Hexball Tactics"
   artifact (https://claude.ai/artifact/KibYkXqZ31B5LRBT4Zu4Ag); exact steps in [CLAUDE.md](CLAUDE.md).
