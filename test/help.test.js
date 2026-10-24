import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, zipFixture } from './support.js';
import { searchHelp, searchHelpText } from '../src/help.js';

const docs = `<HELP><CLASS><NAME>CExample</NAME><FUNCTIONS>
<FUNCTION><NAME>Move</NAME><PARAMS>CArray<CPoint> points</PARAMS><RETURN>void</RETURN><BRIEF_COMMENT>Follow points.</BRIEF_COMMENT></FUNCTION>
</FUNCTIONS><MEMBERS><MEMBER><CODE_NAME>example_type</CODE_NAME><EDITOR_NAME>Bot type</EDITOR_NAME><COMMENT>Choose the behavior.</COMMENT></MEMBER></MEMBERS></CLASS>
<FUNCTION><NAME>Move</NAME><PARAMS>float distance</PARAMS></FUNCTION>
<CVAR><NAME>example_speed</NAME><TYPE>FLOAT</TYPE></CVAR></HELP>`;

test('help search retains class context and unescaped C++ types without duplicating class functions', () => {
  const all = searchHelpText(docs, 'move');
  assert.equal(all.results.length, 2);
  assert.equal(all.results[0].className, 'CExample');
  assert.equal(all.results[0].params, 'CArray<CPoint> points');
  assert.equal(all.results[1].className, null);
  assert.equal(searchHelpText(docs, 'move', { className: 'cexample' }).results.length, 1);
  assert.equal(searchHelpText(docs, 'Bot type').results[0].name, 'example_type');
  assert.equal(searchHelpText(docs, 'speed').results[0].returns, 'FLOAT');
  assert.equal(searchHelpText(docs, '.*').results.length, 0); // literal, not regex
  assert.equal(searchHelpText(docs, 'move', { limit: 1 }).truncated, true);
  assert.throws(() => searchHelpText(docs, ' '), /nonempty/);
});

test('help search bounds output and refuses non-help, traversal, oversized or binary input', async t => {
  const root = await fixture(t);
  const docPath = 'Help/Macros/Test_macros.xml';
  await zipFixture(root, {
    [docPath]: docs,
    'Help/Cvars/Large.xml': 'x'.repeat(8 * 1024 * 1024 + 1),
    'Help/Cvars/Binary.xml': Buffer.from([0, 1, 2])
  });
  const result = await searchHelp(root, 'test.gro', docPath, 'move');
  assert.equal(result.documentedOnly, true);
  assert.equal(result.results.length, 2);
  await assert.rejects(searchHelp(root, 'test.gro', 'Content/Test.xml', 'move'), /exact Help/);
  await assert.rejects(searchHelp(root, 'test.gro', 'Help/Macros/../Test.xml', 'move'), /exact Help/);
  await assert.rejects(searchHelp(root, '../test.gro', docPath, 'move'), /without a directory/);
  await assert.rejects(searchHelp(root, 'test.gro', 'Help/Cvars/Large.xml', 'move'), /8192 KiB/);
  await assert.rejects(searchHelp(root, 'test.gro', 'Help/Cvars/Binary.xml', 'move'), /binary data/);
  const big = docs.replace('Follow points.', 'x'.repeat(20000)).repeat(50);
  const bounded = searchHelpText(big, 'move', { limit: 20 });
  assert.ok(Buffer.byteLength(JSON.stringify(bounded)) < 25000);
  assert.equal(bounded.truncated, true);
});
