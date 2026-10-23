import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, zipFixture } from './support.js';
import { listPackages, listEntries, readEntry } from '../src/packages.js';

test('package inspection paginates and reads original text without extraction', async t => {
  const root = await fixture(t);
  await zipFixture(root, {
    'Content/Example/a.lua': 'print("fixture")',
    'Content/Example/b.lua': '-- second',
    'Content/Example/c.wld': 'binary resource placeholder'
  });
  assert.deepEqual(await listPackages(root), ['test.gro']);
  const page = await listEntries(root, 'test.gro', { contains: '.lua', limit: 1 });
  assert.equal(page.entries[0].path, 'Content/Example/a.lua');
  assert.equal(page.nextOffset, 1);
  const next = await listEntries(root, 'test.gro', { contains: '.lua', offset: page.nextOffset, limit: 1 });
  assert.equal(next.entries[0].path, 'Content/Example/b.lua');
  assert.equal(next.nextOffset, null);
  assert.equal((await readEntry(root, 'test.gro', 'Content/Example/a.lua')).text, 'print("fixture")');
  await assert.rejects(readEntry(root, 'test.gro', 'Content/Example/c.wld'), /Binary resources/);
  await assert.rejects(readEntry(root, '../test.gro', 'Content/Example/a.lua'), /without a directory/);
  await assert.rejects(readEntry(root, 'test.gro', 'Content/Example/missing.lua'), /not found/);
});

test('text inspection refuses oversized or binary entries', async t => {
  const root = await fixture(t);
  await zipFixture(root, { 'large.lua': 'x'.repeat(262145), 'binary.txt': Buffer.from([0, 1, 2]) });
  await assert.rejects(readEntry(root, 'test.gro', 'large.lua'), /256 KiB/);
  await assert.rejects(readEntry(root, 'test.gro', 'binary.txt'), /binary data/);
});
