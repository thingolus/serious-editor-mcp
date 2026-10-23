# Local editor bridge protocol

The MCP process uses stdio. Its editor adapter exchanges bounded text files under
`Content/EditorMcp/` with an explicitly started console-script coroutine. There is
no game network connection, external port or authentication service.

## Request

`request.txt` is UTF-8 with LF separators and a final LF:

```text
SE_MCP/1
<UUID>
<operation>
<hex-encoded UTF-8 argument, possibly empty>
```

Operations are `ping`, `has_member`, `get_member`, `selection`, `preview_edit`,
`apply_edit`, `undo_edit`, and `edit_status`. A UUID correlates replies.
Arguments are data, never source code. The Node client limits decoded arguments to
1024 bytes (4096 for preview payloads) and rejects NUL. The Lua listener validates
hex and limits the request to 16384 bytes. It ignores the request already present
when the listener starts, preventing stale mutation replay after a restart.
Consecutive duplicate request IDs are ignored. Apply/undo also deduplicate by the
edit record's state, independent of the transport request ID.

The client holds an exclusive `client.lock`, writes via a same-directory temporary
file and rename, then polls the response every 100 ms for up to five seconds.
It releases its own lock in a finally block. It does not silently reclaim locks
left by crashed clients. Parallel requests are rejected rather than queued.

## Response

```text
SE_MCP/1
<same UUID>
<ok or error>
<single-line JSON object>
```

The client accepts CRLF and a leading UTF-8 BOM, ignores stale request IDs and
incomplete JSON during a write, and bounds the entire response to 64 KiB. An
editor error becomes an MCP tool error. A timeout is also an error.

Lua JSON output escapes control characters, quotes and backslashes. Nil, booleans
and finite numbers are JSON primitives. Strings are limited to 24000 Lua bytes
before escaping; a heavily escaped result can still exceed the client's bound
and be rejected. Tables, userdata and non-finite numbers become descriptive strings.
This is intentionally not a lossless engine-object serialization format.

The listener calls `Wait(Delay(0.1))` between polls. Reloading sets the previous
listener's `running` flag false through `globals.EditorMcpBridgeState`. A previous
listener may print its stop message after the new startup message. Ping verifies
which version actually responds.

## Edits in bridge 0.2

`selection` retains a document/entity snapshot under its request UUID and returns
that UUID as `contextId`. `preview_edit` receives six LF-separated fields inside
the outer hex argument: context ID, property path, old type, old value hex, new
type, new value hex. Types are `s` (string) or `b` (UTF-8 `true`/`false`). Only
`ep_strName` strings and `ep_bSphere` booleans are writable. Each property must
exist and match the expected type/value. No expression parser or Lua evaluator
is involved. New APIs must be added explicitly with verified types.

A preview's request UUID becomes its `editId`. Apply, undo and status take that
edit ID as their argument. The edit lifecycle is `preview -> applied -> undone`.
A setter/read-back failure becomes `uncertain`, which blocks subsequent writes.
Precondition failures leave the record unchanged because no write was attempted.
Duplicate apply in `applied`, or duplicate undo in `undone`, returns the receipt
without reapplying a write. Applying an already undone edit is refused.

Actual writes require the original document/entity handles, entity ID, a single
selection and the expected current value. Undo calls the setter with the retained
old value and verifies read-back. It never consumes the global native undo stack.
There is no yield between checking the preconditions, setting and verifying.
There are no multi-property transactions, auto-save or disk-persistent edit receipts.

Records retain engine proxy tables and compare their observed
`_CT_OBJECT_USERDATA_` identities. This binding behavior is specific to the tested
build. Context handles are not filesystem paths. The filename accessor is unavailable
in the tested binding; the tool reports null rather than guessing it. Restarting
the bridge drops all records; finish undo work first. The session keeps the newest
32 contexts and at most 128 edit records, then refuses new previews until reload.

The MCP process gates actual writes with `SERIOUS_EDITOR_ALLOW_MUTATION=1`.
This is a client configuration boundary, not authentication of local file writers.
On timeout, query the existing edit ID and inspect the property before retrying.
An applied receipt is historical and does not imply the current value still matches.

## Trust and future changes

Installation defaults to an explicit CLI command; the MCP install tool requires
an environment opt-in. No startup hook, stock override or general execution tool
is provided. The bridge trusts local files in a same-user installation. It is not
an isolation mechanism from other local processes or other MCP clients authorized
to access those files. One editor process per installation is supported.

Changing the operation set or wire interpretation requires protocol/version
review and tests. Future mutations need an explicit target, preview, precondition,
failure behavior and a demonstrated undo/recovery path. Do not treat successful
file delivery as proof that an editor action completed.

## Research references

- [Official Serious Sam 3 update discussion](https://steamcommunity.com/app/41070/discussions/0/864951475484734130/): historical member-access API lead; not proof of current Fusion signatures.
- [Community console-scripting guide](https://steamcommunity.com/sharedfiles/filedetails/?id=2244897713): console coroutine and text-file API research; examples across engine versions require local verification.
- [MCP TypeScript SDK v2 documentation](https://ts.sdk.modelcontextprotocol.io/v2/): server and stdio client integration.

The bridge source is original. Compatibility claims come from the local probes
recorded in [COMPATIBILITY.md](COMPATIBILITY.md), not from assuming those examples
work unchanged in this editor.
