import http from 'node:http';
import { randomBytes } from 'node:crypto';
import { createReadStream, readFileSync, mkdirSync, statSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ViewLog } from './analytics.mjs';
import { readCatalog, publicVideo } from './catalog.mjs';
import { ArchiveSearch } from './retrieval.mjs';

const token = () => randomBytes(32).toString('hex');
const vttTime = n => new Date(n*1000).toISOString().slice(11,23);
export function createApp(options = {}) {
  const root = options.root ?? resolve('.');
  const preview = options.preview ?? process.env.NODE_ENV !== 'production';
  const catalogPath = options.catalogPath ?? join(root, preview && existsSync(join(root,'.local/catalog.json'))?'.local/catalog.json':'content/catalog.json');
  const videos = readCatalog(catalogPath,preview);
  mkdirSync(join(root,'.local'),{recursive:true});
  const log = options.log ?? new ViewLog(join(root,'.local/views.sqlite'));
  const archive = options.archive ?? new ArchiveSearch(videos);
  const sessions = new Map();
  const rates = new Map();
  const retentionTimer=setInterval(()=>log.prune(),3600000);
  retentionTimer.unref();
  let aiState = 'loading';
  archive.ready().then(()=>{aiState='ready';}).catch(()=>{aiState='unavailable';});
  const server = http.createServer(async (req,res)=>{
    const json = (status,body)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(body));};
    res.setHeader('Cache-Control','no-store');
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Referrer-Policy','no-referrer');
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; media-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    const path = new URL(req.url,'http://localhost').pathname;
    const ip = req.socket.remoteAddress ?? '';
    // Forwarded headers are deliberately not trusted. Configure a trusted ingress before deployment.
    const now = Date.now();
    const host = req.headers.host ?? '';
    if (preview && !/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host)) return json(403,{error:'Local preview only'});
    for (const [id,s] of sessions) if (s.expires<now) sessions.delete(id);
    for (const [id,r] of rates) if (r.reset<now) rates.delete(id);
    let sid = /(?:^|;\s*)matt_session=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie ?? '')?.[1];
    let session = sessions.get(sid);
    if (!session) {
      sid=token();session={csrf:token(),expires:now+3600000};sessions.set(sid,session);
      res.setHeader('Set-Cookie',`matt_session=${sid}; HttpOnly; SameSite=Strict; Path=/; Max-Age=3600${preview?'':'; Secure'}`);
    }
    try {
      if(req.method==='GET' && path==='/api/bootstrap') return json(200,{preview,videos:videos.map(publicVideo),csrf:session.csrf,aiState});
      if(req.method==='GET' && path==='/api/declaration') return json(200,{text:readFileSync(join(root,'content/declaration.md'),'utf8')});
      if(req.method==='POST' && path.startsWith('/api/')) {
        const origin=req.headers.origin;
        const expected=options.origin ?? process.env.PUBLIC_ORIGIN ?? `http://${host}`;
        if(origin!==expected || req.headers['sec-fetch-site']==='cross-site') return json(403,{error:'Origin rejected'});
        if(!req.headers['content-type']?.startsWith('application/json')) return json(415,{error:'JSON required'});
        const rate=rates.get(ip) ?? {count:0,reset:now+60000};rate.count++;rates.set(ip,rate);
        if(rate.count>60) return json(429,{error:'Please wait a minute before trying again.'});
        let raw='';
        for await (const chunk of req) {raw+=chunk;if(Buffer.byteLength(raw)>8192) return json(413,{error:'Request too large'});}
        let data;try{data=JSON.parse(raw);}catch{return json(400,{error:'Invalid JSON'});}
        if(!data || typeof data!=='object' || data.csrf!==session.csrf) return json(403,{error:'Session expired. Reload this page.'});
        const metadata={ip,userAgent:req.headers['user-agent'],language:req.headers['accept-language']};
        if(path==='/api/views/open') return json(200,log.open(sid,metadata,data));
        if(path==='/api/views/close') return json(200,log.close(sid,metadata,data));
        if(path==='/api/chat') {
          if(typeof data.question!=='string' || !data.question.trim() || data.question.length>1000) return json(400,{error:'Enter a question of 1–1,000 characters.'});
          if(data.videoId && !videos.some(v=>v.id===data.videoId)) return json(400,{error:'Unknown recording'});
          if(aiState!=='ready') return json(503,{error:'The online AI service is not connected yet. You can still watch the recordings and read their transcripts.'});
          try {return json(200,await archive.answer(data.question.trim(),data.videoId));}
          catch(error){return json(502,{error:error.name==='TimeoutError'?'The AI service timed out. Please try again.':error.message});}
        }
      }
      const media=/^\/(media|captions)\/([a-z0-9-]+)$/.exec(path);
      if(req.method==='GET' && media) {
        const v=videos.find(v=>v.id===media[2]);if(!v) return json(404,{error:'Recording unavailable'});
        if(media[1]==='captions') {
          res.writeHead(200,{'Content-Type':'text/vtt'});
          return res.end('WEBVTT\n\n'+v.segments.map(s=>`${vttTime(s.start)} --> ${vttTime(s.end)}\n${s.text.replaceAll('-->','→')}\n`).join('\n'));
        }
        if(!existsSync(v.path)) return json(404,{error:'Recording file missing'});
        const size=statSync(v.path).size;const range=req.headers.range;
        let start=0,end=size-1;
        if(range) {
          const match=/^bytes=(\d*)-(\d*)$/.exec(range);
          if(!match || (!match[1]&&!match[2])) {res.writeHead(416,{'Content-Range':`bytes */${size}`});return res.end();}
          if(!match[1]) start=Math.max(0,size-Number(match[2]));
          else {start=Number(match[1]);if(match[2])end=Math.min(Number(match[2]),size-1);}
          if(start>=size || start>end) {res.writeHead(416,{'Content-Range':`bytes */${size}`});return res.end();}
        }
        res.writeHead(range?206:200,{'Content-Type':'video/mp4','Accept-Ranges':'bytes','Content-Length':end-start+1,...(range?{'Content-Range':`bytes ${start}-${end}/${size}`}:{})});
        const stream=createReadStream(v.path,{start,end});stream.on('error',()=>res.destroy());res.on('close',()=>stream.destroy());return stream.pipe(res);
      }
      const files={'/':['index.html','text/html'],'/app.js':['app.js','text/javascript'],'/styles.css':['styles.css','text/css'],'/favicon.ico':[null,null]};
      if(req.method==='GET' && Object.hasOwn(files,path)) {
        const [file,mime]=files[path];if(!file){res.writeHead(204);return res.end();}
        res.writeHead(200,{'Content-Type':`${mime}; charset=utf-8`});return res.end(readFileSync(join(root,'public',file)));
      }
      return json(404,{error:'Not found'});
    } catch(error) {console.error('Request failed:',error.name);if(!res.headersSent)json(500,{error:'Unable to complete the request. Please try again.'});else res.destroy();}
  });
  server.on('close',()=>{clearInterval(retentionTimer);log.dispose();});
  return server;
}
if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  if(process.env.NODE_ENV==='production' && !process.env.PUBLIC_ORIGIN) throw new Error('PUBLIC_ORIGIN is required in production');
  const port=Number(process.env.PORT ?? 4173);
  createApp().listen(port,'127.0.0.1',()=>console.log(`Matt preview: http://127.0.0.1:${port}`));
}
