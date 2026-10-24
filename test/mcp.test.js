import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport, getDefaultEnvironment } from '@modelcontextprotocol/client/stdio';
import { fixture, zipFixture } from './support.js';

for (const mode of ['legacy', 'auto']) {
  test(`real stdio MCP session (${mode}) lists tools, validates input and enforces installation opt-in`, async t => {
    const root = await fixture(t);
    await zipFixture(root, { 'Content/Fixture.lua': '-- synthetic test data',
      'Help/Macros/Fixture.xml': '<CLASS><NAME>CTest</NAME><FUNCTION><NAME>Inspect</NAME><RETURN>void</RETURN></FUNCTION></CLASS>' });
    const client = new Client({ name: 'integration-test', version: '1.0.0' }, { versionNegotiation: { mode } });
    const transport = new StdioClientTransport({
      command: process.execPath, args: [fileURLToPath(new URL('../src/index.js', import.meta.url))],
      env: { ...getDefaultEnvironment(), SERIOUS_EDITOR_ROOT: root }, stderr: 'pipe'
    });
    t.after(() => client.close());
    await client.connect(transport);
    const listed = await client.listTools();
    assert.equal(listed.tools.length, 17);
    assert.equal(listed.tools.some(tool => /execute|set_member/.test(tool.name)), false);
    const result = await client.callTool({ name: 'editor_status', arguments: {} });
    assert.equal(result.structuredContent.editorInstalled, true);
    assert.equal(result.structuredContent.connected, null);
    const install = await client.callTool({ name: 'editor_install_bridge', arguments: {} });
    assert.equal(install.isError, true);
    assert.match(install.content[0].text, /disabled/);
    for (const name of ['editor_apply_edit', 'editor_undo_edit']) {
      const denied = await client.callTool({ name, arguments: { editId: '10000000-0000-4000-8000-000000000001' } });
      assert.equal(denied.isError, true);
      assert.match(denied.content[0].text, /Editing is disabled/);
    }
    const wrongType = await client.callTool({ name: 'editor_preview_edit', arguments: {
      contextId: '10000000-0000-4000-8000-000000000001', path: 'ep_bSphere', expectedValue: false, newValue: 'true'
    } });
    assert.equal(wrongType.isError, true);
    assert.match(wrongType.content[0].text, /wrong type/);
    const entries = await client.callTool({ name: 'editor_list_entries', arguments: { package: 'test.gro' } });
    assert.equal(entries.structuredContent.entries[0].path, 'Content/Fixture.lua');
    const invalid = await client.callTool({ name: 'editor_list_entries', arguments: { package: 'test.gro', limit: 201 } });
    assert.equal(invalid.isError, true);
    const help = await client.callTool({ name: 'editor_search_help', arguments: {
      package: 'test.gro', path: 'Help/Macros/Fixture.xml', query: 'Inspect', className: 'CTest'
    } });
    assert.equal(help.structuredContent.results[0].className, 'CTest');
    assert.equal(help.structuredContent.documentedOnly, true);
    const badHelp = await client.callTool({ name: 'editor_search_help', arguments: {
      package: 'test.gro', path: 'Content/Fixture.lua', query: 'Inspect'
    } });
    assert.equal(badHelp.isError, true);
  });
}
