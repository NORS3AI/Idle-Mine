# Deep Delve — project guide for Claude Code

Deep Delve is a single-player **idle mining clicker** (a spinoff of Idle Miner Tycoon).
It's a static web app: **vanilla JS, no framework, no build step, no bundler, no npm
runtime deps** (the only network asset is Google Fonts). Run it by opening
`public/index.html`.

## Run & deploy
- Local: `npm run dev` → serves `public/` at http://localhost:5173
  (or just open `public/index.html` directly in a browser).
- Deploy to Cloudflare Pages: `npm run deploy`
  (`wrangler pages deploy public --project-name deep-delve`). First run will prompt to
  create the Pages project.

## Layout
- `public/index.html` — markup only: header, boost bar, nav, `#stations` container, modals.
- `public/css/styles.css` — all styling. Dark "lamp-lit mine" theme driven by CSS custom
  properties in `:root` (`--gold`, `--ore`, `--panel`, `--copper`, …).
- `public/js/game.js` — the entire game as one IIFE. All logic lives here.

## How `game.js` is organized (top → bottom)
1. **config constants** — `ORE_PRICE`, `TAP_SECS`, `COST_GROWTH`, `MILESTONES` (the miner
   milestone level thresholds), `OFFLINE_CAP`, `PRESTIGE_UNLOCK`.
2. **data tables** — `SHAFT_DEFS` (12 shafts), `RESEARCH` (6 nodes), `PRESTIGE`
   (legacy tree), `BOOSTS`, `ACH` (15 achievements). **Balance the game by editing these.**
3. **state** — `freshState()` returns the whole save object; `S` is the live state.
4. **multipliers** — `mShaft / mTransport / mSell / mCap / mTap / mIncome`, `orePayout()`.
   Every rate, cost, and payout flows through these. Add new global bonuses here.
5. **rates & costs** — `shaftRate/shaftCap/shaftUpCost`, elevator, warehouse.
6. **core sim** — `autoStep(dt)` runs the automated pipeline. Shared by the live loop
   AND the offline calculation, so keep it pure (no DOM).
7. **taps / purchases / boosts / prestige** — user actions.
8. **format / sound / floaters / toasts** — helpers.
9. **DOM build + render** — `build()` creates the station cards once; `render()` and
   `renderBoosts()` update text/bars every frame (they never recreate nodes). Modals
   (`buildResearch/updatePrestige/…`) build once on open and update in place while open.
10. **save / load / offline** — `localStorage` key `deepDelve.save.v1`. `load()` heals
    missing/renamed fields against `freshState()` so old saves survive schema changes.
11. **loop** — `requestAnimationFrame`; `dt` clamped to 0.25s per frame.

## The core loop
Shafts dig **ore** into per-shaft piles → the **elevator** hauls ore up into the
**warehouse** pending stock → the warehouse **sells** ore for **cash**. Each station is
manual (tap the Dig/Haul/Sell button) until you hire its **manager**, after which
`autoStep` runs it. A station gains a **miner** (its output doubles) each time it reaches a
level in `MILESTONES` — 10, 25, 50, 100, then every 100 up to 1000 (13 miners max, ×8192).
The `Buy ×1/×10/×100/Max` toggle (`buyMult`) levels stations and research in bulk.

Currencies: **cash** (upgrades, managers, research) and **gold bars** (earned by prestige
— "sell the mine" — and spent in the Legacy Tree).

## Conventions / gotchas
- **Keep it dependency-free and buildless.** Nothing bundled to the browser.
- Route every big number through `fmt()` (K/M/B/T/… suffixes).
- If you change the shape of `S`: update `freshState()` AND confirm `load()` still heals
  old saves — or bump `SAVE_KEY` and write a migration.
- `autoStep(dt)` must stay DOM-free (offline replay calls it thousands of times).
- All `localStorage` access is wrapped in try/catch; the game must render on empty state.
- **Single-file build:** the version published as a Claude artifact must be ONE html file
  (its sandbox CSP blocks local css/js). This repo is the split canonical source. To make
  the artifact build, inline `css/styles.css` into a `<style>` and `js/game.js` into a
  `<script>` inside `index.html`. A `build` script for this is a nice-to-have (see TODO).

## Ideas / TODO backlog
- ~~"Buy x10 / Max" toggle on upgrade buttons.~~ **Done** — `buyMult` toggle (stations + research).
- ~~Per-shaft milestone rewards.~~ **Done** — miner milestones at 10/25/50/100/…/1000 (all stations).
- ~~Early-game balance pass (pacing was untested).~~ **Done** — see below.
- Offline-earnings upgrade (raise the 8h cap and/or the rate).
- Prestige-only deep shafts; timed events.
- `build.mjs` that emits a single-file `dist/index.html` for the artifact build.
- `boss` research (manual tap power) is a near-dead stat once automated — repurpose it
  (e.g. offline rate, or a click-based boost) rather than leave it a trap node.

## Balance notes (first-30-min pass)
Tuned via an economy simulator (a bottleneck-targeting player over 30 min). Key fixes:
- Old `shaftMgrCost = 200·5^i` exploded ($625K by shaft 6) and stranded expansion — now
  `max(50, unlockCost·0.4)`, so a shaft you can afford to open you can afford to run.
- Old start had shaft/elev/warehouse rates near-tied, so single-leg upgrades moved the
  `min()` bottleneck by $0 (a dead wall). Elevator base 1.5→1.8, warehouse 1.3→1.6 so dig
  is the clear early bottleneck and every upgrade pays off.
- Milestones apply to the **whole chain** (shaft + elevator + warehouse) so transport keeps
  pace instead of becoming a money pit.
- Research (drill/winch/trade/core) made cheaper and a touch stronger so it's reachable
  mid-run; prestige gain `floor(sqrt(run/1e6))` → `floor(3·sqrt(...))` and Head Start
  cheaper + bigger so the first "sell the mine" is worth it.
