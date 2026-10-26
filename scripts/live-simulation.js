// Explicit opt-in test. Runs the supplied original world's scripts three times.
import assert from 'node:assert/strict';
import {readFile,stat,open} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {Client} from '@modelcontextprotocol/client';
import {StdioClientTransport,getDefaultEnvironment} from '@modelcontextprotocol/client/stdio';
const [world]=process.argv.slice(2);
const root=process.env.SERIOUS_EDITOR_ROOT;
if(!world||!root||process.env.SERIOUS_EDITOR_ALLOW_MUTATION!=='1'||!process.env.SERIOUS_EDITOR_PROJECT_ROOT)
  throw new Error('Usage: node scripts/live-simulation.js Content/YourMod/Test.wld; set root, project root and mutation opt-in.');
const client=new Client({name:'serious-editor-live-simulation',version:'0.6.0'});
const transport=new StdioClientTransport({command:process.execPath,args:[fileURLToPath(new URL('../src/index.js',import.meta.url))],
  env:{...getDefaultEnvironment(),SERIOUS_EDITOR_ROOT:root,SERIOUS_EDITOR_PROJECT_ROOT:process.env.SERIOUS_EDITOR_PROJECT_ROOT,SERIOUS_EDITOR_ALLOW_MUTATION:'1'}});
const call=async(name,args={})=>{
  const r=await client.callTool({name,arguments:args});
  if(r.isError)throw new Error(r.content[0].text);return r.structuredContent;
};
const logfile=path.join(root,'Log/SeriousEditor.log');
async function logSince(offset){
  const handle=await open(logfile,'r');
  try{
    const size=(await handle.stat()).size;
    if(size<offset||size-offset>256*1024)throw new Error('Editor log rotated or test output exceeded 256 KiB.');
    const buffer=Buffer.alloc(size-offset);
    const {bytesRead}=await handle.read(buffer,0,buffer.length,offset);
    return buffer.subarray(0,bytesRead).toString('utf8');
  }finally{await handle.close();}
}
async function waitLog(offset,text){
  for(let i=0;i<100;i++){
    if((await logSince(offset)).includes(text))return;
    await delay(100);
  }
  throw new Error('Expected new engine log evidence was not observed: '+text);
}
let active;
try{
  await client.connect(transport);
  assert.equal((await call('editor_ping')).bridgeVersion,'0.6.0');
  const original=await readFile(path.join(root,world));
  for(let i=0;i<3;i++){
    const doc=await call('editor_open_document',{path:world});
    const offset=(await stat(logfile)).size;
    active=await call('editor_start_simulation',{documentId:doc.documentId,withPlayer:true});
    assert.equal(active.status,'document-created');assert.equal(active.running,null);
    await waitLog(offset,`Started simulation on '${world}'`);
    assert.equal((await call('editor_simulation')).activeDocument,true);
    const duplicate=await client.callTool({name:'editor_start_simulation',arguments:{documentId:doc.documentId}});
    assert.equal(duplicate.isError,true);
    const stopped=await call('editor_stop_simulation',{simulationId:active.simulationId});
    active=null;
    assert.equal(stopped.status,'stopped');assert.equal(stopped.playerSettingRestored,true);
    await waitLog(offset,`Stopping world '${world}'`);
    assert.equal((await call('editor_document',{documentId:doc.documentId})).active,true);
    assert.equal((await call('editor_stop_simulation',{simulationId:stopped.simulationId})).status,'stopped');
  }
  assert.deepEqual(await readFile(path.join(root,world)),original);
  console.log(JSON.stringify({passed:true,cycles:3,newStartAndStopLogEvidence:true,sourceFileUnchanged:true,
    duplicateRejected:true,playerPreferenceRestored:true,limitation:'Lifecycle proof only; inspect world-specific logs to establish player/gameplay behavior.'},null,2));
}finally{
  if(active)await call('editor_stop_simulation',{simulationId:active.simulationId}).catch(error=>console.error('Stop uncertain:',error.message));
  await client.close();
}
