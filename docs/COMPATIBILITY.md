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
| Offline tests | Eight tests pass: wire format, install preservation/backups, concurrency/timeouts, path confinement, two stdio modes and two archive tests |

The live test was run from the editor start page with no world open. The engine
reports a scene-interpreter diagnostic for scene property queries in that state.
The bridge converts the observed missing-member result to false and stays responsive.
**No successful read of an existing scene member has been demonstrated yet.**

These findings apply to editor console scripts. They do not establish world-script
runtime behavior, networking, multiplayer authority or gameplay feasibility.
No existing world or stock script was changed. Test output is summarized here;
raw game logs and screenshots are not distributed.

The local installation includes TFE, TSE and BFE resources after installing the
editor. TFE-only compatibility, other editor builds, Linux/Wine and other Serious
Sam editors remain untested. Node 22 is the declared minimum; local verification
used Node 24.19.0.
