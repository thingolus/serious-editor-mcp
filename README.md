# serious-editor-mcp

An experimental [Model Context Protocol](https://modelcontextprotocol.io/) server
for **Serious Editor 2017 / Serious Sam Fusion**, created by
[Thingolus](https://github.com/thingolus). Original source is licensed under MIT.

Connect an MCP client to local package inspection, editor diagnostics and a small
Lua bridge running inside the editor. This is an independent community tool.
You supply your own installed game and editor; no game assets are included.

**v0.1 is a working foundation, not full editor automation.** Live communication
and missing-property handling have been tested against Fusion's editor. Reading
an existing scene property still needs a verified property path in an open world.
World creation, entity editing, saving, undo and playtest control are planned.
See [tested compatibility](docs/COMPATIBILITY.md) and [the roadmap](docs/ROADMAP.md).

## Setup

Requirements: Windows, Serious Sam 2017 Editor installed through Steam (app
564380), Node.js 22 or newer, and pnpm 11.25.0. Development was tested with Node
24.19.0. The standalone HD editors, Serious Sam 2 and Serious Sam 4 are untested.

Clone this repository, then run in PowerShell:

```powershell
pnpm install --frozen-lockfile --ignore-scripts
$env:SERIOUS_EDITOR_ROOT = 'C:\Program Files (x86)\Steam\steamapps\common\Serious Sam Fusion 2017'
node src/index.js --doctor
node src/index.js --install-bridge
```

Use your actual installation path if it differs. The installer writes only to
`Content/EditorMcp/`. It records the installed script's hash, backs up owned older
versions and refuses to overwrite independently changed scripts.

Open Serious Editor, then choose **Script > Run script from file...** and select
`Content/EditorMcp/bridge.lua`. A console line announces bridge startup. Repeat
this after restarting the editor or updating the bridge; no automatic startup
hook is installed. Reloading the script retires the previous listener.

## Connect an MCP client

Adapt [examples/mcp.json](examples/mcp.json) to your client's configuration format:

```json
{
  "mcpServers": {
    "serious-editor": {
      "command": "node",
      "args": ["C:/path/to/serious-editor-mcp/src/index.js"],
      "env": {
        "SERIOUS_EDITOR_ROOT": "C:/Program Files (x86)/Steam/steamapps/common/Serious Sam Fusion 2017"
      }
    }
  }
}
```

Use an absolute Node executable path if your client cannot find `node`. This
repository is run from a checkout; do not assume an npm package is published.
Call `editor_status`, then `editor_ping`. Only a successful ping proves that a
live editor answered. Starting the server alone does not connect or launch the
editor. Stdio is the only transport; the server opens no network listener.

## Tools

| Tool | What it does |
| --- | --- |
| `editor_status` | Reports configuration and local installation; does not infer connectivity. |
| `editor_install_bridge` | Installs the namespaced bridge; requires `SERIOUS_EDITOR_ALLOW_INSTALL=1`. The explicit CLI installer above also works. |
| `editor_ping` | Gets the live bridge version, Lua version and available member functions. |
| `editor_has_member` | Checks an exact property path in the current editor context. |
| `editor_read_member` | Reads an existing property; complex values are descriptive strings. |
| `editor_list_packages` | Lists installed `.gro` files in `Content/SeriousSam2017/`. |
| `editor_list_entries` | Filters and paginates one package's entries without extraction. |
| `editor_read_entry` | Reads one Lua/text/JSON/config entry, limited to 256 KiB. |
| `editor_read_log` | Returns the last 32 KiB of an allowlisted editor log. |

Use property paths observed in the editor. Do not invent entity IDs or infer
scene state from an old selection. A missing property returns false; a read of
it returns an error. With no scene open, the engine can also log
"Unable to get current scene interpreter." A ping still works on the start page.

## Boundaries and recovery

The bridge accepts three fixed read-only operations. It does not evaluate client
Lua, run shell commands or change world properties. IPC still writes local request
and response files. Package contents and log output are untrusted source data;
they may contain private paths or proprietary material. Do not commit or publish
them with this tool's source.

One request can be active per installation. Concurrent requests fail explicitly.
If a client crashes, close MCP clients before manually removing the stale
`Content/EditorMcp/client.lock`. Timeouts are errors, never proof of execution.
The editor must be responsive; modal dialogs or long operations can delay replies.
Use one editor process per installation while the bridge is active.

This is a local, same-user integration, not a security boundary against other
processes that can edit the installation. Path checks reject traversal and existing
links/junctions; they do not protect against a hostile local filesystem race.

To stop, close the editor or execute
`globals.EditorMcpBridgeState.running = false` in its script console. To uninstall,
stop the editor and MCP clients, remove the client configuration, and remove only
the files owned by this bridge under `Content/EditorMcp/`. Preserve anything else
you placed there, including any backups you want to keep.

## Development

```powershell
pnpm test
pnpm run check
# Explicit integration test; requires the installed, running bridge:
pnpm run test:live
```

Offline tests use disposable fake installations and original ZIP fixtures. The
live smoke test checks ping, missing-member handling, recovery and package listing;
it does not create or modify a world. No licensed game is needed for offline tests.

The initial consumer is a separately maintained reverse-co-op mod. Reusable editor
operations belong here; campaign logic, monster control and game assets belong in
that mod. Neither project is required to contain the other's source. Contributions
should follow [CONTRIBUTING.md](CONTRIBUTING.md). See [CREDITS.md](CREDITS.md).
