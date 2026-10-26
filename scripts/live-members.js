// Explicit read/selection test; opens an existing original fixture and does not save.
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport, getDefaultEnvironment } from '@modelcontextprotocol/client/stdio';
const [worldPath,entityName,...extraPaths]=process.argv.slice(2);
if(!worldPath||!entityName||!process.env.SERIOUS_EDITOR_ROOT)throw new Error('Set SERIOUS_EDITOR_ROOT; pass world path, entity name, and optional nested paths.');
const paths=['ep_strName',...extraPaths,'__EditorMcpMissingMember'];
const client=new Client({name:'serious-editor-live-members',version:'0.7.0'});
const transport=new StdioClientTransport({command:process.execPath,
  args:[fileURLToPath(new URL('../src/index.js',import.meta.url))],
  env:{...getDefaultEnvironment(),SERIOUS_EDITOR_ROOT:process.env.SERIOUS_EDITOR_ROOT}});
async function call(name,args={}){
  const r=await client.callTool({name,arguments:args});
  assert.ok(!r.isError,JSON.stringify(r));return r.structuredContent;
}
try{
  await client.connect(transport);
  const doc=await call('editor_open_document',{path:worldPath});
  const scene=await call('editor_scene');
  const matches=scene.entities.filter(e=>e.name===entityName);
  assert.equal(matches.length,1);
  const target=matches[0],other=scene.entities.find(e=>e.entityId!==target.entityId);
  assert.ok(other,'Fixture must contain another entity for stale-context rejection');
  const select=entityId=>call('editor_select_entity',{sceneId:scene.sceneId,entityId});
  await select(target.entityId);
  const {contextId}=await call('editor_selection');
  const result=await call('editor_read_selection_members',{contextId,paths});
  assert.equal(result.entityId,target.entityId);
  assert.equal(result.members[0].member.value,entityName);
  assert.equal(result.members.at(-1).exists,false);
  for(const row of result.members.slice(0,-1)){
    assert.equal(row.exists,true,`Fixture missing ${row.member.path}`);
    assert.deepEqual(row.member,await call('editor_read_member',{path:row.member.path}));
  }
  try{
    await select(other.entityId);
    assert.equal((await client.callTool({name:'editor_read_selection_members',arguments:{contextId,paths}})).isError,true);
  }finally{await select(target.entityId);}
  assert.deepEqual(await call('editor_read_selection_members',{contextId,paths}),result);
  assert.equal((await call('editor_document',{documentId:doc.documentId})).sha256,doc.sha256);
  console.log(JSON.stringify({passed:true,members:result.members,staleSelectionRejected:true,fileUnchanged:true},null,2));
}finally{await client.close();}
