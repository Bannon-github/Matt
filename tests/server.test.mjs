import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,mkdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from '../server/index.mjs';
import {ViewLog} from '../server/analytics.mjs';
import {readCatalog} from '../server/catalog.mjs';

test('HTTP session, range playback, origin, body limits, private files and production publication gate',async()=>{
  const root=mkdtempSync(join(tmpdir(),'matt-test-'));mkdirSync(join(root,'content'));mkdirSync(join(root,'public'));
  writeFileSync(join(root,'public/index.html'),'<h1>Test</h1>');writeFileSync(join(root,'content/declaration.md'),'# Declaration');
  const media=join(root,'private.mp4');writeFileSync(media,'0123456789');
  const catalog={videos:[{id:'test',title:'Test',duration:10,path:media,publicationApproved:false,transcriptReviewed:false,segments:[{id:'s',start:0,end:3,text:'Hello.'}]}]};
  const catalogPath=join(root,'content/catalog.json');writeFileSync(catalogPath,JSON.stringify(catalog));
  assert.equal(readCatalog(catalogPath,false).length,0);
  const app=createApp({root,log:new ViewLog(':memory:'),archive:{ready:async()=>{},answer:async()=>({kind:'unsupported',citations:[]})}});
  await new Promise(resolve=>app.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${app.address().port}`;
  try{
    const boot=await fetch(base+'/api/bootstrap');const cookie=boot.headers.get('set-cookie').split(';')[0];const config=await boot.json();assert.equal(config.videos[0].path,undefined);
    const send=(path,data,origin=base)=>fetch(base+path,{method:'POST',headers:{Cookie:cookie,Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({csrf:config.csrf,...data})});
    const open=await send('/api/views/open',{});assert.equal(open.status,200);const {viewId}=await open.json();
    assert.equal((await (await send('/api/views/close',{viewId,activeMs:0})).json()).reason,'too-short');
    assert.equal((await send('/api/views/open',{},'https://evil.example')).status,403);
    assert.equal((await send('/api/views/open',{csrf:'wrong'})).status,403);
    assert.equal((await send('/api/chat',{question:'x'.repeat(9000)})).status,413);
    assert.equal((await send('/api/chat',{question:'hello',videoId:'not-a-video'})).status,400);
    const range=await fetch(base+'/media/test',{headers:{Range:'bytes=2-5'}});assert.equal(range.status,206);assert.equal(await range.text(),'2345');
    const suffix=await fetch(base+'/media/test',{headers:{Range:'bytes=-3'}});assert.equal(await suffix.text(),'789');
    assert.equal((await fetch(base+'/media/test',{headers:{Range:'bytes=90-'}})).status,416);
    assert.match(await (await fetch(base+'/captions/test')).text(),/00:00:00.000 --> 00:00:03.000/);
    for(const path of ['/.env','/.local/catalog.json','/.local/views.sqlite','/content/declaration.md','/media/unknown']) assert.equal((await fetch(base+path)).status,404);
  }finally{await new Promise(resolve=>app.close(resolve));}
  const production=createApp({root,preview:false,log:new ViewLog(':memory:'),archive:{ready:async()=>{}}});await new Promise(resolve=>production.listen(0,'127.0.0.1',resolve));
  try{const base=`http://127.0.0.1:${production.address().port}`;assert.equal((await (await fetch(base+'/api/bootstrap')).json()).videos.length,0);assert.equal((await fetch(base+'/media/test')).status,404);}finally{await new Promise(resolve=>production.close(resolve));rmSync(root,{recursive:true,force:true});}
});
