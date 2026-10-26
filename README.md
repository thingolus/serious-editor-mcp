# serious-editor-mcp

An experimental [Model Context Protocol](https://modelcontextprotocol.io/) server
for **Serious Editor 2017 / Serious Sam Fusion**, created by
[Thingolus](https://github.com/thingolus). Original source is licensed under MIT.

Connect an MCP client to local package inspection, editor diagnostics and a small
Lua bridge running inside the editor. This is an independent community tool.
You supply your own installed game and editor; no game assets are included.

**v0.6 adds guarded simulation start, inspection and stop.** Nonexclusive tests
can create a player while keeping the bridge responsive; stop restores the prior
player-creation preference. Three consecutive cycles pass in the installed editor.
See [the editor workflow](docs/EDITOR_WORKFLOW.md) for configuration and recovery.

You can preview, apply and
undo entity-name, locator-Sphere and Script auto-run changes on a captured selection. These flows
have passed real-editor tests. Undo restores that edit's previous property value;
it does not invoke the editor's global undo command. Existing loose worlds and
parameter resources can be opened without file dialogs. Saves use a retained
concrete document handle, check an expected disk hash and create a backup.
World creation, arbitrary property types and multiplayer configuration remain outside scope.
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
this after restarting the editor or upgrading from a pre-0.5 bridge; no automatic
startup hook is installed. Once v0.5 is running, use `editor_reload_bridge` after
installing an update. Reload retires the previous listener and expires all tokens.

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
| `editor_reload_bridge` | Verifies installed source/receipt hashes, reloads the fixed bridge path and acknowledges from the new listener. Requires mutation opt-in and token-expiry acknowledgement. |
| `editor_open_document` | Opens/activates an existing loose `.wld` or `.ep` under `Content/`; returns a session token and disk hash. |
| `editor_document` | Checks the retained document is active; returns disk hash and save eligibility. Dirty state remains unknown. |
| `editor_save_document` | Saves a retained project document after identity/hash checks and a backup. Requires mutation opt-in and `SERIOUS_EDITOR_PROJECT_ROOT`. |
| `editor_start_simulation` | Starts the default simulation nonexclusively from a retained project world; optional native player creation defaults on. Requires mutation opt-in and project root. Executes that world's scripts. |
| `editor_simulation` | Reads the latest simulation receipt and whether its document is active. Does not infer gameplay readiness. |
| `editor_stop_simulation` | Closes only the retained active simulation and conditionally restores the prior player-creation preference. |
| `editor_has_member` | Checks an exact property path in the current editor context. |
| `editor_read_member` | Reads an existing property; complex values retain descriptive strings. Resource userdata also returns `resourcePath` when its filename getter works. |
| `editor_selection` | Captures exactly one selected entity and its document identity. |
| `editor_scene` | Lists up to 200 unique entities with IDs, names, classes and positions; restores the prior selection. |
| `editor_select_entity` | Selects an entity from a recent scene snapshot after checking document and entity identity. |
| `editor_preview_edit` | Checks the target and expected old value; returns an edit token without changing the world. |
| `editor_apply_edit` | Applies the previewed change and verifies read-back; mutation opt-in required. |
| `editor_undo_edit` | Restores that edit's old value if its target and current value still match. |
| `editor_edit_status` | Reports a session edit receipt, useful after a timeout. |
| `editor_list_packages` | Lists installed `.gro` files in `Content/SeriousSam2017/`. |
| `editor_list_entries` | Filters and paginates one package's entries without extraction. |
| `editor_read_entry` | Reads one Lua/text/JSON/config entry, limited to 256 KiB. |
| `editor_search_help` | Searches names in packaged Help XML, returning bounded signatures/member descriptions with their owning class. |
| `editor_read_log` | Returns the last 32 KiB of an allowlisted editor log. |

For installed API documentation, use `editor_search_help` with package
`00_All.gro`, path `Help/Macros/GameTemplate/Project_macros.xml`, query
`SpawnExpendableNPC` and className `CPlayerBotManagerEntity`. Discover other help
paths with `editor_list_entries`. Search is a literal, case-insensitive name match;
the optional class filter is exact and does not traverse inheritance. Results
are limited to 20 records and 24 KiB, with `truncated` indicating omitted matches.
This reads installed documentation without starting the editor. A documented
signature is not proof that an API works in a particular runtime context.

Use property paths observed in the editor. Do not invent entity IDs or infer
scene state from an old selection. A missing property returns false; a read of
it returns an error. With no scene open, the engine can also log
"Unable to get current scene interpreter." A ping still works on the start page.

## Editing and undo

Outside simulation, call `editor_scene` to obtain a `sceneId` and the observed
`entityId`. Pass both to `editor_select_entity`, then capture `editor_selection`
before previewing an edit. Scene snapshots retain the most recent eight contexts
and expire when the bridge restarts. Removed/replaced entities and changed
documents are rejected. Selection changes do not require the property-mutation
opt-in. Scene reads temporarily enumerate selection; they restore it even on an
enumeration error and report restoration failures explicitly.

Set `SERIOUS_EDITOR_ALLOW_MUTATION=1` in your MCP server environment to enable
apply/undo. Preview and inspection remain available without it. Select one entity
in an original test world, then:

1. Call `editor_selection` and retain its `contextId`.
2. Read the property. Verified writable paths are `ep_strName` (string, 1–128 UTF-8
   bytes, no control characters), `ep_bSphere` (boolean, on a locator), and
   `ep_satAutoRun` (`SAT_ONLYONHOST` or `SAT_ALWAYS`, on a Script entity).
3. Call `editor_preview_edit` with `contextId`, `path`, `expectedValue`, `newValue`.
   Inspect its before/after values and retain the returned `editId`.
4. Call `editor_apply_edit` with that `editId`, then read the property to inspect it.
5. To restore the original value, call `editor_undo_edit` with the same `editId`.

For example, rename a selected locator from `RC_RouteStart` to `RC_Entry`, then undo
that rename. The preview must use the exact observed old name. Raw `editor_read_member`
returns the engine's numeric 0/1 for Sphere; edit inputs use JSON false/true.

Every actual write checks the retained document/entity handles, entity ID, single
selection and expected property value. Changing selection or editing the property
manually can make apply/undo fail. Reselecting the original target permits a retry
only while the expected value still matches. Tokens expire when the bridge restarts.
At most 32 selection contexts and 128 edit records are retained per bridge session.
Finish any required undo work before restarting it.

This is **property-level compensation**, not native undo-stack integration. During
testing the native undo menu still named an earlier entity creation after a scripted
rename. Calling global Undo would therefore be unsafe. Unrelated edits are not
consumed by this tool. Repeated apply/undo calls return the existing receipt without
writing again; the receipt is historical, not a fresh assertion about scene state.

If a setter or read-back fails after a write attempt, the record becomes `uncertain`
and further writes through it are blocked. Inspect the property and the receipt's
before/after values manually. After a transport timeout, inspect `editor_edit_status`
before retrying; if the bridge restarted, inspect the scene because receipts are gone.
There is no automatic rollback of an uncertain write.

Edits do not save files. Use the guarded document workflow below or File > Save,
then close and reopen the world to verify persistence when needed. The native document filename accessor is not
available in the tested Lua binding, so selection returns `documentPath: null`;
the tool binds to retained editor handles instead of inventing a filename.

## Documents and faster iteration

Set these additional variables in the MCP server environment for project saves:

```json
{
  "SERIOUS_EDITOR_ALLOW_MUTATION": "1",
  "SERIOUS_EDITOR_PROJECT_ROOT": "Content/YourMod"
}
```

The project root must be one original content namespace. Stock/engine namespaces
are rejected. Files must already exist on disk; archive-only resources, Save As
and new-document creation are not supported. Accepted paths are ASCII letters,
digits, spaces, `_`, `-`, `/` and `.`, with no traversal or trailing dots/spaces.
Documents are limited to 64 MiB.

1. Open `Content/YourMod/Levels/Test.wld` with `editor_open_document`.
2. Inspect the scene and make a checked edit. Keep the returned `documentId`.
3. Call `editor_document` to review the active identity, disk hash and eligibility.
4. Call `editor_save_document` with that token and the observed `expectedSha256`.
5. Review `fileChanged`, the new hash and the backup path. A no-change result
   does **not** claim the save succeeded. Close the saved document in the editor
   and reopen it through MCP when independent persistence proof is needed.

Saving writes **all pending changes in that document**, including manual edits.
The expected hash protects the on-disk file; it does not enumerate unsaved changes.
The backup covers that file, not every dependent resource. Backups stay under
`Content/EditorMcp/backups/` until you explicitly clean them up.

For Script bindings, select the entity and read `ep_pssScriptSource`;
`resourcePath` identifies the bound Lua file when supported. This is read-only:
resource reassignment and nested holder/array serialization are not implemented.

See [the editor workflow and recovery guide](docs/EDITOR_WORKFLOW.md) for examples,
timeouts, backups, update/reload steps and the exact UI operations still required.

## Boundaries and recovery

The bridge accepts a fixed operation allowlist. It does not evaluate client
Lua or run shell commands. IPC writes local request
and response files. Package contents and log output are untrusted source data;
they may contain private paths or proprietary material. Do not commit or publish
them with this tool's source.

One request can be active per installation. Concurrent requests fail explicitly.
If a client crashes, close MCP clients before manually removing the stale
`Content/EditorMcp/client.lock`. Timeouts are errors, never proof of execution.
The editor must be responsive; modal dialogs or long operations can delay replies.
Brief Windows sharing violations retry complete request writes and cached
responses. Response retries never execute the operation again. If delivery fails
50 times, the listener stops; inspect the scene/disk before restarting it.
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
# Explicit mutation test on the selected disposable locator; restores both values:
$env:SERIOUS_EDITOR_ALLOW_MUTATION = '1'
pnpm run test:live-edits RC_RouteStart
# Select the disposable Script entity, then test and restore its auto-run setting:
node scripts/live-script.js RC_Smoke
# Disposable saved world only; restores the locator name and saves both versions:
$env:SERIOUS_EDITOR_PROJECT_ROOT = 'Content/YourMod'
node scripts/live-documents.js Content/YourMod/Levels/Test.wld 1 LocatorName
```

Offline tests use disposable fake installations, original ZIP fixtures and the
actual Lua bridge running in Fengari with a fake engine. Fengari implements Lua 5.3;
it does not replace validation against the editor's Lua 5.1 environment. The
live smoke test checks ping, missing-member handling, recovery and package listing;
it does not create or modify a world. No licensed game is needed for offline tests.
The separate live edit test checks preview, apply, read-back, stale rejection and
undo for names and Sphere, including repeated requests.

The initial consumer is a separately maintained reverse-co-op mod. Reusable editor
operations belong here; campaign logic, monster control and game assets belong in
that mod. Neither project is required to contain the other's source. Contributions
should follow [CONTRIBUTING.md](CONTRIBUTING.md). See [CREDITS.md](CREDITS.md).
