import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import {fixture} from './support.js';
import {documentTools,validateProjectRoot} from '../src/documents.js';
import {sha256} from '../src/files.js';
import {installBridge,reloadBridge} from '../src/bridge.js';

const id='10000000-0000-4000-8000-000000000001';
test('simulation requires mutation opt-in and a retained project world',async t=>{
  for(const opts of [{allowMutation:false},{projectRoot:undefined},{projectRoot:'Content/Other'}]){
    const s=await setup(t,opts);await s.tools.open(s.root,s.relative);
    await assert.rejects(s.tools.startSimulation(s.root,id,true));
    assert.equal(s.ops.includes('start_simulation'),false);
  }
  const s=await setup(t);await s.tools.open(s.root,s.relative);
  await s.tools.startSimulation(s.root,id,true);
  assert.deepEqual(s.ops,['open_document','document','start_simulation']);
  await assert.rejects(s.tools.startSimulation(s.root,id,'true'));
  await assert.rejects(s.tools.startSimulation(s.root,id,true,'true'),/runInBackground/);
});
async function setup(t, options={}) {
  const root=await fixture(t);
  const relative='Content/Fixture/World.wld';
  const absolute=path.join(root,relative);
  await fs.mkdir(path.dirname(absolute),{recursive:true});
  await fs.writeFile(absolute,'ORIGINAL SYNTHETIC WORLD');
  const ops=[];
  const tools=documentTools({allowMutation:true,projectRoot:'Content/Fixture',...options},async(_,op,arg)=>{
    ops.push(op);
    if(op==='open_document')return {documentId:id,requestedPath:arg};
    if(op==='save_document')await fs.writeFile(absolute,'SAVED SYNTHETIC WORLD');
    return {active:true};
  });
  return {root,relative,absolute,tools,ops};
}

test('save checks hash and namespace, backs up exact bytes and reports disk evidence',async t=>{
  const {root,relative,absolute,tools,ops}=await setup(t);
  const opened=await tools.open(root,relative);
  await assert.rejects(tools.save(root,id,'0'.repeat(64)),/changed on disk/);
  assert.equal(ops.includes('save_document'),false);
  const saved=await tools.save(root,id,opened.sha256);
  assert.equal(await fs.readFile(path.join(root,saved.backup),'utf8'),'ORIGINAL SYNTHETIC WORLD');
  assert.equal(saved.fileChanged,true);
  assert.equal(saved.sha256,sha256(await fs.readFile(absolute)));
  assert.equal((await tools.inspect(root,id)).sha256,saved.sha256);
  tools.clear();
  await assert.rejects(tools.inspect(root,id),/Unknown document token/);
});

test('disabled editing, missing namespace, stock paths and links cannot save',async t=>{
  for(const options of [{allowMutation:false},{projectRoot:undefined},{projectRoot:'Content/AnotherMod'}]) {
    const {root,relative,tools,ops}=await setup(t,options);
    const opened=await tools.open(root,relative);
    await assert.rejects(tools.save(root,id,opened.sha256));
    assert.equal(ops.includes('save_document'),false);
  }
  for(const candidate of ['Content/SeriousSam2017','Content/EditorMcp','Content/../escape','Content/Fixture/sub','Content/Common']) {
    assert.throws(()=>validateProjectRoot(candidate));
  }
  const {root,tools,ops}=await setup(t);
  for(const candidate of ['Content/../World.wld','Content/Fixture/code.lua','Content/Fixture/Bad./World.wld','Content/Fixture/Bad /World.wld']) {
    await assert.rejects(tools.open(root,candidate));
  }
  const outside=await fixture(t);
  await fs.symlink(outside,path.join(root,'Content/Linked'),process.platform==='win32'?'junction':'dir');
  await assert.rejects(tools.open(root,'Content/Linked/World.wld'),/Links and junctions/);
  assert.deepEqual(ops,[]);
});

test('unchanged save is not claimed as persistence and uncertain saves retain backups',async t=>{
  const {root,relative}=await setup(t);
  for(const fail of [false,true]) {
    const tools=documentTools({allowMutation:true,projectRoot:'Content/Fixture'},async(_,op)=>{
      if(op==='open_document')return {documentId:id};
      if(op==='save_document'&&fail)throw new Error('test timeout');
      return {};
    });
    const opened=await tools.open(root,relative);
    if(fail)await assert.rejects(tools.save(root,id,opened.sha256),/outcome uncertain.*Backup:/);
    else assert.equal((await tools.save(root,id,opened.sha256)).outcome,'no-file-change');
  }
  assert.equal((await fs.readdir(path.join(root,'Content/EditorMcp/backups'))).length,2);
});

test('reload refuses modified source or receipt before dispatch',async t=>{
  const root=await fixture(t);
  await installBridge(root);
  await fs.writeFile(path.join(root,'Content/EditorMcp/bridge.lua'),'-- independently changed');
  await assert.rejects(reloadBridge(root),/source, installed file and receipt must match/);
});
