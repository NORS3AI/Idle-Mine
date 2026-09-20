# Deep Delve

An idle mining clicker (Idle Miner Tycoon spinoff). Static site — vanilla JS, no build step.

## Structure
```
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

## Deploy (Cloudflare Pages)
```
npm run deploy
```
Runs `wrangler pages deploy public --project-name deep-delve`.

## Saves
Progress is stored in the browser under `localStorage["deepDelve.save.v1"]`. It saves every
5s and on tab hide, and calculates offline earnings (capped at 8h) when you return. Reset
from the in-game ⚙ Settings menu.
