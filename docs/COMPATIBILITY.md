# Compatibility evidence

## v0.7.0: selection-bound nested inspection (2026-10-26)

Thirty offline tests, Lua 5.1 syntax checking and the 25-tool public stdio smoke
test pass on the same installation as v0.6. `scripts/live-members.js` passed on
a disposable copy of the consumer's original Stage 1 world. It read the manager
name and both nested character-ID/bot-type paths through the public MCP tool,
matched individual reads, reported a missing path, rejected a different selected
entity, succeeded after reselecting the target and left the file hash unchanged.

The actual native paths use `/` and `/[0]`; the earlier dotted-path experiment
was invalid. This establishes nested leaf reads, not whole-holder serialization
or resource assignment. Fake-engine tests also reject invalid/duplicate/oversized
path sets and context changes during a read, with no writes or partial results.

Follow-up regression checks found old v0.6 version assertions in the document,
edit and simulation scripts. Those three scripts now obtain the expected version
from package.json. All three passed against v0.7: two guarded saves with name
restoration and stale-hash rejection, locator name/Sphere apply/undo, and three
nonexclusive simulation cycles with unchanged source file and restored preference.

The consumer's `dofile`-loaded gameplay probe picked up edits on subsequent
simulations without restarting the editor. Its directly bound entry resource had
previously stayed cached. No general resource/script-refresh operation is exposed.

Further consumer tests now spawn its bot in a fresh dedicated process using an
alternate saved manager-list configuration. Damage, navigation and multiplayer
gameplay remain open; this is not a passing mod milestone. Experimental resource
assignment/reinitialization commands are not included in this release.

## v0.6.0: nonexclusive simulation lifecycle (2026-10-26)

Same Windows/Fusion/editor builds as v0.5. Twenty-eight offline tests and the
24-tool public stdio smoke test pass. `scripts/live-simulation.js` passed three
consecutive cycles on the consumer's original Stage 1 world:

- The default nonexclusive native command creates a distinct simulation document.
- New log lines show that exact world starting and stopping on every cycle.
- `prj_bAutoCreatePlayerInEditor` is accessible directly in console Lua and makes
  a player in nonexclusive mode. The earlier manual probe ran world scripts and
  produced the expected NPC-spawn diagnostic after a one-second delay.
- Stop closes the retained active simulation and returns to the source world.
  Repeated stop returns the receipt. Duplicate start is rejected.
- The prior player-creation preference is restored, the bridge remains responsive,
  and the source world is byte-for-byte unchanged by the three-cycle test.

Fake-engine tests separately cover failed start, ineffective close, changed
active document, unknown tokens, reload rejection and preservation of an
intervening preference change. They do not prove network behavior.

The v0.5 title failure was caused by the editor starting **before** the loose
title-discovery file was installed. Its startup title list omitted that title.
After restart the same world reference loaded successfully. Exclusive start
created a player but suspended the calling bridge; it is not exposed. Only the
default single-player configuration was tested. Multi-simulation, network setup,
automatic script refresh and engine running-state introspection remain unverified.
The API reports document/receipt evidence and `running: null`, not gameplay success.

The consumer's Sam spawn still fails despite its saved browsed-NPC entry and a
delayed request. Source edits were cached until editor restart. These remain
consumer investigation findings, not passing mod features.

## v0.5.0: document workflow and transport recovery (2026-10-26)

Windows, Node 24.19.0, Fusion 3897313, Editor 3897336. The following were
verified on original consumer fixtures, with no stock files overwritten:

| Check | Result |
| --- | --- |
| Open/activate | `edtOpenDocument` opens loose `.wld` and `.ep` files without file-dialog navigation. The return is a concrete document proxy. |
| Two document interfaces | `guiGetActiveDocument` exposes an `IWorldDocument`; Open returns `CWorldDocument`. Their retained userdata differs. |
| Native save | `edtSaveDocument` with the concrete Open handle saves the world. The earlier active-interface attempt was ineffective. |
| Public stdio document flow | Open, inspect, rename locator, save with backup, stale hash rejection, checked name restoration and second save passed. |
| Independent persistence | Closed the saved Stage 0 fixture through File > Close; MCP reopened it from disk and scene inventory preserved `RC_RouteStart`. No unsaved-change prompt appeared. |
| Resource filename | Script `ep_pssScriptSource` userdata supports `GetFileName`; resolved the consumer's bound Stage 1 `Entry.lua`. Holder arrays remain unsupported. |
| Bridge reload | Installed-source hash verification, fixed-path reload, acknowledgement from the new listener, immediate ping and expired document token rejection passed. |
| Windows IPC | Live testing exposed `strSaveText` logging error 32 without throwing, losing a response. The bridge now verifies read-back and retries the cached response; fake-engine tests prove no repeated mutation. The final live document flow passed with this change. |
| Offline coverage | 24 tests: actual Lua bridge, namespace/hash/backup checks, uncertain and unchanged saves, reload gating, response retries, stdio opt-in and existing package/help/edit coverage. |
| Live smoke | 21 tools discovered; Lua 5.1 ping, missing-member/error recovery and 12 installed package names passed. |

No dirty-state or native filename accessor has been established. `requestedPath`
comes from the explicit Open request; the tool does not pretend it queried the
editor's filename. Backups cover the single target file, not dependent resources.
Resource `.ep` opening was tested; positive save/reopen mutation evidence is for
the original `.wld` fixture. Other resource-specific save side effects are untested.
Opening CommonSam.ep left a separate property panel context active: reading its
documented bot-type field returned a missing-member error. Open/activate is not
proof that generic member queries now address that resource's properties.

`Command.StartDefaultSimNonExclusive` reached the engine's simulation path but
reported no valid game title and initialization failure. Configuration setters
attempted during investigation did not fix that state. This is a known missing
capability, **not** a passing playtest API; no simulation tool is published.
The following sections retain historical evidence and limitations of older versions.

## v0.4.1: installed help search (2026-10-24)

Seventeen offline tests pass, including stdio help search in legacy/auto modes,
class ownership, malformed C++ template text, output limits and denied paths.
`SERIOUS_EDITOR_ROOT` plus `node scripts/live-help.js` verified the installed
`00_All.gro` documentation for `CCommonPlayerBotParams.pbp_pbtPlayerBotType`,
`CPlayerBotManagerEntity.SpawnExpendableNPC` and
`CPlayerActorPuppetEntity.GetCommandValue`. This is a documentation check, not a
live invocation of those gameplay APIs. Bridge code remains v0.4.0.

The consuming fixture also exposed a real guarded-edit failure: the bot manager
kept its automatic name `BotManager` after an attempted rename. Read-back caught
the mismatch and reported an uncertain edit rather than success; a fresh read
confirmed the original name. Name mutation support must be verified per entity
class. Locator and Script evidence below does not imply every class accepts it.

Observed on 2026-10-23, Windows, Node.js 24.19.0, pnpm 11.25.0:

| Component | Observed result |
| --- | --- |
| Fusion app 564310 | Installed build 3897313 |
| Editor app 564380 | Installed build 3897336; editor starts |
| Editor console interpreter | `_VERSION` reports `Lua 5.1` |
| `strSaveText(path, text)` | Writes an original probe file under `Content/EditorMcp/` |
| `strLoadText_unsigned`, `Wait`, `Delay` | Available and exercised by the live polling bridge |
| Shared console state | Must use `globals`; bare global creation is rejected |
| Lua libraries | `math` is absent in the observed console environment; avoid assuming standard libraries are loaded |
| `edtGetMemberValue`, `edtHasMemberValue`, `edtSetMemberValue` | Functions are present; presence does not establish valid paths or safe mutation |
| `edtHasMemberValue` | Missing path returns numeric zero; bridge normalizes zero to JSON false |
| MCP stdio | SDK client negotiation tested in legacy and auto modes |
| Live smoke | Ping, missing member, rejected missing read, ping after error and installed package listing pass |
| Offline tests | Fourteen tests pass, including actual bridge state-machine execution in Fengari with fake engine functions |

The live test was run from the editor start page with no world open. The engine
reports a scene-interpreter diagnostic for scene property queries in that state.
The bridge converts the observed missing-member result to false and stays responsive.
That initial smoke test is separate from the scene-editing evidence below.

## v0.2: scene reads, editing and undo

An original world was created using the editor UI, with one Locator entity (ID 1)
named `RC_RouteStart`, and saved under the consuming mod's namespace. It is kept
in the separate mod repository; no world or game asset is distributed here.

| Check | Result and scope |
| --- | --- |
| Positive member reads | `ep_strName` returns the locator name; `ep_bSphere` returns numeric 0/1; `ep_colColor` returns a number (read-only support) |
| Selection identity | `edtCountSelectedEntityProperties()`, `edtGetSelectedEntityProperty(0)`, `GetName()`, `GetEntityID()` and retained proxy userdata exercised |
| Document identity | `guiGetActiveDocument()` returns a proxy; its userdata identity can be retained/compared |
| Document filename | `GetDocumentFileName` and `GetDocument` methods unavailable on this proxy; do not expose a guessed filename |
| Name edit | Full MCP preview/apply/read-back/undo/read-back passed |
| Sphere edit | Full MCP false-to-true/apply/read-back/undo/read-back passed |
| Stale old value | Second conflicting preview refused after the first edit applied |
| Repeated calls | Repeated apply and repeated undo returned receipts and preserved the expected value |
| Selection change | Applying a pending preview after clearing the selection was rejected live |
| Save/reopen | File > Save wrote the original fixture; full editor restart and reopen preserved `RC_RouteStart` and Sphere=0 |
| Restart recovery | Old edit token rejected after restarting; the queued request was not replayed |
| Native undo | After `edtSetMemberValue`, the menu still offered Undo Create entity. Native global undo was deliberately not invoked |
| Save API | `edtSaveDocument(guiGetActiveDocument())` returned without an error but did not update the file; UI File > Save did. No MCP save tool is exposed |

Undo is implemented as a checked restoration of the previous property value, not
native undo-stack integration. Changed document/entity handles, multi-selection,
partial setter failures and unknown tokens are also covered by fake-engine tests.
Those particular failure cases are not all demonstrated against the real editor.
Fengari uses Lua 5.3; the live runs above used the editor's Lua 5.1.

These findings apply to editor console scripts. They do not establish world-script
runtime behavior, networking, multiplayer authority or gameplay feasibility.
Only the original disposable fixture was edited; no stock script/world was changed.
Test output is summarized here;
raw game logs and screenshots are not distributed.

The local installation includes TFE, TSE and BFE resources after installing the
editor. TFE-only compatibility, other editor builds, Linux/Wine and other Serious
Sam editors remain untested. Node 22 is the declared minimum; local verification
used Node 24.19.0.

## v0.3: Script auto-run edits

In the consuming mod's original test world, Script entity `ep_satAutoRun` was
read through the live bridge: On host is `SAT_ONLYONHOST`, Always is `SAT_ALWAYS`.
The source resource property `ep_pssScriptSource` returns userdata, not a filename.
Binding a Lua file through the UI and starting simulation executed that source.
World-script `_VERSION` returned nil; console Lua 5.1 is a separate observation.

Preview/apply/read-back/undo/read-back passed in the live editor on the consuming
mod's original Script entity (ID 2): `SAT_ONLYONHOST` to `SAT_ALWAYS` and back.
The fixture was then deliberately set to Always, bound through the UI and saved.
Fourteen offline tests cover this addition, including enum rejection/restoration.
Repeat with `node scripts/live-script.js <entity-name>` and the same root/mutation
environment variables as the locator test, outside simulation. This does not
establish arbitrary resource binding, entity creation or playtest control.

## Shared fixture follow-through

The consuming mod's fixture was saved/reopened with `RC_Smoke` set to Always,
then moved to `Content/ReverseCoop/Levels/Stage0/EditorMcpTest.wld`. Its isolated
editor-authored title and seven-file package now load in Unrestricted after a
full restart with no loose mod overrides. The world probe logs `role=host`.
This is consumer runtime evidence, not a claim that the MCP runs inside the game.

World-script logging differs from the editor console: `print` appeared in the
editor log but not the runtime log. `conLogF(message .. "\n")` was verified in
the runtime; it needs an explicit newline. World `_VERSION` remains nil. The
consumer's own title bootstrap initializes `worldGlobals.worldInfo` from injected
`worldInfo`; nested `dofile` did not inherit that injection. These observations
must not be generalized into new console bridge capabilities without testing.

The fixture remains an empty logging world. Remote human client acceptance and
TFE-only installation compatibility are still pending in the consuming project.

### Separate local server/client verification

Later on 2026-10-23, the same packaged fixture ran in two distinct processes on
one Windows PC: Dedicated Server app 564390/build 3897293 (Unrestricted) and
Fusion app 564310/build 3897313 (Unrestricted). The server logged `role=host`;
the client connected through `127.0.0.1:27045`, loaded the fixture and logged
`role=client`. Both reported world `_VERSION=nil`. The client then joined the
simulation and the server recorded the player. The live-verified Script Always
setting therefore survives saving/packaging and executes in the client context.

This extends shared-fixture evidence, not the MCP's tool surface. No runtime
process control or runtime-log tool is exposed. The consuming mod now accepts
this local connection for its setup milestone and retains two-PC human gameplay
as its next gate. Steam networking participated; offline-only transport, internet
conditions and gameplay replication have not been established. The empty world
still needs geometry/spawn/chapter before gameplay tests. An early server mode
normalization diagnostic did not prevent joining, but remains unexplained.

## v0.4: scene inventory and verified selection

Observed on 2026-10-24 on the same engine/editor builds. The consumer's original
Stage 1 world has nine entities: world info, locator, script, chapter, floor,
spawn, two lights and an experimental Gnaar. `editor_scene` returns unique IDs,
names, runtime class names and placement coordinates, restoring the previous
selection. `edtSelectAllEntityProperties` can append duplicates, so enumeration
clears selection first and de-duplicates by ID.

The real stdio MCP client passed inventory, selecting the locator and Script,
selection preservation during a subsequent read, and rejection of an unknown ID.
The existing locator name/Sphere and Script auto-run edit/undo tests also passed
on the reopened world. Earlier in this session, selecting a deleted test entity
from its previous snapshot was rejected by the live bridge. Fifteen offline
tests pass, including changed-document and removed-entity rejection with no
property writes. No simulation control, creation or save operation is exposed.

Repeat with `node scripts/live-scene.js <entity-name>` and SERIOUS_EDITOR_ROOT
set. This intentionally changes selection, leaves that target selected, and does
not save the document. Run outside simulation in a disposable world. Eight scene
snapshots are retained; a bridge restart discards them.

Consumer experiments confirmed that console and world Lua differ: world `pcall`
is absent, and several model setters are unavailable on runtime player puppets.
An unconfigured player-bot constructor crashed the editor. Those experiments do
not establish a reusable creation API or gameplay feasibility. The consuming
mod's Stage 1 remains incomplete; MCP scene/edit tests do not pass that gate.
