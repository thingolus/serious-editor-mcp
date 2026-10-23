# Contributing

Use Node.js 22+ and pnpm 11.25.0. Install from the lockfile with scripts disabled,
then run `pnpm test` and `pnpm run check`. Tests use original synthetic fixtures.
For bridge changes, run the explicit live smoke test in the target editor too.
Report editor app/build, Node version and whether a world was open.

Keep changes small and explain the observed editor behavior they address. Separate
offline checks from live editor and multiplayer evidence. Do not mark a capability
supported merely because a function name exists in another game version.

Do not submit game packages, extracted proprietary scripts, levels, captures with
private data, credentials or personal installation paths. Use original fixtures
and sanitized evidence. Dependencies retain their licenses; update CREDITS.md when
adding one. Contributions to this project's original source are under MIT.

New mutation tools need the preview, precondition and recovery requirements in
[the roadmap](docs/ROADMAP.md). Never add arbitrary client-provided Lua execution
as a shortcut for discovering the editor API.
