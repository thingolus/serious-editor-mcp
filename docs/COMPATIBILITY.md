# Compatibility evidence

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
| Offline tests | Thirteen tests pass, including actual bridge state-machine execution in Fengari with fake engine functions |

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

## Pending: Script auto-run edits

In the consuming mod's original test world, Script entity `ep_satAutoRun` was
read through the live bridge: On host is `SAT_ONLYONHOST`, Always is `SAT_ALWAYS`.
The source resource property `ep_pssScriptSource` returns userdata, not a filename.
Binding a Lua file through the UI and starting simulation executed that source.
World-script `_VERSION` returned nil; console Lua 5.1 is a separate observation.

The local branch extends preview/apply/undo to the two observed auto-run values.
Fourteen offline tests pass, including enum rejection and restoration. The new
setter has not yet passed a live test; `node scripts/live-script.js <entity-name>`
is prepared for that check with the same root/mutation environment variables as
the locator test. Stop simulation first. Do not treat this pending work as a
verified release or assume arbitrary resource binding is supported.
