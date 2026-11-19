# Hexball Tactics: notes for Claude

The game ships as one self-contained page, published as a claude.ai artifact. Code layout and dev commands are in
[ARCHITECTURE.md](ARCHITECTURE.md); the rules and the decisions behind them are in [design-notes.md](design-notes.md).

## Live artifact

**Hexball Tactics:** https://claude.ai/artifact/KibYkXqZ31B5LRBT4Zu4Ag

Always update this one URL. Never publish without `url` from a new thread: that creates a separate artifact and the
link the user plays from stops getting updates. (Older "Hexball Tactics" artifacts in the gallery are retired.)

## Publishing a change

1. Edit `src/` (never `dist/`: it is build output and not committed).
2. `npm run build` → writes `dist/hexball.html` (the artifact page) plus the test, offline and PWA builds.
3. `npm run quick` while working; `npm test` before publishing. If play changed on purpose, run
   `npm run replay -- record` first.
4. Publish with the Artifact tool:
   - In a new thread, first `action: "read"` with the URL above (the tool refuses a publish to an artifact this
     conversation hasn't read or published).
   - Then publish with `url` = the URL above and `file_path` = `dist/hexball.html`. No `icon` (it keeps "game").
   - Later publishes in the same thread can use the same `file_path` without `url`.
5. Commit the `src/` changes (and a line in design-notes.md under Recent decisions) on the session's branch.

The page needs nothing from outside: fonts are inlined as base64 by `build.mjs`, there are no network calls, and
saves live in the player's browser (`localStorage`: `hexball.save`, `hexDanger`, `hexCard`). Keep it that way: the
artifact sandbox blocks other hosts.

The artifact is private to the owner until they share it from the page's Share menu.
