// Explicitly changes and restores auto-run on a selected disposable Script entity.
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport, getDefaultEnvironment } from '@modelcontextprotocol/client/stdio';

const expectedName = process.argv[2];
if (!expectedName || !process.env.SERIOUS_EDITOR_ROOT || process.env.SERIOUS_EDITOR_ALLOW_MUTATION !== '1') {
  throw new Error('Set SERIOUS_EDITOR_ROOT and SERIOUS_EDITOR_ALLOW_MUTATION=1; pass the exact selected disposable Script entity name. Stop simulation first.');
}
const client = new Client({ name: 'serious-editor-live-script', version: '0.2.0' });
const transport = new StdioClientTransport({ command: process.execPath,
  args: [fileURLToPath(new URL('../src/index.js', import.meta.url))],
  env: { ...getDefaultEnvironment(), SERIOUS_EDITOR_ROOT: process.env.SERIOUS_EDITOR_ROOT, SERIOUS_EDITOR_ALLOW_MUTATION: '1' } });
let editId;
async function call(name, args = {}) {
  const result = await client.callTool({ name, arguments: args });
  assert.ok(!result.isError, JSON.stringify(result));
  return result.structuredContent;
}
try {
  await client.connect(transport);
  const selected = await call('editor_selection');
  assert.equal(selected.name, expectedName, 'Wrong test entity selected');
  const path = 'ep_satAutoRun';
  const before = (await call('editor_read_member', { path })).value;
  assert.ok(['SAT_ALWAYS', 'SAT_ONLYONHOST'].includes(before));
  const after = before === 'SAT_ALWAYS' ? 'SAT_ONLYONHOST' : 'SAT_ALWAYS';
  const preview = await call('editor_preview_edit', { contextId: selected.contextId, path, expectedValue: before, newValue: after });
  editId = preview.editId;
  assert.equal((await call('editor_read_member', { path })).value, before);
  await call('editor_apply_edit', { editId });
  assert.equal((await call('editor_read_member', { path })).value, after);
  await call('editor_undo_edit', { editId });
  assert.equal((await call('editor_read_member', { path })).value, before);
  console.log(JSON.stringify({ passed: true, entityId: selected.entityId, name: expectedName,
    path, before, temporaryValue: after, restored: true, saved: false }, null, 2));
} finally {
  try {
    if (editId) {
      const receipt = await call('editor_edit_status', { editId });
      if (receipt.status === 'applied') await call('editor_undo_edit', { editId });
      if (receipt.status === 'uncertain') console.error(`Inspect uncertain edit ${editId}; no automatic retry.`);
    }
  } finally { await client.close(); }
}
