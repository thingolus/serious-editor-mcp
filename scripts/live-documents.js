// Opt-in mutation test on a disposable, editor-authored world. Restores the name.
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {Client} from '@modelcontextprotocol/client';
import {StdioClientTransport,getDefaultEnvironment} from '@modelcontextprotocol/client/stdio';

const [path,entityText,expectedName]=process.argv.slice(2);
if(!path||!/^\d+$/.test(entityText??'')||!expectedName)throw new Error('Usage: node scripts/live-documents.js Content/YourMod/Test.wld entityId expectedName');
if(process.env.SERIOUS_EDITOR_ALLOW_MUTATION!=='1'||!process.env.SERIOUS_EDITOR_PROJECT_ROOT)throw new Error('Set mutation opt-in and an original project root.');
const client=new Client({name:'serious-editor-live-documents',version:'0.6.0'});
const transport=new StdioClientTransport({command:process.execPath,args:[fileURLToPath(new URL('../src/index.js',import.meta.url))],
  env:{...getDefaultEnvironment(),SERIOUS_EDITOR_ROOT:process.env.SERIOUS_EDITOR_ROOT,
    SERIOUS_EDITOR_PROJECT_ROOT:process.env.SERIOUS_EDITOR_PROJECT_ROOT,SERIOUS_EDITOR_ALLOW_MUTATION:'1'}});
const call=async(name,args={})=>{
  const result=await client.callTool({name,arguments:args});
  if(result.isError)throw new Error(result.content[0].text);
  return result.structuredContent;
};
try{
  await client.connect(transport);
  const opened=await call('editor_open_document',{path});
  const observed=await call('editor_document',{documentId:opened.documentId});
  assert.equal(observed.saveAllowed,true);
  const scene=await call('editor_scene');
  await call('editor_select_entity',{sceneId:scene.sceneId,entityId:Number(entityText)});
  const context=await call('editor_selection');
  assert.equal(context.name,expectedName);
  const edit=await call('editor_preview_edit',{contextId:context.contextId,path:'ep_strName',expectedValue:expectedName,newValue:'EditorMcp_SaveTest'});
  await call('editor_apply_edit',{editId:edit.editId});
  const first=await call('editor_save_document',{documentId:opened.documentId,expectedSha256:observed.sha256});
  assert.equal(first.fileChanged,true,'Save produced no changed-file evidence; inspect and restore the pending edit.');
  const stale=await client.callTool({name:'editor_save_document',arguments:{documentId:opened.documentId,expectedSha256:observed.sha256}});
  assert.equal(stale.isError,true);
  await call('editor_undo_edit',{editId:edit.editId});
  const restored=await call('editor_save_document',{documentId:opened.documentId,expectedSha256:first.sha256});
  assert.equal(restored.fileChanged,true);
  assert.equal((await call('editor_read_member',{path:'ep_strName'})).value,expectedName);
  const reload=await call('editor_reload_bridge',{acknowledgeTokenExpiry:true});
  assert.equal(reload.reloaded,true);
  assert.equal((await call('editor_ping')).bridgeVersion,'0.6.0');
  const expired=await client.callTool({name:'editor_document',arguments:{documentId:opened.documentId}});
  assert.equal(expired.isError,true);
  const reopened=await call('editor_open_document',{path});
  console.log(JSON.stringify({passed:true,renamedAndRestored:true,staleHashRejected:true,tokensExpired:true,
    immediatePingAfterReload:true,backups:[first.backup,restored.backup],restoredSha256:reopened.sha256,
    limitation:'Existing-tab activation is not a disk reload. Close the saved document manually, reopen and inspect for independent persistence proof.'},null,2));
}finally{await client.close();}
