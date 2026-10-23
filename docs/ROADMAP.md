# Implementation roadmap

Develop this tool alongside the separate reverse-co-op mod. Each editor capability
should be reusable beyond that mod and justified by an actual authoring task.
Keep proprietary assets and gameplay logic out of this repository.

## 0. Local bridge foundation — complete

- Stdio MCP server with validated inputs and explicit tool errors.
- Opt-in namespaced bridge installation, ownership checks and backups.
- Live ping and property-query plumbing with timeout/concurrency handling.
- Read-only package inspection and bounded diagnostic log access.
- Offline tests and a repeatable live smoke script.

This proves connectivity, not full property access or world automation.

## 1. Read a real editor scene — initial slice verified

Verified: saved/reopened original locator, string and numeric member reads, single
selection identity and no-selection rejection. Filename discovery and positive
engine-reference serialization remain open. See COMPATIBILITY.md for exact scope.

1. Create an original disposable world using the editor UI and save it under the
   consuming mod's namespace. Record its editor/build version.
2. Discover exact selection/property paths through editor-supported inspection.
   Record how a user or tool obtains each path; do not infer undocumented IDs.
3. Demonstrate one successful read for a string, number and engine reference where
   available. Check unselected state, changing selection and closed documents.
4. Add context metadata only after its API is verified. Report ambiguous/changed
   context explicitly. Separate an unavailable scene from a missing property.

**Pass:** repeatable reads of known values from a reopened test world, with documented
paths and errors. Add original fixtures and live checks for observed edge cases.

## 2. One reversible edit — initial slice verified

Verified: name and Sphere preview/apply/read-back/conditional-undo through MCP,
stale-value rejection, mutation opt-in and saved fixture reopen. Native undo-stack
integration is not implemented: the observed setter did not add an undo entry.
The tool restores its own previous value after checking the target and current
value. Saving is manual; the scripted save attempt did not update the file.

1. Verify the editor's setter and undo/transaction APIs in the disposable world.
2. Add a narrow property-edit operation with an explicit target and expected old
   value, input limits, preview and an opt-in mutation capability.
3. Demonstrate edit, read-back and undo. Test selection changes, stale values,
   invalid types and failure midway through an operation.
4. Verify explicit save-as into a chosen project namespace before adding saving.
   Never overwrite a stock world as a side effect of an editing tool.

**Pass:** the intended property changes once, undo restores it, and reopening a
separately saved original test world preserves the intended result.

## 3. Author the mod's feasibility world

This is the next shared mod/MCP milestone. Extend the original locator fixture
with a verified script binding and host/client smoke probe. Add reusable authoring
operations here as those mod tasks need them; retain live checks for each one.

- Verify entity creation/deletion and resource-reference inspection.
- Add small reusable operations for route nodes, script bindings and transforms.
- Use those operations to assist the mod's host/client smoke world, then its
  monster-control/AI-Sam test route. Gameplay remains in the mod repository.
- Verify play/start/stop and diagnostics before exposing playtest tools.

**Pass:** a repeatable original test world can be authored and inspected; the mod
separately demonstrates its own engine and two-machine acceptance criteria.

## 4. Reliability and wider use

- Context identity, queued requests, cancellation and safe crash recovery.
- Capability negotiation and version mismatch reporting.
- Multiple documents/editor instances only after an explicit routing design.
- Windows Node 22/24 CI for offline tests; licensed-editor tests remain opt-in.
- Additional builds/editors only with their own evidence matrix.
- Release packaging and optional npm publication after install/update/remove tests.

## Tools that help

Required now: installed Fusion editor, Git, Node and pnpm. The MCP SDK handles
transport and validation; the bridge uses the editor's console Lua runtime.
An MCP client is useful for interactive work; the SDK smoke client gives a
repeatable integration check without depending on one assistant application.

Lua language tooling helps with syntax, but its standard library assumptions must
match the restricted console. OBS is useful for undo/playtest evidence. Archive
inspection is built in; 7-Zip remains useful for manual comparisons. A second
machine and human tester are needed for the mod's multiplayer proof, not for MCP
unit tests. Native plugins, process injection and a full UI-automation framework
are not requirements for the current bridge.
