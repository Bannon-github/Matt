import test from 'node:test';
import assert from 'node:assert/strict';
import {ViewLog,MAX_READING_MS} from '../server/analytics.mjs';
const request={ip:'127.0.0.1',userAgent:'test',language:'en'};
test('paired open and close count once; event metadata and duration are durable',()=>{
  let now=100000;const log=new ViewLog(':memory:',()=>now);
  const {viewId}=log.open('session',request,{timezone:'America/Vancouver'});
  assert.equal(log.db.prepare('SELECT SUM(counted) AS n FROM views').get().n,0);
  now+=6000;assert.deepEqual(log.close('session',request,{viewId,activeMs:5500}),{counted:true,reason:'valid'});
  assert.equal(log.close('session',request,{viewId,activeMs:5500}).reason,'duplicate-close');
  assert.equal(log.db.prepare('SELECT SUM(counted) AS n FROM views').get().n,1);
  const events=log.db.prepare('SELECT * FROM events ORDER BY id').all();assert.equal(events.length,3);assert.equal(events[0].ip,'127.0.0.1');assert.equal(events[1].occurred,106000);log.dispose();
});
test('missing, mismatched, short, hidden, forged, and expired sessions never count',()=>{
  let now=100000;const log=new ViewLog(':memory:',()=>now);
  assert.equal(log.close('s',request,{viewId:'missing',activeMs:8000}).reason,'missing-open');
  let id=log.open('s',request).viewId;now+=6000;
  assert.equal(log.close('other',request,{viewId:id,activeMs:6000}).reason,'session-mismatch');
  assert.equal(log.close('s',request,{viewId:id,activeMs:0}).reason,'too-short');
  id=log.open('s',request).viewId;now+=4000;assert.equal(log.close('s',request,{viewId:id,activeMs:4000}).reason,'too-short');
  id=log.open('s',request).viewId;now+=6000;assert.equal(log.close('s',request,{viewId:id,activeMs:600000}).reason,'invalid-duration');
  id=log.open('s',request).viewId;now+=MAX_READING_MS+1;assert.equal(log.close('s',request,{viewId:id,activeMs:10000}).reason,'expired');
  assert.equal(log.db.prepare('SELECT SUM(counted) AS n FROM views').get().n,0);log.dispose();
});
test('exact duration boundaries and retention',()=>{
  let now=100000;const log=new ViewLog(':memory:',()=>now);const id=log.open('s',request).viewId;
  now+=5000;assert.equal(log.close('s',request,{viewId:id,activeMs:5000}).counted,true);
  const second=log.open('s',request).viewId;now+=MAX_READING_MS;assert.equal(log.close('s',request,{viewId:second,activeMs:MAX_READING_MS}).counted,true);
  now+=31*86400000;log.prune();assert.equal(log.db.prepare('SELECT COUNT(*) AS n FROM events').get().n,0);log.dispose();
});
