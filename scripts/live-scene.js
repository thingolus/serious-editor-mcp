// Explicit selection test in an open disposable world, outside simulation.
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport, getDefaultEnvironment } from '@modelcontextprotocol/client/stdio';

const expectedName = process.argv[2];
if (!expectedName || !process.env.SERIOUS_EDITOR_ROOT) throw new Error('Set SERIOUS_EDITOR_ROOT; pass the name of an entity in the disposable world.');
const client = new Client({ name: 'serious-editor-live-scene', version: '0.4.0' });
const transport = new StdioClientTransport({ command: process.execPath,
  args: [fileURLToPath(new URL('../src/index.js', import.meta.url))],
  env: { ...getDefaultEnvironment(), SERIOUS_EDITOR_ROOT: process.env.SERIOUS_EDITOR_ROOT } });
async function call(name, args = {}) {
  const result = await client.callTool({ name, arguments: args });
  assert.ok(!result.isError, JSON.stringify(result));
  return result.structuredContent;
}
try {
  await client.connect(transport);
  const scene = await call('editor_scene');
  assert.equal(scene.selectionRestored, true);
  assert.equal(new Set(scene.entities.map(e => e.entityId)).size, scene.entities.length);
  const matches = scene.entities.filter(e => e.name === expectedName);
  assert.equal(matches.length, 1, 'Expected exactly one named fixture entity');
  const entity = matches[0];
  for (const axis of ['x', 'y', 'z']) assert.ok(Number.isFinite(entity.position[axis]));
  await call('editor_select_entity', { sceneId: scene.sceneId, entityId: entity.entityId });
  assert.equal((await call('editor_selection')).entityId, entity.entityId);
  const second = await call('editor_scene');
  assert.equal(second.selectionRestored, true);
  assert.equal((await call('editor_selection')).entityId, entity.entityId);
  const absentId = 4294967295;
  assert.ok(!scene.entities.some(e => e.entityId === absentId));
  const rejected = await client.callTool({ name: 'editor_select_entity', arguments: { sceneId: scene.sceneId, entityId: absentId } });
  assert.equal(rejected.isError, true);
  assert.equal((await call('editor_selection')).entityId, entity.entityId);
  console.log(JSON.stringify({ passed: true, count: scene.entities.length, selected: entity,
    selectionPreservedDuringRead: true, unknownIdRejected: true, saved: false }, null, 2));
} finally { await client.close(); }
