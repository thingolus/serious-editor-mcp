// Explicit integration check against an already running editor. Never runs in CI.
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport, getDefaultEnvironment } from '@modelcontextprotocol/client/stdio';

if (!process.env.SERIOUS_EDITOR_ROOT) throw new Error('Set SERIOUS_EDITOR_ROOT first.');
const client = new Client({ name: 'serious-editor-live-smoke', version: '0.3.0' });
const transport = new StdioClientTransport({ command: process.execPath,
  args: [fileURLToPath(new URL('../src/index.js', import.meta.url))],
  env: { ...getDefaultEnvironment(), SERIOUS_EDITOR_ROOT: process.env.SERIOUS_EDITOR_ROOT } });
try {
  await client.connect(transport);
  const tools = await client.listTools();
  const ping = await client.callTool({ name: 'editor_ping', arguments: {} });
  assert.ok(!ping.isError, JSON.stringify(ping));
  assert.equal(ping.structuredContent.bridgeVersion, '0.3.0');
  const missing = await client.callTool({ name: 'editor_has_member', arguments: { path: '__editor_mcp_intentionally_missing__' } });
  assert.ok(!missing.isError, JSON.stringify(missing));
  assert.equal(missing.structuredContent.exists, false);
  const readMissing = await client.callTool({ name: 'editor_read_member', arguments: { path: '__editor_mcp_intentionally_missing__' } });
  assert.equal(readMissing.isError, true);
  const packages = await client.callTool({ name: 'editor_list_packages', arguments: {} });
  assert.ok(!packages.isError);
  const after = await client.callTool({ name: 'editor_ping', arguments: {} });
  assert.ok(!after.isError, JSON.stringify(after));
  console.log(JSON.stringify({ passed: true, tools: tools.tools.map(tool => tool.name),
    livePing: ping.structuredContent, missingMemberReturnsFalse: true, invalidReadReturnsError: true,
    responsiveAfterError: true, installedPackageCount: packages.structuredContent.packages.length }, null, 2));
} finally { await client.close(); }
