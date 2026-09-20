# Deep Delve

An idle mining clicker (Idle Miner Tycoon spinoff). Static site — vanilla JS, no build step.

## ▶ Play

**[Idle Mine](https://nors3ai.github.io/Idle-Mine/)** — https://nors3ai.github.io/Idle-Mine/

> Note: GitHub Pages URLs are case-sensitive in the repo path. The owner is lower-cased
> (`nors3ai.github.io`) but the project segment keeps its capitals — `Idle-Mine`, not `idle-mine`.

## Structure
```
index.html        root redirect → public/ (lets GitHub Pages serve the clean URL)
public/
  index.html      markup
  css/styles.css  styling
  js/game.js      all game logic (one IIFE)
CLAUDE.md         architecture notes for Claude Code
wrangler.toml     Cloudflare Pages config
```

## Run locally
```
npm run dev
```
Serves `public/` at http://localhost:5173. (Or just open `public/index.html`.)

## Deploy

**GitHub Pages** — Settings → Pages → *Deploy from a branch*, branch `main`, folder `/ (root)`.
The root `index.html` redirects to `public/`, so the game is live at
https://nors3ai.github.io/Idle-Mine/.

**Cloudflare Pages**
```
npm run deploy
```
Runs `wrangler pages deploy public --project-name deep-delve`.

## Gameplay
Shafts dig **ore** → the **elevator** hauls it to the **warehouse** → the warehouse **sells** it
for **cash**. Each station is manual until you hire its **manager**, after which it runs itself.
Every station gains a new **miner** (×2 output) at milestone levels 10, 25, 50, 100, then every 100
up to 1000. Spend cash on **research**, and "sell the mine" to **prestige** for gold bars and a
permanent legacy tree. Use the **Buy ×1 / ×10 / ×100 / Max** toggle to level up in bulk.

## Saves
Progress is stored in the browser under `localStorage["deepDelve.save.v1"]`. It saves every
5s and on tab hide, and calculates offline earnings (capped at 8h) when you return. Reset
from the in-game ⚙ Settings menu.
