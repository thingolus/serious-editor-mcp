# Editor workflow and recovery

This guide describes v0.7.0 on Serious Editor 2017 build 3897336. See
[compatibility evidence](COMPATIBILITY.md) for what was actually exercised.

## Start once, iterate through MCP

1. Configure `SERIOUS_EDITOR_ROOT` and run `node src/index.js --install-bridge`.
2. Start the editor. Use **Script > Run script from file** once to run
   `Content/EditorMcp/bridge.lua`.
3. Call `editor_ping`; require `bridgeVersion: "0.7.0"`.
4. Use `editor_open_document`, `editor_scene`, `editor_select_entity`, property
   inspection and checked edits. Avoid repeating file-dialog navigation.
5. Enable project saves only by setting `SERIOUS_EDITOR_ALLOW_MUTATION=1` and
   `SERIOUS_EDITOR_PROJECT_ROOT=Content/YourMod` in the server environment.

After changing bridge source, run the installer again (or enable its separate
installation opt-in and call `editor_install_bridge`). Finish any required undo
work, then call:

```json
{"name":"editor_reload_bridge","arguments":{"acknowledgeTokenExpiry":true}}
```

The installed script, install receipt and current checkout source must have the
same SHA256. Reload runs only the fixed namespaced bridge file. The new listener
acknowledges readiness, so the next request can be sent immediately. All scene,
selection, edit and document tokens expire. Other MCP clients also need fresh
tokens. A server restart also loses its document map. No automatic hook is added.

The first upgrade from v0.4.x needs the editor menu because that old listener has
no reload operation. Restarting the editor always needs the menu bootstrap.

## Open, inspect, save

```json
{"name":"editor_open_document","arguments":{"path":"Content/YourMod/Levels/Test.wld"}}
```

The result contains `documentId`, `requestedPath`, `sha256`, `bytes`, and
`documentPath: null`. The path is the explicit Open argument, not an inferred
filename. The bridge retains both the concrete document returned by Open and
the active editor interface. These handles are different in this engine.

### Inspect nested entity properties without expanding panels

Select a world entity through `editor_scene` and `editor_select_entity`, then
capture `editor_selection`. Pass that `contextId` and 1–16 distinct `paths` to
`editor_read_selection_members`. Each path is limited to 192 ASCII characters;
letters, digits, underscores, slashes, brackets, dots and hyphens are accepted.
The tool checks the active document, entity handle, ID and single selection
before reading and again before returning. It performs no writes or panel changes.

Native meta paths use `/` between members and `/[0]` for the first array element.
Dots do not traverse members. These paths were verified on a configured bot manager:

```text
ep_pbphExpendableNPCs/pbph_apbpPlayerBotParams/[0]/pbp_idCharacterName
ep_pbphExpendableNPCs/pbph_apbpPlayerBotParams/[0]/pbp_pcpbpCommonBotParams/pbp_pbtPlayerBotType
```

The response has one `members` row per requested path. `exists: false` means the
path was not found. An existing path has `exists: true` and a `member` with
`valueType`, `value` and `resourcePath`. An existing holder/array may return
`valueType: "nil", value: null`; this means unavailable or null, **not** an empty
array. Request observed leaf paths instead. This tool does not enumerate members
or serialize whole resources. Resource filenames are returned only when the
native getter works.

On a stale-context error, inspect and select the intended entity again before
capturing a new context. Do not substitute an invented entity ID. Opening a
generic parameter document does not guarantee its property panel becomes the
current member-query context; these checks were verified on selected world entities.
Any native read error or oversized result fails the batch without partial data.

Run `node scripts/live-members.js <world-path> <entity-name> [nested-path ...]`
with `SERIOUS_EDITOR_ROOT` set. It compares batch/single reads, verifies a missing
path, rejects a changed selection, reselects the target, and checks the disk hash.
The test needs a second entity and leaves the requested target selected.

### Save the inspected document

After inspecting and editing, call `editor_document` with that token. Pass its
hash to `editor_save_document`:

```json
{"name":"editor_save_document","arguments":{"documentId":"<returned UUID>","expectedSha256":"<observed 64-character hash>"}}
```

The server rejects a changed disk file, a different active document, an expired
token, disabled mutation, or a file outside the configured original namespace.
It creates a unique backup with exclusive creation, rechecks the original hash,
then invokes `edtSaveDocument` with the retained **concrete** handle. It reads
the resulting file and reports hashes and `fileChanged`.

`outcome: "file-changed"` is disk evidence. It does not verify every entity or
dependent asset. `outcome: "no-file-change"` is deliberately inconclusive: the
document may already be saved, or the editor may have done nothing. There is no
dirty-state getter in the verified binding. All pending edits in that document
are saved, including edits made outside MCP.

Opening an already-open file activates its existing document and preserves its
unsaved contents. It is **not** a disk reload. For persistence testing, save,
close with the editor's File > Close command, then reopen and inspect. The MCP
does not force-close, discard changes, invoke Save All or automate save prompts.

## Resource filenames

After selecting a Script entity, `editor_read_member` with
`path: "ep_pssScriptSource"` returns its ordinary value metadata and, when
available, `resourcePath`. The bridge calls `GetFileName()` on resource userdata;
an unsupported getter leaves `resourcePath: null`. It does not follow references,
load scripts, serialize holder arrays or change resource bindings. This was
verified for the consuming fixture's original Script source.

The current property context can remain on a pinned panel after switching
documents. Opening a parameter resource alone does not guarantee that
`editor_read_member` is reading its fields. For world entities, select the target
through `editor_scene` / `editor_select_entity` before reading. Do not use a
missing member result as evidence that the newly opened resource lacks a field.

## Repeatable simulation

Configure a default test in the editor's Simulation > Configure panel once. The
verified configuration has one single-player simulation and uses the current
world. Install title discovery files before starting the editor: its startup log
must enumerate the intended `.gtitle`. A title copied after launch may require
one editor restart even when the world's title reference is correct.

Open an original project world through `editor_open_document`, then:

```json
{"name":"editor_start_simulation","arguments":{"documentId":"<open token>","withPlayer":true}}
{"name":"editor_simulation","arguments":{}}
{"name":"editor_stop_simulation","arguments":{"simulationId":"<returned token>"}}
```

Start requires `SERIOUS_EDITOR_ALLOW_MUTATION=1` and a world inside
`SERIOUS_EDITOR_PROJECT_ROOT`. It runs `Command.StartDefaultSimNonExclusive` and
retains the newly active simulation document. Native
`prj_bAutoCreatePlayerInEditor` is set to `withPlayer` until stop. Stop checks
document identity, invokes `Command.CloseDocument`, verifies the active document
changed, and restores the preference only if it still equals this tool's value.
An intervening preference change is preserved and reported. Source worlds are
neither saved nor closed. The default configuration can have its own autosave,
network and script effects; inspect it before running a test.

`status: "document-created"` proves a distinct document was returned, not that
the engine finished loading or a script passed. `running` deliberately stays
null. Check **new** log lines for the requested world and its gameplay-specific
evidence. `editor_simulation` also recovers the latest token after a timeout.
Do not automatically repeat Start. A second tracked start and bridge reload
are rejected until the simulation is stopped.

Keep the simulation tab active until Stop. If another tab is selected, Stop
refuses to close it. Select the simulation tab in the editor and retry. If the
simulation was closed outside MCP, its retained record is not proof of a live
simulation; restore any changed player preference deliberately before a manual
bridge restart. Tokens do not survive that restart.

Exclusive `Command.StartDefaultSim` suspends the calling bridge in the tested
build and is intentionally not exposed. Nonexclusive mode with native player
creation avoids that stall. Script resources can remain cached after external
edits; a successful lifecycle test does not prove the latest source executed.
Use a unique diagnostic version in world logs and explicitly refresh/reopen the
resource or restart the editor when necessary. Automatic source refresh and
multi-client configuration are not yet supported.

Run `node scripts/live-simulation.js Content/YourMod/Test.wld` with root,
mutation opt-in and project root set. It exercises three public-stdio cycles,
checks new start/stop engine log lines, duplicate rejection, preference restoration,
source-document return and unchanged source bytes. This runs the world's scripts;
use a disposable original fixture. It does not certify gameplay or multiplayer.

## Failure recovery

| Situation | Action |
| --- | --- |
| Changed disk hash | Inspect the external change. Do not replace the expected hash blindly and retry. |
| Simulation timeout | Call `editor_simulation` and inspect fresh engine logs before any retry. Stop with its token if its document is active. |
| No valid game title | Check startup title enumeration. Install the discovery file before launch, then restart once; changing the world reference alone cannot update that cached list. |
| Save timeout/error after dispatch | Treat the save as uncertain. Inspect the document and file, compare hashes, and retain the backup reported by the error. Never automatically retry the save. |
| Need to restore a backup | Close the target document and preserve any wanted pending edits. Compare the current file and backup first, then copy back deliberately. Reopen to verify. No automatic rollback is performed. |
| Reload timeout | Ping to identify the running bridge. Tokens may already be gone. Inspect state rather than replaying edits. |
| Windows sharing violation | The transport retries complete request replacement; the bridge verifies/retries only the cached response up to 50 times. It does not repeat a setter or save. Persistent response failure stops the listener. |
| Modal dialog | Resolve it in the editor. A timeout never means the operation was cancelled. |
| Stale client lock | Close MCP clients before removing only `Content/EditorMcp/client.lock`. |

Backups are local and can contain proprietary assets. Do not commit them.
Checks protect against ordinary stale state and accidental path mistakes, not a
hostile same-user process racing filesystem changes. Use one editor per install.

## Still manual or experimental

- Initial bridge startup, independent close/reopen verification and visual QA.
- New worlds, Save As, entity construction and resource assignment.
- Nested resource-holder inspection and general transforms.
- Simulation configuration, reliable start/stop state and input capture.

The native nonexclusive simulation command was investigated but failed with a
missing game-title configuration. Returning from that command did not establish
a running test. No playtest-control tool is exposed until start, state detection,
stop and failure recovery have live evidence. Gameplay belongs in the consumer.
