import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { fixture } from './support.js';
import { installBridge, requestEditor, encodeRequest, decodeResponse } from '../src/bridge.js';
import { confinedPath, exists, sha256 } from '../src/files.js';

test('wire encoding keeps input as data and ignores unrelated replies', () => {
  const id = randomUUID();
  const payload = 'name\nprint("not executed")';
  const command = encodeRequest(id, 'get_member', payload);
  assert.equal(Buffer.from(command.split('\n')[3], 'hex').toString(), payload);
  assert.equal(decodeResponse(`SE_MCP/1\n${randomUUID()}\nok\n{}\n`, id), null);
  assert.equal(decodeResponse('partial', id), null);
  assert.deepEqual(decodeResponse(`\uFEFFSE_MCP/1\r\n${id}\r\nok\r\n{"value":"hello"}\r\n`, id), { value: 'hello' });
  assert.throws(() => decodeResponse(`SE_MCP/1\n${id}\nerror\n{"error":"no context"}\n`, id), /no context/);
  assert.throws(() => encodeRequest(id, 'execute', 'anything'), /Invalid bridge command/);
  assert.throws(() => encodeRequest(id, 'get_member', 'x'.repeat(1025)), /too long/);
});

test('installation preserves changed bridge files and backs up owned versions', async t => {
  const root = await fixture(t);
  await installBridge(root);
  const bridge = path.join(root, 'Content/EditorMcp/bridge.lua');
  const receipt = path.join(root, 'Content/EditorMcp/install.json');
  const original = await fs.readFile(bridge);
  await installBridge(root);
  assert.deepEqual(await fs.readFile(bridge), original);
  await fs.writeFile(bridge, '-- independently changed');
  await assert.rejects(installBridge(root), /changed outside/);
  assert.equal(await fs.readFile(bridge, 'utf8'), '-- independently changed');
  const previousHash = sha256(await fs.readFile(bridge));
  await fs.writeFile(receipt, JSON.stringify({ sha256: previousHash }));
  await installBridge(root);
  assert.deepEqual(await fs.readFile(bridge), original);
  assert.equal(await fs.readFile(path.join(root, `Content/EditorMcp/bridge-${previousHash}.lua.bak`), 'utf8'), '-- independently changed');
});

test('request/reply round trip rejects concurrency, ignores stale data and releases its lock', async t => {
  const root = await fixture(t);
  await installBridge(root);
  const directory = path.join(root, 'Content/EditorMcp');
  await fs.writeFile(path.join(directory, 'response.txt'), `SE_MCP/1\n${randomUUID()}\nok\n{"stale":true}\n`);
  const pending = requestEditor(root, 'ping', '', 2000);
  let command = '';
  for (let attempt = 0; attempt < 100; attempt++) {
    command = await fs.readFile(path.join(directory, 'request.txt'), 'utf8');
    if (command.startsWith('SE_MCP/1')) break;
    await delay(10);
  }
  assert.match(command, /^SE_MCP\/1/);
  await assert.rejects(requestEditor(root, 'ping', '', 100), /Another bridge request/);
  const id = command.split('\n')[1];
  await fs.writeFile(path.join(directory, 'response.txt'), `SE_MCP/1\n${id}\nok\n{"bridgeVersion":"fixture"}\n`);
  assert.deepEqual(await pending, { bridgeVersion: 'fixture' });
  assert.equal(await exists(path.join(directory, 'client.lock')), false);
  await assert.rejects(requestEditor(root, 'ping', '', 150), /timeout/);
  assert.equal(await exists(path.join(directory, 'client.lock')), false);
});

test('confined paths reject traversal, alternate separators and directory links', async t => {
  const root = await fixture(t);
  for (const unsafe of ['../escape', '/absolute', 'C:/escape', 'Content\\escape', 'Content/../escape']) {
    await assert.rejects(confinedPath(root, unsafe));
  }
  const outside = await fixture(t);
  await fs.symlink(outside, path.join(root, 'Content/linked'), process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(confinedPath(root, 'Content/linked/file'), /Links and junctions/);
});
