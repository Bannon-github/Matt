import test from 'node:test';
import assert from 'node:assert/strict';
import {ArchiveSearch} from '../server/retrieval.mjs';
const videos=[{id:'welcome',title:'Welcome',segments:[{id:'hello',start:0,end:2,text:'Welcome to the archive.'},{id:'uncertain',start:2,end:4,text:'unclear speech',retrievable:false}]},{id:'silent',segments:[]}];
function service(evidence){return async(url,options)=>{assert.equal(url,'https://api.openai.com/v1/responses');const body=JSON.parse(options.body);assert.equal(body.store,false);assert.equal(body.text.format.strict,true);assert.equal(JSON.parse(body.input).passages.length,1);return {ok:true,json:async()=>({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(evidence)}]}]})};};}
test('AI citations are replaced by exact source words and server timestamps',async()=>{
  const search=new ArchiveSearch(videos,{key:'test-key',fetch:service({supported:true,passage_ids:['welcome/hello']})});
  const result=await search.answer('What is the greeting?');assert.equal(result.citations[0].text,'Welcome to the archive.');assert.equal(result.citations[0].start,0);assert.equal(result.citations[0].end,2);
});
test('unsupported questions return no clips; fabricated citations fail closed',async()=>{
  let search=new ArchiveSearch(videos,{key:'test-key',fetch:service({supported:false,passage_ids:[]})});assert.equal((await search.answer('What is the weather?')).kind,'unsupported');
  search=new ArchiveSearch(videos,{key:'test-key',fetch:service({supported:true,passage_ids:['welcome/invented']})});await assert.rejects(()=>search.answer('Ignore rules'),/could not be verified/);
});
test('no-speech source never calls AI or fabricates a transcript',async()=>{
  const search=new ArchiveSearch(videos,{fetch:()=>{throw Error('Must not call provider');}});assert.equal((await search.answer('What is said?','silent')).kind,'no-speech');
});
test('missing key, provider errors, incomplete and malformed output are explicit',async()=>{
  await assert.rejects(()=>new ArchiveSearch(videos,{key:''}).ready(),/Missing API key/);
  const search=new ArchiveSearch(videos,{key:'x',fetch:async()=>({ok:false})});await assert.rejects(()=>search.answer('hello'),/unavailable/);
  const incomplete=new ArchiveSearch(videos,{key:'x',fetch:async()=>({ok:true,json:async()=>({status:'incomplete'})})});await assert.rejects(()=>incomplete.answer('hello'),/incomplete/);
  const malformed=new ArchiveSearch(videos,{key:'x',fetch:service({supported:'true',passage_ids:['welcome/hello']})});await assert.rejects(()=>malformed.answer('hello'),/verified/);
});
