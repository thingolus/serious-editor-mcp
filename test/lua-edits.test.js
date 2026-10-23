// Executes the actual bridge in Fengari (Lua 5.3) with an original fake engine.
// These state-machine checks complement, and never replace, live Lua 5.1 tests.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import fengari from 'fengari';
import { encodeRequest } from '../src/bridge.js';
const { lua, lauxlib, lualib, to_luastring } = fengari;
const source = readFileSync(new URL('../bridge/bridge.lua', import.meta.url), 'utf8');
const id = n => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const value = v => `${typeof v === 'boolean' ? 'b' : 's'}\n${Buffer.from(String(v)).toString('hex')}`;
const preview = (context, path, before, after) => `${id(context)}\n${path}\n${value(before)}\n${value(after)}`;

function run(steps, initial = '') {
  const L = lauxlib.luaL_newstate();
  lualib.luaL_openlibs(L);
  const responses = [];
  lua.lua_pushjsfunction(L, state => { responses.push(lua.lua_tojsstring(state, 2)); return 0; });
  lua.lua_setglobal(L, to_luastring('strSaveText'));
  const requests = steps.map((step, i) => `{wire=${JSON.stringify(encodeRequest(id(i + 1), step.op, step.arg ?? ''))}, before=function() ${step.before ?? ''} end}`).join(',\n');
  const setup = `
    globals={}; math=nil; print=function() end
    mock={name='Locator001',sphere=0,autorun='SAT_ALWAYS',count=1,sets=0}
    local document={_CT_OBJECT_USERDATA_={}}
    local entity={_CT_OBJECT_USERDATA_={}}
    function entity:GetEntityID() return 1 end
    function entity:GetName() return mock.name end
    mock.document=document; mock.entity=entity
    function guiGetActiveDocument() return mock.document end
    function edtCountSelectedEntityProperties() return mock.count end
    function edtGetSelectedEntityProperty() return mock.entity end
    function edtHasMemberValue(p) return (p=='ep_strName' or p=='ep_bSphere' or p=='ep_satAutoRun') and 1 or 0 end
    function edtGetMemberValue(p) if p=='ep_strName' then return mock.name elseif p=='ep_satAutoRun' then return mock.autorun else return mock.sphere end end
    function edtSetMemberValue(p,v)
      mock.sets=mock.sets+1
      if p=='ep_strName' then mock.name=v elseif p=='ep_satAutoRun' then mock.autorun=v else mock.sphere=v end
      if mock.fail then error('simulated failure after write') end
    end
    function Delay() end
    local requests={${requests}}
    local index=1; local first=true
    function strLoadText_unsigned()
      if first then first=false; return ${JSON.stringify(initial)} end
      local request=requests[index]; request.before(); return request.wire
    end
    function Wait() index=index+1; if index>#requests then globals.EditorMcpBridgeState.running=false end end
  `;
  try {
    const code = lauxlib.luaL_dostring(L, to_luastring(setup + '\n' + source));
    assert.equal(code, lua.LUA_OK, lua.lua_tojsstring(L, -1));
    lua.lua_getglobal(L, to_luastring('mock'));
    const mock = {};
    for (const key of ['name', 'sphere', 'sets']) {
      lua.lua_getfield(L, -1, to_luastring(key));
      mock[key] = lua.lua_type(L, -1) === lua.LUA_TNUMBER ? lua.lua_tonumber(L, -1) : lua.lua_tojsstring(L, -1);
      lua.lua_pop(L, 1);
    }
    return { mock, responses: responses.map(text => {
      const lines = text.split('\n'); return { status: lines[2], ...JSON.parse(lines[3]) };
    }) };
  } finally { lua.lua_close(L); }
}

test('actual Lua bridge previews, applies once, reports and conditionally undoes once', () => {
  const result = run([
    { op: 'selection' },
    { op: 'preview_edit', arg: preview(1, 'ep_strName', 'Locator001', 'RC_RouteStart') },
    { op: 'apply_edit', arg: id(2) }, { op: 'apply_edit', arg: id(2) },
    { op: 'edit_status', arg: id(2) },
    { op: 'undo_edit', arg: id(2) }, { op: 'undo_edit', arg: id(2) }
  ]);
  assert.equal(result.responses[1].status, 'preview');
  assert.equal(result.responses[4].status, 'applied');
  assert.equal(result.responses[6].status, 'undone');
  assert.deepEqual(result.mock, { name: 'Locator001', sphere: 0, sets: 2 });
});

test('Lua bridge normalizes engine booleans and preserves strings as data', () => {
  const result = run([
    { op: 'selection' },
    { op: 'preview_edit', arg: preview(1, 'ep_bSphere', false, true) },
    { op: 'apply_edit', arg: id(2) }, { op: 'undo_edit', arg: id(2) },
    { op: 'preview_edit', arg: preview(1, 'ep_strName', 'Locator001', '"; error("never executed")') },
    { op: 'apply_edit', arg: id(5) }, { op: 'undo_edit', arg: id(5) }
  ]);
  assert.equal(result.responses[1].before, false);
  assert.equal(result.responses[2].after, true);
  assert.equal(result.mock.sets, 4);
  assert.equal(result.mock.name, 'Locator001');
});

test('script auto-run uses bounded enum values and conditional restoration', () => {
  const result = run([
    { op: 'selection' },
    { op: 'preview_edit', arg: preview(1, 'ep_satAutoRun', 'SAT_ALWAYS', 'SAT_ONLYONHOST') },
    { op: 'apply_edit', arg: id(2) },
    { op: 'get_member', arg: 'ep_satAutoRun' },
    { op: 'undo_edit', arg: id(2) },
    { op: 'get_member', arg: 'ep_satAutoRun' },
    { op: 'preview_edit', arg: preview(1, 'ep_satAutoRun', 'SAT_ALWAYS', 'INVENTED') },
    { op: 'preview_edit', arg: preview(1, 'ep_satAutoRun', 'SAT_ALWAYS', true) }
  ]);
  assert.equal(result.responses[3].value, 'SAT_ONLYONHOST');
  assert.equal(result.responses[5].value, 'SAT_ALWAYS');
  assert.ok(result.responses[6].error);
  assert.ok(result.responses[7].error);
  assert.equal(result.mock.sets, 2);
});

test('Lua rejects stale values, changed entity/document, and multiple selections without writes', () => {
  for (const change of ["mock.name='ManualChange'", 'mock.document={_CT_OBJECT_USERDATA_={}}',
    'mock.entity={_CT_OBJECT_USERDATA_={},GetEntityID=function() return 1 end,GetName=function() return mock.name end}', 'mock.count=2']) {
    const result = run([
      { op: 'selection' }, { op: 'preview_edit', arg: preview(1, 'ep_strName', 'Locator001', 'RC_Start') },
      { op: 'apply_edit', arg: id(2), before: change }
    ]);
    assert.ok(result.responses[2].error);
    assert.equal(result.mock.sets, 0);
  }
  const result = run([
    { op: 'selection' }, { op: 'preview_edit', arg: preview(1, 'ep_strName', 'Locator001', 'RC_Start') },
    { op: 'apply_edit', arg: id(2) },
    { op: 'undo_edit', arg: id(2), before: "mock.name='ManualChange'" }
  ]);
  assert.match(result.responses[3].error, /refusing to overwrite/);
  assert.equal(result.mock.name, 'ManualChange');
});

test('Lua marks partial setter failure uncertain and refuses replay or undo', () => {
  const result = run([
    { op: 'selection' }, { op: 'preview_edit', arg: preview(1, 'ep_strName', 'Locator001', 'RC_Start') },
    { op: 'apply_edit', arg: id(2), before: 'mock.fail=true' },
    { op: 'apply_edit', arg: id(2) }, { op: 'undo_edit', arg: id(2) }, { op: 'edit_status', arg: id(2) }
  ]);
  assert.match(result.responses[2].error, /uncertain/);
  assert.equal(result.responses[5].status, 'uncertain');
  assert.equal(result.mock.sets, 1);
});

test('Lua refuses unverified paths, wrong types, controls, stale contexts and startup requests', () => {
  const result = run([
    { op: 'selection' },
    { op: 'preview_edit', arg: preview(1, 'ep_strName', 'WrongOldValue', 'RC_Start') },
    { op: 'preview_edit', arg: preview(1, 'ep_bSphere', false, 'true') },
    { op: 'preview_edit', arg: preview(1, 'ep_strName', 'Locator001', 'bad\nname') },
    { op: 'preview_edit', arg: preview(1, 'ep_colColor', 'old', 'new') },
    { op: 'apply_edit', arg: id(99) },
    { op: 'selection', before: 'mock.count=0' }
  ]);
  assert.ok(result.responses.slice(1).every(reply => reply.error));
  assert.equal(result.mock.sets, 0);
  const skipped = run([{ op: 'apply_edit', arg: id(99) }], encodeRequest(id(1), 'apply_edit', id(99)));
  assert.equal(skipped.responses.length, 0);
  assert.equal(skipped.mock.sets, 0);
});
