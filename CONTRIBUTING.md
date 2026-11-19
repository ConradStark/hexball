# Contributing to Hexball Tactics

Thanks for taking a look. Bug reports, balance feedback and pull requests are all welcome.

## Reporting a bug or idea

Open an issue with what you did, what you expected and what happened. For anything that happens mid-match, open
**Technical log** (below the match feed) and press **Copy state**, and paste the text into the issue: it lets anyone load the exact position.

## Working on the code

Plain JavaScript, no framework and no bundler: the modules in `src/` are concatenated in a fixed order by
`build.mjs` into one self-contained page. Read [ARCHITECTURE.md](ARCHITECTURE.md) before changing game logic; the
rules as they stand and the reasoning behind them are in [design-notes.md](design-notes.md).

```
npm install                 # prettier, acorn, Playwright
npx playwright install chromium   # the browser the test suites drive
npm start                   # build and play at http://localhost:8080
npm run dev                 # rebuild on every save (run `npm run serve` alongside it)
npm run quick               # ~15 s: unit tests, behaviour lock, game-screen UI
npm test                    # everything, before opening a pull request
npm run format              # prettier
```

## Pull requests

- Keep each pull request to one change, and say in the description what it changes for the player.
- Run `npm test` and `npm run format` first.
- `npm run replay` locks the CPU's behaviour with fixed dice. If your change is meant to alter how matches play out,
  re-record the baseline (`node test/replay.mjs record`) and say so in the pull request.
- Don't commit `dist/`: it's build output, and GitHub Pages builds it from `main`.

## License

By contributing you agree that your contribution is licensed under the [MIT License](LICENSE), like the rest of the
project.
