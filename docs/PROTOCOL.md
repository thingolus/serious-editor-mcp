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

Operations are exactly `ping`, `has_member`, `get_member`. A UUID correlates replies.
Arguments are data, never source code. The Node client limits decoded arguments to
1024 bytes and rejects NUL. The Lua listener validates hex and limits the request
to 8192 bytes. It handles each newly observed request ID once per listener lifetime.
Restarting the listener may replay the last request; all current commands are reads.

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
