const $=id=>document.getElementById(id);
let config,selected,clipEnd=null,recognition=null,speaking=false;
const time=n=>`${Math.floor(n/60)}:${String(Math.floor(n%60)).padStart(2,'0')}`;
const el=(tag,text,className)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(className)n.className=className;return n;};
async function post(path,data,keepalive=false){
  const response=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...data,csrf:config.csrf}),keepalive});
  const result=await response.json();if(!response.ok)throw Error(result.error??'Request failed');return result;
}
function stopSpeech(){window.speechSynthesis?.cancel();speaking=false;$('stop-speaking').hidden=true;}
function speak(text){if(!$('speak').checked || !window.speechSynthesis)return;stopSpeech();const u=new SpeechSynthesisUtterance(text);u.onend=u.onerror=()=>{speaking=false;$('stop-speaking').hidden=true;};speaking=true;$('stop-speaking').hidden=false;window.speechSynthesis.speak(u);}
function selectVideo(id){
  selected=config.videos.find(v=>v.id===id);if(!selected)return;
  stopSpeech();clipEnd=null;$('player').pause();$('player').replaceChildren();$('player').src=selected.src;
  if(selected.segments.length){const track=el('track');track.kind='captions';track.label='English (automatic)';track.srclang='en';track.src=selected.captions;$('player').append(track);}
  $('synthetic').textContent=selected.synthetic?'AI-generated imagery':'';
  $('description').textContent=selected.description;$('transcript-note').textContent=selected.transcriptStatus;
  $('segments').replaceChildren();$('playback-status').textContent='';
  for(const s of selected.segments){const b=el('button',`${time(s.start)} — ${s.text}`,'segment');b.type='button';b.onclick=()=>playClip(id,s.start,s.end);$('segments').append(b);}
  if(!selected.segments.length)$('segments').append(el('p','No spoken transcript is available.'));
  document.querySelectorAll('.recording').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.id===id)));
}
async function playClip(id,start,end){
  if(selected?.id!==id)selectVideo(id);
  const player=$('player');clipEnd=end;
  try{
    if(player.readyState<1)await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{cleanup();reject(Error('The recording did not load.'));},8000);const loaded=()=>{cleanup();resolve();};const failed=()=>{cleanup();reject(Error('The recording could not be loaded.'));};const cleanup=()=>{clearTimeout(timer);player.removeEventListener('loadedmetadata',loaded);player.removeEventListener('error',failed);};player.addEventListener('loadedmetadata',loaded);player.addEventListener('error',failed);});
    player.currentTime=start;stopSpeech();await player.play();$('playback-status').textContent=`Playing ${time(start)}–${time(end)} from ${selected.title}.`;
  }catch(error){$('playback-status').textContent=error.message;}
}
$('player').addEventListener('timeupdate',()=>{if(clipEnd!==null&&$('player').currentTime>=clipEnd){$('player').pause();clipEnd=null;$('playback-status').textContent='Clip finished. Use the player to keep watching.';}});
$('player').addEventListener('error',()=>{$('playback-status').textContent='This recording could not be loaded. The local file may have moved.';});
$('player').addEventListener('play',stopSpeech);
function message(role,text){$('empty-chat')?.remove();const box=el('div',undefined,'message');box.append(el('strong',role),el('p',text));$('conversation').append(box);box.scrollIntoView({block:'nearest'});return box;}
$('question-form').onsubmit=async event=>{
  event.preventDefault();const question=$('question').value.trim();if(!question)return;
  message('You',question);$('question').value='';$('ask').disabled=true;$('ask').textContent='Thinking…';stopSpeech();
  try{const result=await post('/api/chat',{question,videoId:$('scope').value});const box=message('Archive AI',result.answer);
    for(const c of result.citations){box.append(el('blockquote',c.text));const b=el('button',`Play ${c.title} · ${time(c.start)}–${time(c.end)}`,'citation');b.type='button';b.onclick=()=>playClip(c.videoId,c.start,c.end);box.append(b);}
    speak([result.answer,...result.citations.map(c=>c.text)].join(' '));box.scrollIntoView({block:'nearest'});
  }catch(error){message('Connection notice',error.message);}finally{$('ask').disabled=false;$('ask').textContent='Ask';$('question').focus();}
};
$('stop-speaking').onclick=stopSpeech;$('speak').onchange=()=>{if(!$('speak').checked)stopSpeech();};
const Recognition=window.SpeechRecognition??window.webkitSpeechRecognition;
if(!Recognition){$('microphone').disabled=true;$('voice-status').textContent='Microphone input is unavailable in this browser. You can type your question.';}
else{$('microphone').onclick=()=>{
  if(recognition){recognition.stop();return;}
  stopSpeech();$('player').pause();recognition=new Recognition();recognition.lang='en-US';recognition.interimResults=false;recognition.continuous=false;
  recognition.onresult=e=>{$('question').value=e.results[0][0].transcript.slice(0,1000);$('voice-status').textContent='Review your question, then select Ask.';};
  recognition.onerror=e=>{$('voice-status').textContent=e.error==='not-allowed'?'Microphone permission was declined. You can type instead.':'Voice input could not complete. You can type instead.';};
  recognition.onend=()=>{recognition=null;$('microphone').textContent='Use microphone';};
  try{recognition.start();$('microphone').textContent='Stop listening';$('voice-status').textContent='Listening. Audio may be processed by your browser’s speech provider.';}catch{recognition=null;$('voice-status').textContent='Microphone input is unavailable. You can type instead.';}
};}
if(!window.speechSynthesis)$('speak').disabled=true;

// Track only a displayed document; visibility pauses the reading clock.
let view=null,activeMs=0,visibleSince=null,openPending=null,opening=false;
const meta=()=>({clientTime:new Date().toISOString(),timezone:Intl.DateTimeFormat().resolvedOptions().timeZone,viewport:`${innerWidth}x${innerHeight}`,visibility:document.visibilityState});
function accrue(){if(visibleSince!==null){activeMs+=performance.now()-visibleSince;visibleSince=null;}}
function resume(){if(view&&document.visibilityState==='visible')visibleSince=performance.now();}
function renderDeclaration(text){
  $('declaration-content').replaceChildren();
  for(const block of text.trim().split(/\n\n+/)){const heading=/^(#{1,2}) (.*)$/.exec(block);const node=el(heading?(heading[1]==='#'?'h2':'h3'):'p',heading?heading[2]:block.replaceAll('**',''));if(heading?.[1]==='#')node.id='declaration-title';$('declaration-content').append(node);}
}
$('declaration-link').onclick=async event=>{
  event.preventDefault();if(opening||$('declaration-dialog').open)return;opening=true;
  try{const response=await fetch('/api/declaration');if(!response.ok)throw Error('Declaration unavailable');renderDeclaration((await response.json()).text);
    stopSpeech();$('player').pause();$('declaration-dialog').showModal();$('close-declaration').focus();activeMs=0;view={};resume();$('logging-status').textContent='Opening and closing this document records viewing metadata. A count requires a valid pair of events.';
    const current=view;openPending=post('/api/views/open',meta()).then(result=>{current.id=result.viewId;return result;}).catch(()=>{$('logging-status').textContent='Viewing could not be logged. You can still read the Declaration.';return null;});
  }catch{message('Notice','The Declaration could not load. Please try again.');}finally{opening=false;}
};
async function closeView(){if(!view)return;accrue();const current=view;const duration=Math.round(activeMs);view=null;const pending=openPending;openPending=null;
  if(!current.id)await pending;if(!current.id)return;
  try{await post('/api/views/close',{...meta(),viewId:current.id,activeMs:duration},true);}catch{/* Never invent a completed view if delivery fails. */}
}
$('close-declaration').onclick=()=>$('declaration-dialog').close();
$('declaration-dialog').addEventListener('close',()=>{closeView();$('declaration-link').focus();});
document.addEventListener('visibilitychange',()=>{accrue();resume();if(document.hidden){stopSpeech();recognition?.stop();}});
window.addEventListener('pagehide',()=>{stopSpeech();recognition?.stop();closeView();});
window.addEventListener('pageshow',event=>{if(event.persisted&&$('declaration-dialog').open)$('declaration-dialog').close();});
async function init(){
  try{const response=await fetch('/api/bootstrap');if(!response.ok)throw Error();config=await response.json();
    $('ai-status').textContent=config.aiState==='ready'?'AI connected · Answers cite the recordings':'AI not connected · Playback and transcripts are available';
    $('preview-status').textContent=config.preview?'Local preview · Footage awaiting publication approval':'Video archive';
    for(const v of config.videos){const b=el('button',undefined,'recording');b.dataset.id=v.id;b.type='button';b.setAttribute('aria-pressed','false');
      const icon=el('span',undefined,'icon');icon.innerHTML=v.synthetic?'<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="5" width="13" height="14" rx="2"/><path d="m15 9 7-3v12l-7-3z"/></svg>':'<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="3" width="20" height="15" rx="1"/><path d="M8 22h8M12 18v4"/></svg>';
      b.append(icon,el('span',v.title),el('span',time(v.duration),'duration'));const arrow=el('span');arrow.innerHTML='<svg class="chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 7 7-7 7"/></svg>';b.append(arrow);b.onclick=()=>selectVideo(v.id);$('recordings').append(b);const option=el('option',v.title);option.value=v.id;$('scope').append(option);
    }
    if(config.videos.length)selectVideo(config.videos[0].id);else{$('description').textContent='No recordings have been approved for this archive yet.';$('ask').disabled=true;}
  }catch{$('ai-status').textContent='The archive could not load. Refresh to try again.';$('ask').disabled=true;}
}
init();
