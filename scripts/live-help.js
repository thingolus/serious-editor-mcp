// Read-only check against installed engine documentation; no editor required.
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport, getDefaultEnvironment } from '@modelcontextprotocol/client/stdio';

if (!process.env.SERIOUS_EDITOR_ROOT) throw new Error('Set SERIOUS_EDITOR_ROOT first.');
const client = new Client({ name: 'serious-editor-help-check', version: '0.4.1' });
const transport = new StdioClientTransport({ command: process.execPath,
  args: [fileURLToPath(new URL('../src/index.js', import.meta.url))],
  env: { ...getDefaultEnvironment(), SERIOUS_EDITOR_ROOT: process.env.SERIOUS_EDITOR_ROOT } });
try {
  await client.connect(transport);
  const observations = [];
  for (const [query, className, expectedName] of [
    ['Bot type', 'CCommonPlayerBotParams', 'pbp_pbtPlayerBotType'],
    ['SpawnExpendableNPC', 'CPlayerBotManagerEntity', 'SpawnExpendableNPC'],
    ['GetCommandValue', 'CPlayerActorPuppetEntity', 'GetCommandValue']
  ]) {
    const result = await client.callTool({ name: 'editor_search_help', arguments: {
      package: '00_All.gro', path: 'Help/Macros/GameTemplate/Project_macros.xml', query, className
    } });
    assert.ok(!result.isError, JSON.stringify(result));
    assert.ok(result.structuredContent.results.some(item => item.name === expectedName));
    observations.push(...result.structuredContent.results);
  }
  console.log(JSON.stringify({ passed: true, documentedOnly: true, observations }, null, 2));
} finally { await client.close(); }

