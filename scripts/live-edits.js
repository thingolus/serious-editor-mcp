// Explicitly mutates and restores a selected disposable locator. Never runs in CI.
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport, getDefaultEnvironment } from '@modelcontextprotocol/client/stdio';

const expectedName = process.argv[2];
if (!expectedName || !process.env.SERIOUS_EDITOR_ROOT || process.env.SERIOUS_EDITOR_ALLOW_MUTATION !== '1') {
  throw new Error('Set SERIOUS_EDITOR_ROOT and SERIOUS_EDITOR_ALLOW_MUTATION=1, then pass the exact selected disposable locator name as the first argument.');
}
const client = new Client({ name: 'serious-editor-live-edits', version: '0.4.0' });
const transport = new StdioClientTransport({ command: process.execPath,
  args: [fileURLToPath(new URL('../src/index.js', import.meta.url))],
  env: { ...getDefaultEnvironment(), SERIOUS_EDITOR_ROOT: process.env.SERIOUS_EDITOR_ROOT, SERIOUS_EDITOR_ALLOW_MUTATION: '1' } });
const receipts = [];
async function call(name, args = {}) {
  const result = await client.callTool({ name, arguments: args });
  assert.ok(!result.isError, JSON.stringify(result));
  return result.structuredContent;
}
try {
  await client.connect(transport);
  assert.equal((await call('editor_ping')).bridgeVersion, '0.6.0');
  const selected = await call('editor_selection');
  assert.equal(selected.name, expectedName, 'Wrong test entity selected');
  const originalName = await call('editor_read_member', { path: 'ep_strName' });
  assert.equal(originalName.value, expectedName);
  const sphere = await call('editor_read_member', { path: 'ep_bSphere' });
  assert.ok(sphere.value === 0 || sphere.value === 1);
  const preview = (path, expectedValue, newValue) => call('editor_preview_edit', { contextId: selected.contextId, path, expectedValue, newValue });
  const rename = await preview('ep_strName', expectedName, `${expectedName}_McpCheck`);
  const stale = await preview('ep_strName', expectedName, `${expectedName}_Stale`);
  receipts.push(rename.editId);
  assert.equal((await call('editor_read_member', { path: 'ep_strName' })).value, expectedName, 'Preview changed the world');
  assert.equal((await call('editor_apply_edit', { editId: rename.editId })).status, 'applied');
  assert.equal((await call('editor_read_member', { path: 'ep_strName' })).value, rename.after);
  assert.equal((await call('editor_apply_edit', { editId: rename.editId })).status, 'applied');
  const rejected = await client.callTool({ name: 'editor_apply_edit', arguments: { editId: stale.editId } });
  assert.equal(rejected.isError, true);
  assert.match(rejected.content[0].text, /changed since/);
  assert.equal((await call('editor_undo_edit', { editId: rename.editId })).status, 'undone');
  assert.equal((await call('editor_undo_edit', { editId: rename.editId })).status, 'undone');
  assert.equal((await call('editor_read_member', { path: 'ep_strName' })).value, expectedName);
  const shape = await preview('ep_bSphere', sphere.value === 1, sphere.value !== 1);
  receipts.push(shape.editId);
  await call('editor_apply_edit', { editId: shape.editId });
  assert.equal((await call('editor_read_member', { path: 'ep_bSphere' })).value, sphere.value === 1 ? 0 : 1);
  await call('editor_undo_edit', { editId: shape.editId });
  assert.equal((await call('editor_read_member', { path: 'ep_bSphere' })).value, sphere.value);
  console.log(JSON.stringify({ passed: true, entityId: selected.entityId, name: expectedName,
    previewDoesNotMutate: true, renameApplyReadUndo: true, sphereApplyReadUndo: true,
    staleApplyRejected: true, repeatedApplyUndoSafe: true, restoredOriginalValues: true,
    undoMode: 'conditional-property-restore', saved: false }, null, 2));
} finally {
  // Recovery uses the same guarded undo; it cannot overwrite a later manual change.
  try {
    for (const editId of receipts.reverse()) {
      const record = await call('editor_edit_status', { editId });
      if (record.status === 'applied') await call('editor_undo_edit', { editId });
      if (record.status === 'uncertain') console.error(`Inspect uncertain edit ${editId} manually; no automatic retry.`);
    }
  } finally { await client.close(); }
}
