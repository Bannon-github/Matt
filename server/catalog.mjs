import { readFileSync, existsSync } from 'node:fs';

export function readCatalog(path, preview) {
  const data = JSON.parse(readFileSync(path, 'utf8'));
  if (!Array.isArray(data.videos)) throw new Error('Invalid catalog');
  const ids = new Set();
  for (const v of data.videos) {
    if (!/^[a-z0-9-]+$/.test(v.id) || ids.has(v.id) || typeof v.title !== 'string' || !Number.isFinite(v.duration) || v.duration<=0) throw new Error('Invalid video metadata');
    ids.add(v.id);
    if (!Array.isArray(v.segments)) throw new Error('Missing segments');
    const segmentIds = new Set();
    for (const s of v.segments) {
      if (typeof s.id!=='string' || segmentIds.has(s.id) || !Number.isFinite(s.start) || !Number.isFinite(s.end) || s.start<0 || s.end<=s.start || s.end>v.duration || typeof s.text!=='string' || !s.text.trim()) throw new Error('Invalid transcript segment');
      segmentIds.add(s.id);
    }
  }
  return data.videos.filter(v=>preview || (v.publicationApproved===true && v.transcriptReviewed===true));
}
export function publicVideo(v) {
  return {id:v.id,title:v.title,duration:v.duration,description:v.description,synthetic:v.synthetic,
    transcriptStatus:v.transcriptStatus,segments:v.segments.map(({id,start,end,text,retrievable})=>({id,start,end,text,retrievable})),
    available:existsSync(v.path),src:`/media/${v.id}`,captions:`/captions/${v.id}`};
}
