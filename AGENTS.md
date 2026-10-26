# Working on serious-editor-mcp

- This is a standalone MIT tool credited to Thingolus. Keep mod/gameplay code in
  its separate repository and never copy game assets into this one.
- User preference: develop this MCP hand in hand with the reverse-co-op mod.
  Exercise reusable editor operations on the mod's original fixtures, and update
  evidence/plans in both repositories whenever a shared milestone advances.
- Prefer extending bounded, reusable MCP operations over repeating editor UI
  navigation. Use UI for initial bootstrap, visual verification and operations
  whose API has not yet been proven. Never disguise a command return as success.
- User preference: push verified MCP additions to this repository's GitHub remote
  and keep README, workflow, compatibility evidence and recovery instructions
  current in the same change. Keep experimental probes and raw logs local.
- Read README.md and docs/COMPATIBILITY.md before changing engine integration.
- Verify engine behavior in the installed editor; record evidence and limitations.
  Console Lua and world scripts are different contexts.
- Preserve fixed operation dispatch. Client data is never Lua source or shell code.
- Keep installation inside Content/EditorMcp and preserve independently changed files.
- Do not add automatic startup hooks or stock script overrides.
- Keep stdout exclusively MCP protocol output in normal server mode.
- Test affected behavior; bridge changes also need an explicit live editor test.
  Do not claim synthetic tests prove scene editing or multiplayer behavior.
- Follow docs/ROADMAP.md for mutations, context checks and undo/recovery.
- No credentials, raw game logs or personal paths in committed files.
