# Hexball Tactics

A turn-based tactical football game on hexes. Plain JavaScript, no framework, no server: `node build.mjs` turns
`src/` into one self-contained page.

## Run it locally

```
npm start
```

Builds and serves the installable app at http://localhost:8080 (Node 18+, no install needed). The service worker
and "Install app" work on localhost just as they will on a real host. `PORT=3000 npm start` to change the port.

## Build

```
npm run build
```

Outputs in `dist/` (build output, not committed):

| File | What it is |
|---|---|
| `hexball-offline.html` | One file you can download and open in any browser, no connection needed |
| `pwa/` | The installable web app: `index.html`, `manifest.webmanifest`, `sw.js` (offline cache), `icons/` |
| `hexball.html` | The page published as the claude.ai artifact |
| `hexball.test.html` | Test build (hooks on `window.__hexball`, faster timing); never published |

## Play it as an app (GitHub Pages)

1. Push this repo to GitHub (branch `main`).
2. On GitHub: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. Every push to `main` runs `.github/workflows/pages.yml`, which builds and publishes `dist/pwa`.
   The site is at `https://<your-user>.github.io/<repo-name>/`.
4. On a phone, open that address and choose **Add to Home Screen** (Safari: Share → Add to Home Screen;
   Chrome: ⋮ → Install app). It opens full screen and works with no signal after the first visit.

A new push updates the app: the service worker's cache name comes from the page, so phones pick up the new version
the next time they open it online.

## Saving

The match is saved on the device at the start of every turn; the start screen shows **Continue** with the score and
turn. A finished match is cleared.

## Develop

- `npm install` (prettier, acorn) and Playwright for the tests and tools.
- `npm run dev` rebuilds on save (run `npm run serve` alongside it and reload); `npm run quick` / `npm test`; `npm run sim` / `npm run rhythm` for CPU-vs-CPU numbers.
- `node tools/icons.mjs` re-renders the app icons from the start-screen logo (needs Playwright).
- Design history and the rules as they stand: `design-notes.md`. Code guide: `ARCHITECTURE.md`.

## Fonts

Barlow, Barlow Condensed and Bitter (SIL Open Font License 1.1), latin subsets from Fontsource, embedded in the page.
Licences in `assets/fonts/`.
