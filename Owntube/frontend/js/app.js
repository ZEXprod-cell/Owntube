(async()=>{
'use strict';
 
// ══════════════════════════════════════════
// ОСНОВНОЙ КОД (с исправлениями из ДСВ)
// ══════════════════════════════════════════
 
const Mem={
  obs:new Set(),blobs:new Set(),
  trackObs(o){this.obs.add(o);return o;},
  cleanup(){this.obs.forEach(o=>o.disconnect());this.obs.clear();this.blobs.forEach(u=>URL.revokeObjectURL(u));}
};
 
const VS={
  MAX:48,FILES:new Map(),RAM:new Map(),_sz:0,_ord:[],
  add(id,f){this.FILES.set(id,f);},
  get(id){return this.FILES.get(id)||null;},
  has(id){return this.FILES.has(id);},
  load(id){
    const f=this.get(id);if(!f)return null;
    if(f.size>50*1024*1024){const u=URL.createObjectURL(f);setTimeout(()=>URL.revokeObjectURL(u),8000);return{url:u,type:'large'};}
    if(this.RAM.has(id)){this._ord=this._ord.filter(x=>x!==id);this._ord.push(id);return{url:this.RAM.get(id),type:'small'};}
    const u=URL.createObjectURL(f);
    while(this._sz+f.size>this.MAX*1024*1024&&this._ord.length){
      const o=this._ord.shift();const ou=this.RAM.get(o);
      if(ou){URL.revokeObjectURL(ou);this._sz-=(this.get(o)||{}).size||0;this.RAM.delete(o);}
    }
    this.RAM.set(id,u);this._sz+=f.size;this._ord.push(id);return{url:u,type:'small'};
  },
  clear(){for(const u of this.RAM.values())URL.revokeObjectURL(u);this.RAM.clear();this._sz=0;this._ord=[];},
  ids(){return Array.from(this.FILES.keys());}
};
 
const IS_FF=navigator.userAgent.includes('Firefox');
const HAS_FS=!!window.showDirectoryPicker;

// ===== Векторные иконки вместо эмодзи =====
const ICONS = {
  play:     '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>',
  pause:    '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><rect x="6" y="5" width="4" height="14"/><rect x="14" y="5" width="4" height="14"/></svg>',
  prev:     '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6 8.5 6V6z"/></svg>',
  next:     '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M16 6h2v12h-2zM6 6l8.5 6L6 18z"/></svg>',
  shuffle:  '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h4l6 12h4M3 18h4l2.5-5M17 6h4M17 6l3-3M17 6l3 3M17 18l3 3M17 18l3-3"/></svg>',
  loop:     '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 2l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>',
  download: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12"/><path d="M7 10l5 5 5-5"/><path d="M5 21h14"/></svg>',
  menu:     '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 6h16M4 12h16M4 18h16"/></svg>',
  dice:     '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="1.2" fill="currentColor"/><circle cx="16" cy="8" r="1.2" fill="currentColor"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/><circle cx="8" cy="16" r="1.2" fill="currentColor"/><circle cx="16" cy="16" r="1.2" fill="currentColor"/></svg>',
  check:    '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
  // НОВЫЕ ИКОНКИ ДЛЯ ЛАЙКОВ
  like:     '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>',
  likeFilled:'<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>',
  dislike:  '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17"/></svg>',
  dislikeFilled:'<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17"/></svg>',
};
function setIcon(el, name){
  if(!el) return;
  const label = el.getAttribute('data-label');
  el.innerHTML = ICONS[name] + (label ? ` <span>${label}</span>` : '');
}
const DB_NAME='owntube_v28';
let db,curPage='home',curVidId=null,curTab='all',thumbObs=null,rendering=false;
let videoPage=0;const VIDEO_PAGE_SIZE=60;
const curVid={id:null,url:null,type:null};
let dirHandle=null;
let dynCover=localStorage.getItem('ot_dyn_cover')==='1';
let mbarVisible=false;
let tpVisible = false;
 
// ====================== SERVER INTEGRATION ======================
const SERVER_API = 'http://localhost:3001';
let serverOnline = false;
let serverLatency = 0;
let wasOffline = false;

async function fetchWithTimeout(url, opts = {}, timeoutMs = 5000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

function updatePingUI() {
  const pingEl = document.getElementById('serverPing');
  if (!pingEl) return;
  pingEl.style.color = serverOnline ? '#0f0' : '#f44';
  pingEl.textContent = serverOnline ? `● ${serverLatency}ms` : '● offline';
}

async function checkServerStatus() {
  const start = Date.now();
  try {
    const res = await fetchWithTimeout(`${SERVER_API}/health`, { cache: 'no-cache' }, 4000);
    serverOnline = res.ok;
    serverLatency = Date.now() - start;
    if (wasOffline && serverOnline) {
      videoLibCache = null; videoLibCacheAt = 0;
      musicLibCache = null; musicLibCacheAt = 0;
      renderPage();
    }
    wasOffline = !serverOnline;
    updatePingUI();
    return serverOnline;
  } catch (e) {
    serverOnline = false;
    wasOffline = true;
    updatePingUI();
    return false;
  }
}

async function fetchJsonWithRetry(url, { attempts = 3, timeouts = [8000, 15000, 25000], opts = {} } = {}) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetchWithTimeout(url, opts, timeouts[Math.min(i, timeouts.length - 1)]);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      lastErr = e;
      if (i < attempts - 1) await new Promise(r => setTimeout(r, 800 * (i + 1)));
    }
  }
  throw lastErr;
}

const LS_VIDEO_LIB_KEY = 'ot_video_lib_cache';
const LS_MUSIC_LIB_KEY = 'ot_music_lib_cache';
function saveLibToLS(key, items) {
  try { localStorage.setItem(key, JSON.stringify({ items, at: Date.now() })); } catch(e) {}
}
function loadLibFromLS(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw).items || null;
  } catch(e) { return null; }
}

// ──────────────────────────────────────────────
// БЛОК 1: IndexedDB / кэш / хэлперы хранилища
// ──────────────────────────────────────────────
function openDB(){
  return new Promise((ok,fail)=>{
    ['owntube_db','owntube_v5','owntube_v7','owntube_v8','owntube_v10','owntube_v12','owntube_v15'].forEach(n=>{try{indexedDB.deleteDatabase(n);}catch(e){}});
    const req=indexedDB.open(DB_NAME,1);
    req.onupgradeneeded=e=>{
      const d=e.target.result;
      if(!d.objectStoreNames.contains('videos')){const s=d.createObjectStore('videos',{keyPath:'id'});s.createIndex('fullName','fullName');s.createIndex('dateAdded','dateAdded');}
      if(!d.objectStoreNames.contains('handles'))d.createObjectStore('handles',{keyPath:'id'});
      if(!d.objectStoreNames.contains('tracks')){const ts=d.createObjectStore('tracks',{keyPath:'id'});ts.createIndex('artist','artist');ts.createIndex('dateAdded','dateAdded');}
    };
    req.onsuccess=e=>{db=e.target.result;ok();};
    req.onerror=e=>fail(e.target.error);
  });
}
 
const dbPut=(st,o)=>new Promise((y,n)=>{const t=db.transaction(st,'readwrite');t.objectStore(st).put(o);t.oncomplete=y;t.onerror=e=>n(e.target.error);});
const dbAll=(st)=>new Promise((y,n)=>{const t=db.transaction(st,'readonly');const r=t.objectStore(st).getAll();r.onsuccess=()=>y(r.result);r.onerror=e=>n(e.target.error);});
const dbGet=(st,k)=>new Promise((y,n)=>{const t=db.transaction(st,'readonly');const r=t.objectStore(st).get(k);r.onsuccess=()=>y(r.result);r.onerror=e=>n(e.target.error);});
const dbClear=(st)=>new Promise((y,n)=>{const t=db.transaction(st,'readwrite');t.objectStore(st).clear();t.oncomplete=y;t.onerror=e=>n(e.target.error);});
 
const TC=new Map();
const TC_MAX=30;
function cacheThumb(id,t){
  if(TC.size>=TC_MAX)TC.delete(TC.keys().next().value);
  TC.set(id,t);
}
 
const COLORS=['#e94560','#ff6b6b','#0ff','#9b59b6','#e67e22','#3498db','#1abc9c','#f1c40f','#2ecc71','#e74c3c'];
function hsh(s){let h=0;for(let i=0;i<s.length;i++)h=((h<<5)-h+s.charCodeAt(i))|0;return h;}
const fmtD=s=>(!s||isNaN(s))?'—':Math.floor(s/60)+':'+String(Math.floor(s%60)).padStart(2,'0');
const fmtSz=b=>!b?'':b<1048576?(b/1024).toFixed(0)+' КБ':b<1073741824?(b/1048576).toFixed(1)+' МБ':(b/1073741824).toFixed(2)+' ГБ';
const fmtDt=ts=>new Date(ts).toLocaleDateString('ru-RU',{day:'numeric',month:'short',year:'numeric'});
 
const _defThumbCache=new Map();
function defThumb(name){
  if(_defThumbCache.has(name))return _defThumbCache.get(name);
  const c=document.createElement('canvas');c.width=160;c.height=90;
  const x=c.getContext('2d');x.fillStyle=COLORS[Math.abs(hsh(name))%COLORS.length];x.fillRect(0,0,160,90);
  x.fillStyle='#fff';x.font='bold 36px Arial';x.textAlign='center';x.textBaseline='middle';x.fillText(name.charAt(0).toUpperCase(),80,45);
  const d=c.toDataURL('image/jpeg',.4);
  if(_defThumbCache.size>50)_defThumbCache.delete(_defThumbCache.keys().next().value);
  _defThumbCache.set(name,d);return d;
}
function isPlaceholder(d){return d&&d.startsWith('data:image/jpeg;base64,')&&d.length<9000;}
 
function showMbar(){mbarVisible=true;document.getElementById('mbar').classList.add('active');document.getElementById('mbarTab').classList.add('active');document.getElementById('mbarTab').textContent='♪';}
function hideMbar(){mbarVisible=false;document.getElementById('mbar').classList.remove('active');document.getElementById('mbarTab').classList.remove('active');}
function toggleMbar(){if(mbarVisible)hideMbar();else showMbar();}
 
async function genThumb(id){
  const v=await dbGet('videos',id);if(!v)return null;
  const file=VS.get(id);if(!file)return null;
  return new Promise(res=>{
    const vid=document.createElement('video');vid.muted=true;vid.playsInline=true;vid.preload='metadata';
    const url=URL.createObjectURL(file);vid.src=url;let done=false;
    const fin=(d,iv=false)=>{if(done)return;done=true;URL.revokeObjectURL(url);vid.src='';vid.load();res({data:d||defThumb(v.name),vertical:iv});};
    const cap=()=>{try{const w=vid.videoWidth,h=vid.videoHeight;if(!w||!h){fin(null);return;}const iv=h>w*1.33;const c=document.createElement('canvas');c.width=iv?120:220;c.height=iv?220:124;c.getContext('2d').drawImage(vid,0,0,c.width,c.height);fin(c.toDataURL('image/jpeg',.6),iv);}catch(e){fin(null);}};
    vid.onloadeddata=()=>{const s=Math.min(vid.duration*.1,1);vid.currentTime=isFinite(s)&&s>0?s:.01;};
    vid.onseeked=cap;vid.onloadedmetadata=()=>{if(!vid.duration||!isFinite(vid.duration))vid.currentTime=.01;};
    vid.onerror=()=>fin(null);setTimeout(()=>{if(!done)fin(null);},12000);
  });
}
async function updateThumb(id){
  const r=await genThumb(id);
  if(r?.data){const rec=await dbGet('videos',id);if(rec){rec.thumbnail=r.data;if(r.vertical!==undefined)rec.vertical=r.vertical;await dbPut('videos',rec);cacheThumb(id,r.data);const img=document.getElementById('thumb-'+id);if(img)img.src=r.data;return true;}}
  return false;
}
async function regenAll(){
  const all=await dbAll('videos');const pgb=document.getElementById('pgb');let n=0;
  const rel=all.filter(v=>VS.has(v.id));if(!rel.length){alert('Нет подключённых видео.');return;}
  for(const v of rel){if(await updateThumb(v.id))n++;pgb.style.transform=`scaleX(${n/rel.length})`;await new Promise(r=>setTimeout(r,80));}
  pgb.style.transform='scaleX(0)';alert(`Перегенерировано: ${n}`);await renderPage();
}
async function regenMissing(){
  const all=await dbAll('videos');
  const missing=all.filter(v=>isPlaceholder(v.thumbnail)&&VS.has(v.id));
  for(let i=0;i<missing.length;i++){
    await updateThumb(missing[i].id);
    if(i%5===4)await new Promise(r=>setTimeout(r,200));
  }
}
 
 
// ──────────────────────────────────────────────
// БЛОК 2: Работа с папками (видео), сканирование, импорт/экспорт
// ──────────────────────────────────────────────
async function scanFolder(handle){
  const pgb=document.getElementById('pgb');const files=[];
  async function walk(d){for await(const e of d.values()){if(e.kind==='file'){const f=await e.getFile();if(/\.(mp4|webm|ogg|mkv|avi|mov|m4v|flv)$/i.test(f.name))files.push(f);}else if(e.kind==='directory')await walk(e);}}
  await walk(handle);if(!files.length)return 0;
  const ex=await dbAll('videos');const em=new Map();ex.forEach(v=>em.set(v.relativePath,v));
  let n=0;
  for(let i=0;i<files.length;i++){
    const f=files[i];pgb.style.transform=`scaleX(${(i+1)/files.length})`;
    const rp=f.webkitRelativePath||f.name;
    if(em.has(rp)){VS.add(em.get(rp).id,f);continue;}
    const id=crypto.randomUUID();
    await dbPut('videos',{id,name:f.name.replace(/\.[^/.]+$/,''),fullName:f.name,relativePath:rp,size:f.size,vertical:false,thumbnail:defThumb(f.name),dateAdded:Date.now(),duration:0});
    VS.add(id,f);updateThumb(id);n++;
  }
  await dbPut('handles',{id:'folder',handle});dirHandle=handle;pgb.style.transform='scaleX(0)';return n;
}
 
async function onFolderSel(e){
  const files=e.target?Array.from(e.target.files||[]):Array.from(e.dataTransfer?.files||[]);
  const vids=files.filter(f=>/\.(mp4|webm|ogg|mkv|avi|mov|m4v|flv)$/i.test(f.name));if(!vids.length)return;
  const pgb=document.getElementById('pgb');const ex=await dbAll('videos');const em=new Map();ex.forEach(v=>em.set(v.relativePath,v));
  let n=0;
  for(let i=0;i<vids.length;i++){
    const f=vids[i];pgb.style.transform=`scaleX(${(i+1)/vids.length})`;
    const rp=f.webkitRelativePath||f.name;
    if(em.has(rp)){VS.add(em.get(rp).id,f);continue;}
    const id=crypto.randomUUID();
    await dbPut('videos',{id,name:f.name.replace(/\.[^/.]+$/,''),fullName:f.name,relativePath:rp,size:f.size,vertical:false,thumbnail:defThumb(f.name),dateAdded:Date.now(),duration:0});
    VS.add(id,f);updateThumb(id);n++;
  }
  pgb.style.transform='scaleX(0)';if(e.target)e.target.value='';updateNotice();await renderPage();
}
 
async function connectFolder(){
  if(!useLocalFolders) return;
  if(HAS_FS){try{const h=await window.showDirectoryPicker();await scanFolder(h);updateNotice();await renderPage();return;}catch(e){if(e.name==='AbortError'||e.name==='SecurityError')return;}}
  document.getElementById('folderInput').click();
}
 
async function restoreHandle(){
  if(!useLocalFolders) return false;
  if(!HAS_FS)return false;
  const rec=await dbGet('handles','folder');if(!rec?.handle?.requestPermission)return false;
  try{if(await rec.handle.requestPermission({mode:'read'})!=='granted')return false;}catch(e){return false;}
  dirHandle=rec.handle;const all=await dbAll('videos');const im=new Map();all.forEach(v=>im.set(v.relativePath,v));
  const pgb=document.getElementById('pgb');let n=0;
  async function walk(d){for await(const e of d.values()){if(e.kind==='file'){const f=await e.getFile();const r=im.get(f.webkitRelativePath||f.name);if(r){VS.add(r.id,f);n++;pgb.style.transform=`scaleX(${n/all.length})`;}}else if(e.kind==='directory')await walk(e);}}
  await walk(rec.handle);pgb.style.transform='scaleX(0)';return true;
}
 
async function buildJson(){return(await dbAll('videos')).map(v=>({id:v.id,name:v.name,fullName:v.fullName,relativePath:v.relativePath,size:v.size,vertical:v.vertical,duration:v.duration,dateAdded:v.dateAdded}));}
async function exportJson(){const b=new Blob([JSON.stringify(await buildJson(),null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download='owntube_library.json';a.click();}
async function importJson(file){
  const data=JSON.parse(await file.text());if(!Array.isArray(data))return;
  const ex=await dbAll('videos');const em=new Map();ex.forEach(v=>em.set(v.relativePath,v));
  for(const item of data){if(!item.relativePath||em.has(item.relativePath))continue;await dbPut('videos',{id:item.id||crypto.randomUUID(),name:item.name||item.fullName.replace(/\.[^/.]+$/,''),fullName:item.fullName||item.name,relativePath:item.relativePath,size:item.size||0,vertical:item.vertical||false,thumbnail:defThumb(item.fullName||item.name),dateAdded:item.dateAdded||Date.now(),duration:0});}
  await renderPage();
}
 
 
// ──────────────────────────────────────────────
// БЛОК 3: Рендер страниц / навигация / плеер видео
// ──────────────────────────────────────────────
function updateNotice(){}
 
function initObs(){
  if(thumbObs)return;
  thumbObs=Mem.trackObs(new IntersectionObserver(entries=>{
    for(const e of entries){if(!e.isIntersecting)continue;const id=e.target.dataset.id;if(id&&!TC.has(id)&&VS.has(id))updateThumb(id);thumbObs.unobserve(e.target);}
  },{rootMargin:'250px'}));
}
 
function orderedHome(list){
  const h=list.filter(v=>!v.vertical).sort((a,b)=>b.dateAdded-a.dateAdded);
  const v=list.filter(v=>v.vertical).sort((a,b)=>b.dateAdded-a.dateAdded);
  const r=[];let hi=0,vi=0;
  while(hi<h.length||vi<v.length){for(let i=0;i<5&&hi<h.length;i++,hi++)r.push(h[hi]);for(let i=0;i<9&&vi<v.length;i++,vi++)r.push(v[vi]);}
  return r;
}
 
const LIB_CACHE_TTL = 60000;
let videoLibCache = null;
let videoLibCacheAt = 0;
async function fetchVideoLibrary() {
  const now = Date.now();
  if (videoLibCache && (now - videoLibCacheAt) < LIB_CACHE_TTL) return videoLibCache;
  if (!serverOnline) return videoLibCache || loadLibFromLS(LS_VIDEO_LIB_KEY) || [];
  try {
    const data = await fetchJsonWithRetry(`${SERVER_API}/library/video`);
    videoLibCache = (data.items && Array.isArray(data.items)) ? data.items : [];
    videoLibCacheAt = now;
    saveLibToLS(LS_VIDEO_LIB_KEY, videoLibCache);
    return videoLibCache;
  } catch(e) {
    console.warn('fetchVideoLibrary failed:', e.message);
    serverOnline = false; updatePingUI();
    return videoLibCache || loadLibFromLS(LS_VIDEO_LIB_KEY) || [];
  }
}

async function renderPage(){
  if(curPage==='music'){showMusicPage();return;}
  if(curPage==='downloader'){showDlPage();return;}
  if(rendering)return;rendering=true;
  try{
    if(curVidId){rendering=false;return;}
    const g=document.getElementById('vg');g.replaceChildren();
    const q=document.getElementById('searchIn').value;
    let list=await dbAll('videos');const isSrc=!!q;
    const localVFp=new Set(list.filter(v=>VS.has(v.id)).map(v=>`${(v.fullName||v.name||'').toLowerCase()}|${v.size||0}`));
 
    if (serverOnline) {
      try {
        const rawItems = await fetchVideoLibrary();
        rawItems.forEach(raw => {
          const fp=`${(raw.fullName||raw.name||'').toLowerCase()}|${raw.size||0}`;
          if(localVFp.has(fp))return;
          const it = { ...raw };
          const id = 'srv-v-' + Math.abs(hsh(it.relativePath)).toString(36);
          it.id = id;
          it.isServer = true;
          it.streamUrl = SERVER_API + raw.streamUrl;
          it.name = it.name || it.fullName || 'Серверное видео';
          it.dateAdded = it.mtime || Date.now();
          serverVideoMap.set(id, it);
          list.unshift(it);
        });
      } catch(e){ console.warn('Server video failed', e); }
    }
 
    if(q){const ql=q.toLowerCase();list=list.filter(v=> (v.name||'').toLowerCase().includes(ql));}
    if(curTab==='vert'||curPage==='vertical'){
      g.innerHTML='<div class="not-found"><h3>Определяем ориентацию видео...</h3></div>';
      await ensureServerOrientations(list);
    }
    if(curTab==='vert')list=list.filter(v=>v.vertical);
    else if(curTab==='horiz')list=list.filter(v=>!v.vertical);
    if(curPage==='vertical')list=list.filter(v=>v.vertical);
    if(curPage==='history'){const h=JSON.parse(localStorage.getItem('ot_hist')||'[]');list=h.map(id=>list.find(v=>v.id===id)).filter(Boolean);}
 
    if(!isSrc)list.sort((a,b)=>b.dateAdded-a.dateAdded);
    if(curPage==='home'&&curTab==='all'&&!isSrc)list=fisherYates(orderedHome(list));
 
    const total = (await dbAll('videos')).length;
    if(total === 0 && !serverOnline){
      g.innerHTML=`<div class="welcome"><h2>Сервер недоступен</h2><p>Проверьте, что backend запущен на :3001</p></div>`;
      return;
    }
    if(!list.length){g.innerHTML=`<div class="not-found"><h3>Ничего не найдено</h3><p>Попробуйте изменить запрос</p></div>`;return;}

    if(curPage==='home'&&curTab==='all')list=list.filter(v=>!v.vertical);

    initObs();
    const hist=JSON.parse(localStorage.getItem('ot_hist')||'[]');
    for(const v of list){
      const card=document.createElement('div');card.className='vc'+(v.vertical?' vert':'');card.dataset.id=v.id;card.onclick=()=>openVid(v.id);
      const thumb=TC.get(v.id)||v.thumbnail||defThumb(v.name);
      const badge=v.isServer ? `<div class="ct-badge ok">● сервер</div>` : (VS.has(v.id)?`<div class="ct-badge ok">● подключено</div>`:'');
      const ri=hist.includes(v.id)?`<div class="replay-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.67"/></svg></div>`:'';
      card.innerHTML=`<div class="ct${v.vertical?' vert':''}"><img src="${thumb}" alt="${v.name}" loading="lazy" id="thumb-${v.id}"><div class="cd">${fmtD(v.duration)}</div>${badge}${ri}</div><div class="ci"><div class="cit">${v.name}</div><div class="cm">${fmtSz(v.size)} • ${fmtDt(v.dateAdded)}</div></div>`;
      const ric=card.querySelector('.replay-icon');if(ric)ric.addEventListener('click',e=>{e.stopPropagation();openVid(v.id);});
      g.appendChild(card);if(thumbObs)thumbObs.observe(card);
    }
  }finally{rendering=false;}
}
 
function showDlPage(){
  curPage='downloader';
  document.getElementById('mainC').style.display='none';
  if (curVidId) {
    const p = document.getElementById('player');
    p.pause(); p.src = '';
    document.getElementById('endScreen').classList.remove('show');
    curVidId = null;
  }
  document.getElementById('vp').classList.remove('on');
  document.getElementById('musicPage').classList.remove('on');
  document.getElementById('dlPage').classList.add('on');
  document.getElementById('searchIn').placeholder='Поиск...';
}
function hideDlPage(){
  document.getElementById('dlPage').classList.remove('on');
}
 
async function openVid(id) {
  let v, url;

  let localV = await dbGet('videos', id);
  if (localV) {
    const file = VS.get(id);
    if (!file) { alert('Файл не подключён.'); return; }
    const res = VS.load(id);
    if (!res) return;
    v = localV;
    url = res.url;
  } else {
    const serverItem = serverVideoMap.get(id);
    if (serverItem) {
      v = {
        name: serverItem.name,
        isServer: true,
        duration: serverItem.duration || 0,
        size: serverItem.size || 0,
        dateAdded: serverItem.dateAdded || Date.now()
      };
      url = serverItem.streamUrl;
    } else {
      alert('Видео не найдено');
      return;
    }
  }

  curVidId = id;
  curVid.id = id;
  curVid.url = url;
  curVid.type = 'large';
  document.getElementById('mainC').style.display = 'none';
  document.getElementById('musicPage').classList.remove('on');
  document.getElementById('dlPage').classList.remove('on');
  document.getElementById('vp').classList.add('on');
  document.getElementById('vp').classList.toggle('vp-vertical', !!v.vertical);
  document.getElementById('vpTitle').textContent = v.name;
  document.getElementById('vpDur').textContent = '' + fmtD(v.duration || 0);
  document.getElementById('vpSize').textContent = '' + fmtSz(v.size || 0);
  document.getElementById('vpDate').textContent = '' + fmtDt(v.dateAdded || Date.now());
  const player = document.getElementById('player');
  player.src = '';
  player.src = url;
  player.preload = 'auto';
  player.play().catch(() => {});
  document.getElementById('endScreen').classList.remove('show');
  const hist = JSON.parse(localStorage.getItem('ot_hist') || '[]');
  const idx = hist.indexOf(id);
  if (idx !== -1) hist.splice(idx, 1);
  hist.unshift(id);
  if (hist.length > 100) hist.length = 100;
  localStorage.setItem('ot_hist', JSON.stringify(hist));
  renderRec(id);
  loadCmts(id);
}
 
async function switchVid(id){
  const player=document.getElementById('player');player.pause();player.src='';
  document.getElementById('endScreen').classList.remove('show');
  if(curVid.type==='large'&&curVid.url){URL.revokeObjectURL(curVid.url);curVid.url=null;curVid.type=null;}
  curVidId=null;await openVid(id);
}
 
async function showEnd(){
  const all=[...await dbAll('videos'),...serverVideoMap.values()];
  const recs=fisherYates(all.filter(v=>v.id!==curVidId)).slice(0,6);
  const grid=document.getElementById('endGrid');grid.innerHTML='';
  for(const v of recs){
    const t=v.isServer?(v.coverUrl||defThumb(v.name)):(TC.get(v.id)||v.thumbnail||defThumb(v.name));
    const d=document.createElement('div');d.className='end-card';
    d.innerHTML=`<img src="${t}" onerror="this.src='${defThumb(v.name)}'"><h4>${v.name}</h4>`;
    d.onclick=()=>{document.getElementById('endScreen').classList.remove('show');switchVid(v.id);};
    grid.appendChild(d);
  }
  document.getElementById('endScreen').classList.add('show');
}
 
async function renderRec(ex){
  const all=[...await dbAll('videos'),...serverVideoMap.values()];
  const recs=fisherYates(all.filter(v=>v.id!==ex)).slice(0,10);
  const rl=document.getElementById('recList');rl.innerHTML='';
  for(const v of recs){
    const t=v.isServer?(v.coverUrl||defThumb(v.name)):(TC.get(v.id)||v.thumbnail||defThumb(v.name));
    const d=document.createElement('div');d.className='rc';
    d.innerHTML=`<img class="rc-thumb" src="${t}" onerror="this.src='${defThumb(v.name)}'"><div class="ri"><h4>${v.name}</h4><p>${v.vertical?'↕':'↔'} ${fmtSz(v.size)}</p></div>`;
    d.onclick=()=>switchVid(v.id);rl.appendChild(d);
  }
}
 
function loadCmts(id){
  const data=JSON.parse(localStorage.getItem('ot_cmt_'+id)||'[]');
  document.getElementById('cmtList').innerHTML=data.length
    ?data.map(x=>`<div class="cmt"><div class="cmt-av" style="background:${COLORS[Math.abs(hsh(x.user))%COLORS.length]}">${x.user[0].toUpperCase()}</div><div class="cmt-body"><div class="cmt-hdr"><strong>${x.user}</strong><small>${new Date(x.date).toLocaleString('ru-RU')}</small></div><div class="cmt-txt">${x.text}</div></div></div>`).join('')
    :'<p style="color:var(--t2)">Нет комментариев</p>';
}
function addCmt(){
  const inp=document.getElementById('cmtIn');const text=inp.value.trim();if(!text||!curVidId)return;
  const user=localStorage.getItem('ot_user')||'Аноним';
  const cmts=JSON.parse(localStorage.getItem('ot_cmt_'+curVidId)||'[]');cmts.push({user,text,date:Date.now()});
  localStorage.setItem('ot_cmt_'+curVidId,JSON.stringify(cmts));inp.value='';loadCmts(curVidId);
}
 
function resetApp(skipRender=false){
  hideMusicPage();
  hideDlPage();
  tpVisible = false;
  if(curVidId){
    const p=document.getElementById('player');p.pause();p.src='';
    document.getElementById('vp').classList.remove('on');
    document.getElementById('endScreen').classList.remove('show');
    curVidId=null;
  }
  if(curVid.type==='large'&&curVid.url)URL.revokeObjectURL(curVid.url);
  curVid.url=null;curVid.type=null;curVid.id=null;
  VS.clear();Mem.cleanup();thumbObs=null;
  document.getElementById('mainC').style.display='';
  curPage='home';
  document.querySelectorAll('.si').forEach(x=>x.classList.remove('on'));
  document.querySelector('[data-p="home"]').classList.add('on');
  document.getElementById('searchIn').value='';
  document.getElementById('searchIn').placeholder='Поиск видео...';
  if(!skipRender)renderPage();
}
 
function showMusicPage(q=''){
  const panelWasVisible = tpVisible;
  resetApp(true);
  curPage='music';
  curVidId=null;
  document.querySelectorAll('.si').forEach(item=>item.classList.toggle('on',item.dataset.p==='music'));
  document.getElementById('mainC').style.display='none';
  document.getElementById('vp').classList.remove('on');
  document.getElementById('dlPage').classList.remove('on');
  document.getElementById('musicPage').classList.add('on');
  document.getElementById('searchIn').placeholder='Поиск по названию, исполнителю или альбому...';
  if(panelWasVisible && MP.queue.length){
    const panel = document.getElementById('trackPanel');
    panel.classList.add('show');
    panel.classList.remove('collapsed');
    tpVisible = true;
  }
  renderMusicPage('artists', null, null, q || document.getElementById('searchIn').value.trim());
}
function hideMusicPage(){
  document.getElementById('musicPage').classList.remove('on');
  if(!curVidId)document.getElementById('mainC').style.display='';
  if(curPage==='music')curPage='home';
  for(const u of coverCache.values())URL.revokeObjectURL(u);
  coverCache.clear();
}
 
 
// ──────────────────────────────────────────────
// БЛОК 4: Обработчики событий UI (клики, поиск)
// ──────────────────────────────────────────────
function fmtTime(s){
  if(!isFinite(s)||s<0)s=0;
  s=Math.floor(s);
  const h=Math.floor(s/3600),m=Math.floor((s%3600)/60),sec=s%60;
  const mm=h>0?String(m).padStart(2,'0'):m;
  return (h>0?h+':':'')+mm+':'+String(sec).padStart(2,'0');
}
function initPlayerControls(){
  const player=document.getElementById('player');
  const pb=player.closest('.pb');
  const pc=document.getElementById('playerControls');
  const progress=document.getElementById('pcProgress');
  const buf=document.getElementById('pcBuf');
  const played=document.getElementById('pcPlayed');
  const dot=document.getElementById('pcDot');
  const btnPlay=document.getElementById('pcPlay');
  const icPlay=btnPlay.querySelector('.ic-play');
  const icPause=btnPlay.querySelector('.ic-pause');
  const btnVol=document.getElementById('pcVol');
  const volSlider=document.getElementById('pcVolSlider');
  const timeEl=document.getElementById('pcTime');
  const btnPip=document.getElementById('pcPip');
  const btnFs=document.getElementById('pcFs');

  let hideTimer=null;
  function showControls(){
    pc.classList.add('show');
    pb.classList.remove('no-cursor');
    clearTimeout(hideTimer);
    if(!player.paused){
      hideTimer=setTimeout(()=>{
        pc.classList.remove('show');
        pb.classList.add('no-cursor');
      },2500);
    }
  }
  pb.addEventListener('mousemove',showControls);
  pb.addEventListener('mouseleave',()=>{if(!player.paused){pc.classList.remove('show');}});
  pc.addEventListener('mousemove',e=>e.stopPropagation());

  function updatePlayIcon(){
    icPlay.style.display=player.paused?'':'none';
    icPause.style.display=player.paused?'none':'';
  }
  function togglePlay(){player.paused?player.play().catch(()=>{}):player.pause();}
  btnPlay.onclick=togglePlay;
  player.addEventListener('click',togglePlay);
  player.addEventListener('play',()=>{updatePlayIcon();showControls();});
  player.addEventListener('pause',()=>{updatePlayIcon();pc.classList.add('show');pb.classList.remove('no-cursor');clearTimeout(hideTimer);});

  player.addEventListener('timeupdate',()=>{
    const pct=player.duration?player.currentTime/player.duration*100:0;
    played.style.width=pct+'%';
    dot.style.left=pct+'%';
    timeEl.textContent=`${fmtTime(player.currentTime)} / ${fmtTime(player.duration)}`;
  });
  player.addEventListener('progress',()=>{
    if(player.buffered.length&&player.duration){
      const end=player.buffered.end(player.buffered.length-1);
      buf.style.width=(end/player.duration*100)+'%';
    }
  });

  let seeking=false;
  function seekTo(e){
    const r=progress.getBoundingClientRect();
    const pct=Math.min(1,Math.max(0,(e.clientX-r.left)/r.width));
    if(player.duration)player.currentTime=pct*player.duration;
  }
  progress.addEventListener('mousedown',e=>{seeking=true;seekTo(e);});
  window.addEventListener('mousemove',e=>{if(seeking)seekTo(e);});
  window.addEventListener('mouseup',()=>{seeking=false;});
  progress.addEventListener('click',seekTo);

  function updateVolIcon(){
    btnVol.innerHTML = (player.muted||player.volume===0)
      ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M16.5 12A4.5 4.5 0 0 0 14 8v8a4.5 4.5 0 0 0 2.5-4zM19 12c0 1.19-.29 2.31-.8 3.3l1.5 1.5A8.9 8.9 0 0 0 21 12a8.9 8.9 0 0 0-1.3-4.8l-1.5 1.5c.51.99.8 2.11.8 3.3zM3 10v4h4l5 5V5L7 10H3z"/></svg>'
      : '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M3 10v4h4l5 5V5L7 10H3z"/></svg>';
  }
  btnVol.onclick=()=>{player.muted=!player.muted;updateVolIcon();};
  volSlider.oninput=()=>{player.volume=+volSlider.value;player.muted=player.volume===0;updateVolIcon();};
  player.addEventListener('volumechange',()=>{volSlider.value=player.muted?0:player.volume;updateVolIcon();});

  btnPip.onclick=async()=>{
    try{
      if(document.pictureInPictureElement){await document.exitPictureInPicture();}
      else{await player.requestPictureInPicture();}
    }catch(e){console.warn('PIP не поддерживается',e);}
  };
  if(!('pictureInPictureEnabled' in document))btnPip.style.display='none';

  btnFs.onclick=()=>{
    if(document.fullscreenElement){document.exitFullscreen();}
    else{pb.requestFullscreen().catch(()=>{});}
  };

  document.addEventListener('keydown',e=>{
    if(!document.getElementById('vp').classList.contains('on'))return;
    if(['INPUT','TEXTAREA'].includes(document.activeElement.tagName))return;
    if(e.code==='Space'){e.preventDefault();togglePlay();showControls();}
    else if(e.code==='ArrowRight'){player.currentTime=Math.min(player.duration||0,player.currentTime+5);showControls();}
    else if(e.code==='ArrowLeft'){player.currentTime=Math.max(0,player.currentTime-5);showControls();}
    else if(e.code==='KeyF'){btnFs.click();}
    else if(e.code==='KeyM'){btnVol.click();}
  });

  updatePlayIcon();updateVolIcon();
  showControls();
}

function initEvents(){
  document.getElementById('exportBtn').onclick=exportJson;
  document.getElementById('importBtn').onclick=()=>document.getElementById('jsonInput').click();
  document.getElementById('jsonInput').onchange=async e=>{if(e.target.files.length){await importJson(e.target.files[0]);e.target.value='';}};
  document.getElementById('regenerateThumbsBtn').onclick=regenAll;
 
  document.getElementById('settingsBtn').onclick=()=>{
    document.getElementById('toggleDynCover').checked=dynCover;
    buildJson().then(d=>{document.getElementById('jsonPreview').textContent=JSON.stringify(d,null,2);});
    document.getElementById('setMo').classList.add('on');
  };
 
  document.getElementById('searchBtn').onclick=()=>{
    const q=document.getElementById('searchIn').value.trim();
    if(curPage==='music')renderMusicPage('artists', null, null, q);
    else if(curPage==='downloader'){}
    else renderPage();
  };
 
  document.getElementById('logoBtn').onclick=()=>resetApp(false);
 
  document.getElementById('cmtBtn').onclick=addCmt;
  document.getElementById('cmtIn').addEventListener('keypress',e=>{if(e.key==='Enter')addCmt();});
 
  const player=document.getElementById('player');
  player.addEventListener('ended',showEnd);
  player.addEventListener('play',()=>document.getElementById('endScreen').classList.remove('show'));
  player.addEventListener('seeked',()=>{if(player.currentTime<player.duration)document.getElementById('endScreen').classList.remove('show');});
 
  document.querySelectorAll('.si').forEach(el => {
    el.addEventListener('click', () => {
      const page = el.dataset.p;
      if (!page) return;
 
      document.querySelectorAll('.si,.snav').forEach(e => e.classList.remove('on'));
      el.classList.add('on');
 
      curPage = page;
 
      document.getElementById('mainC').style.display = (page === 'home' || page === 'vertical' || page === 'history') ? 'block' : 'none';
      if (curVidId) {
        const p = document.getElementById('player');
        p.pause(); p.src = '';
        document.getElementById('endScreen').classList.remove('show');
        curVidId = null;
      }
      document.getElementById('vp').classList.remove('on');
      document.getElementById('musicPage').classList.toggle('on', page === 'music');
      document.getElementById('dlPage').classList.toggle('on', page === 'downloader');
 
      if (page === 'music') {
        showMusicPage();
      } else if (page === 'downloader') {
        showDlPage();
      } else {
        renderPage();
      }
    });
  });
 
  document.querySelectorAll('.tab').forEach(el=>{
    el.addEventListener('click',()=>{document.querySelectorAll('.tab').forEach(x=>x.classList.remove('on'));el.classList.add('on');curTab=el.dataset.f;videoPage=0;renderPage();});
  });
 
  document.getElementById('setMo').addEventListener('click',e=>{if(e.target===e.currentTarget)e.target.classList.remove('on');});
  document.getElementById('closeModal').onclick=()=>document.getElementById('setMo').classList.remove('on');
  document.getElementById('toggleDynCover').addEventListener('change',e=>{dynCover=e.target.checked;localStorage.setItem('ot_dyn_cover',dynCover?'1':'0');});
 
  document.getElementById('clearBtn').onclick=async()=>{
    if(!confirm('Удалить ВСЕ данные?'))return;
    await dbClear('videos');await dbClear('handles');await dbClear('tracks');
    VS.FILES.clear();VS.RAM.clear();TC.clear();dirHandle=null;resetApp(false);
  };
 
  document.getElementById('mbarTab').onclick=toggleMbar;
}
 
function initSearch(){
  const inp = document.getElementById('searchIn');
  
  inp.addEventListener('input', () => {
    const q = inp.value.trim();
    
    if (curPage === 'music') {
      if (q) {
        renderMusicPage('tracks_all', null, null, q);
      } else {
        if (MS.artist && MS.album) {
          renderMusicPage('tracks', MS.artist, MS.album);
        } else if (MS.artist) {
          renderMusicPage('albums', MS.artist);
        } else {
          renderMusicPage('artists');
        }
      }
    } else if (curPage !== 'downloader') {
      videoPage=0;renderPage();
    }
  });
 
  inp.addEventListener('keypress', e => {
    if (e.key !== 'Enter') return;
    const q = inp.value.trim();
    if (curPage === 'music') {
      renderMusicPage(q ? 'artists' : MS.mode, MS.artist, MS.album, q);
    } else if (curPage !== 'downloader') {
      videoPage=0;renderPage();
    }
  });
}
 
 
// ══════════════════════════════════════════════════════════════
// БЛОК 5: МУЗЫКАЛЬНЫЙ МОДУЛЬ (ID3, плеер, библиотека, панель трека, эквалайзер)
// ══════════════════════════════════════════════════════════════
const MusicStore={FILES:new Map(),add(id,f){this.FILES.set(id,f);},get(id){return this.FILES.get(id)||null;},has(id){return this.FILES.has(id);}};
const coverCache=new Map();
const MAX_COVER_CACHE=40;

function getCover(t) {
  if (!t) return null;
  if (t.coverUrl) return t.coverUrl.startsWith('/') ? (SERVER_API + t.coverUrl) : t.coverUrl;
  if (t.coverData && t.coverData.byteLength) {
    if (coverCache.has(t.id)) return coverCache.get(t.id);
    if (coverCache.size >= MAX_COVER_CACHE) {
      const firstKey = coverCache.keys().next().value;
      const oldUrl = coverCache.get(firstKey);
      if (oldUrl) URL.revokeObjectURL(oldUrl);
      coverCache.delete(firstKey);
    }
    try {
      const u = URL.createObjectURL(new Blob([t.coverData], { type: t.coverMime || 'image/jpeg' }));
      coverCache.set(t.id, u);
      return u;
    } catch(e) { return null; }
  }
  return null;
}

function getAlbumCover(tracks) {
  if (!tracks || !tracks.length) return null;
  const sorted = [...tracks].sort((a, b) => effectiveTrackNumber(a) - effectiveTrackNumber(b));
  for (const t of sorted) {
    const cu = getCover(t);
    if (cu) return cu;
  }
  return null;
}

const streamCoverCache = new Map();
async function fetchCoverFromStream(streamUrl) {
  if (!streamUrl) return null;
  if (streamCoverCache.has(streamUrl)) return streamCoverCache.get(streamUrl);
  try {
    const res = await fetchWithTimeout(streamUrl, { headers: { Range: 'bytes=0-1048575' } }, 10000);
    if (!res.ok && res.status !== 206) {
      console.warn('[cover] сервер отказал', streamUrl, res.status);
      streamCoverCache.set(streamUrl, null); return null;
    }
    const blob = await res.blob();
    const file = new File([blob], 'chunk.mp3', { type: blob.type || 'audio/mpeg' });
    const tags = await parseID3(file);
    if (tags.coverData && tags.coverData.byteLength) {
      const u = URL.createObjectURL(new Blob([tags.coverData], { type: tags.coverMime || 'image/jpeg' }));
      streamCoverCache.set(streamUrl, u);
      console.log('[cover] найдена обложка в ID3', streamUrl);
      return u;
    }
    console.warn('[cover] ID3 без обложки (APIC) в первом мегабайте', streamUrl);
    streamCoverCache.set(streamUrl, null);
    return null;
  } catch (e) {
    console.warn('[cover] ошибка запроса', streamUrl, e);
    streamCoverCache.set(streamUrl, null);
    return null;
  }
}

async function getAlbumCoverAsync(tracks) {
  if (!tracks || !tracks.length) return null;
  const sorted = [...tracks].sort((a, b) => effectiveTrackNumber(a) - effectiveTrackNumber(b));
  for (const t of sorted) {
    const cu = getCover(t);
    if (cu) return cu;
  }
  console.log('[cover] обложек нет ни у одного трека, пробуем вытянуть из потока', sorted.map(t=>({id:t.id,isServer:t.isServer,streamUrl:t.streamUrl})));
  for (const t of sorted) {
    if (t.isServer && t.streamUrl) {
      const cu = await fetchCoverFromStream(t.streamUrl);
      if (cu) return cu;
    }
  }
  return null;
}

function remUnsync(d){const o=new Uint8Array(d.length);let j=0;for(let i=0;i<d.length;i++){if(d[i]===0xFF&&i+1<d.length&&d[i+1]===0x00){o[j++]=0xFF;i++;}else o[j++]=d[i];}return o.slice(0,j);}
function readStr(d,enc){try{if(enc===1||enc===2){const le=d.length>=2&&d[0]===0xFF&&d[1]===0xFE;const be=!le&&d.length>=2&&d[0]===0xFE&&d[1]===0xFF;return new TextDecoder(le?'utf-16le':'utf-16be').decode(d.slice(le||be?2:0)).replace(/\0/g,'');}return(enc===3?new TextDecoder('utf-8'):new TextDecoder('iso-8859-1')).decode(d).replace(/\0/g,'');}catch(e){return'';}}
function gMime(b){if(b[0]===0xFF&&b[1]===0xD8)return'image/jpeg';if(b[0]===0x89&&b[1]===0x50)return'image/png';return'image/jpeg';}
async function parseID3(file){
  const r={title:null,artist:null,album:null,trackNumber:null,coverData:null,coverMime:null};
  try{
    const hb=await file.slice(0,10).arrayBuffer();const h=new Uint8Array(hb);
    if(!(h[0]===0x49&&h[1]===0x44&&h[2]===0x33))return r;
    const ver=h[3];const flags=h[5];const hasU=!!(flags&0x80);const hasE=!!(flags&0x40);
    const ss=(b0,b1,b2,b3)=>((b0&0x7f)<<21)|((b1&0x7f)<<14)|((b2&0x7f)<<7)|(b3&0x7f);
    const tagSz=ss(h[6],h[7],h[8],h[9]);
    const fb=await file.slice(0,Math.min(10+tagSz,5*1024*1024)).arrayBuffer();
    let data=new Uint8Array(fb);let off=10;
    if(hasE){let es=ver>=4?ss(data[off],data[off+1],data[off+2],data[off+3]):((data[off]<<24)|(data[off+1]<<16)|(data[off+2]<<8)|data[off+3]);off+=es+4;}
    const end=Math.min(10+tagSz,data.length);let raw=data.slice(off,end);if(hasU)raw=remUnsync(raw);
    const dl=new TextDecoder('iso-8859-1');let pos=0;
    while(pos<raw.length-10){
      const id=String.fromCharCode(raw[pos],raw[pos+1],raw[pos+2],raw[pos+3]);if(id.charCodeAt(0)===0)break;
      let sz=ver>=4?ss(raw[pos+4],raw[pos+5],raw[pos+6],raw[pos+7]):((raw[pos+4]<<24)|(raw[pos+5]<<16)|(raw[pos+6]<<8)|raw[pos+7]);
      if(sz<=0||pos+10+sz>raw.length)break;
      const fd=raw.slice(pos+10,pos+10+sz);const enc=fd[0]||0;
      if(id==='TIT2'&&!r.title)r.title=readStr(fd.slice(1),enc);
      else if(id==='TPE1'&&!r.artist)r.artist=readStr(fd.slice(1),enc);
      else if(id==='TALB'&&!r.album)r.album=readStr(fd.slice(1),enc);
      else if((id==='TRCK'||id==='TPOS')&&r.trackNumber===null){const n=parseInt(readStr(fd.slice(1),enc).split('/')[0]);if(!isNaN(n))r.trackNumber=n;}
      else if((id==='APIC'||id==='PIC')&&!r.coverData){let p=1;let ms=p;while(p<fd.length&&fd[p]!==0)p++;let mime=dl.decode(fd.slice(ms,p));p++;if(id==='APIC'){p++;while(p<fd.length&&fd[p]!==0)p++;p++;}if(p<fd.length){r.coverData=new Uint8Array(fd.slice(p)).buffer.slice(0);r.coverMime=(mime&&mime.startsWith('image/'))?mime:gMime(new Uint8Array(r.coverData));}}
      pos+=10+sz;
    }
  }catch(e){}return r;
}
 
const MP={audio:new Audio(),trackId:null,queue:[],queueIdx:-1,shuffle:false,loop:false,shuffled:[],blobUrl:null};
MP.audio.crossOrigin='anonymous';
MP.audio.volume=0.8;
const MS={mode:'artists',artist:null,album:null};
function mFmt(s){if(!s||isNaN(s))return'0:00';return Math.floor(s/60)+':'+String(Math.floor(s%60)).padStart(2,'0');}

function updateBar(track){
  if (!track) return;
  document.getElementById('mbarTitle').textContent = track.title || track.name || '—';
  document.getElementById('mbarArtist').textContent = track.artist || track.album || '—';
  const art = document.getElementById('mbarArt');
  const cu = getCover(track);
  const ph = `<div class="mbar-art-ph"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#555" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg></div>`;
  art.innerHTML = cu
    ? `<img src="${cu}" alt="" onerror="this.parentElement.innerHTML='${ph.replace(/'/g, "\\'")}'">`
    : ph;

  if (dynCover) {
    const panel = document.getElementById('trackPanel');
    if (panel?.classList.contains('show')) {
      const cw = document.getElementById('trackPanelInner')?.querySelector('.tp-cover-wrap');
      if (cw) {
        cw.innerHTML = cu
          ? `<img class="track-panel-cover" src="${cu}" alt="">`
          : `<div class="track-panel-cover-ph"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#444" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/></svg></div>`;
      }
    }
  }
}

// ─── ЛАЙКИ ТРЕКОВ ────────────────────────────────────────────
const TRACK_LIKES_KEY='ot_track_likes';
function loadTrackLikes(){try{return JSON.parse(localStorage.getItem(TRACK_LIKES_KEY)||'{}');}catch(e){return{};}}
function saveTrackLikes(o){try{localStorage.setItem(TRACK_LIKES_KEY,JSON.stringify(o));}catch(e){}}
let trackLikesCache=loadTrackLikes();

function getTrackLikeStateSync(id){return trackLikesCache[id]||0;}

async function getTrackLikeState(track){
 if(!track)return 0;
 if(trackLikesCache[track.id]!==undefined)return trackLikesCache[track.id];
 if(!track.isServer){
 try{const rec=await dbGet('tracks',track.id);if(rec&&rec.likeState){trackLikesCache[track.id]=rec.likeState;return rec.likeState;}}catch(e){}
 }
 return 0;
}
async function setTrackLikeState(track,state){
 if(!track)return;
 trackLikesCache[track.id]=state;saveTrackLikes(trackLikesCache);
 if(!track.isServer){
 try{const rec=await dbGet('tracks',track.id);if(rec){rec.likeState=state;await dbPut('tracks',rec);}}catch(e){}
 }
}
function refreshTrackCardLikeUI(id){
 document.querySelectorAll(`.mc[data-id="${id}"] .mc-like-btn`).forEach(btn=>{
 const st=getTrackLikeStateSync(id);
 btn.classList.toggle('liked',st===1);btn.classList.toggle('disliked',st===-1);
 btn.innerHTML=st===1?ICONS.likeFilled:(st===-1?ICONS.dislikeFilled:ICONS.like);
 });
 document.querySelectorAll(`#tpTrackList .tp-track[data-tid="${id}"]`).forEach(el=>{
 el.classList.toggle('liked',getTrackLikeStateSync(id)===1);
 });
}
async function updateLikeButtons(track){
 const state=await getTrackLikeState(track);
 const likeBtn=document.getElementById('mLike');
 const dislikeBtn=document.getElementById('mDislike');
 if(likeBtn){likeBtn.classList.toggle('liked',state===1);likeBtn.innerHTML=state===1?ICONS.likeFilled:ICONS.like;}
 if(dislikeBtn){dislikeBtn.classList.toggle('disliked',state===-1);dislikeBtn.innerHTML=state===-1?ICONS.dislikeFilled:ICONS.dislike;}
}
async function resolveTrackObj(id){
 return (await dbGet('tracks',id)) || serverMusicMap.get(id) || {id,isServer:true};
}
// ─── КОНЕЦ БЛОКА ЛАЙКОВ ─────────────────────────────────────

// 4.5 – новая mPlay с полным fallback и проверкой HEAD
async function mPlay(id) {
  let track = await dbGet('tracks', id);
  let file = MusicStore.get(id);
  let audioSrc;

  if (file && !file.isServer) {
    if (MP.blobUrl) { URL.revokeObjectURL(MP.blobUrl); MP.blobUrl = null; }
    try {
      audioSrc = URL.createObjectURL(file);
      MP.blobUrl = audioSrc;
    } catch(e) {
      alert('Не удалось открыть файл');
      return;
    }
  } else if (file && file.isServer) {
    audioSrc = file.streamUrl;
    track = track || serverMusicMap.get(id) || {
      id, title: file.name, artist: '—', album: '', coverUrl: file.coverUrl || null
    };
  } else {
    const serverItem = serverMusicMap.get(id);
    if (serverItem) {
      audioSrc = serverItem.streamUrl;
      track = track || {
        id, title: serverItem.title, artist: serverItem.artist || '—',
        album: serverItem.album || '', coverUrl: serverItem.coverUrl || null
      };
    } else if (localFallbackStreamUrl.has(id)) {
      audioSrc = localFallbackStreamUrl.get(id);
    } else if (track && track.relativePath && serverOnline) {
      const url = `${SERVER_API}/stream/music/${encodeURIComponent(track.relativePath).replace(/%2F/g, '/')}`;
      try {
        const check = await fetchWithTimeout(url, { method: 'HEAD' }, 3000);
        if (check.ok) audioSrc = url;
      } catch(e) {}
    }
  }

  if (!audioSrc) {
    alert('Трек не найден. Переподключите папку с музыкой или проверьте сервер.');
    return;
  }
  if (!track) track = { id, title: 'Неизвестный трек', artist: '—', album: '', coverUrl: null };

  MP.audio.src = audioSrc;
  MP.audio.load();
  MP.audio.play().catch(e => console.warn('play() rejected:', e));
  MP.trackId = id;

  const qIdx = MP.queue.indexOf(id);
  if (qIdx !== -1) MP.queueIdx = qIdx;

  updateBar(track);
  updateLikeButtons(track); // ← ОБНОВЛЯЕМ КНОПКИ ЛАЙКА ПРИ СТАРТЕ
  setIcon(document.getElementById('mPlay'), 'pause');
  showMbar();
  hlTrack(id);
}

function mPause(){MP.audio.pause();setIcon(document.getElementById('mPlay'),'play');document.querySelectorAll('.mc.playing .mc-play-ov span').forEach(el=>el.innerHTML=ICONS.play);}
async function mNext(){
  const q=MP.shuffle?MP.shuffled:MP.queue;if(!q.length)return;
  let idx=MP.queueIdx+1;
  if(idx>=q.length){MP.audio.pause();setIcon(document.getElementById('mPlay'),'play');return;}
  MP.queueIdx=idx;openTrackPanelIfLoaded();await mPlay(q[idx]);
}
async function mPrev(){
  const q=MP.shuffle?MP.shuffled:MP.queue;if(!q.length)return;
  let idx=MP.queueIdx-1;if(idx<0)idx=q.length-1;
  MP.queueIdx=idx;openTrackPanelIfLoaded();await mPlay(q[idx]);
}
function openTrackPanelIfLoaded(){const panel=document.getElementById('trackPanel');if(panel.classList.contains('show')&&panel.classList.contains('collapsed')){panel.classList.remove('collapsed');tpVisible=true;}}
function fisherYates(arr){const a=[...arr];for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
function mShuffleArr(arr){return fisherYates(arr);}
MP.audio.addEventListener('ended',()=>{if(MP.loop){MP.audio.currentTime=0;MP.audio.play().catch(()=>{});}else mNext();});
MP.audio.addEventListener('timeupdate',()=>{
  const a=MP.audio;if(!a.duration)return;
  const pct=(a.currentTime/a.duration)*100;
  const fill=document.getElementById('mProgFill');const thumb=document.getElementById('mProgThumb');
  if(fill)fill.style.width=pct+'%';if(thumb)thumb.style.left=pct+'%';
  const cur=document.getElementById('mCurTime');const dur=document.getElementById('mDurTime');
  if(cur)cur.textContent=mFmt(a.currentTime);if(dur)dur.textContent=mFmt(a.duration);
});
 
function initMusicCtrl(){
  const pt=document.getElementById('mProgTrack');let drag=false;
  const scrub=e=>{const r=pt.getBoundingClientRect();const p=Math.max(0,Math.min(1,(e.clientX-r.left)/r.width));if(MP.audio.duration)MP.audio.currentTime=p*MP.audio.duration;};
  pt.addEventListener('mousedown',e=>{drag=true;scrub(e);});document.addEventListener('mousemove',e=>{if(drag)scrub(e);});document.addEventListener('mouseup',()=>{drag=false;});
  const vt=document.getElementById('mVolTrack');let vd=false;
  const setVol=e=>{const r=vt.getBoundingClientRect();const p=Math.max(0,Math.min(1,(e.clientX-r.left)/r.width));MP.audio.volume=p;document.getElementById('mVolFill').style.width=(p*100)+'%';};
  vt.addEventListener('mousedown',e=>{vd=true;setVol(e);});document.addEventListener('mousemove',e=>{if(vd)setVol(e);});document.addEventListener('mouseup',()=>{vd=false;});vt.addEventListener('click',setVol);
  document.getElementById('mPlay').onclick=()=>{if(MP.audio.paused){if(!MP.trackId&&MP.queue.length)mPlay(MP.queue[0]);else{MP.audio.play().catch(()=>{});setIcon(document.getElementById('mPlay'),'pause');}}else mPause();};
  document.getElementById('mNext').onclick=mNext;
  document.getElementById('mPrev').onclick=mPrev;
  document.getElementById('mShuf').onclick=()=>{MP.shuffle=!MP.shuffle;document.getElementById('mShuf').classList.toggle('active',MP.shuffle);if(MP.shuffle)MP.shuffled=mShuffleArr(MP.queue);};
  document.getElementById('mLoop').onclick=()=>{MP.loop=!MP.loop;document.getElementById('mLoop').classList.toggle('active',MP.loop);};
 
  // ── ОБРАБОТЧИКИ ЛАЙКОВ (с проверкой наличия элементов) ──
  const mLike = document.getElementById('mLike');
  const mDislike = document.getElementById('mDislike');
  if (mLike) {
    mLike.onclick = async () => {
      if (!MP.trackId) return;
      const track = await resolveTrackObj(MP.trackId);
      const cur = await getTrackLikeState(track);
      await setTrackLikeState(track, cur === 1 ? 0 : 1);
      updateLikeButtons(track);
      refreshTrackCardLikeUI(MP.trackId);
    };
    mLike.innerHTML = ICONS.like;
  }
  if (mDislike) {
    mDislike.onclick = async () => {
      if (!MP.trackId) return;
      const track = await resolveTrackObj(MP.trackId);
      const cur = await getTrackLikeState(track);
      await setTrackLikeState(track, cur === -1 ? 0 : -1);
      updateLikeButtons(track);
      refreshTrackCardLikeUI(MP.trackId);
    };
    mDislike.innerHTML = ICONS.dislike;
  }

  document.getElementById('musicRandomMixBtn').onclick=playRandomMix;
}
 
const AEXT=/\.(mp3|flac|ogg|wav|m4a|aac|opus|wma)$/i;

async function scanMusic(files){
  const pgb=document.getElementById('pgb');const ex=await dbAll('tracks');const em=new Map();ex.forEach(t=>em.set(t.relativePath,t));
  for(let i=0;i<files.length;i++){
    const f=files[i];pgb.style.transform=`scaleX(${(i+1)/files.length})`;
    const rp=f.webkitRelativePath||f.name;if(em.has(rp)){MusicStore.add(em.get(rp).id,f);continue;}
    const id=crypto.randomUUID();let tags={title:null,artist:null,album:null,trackNumber:null,coverData:null,coverMime:null};
    try{tags=await parseID3(f);}catch(e){}
    await dbPut('tracks',{
      id,
      name:f.name.replace(/\.[^/.]+$/,''),
      fullName:f.name,
      relativePath:rp,
      size:f.size,
      title:tags.title,
      artist:tags.artist,
      album:tags.album,
      trackNumber:tags.trackNumber,
      coverData:tags.coverData,
      coverMime:tags.coverMime,
      coverUrl: null,
      dateAdded:Date.now()
    });
    MusicStore.add(id,f);
  }
  pgb.style.transform='scaleX(0)';
}

async function onMusicSel(e){if(!e.target.files.length)return;const files=Array.from(e.target.files).filter(f=>AEXT.test(f.name));if(!files.length)return;await scanMusic(files);e.target.value='';await renderMusicPage('artists');}
 
async function connectMusic(){
  if(!useLocalFolders)return;
  if(HAS_FS){
    try{
      const handle=await window.showDirectoryPicker();
      const files=[];
      async function walk(d){
        for await(const e of d.values()){
          if(e.kind==='file'){
            const f=await e.getFile();
            if(AEXT.test(f.name)) files.push(f);
          } else if(e.kind==='directory') await walk(e);
        }
      }
      await walk(handle);
      await scanMusic(files);
      await dbPut('handles',{id:'musicFolder',handle});
      await renderMusicPage('artists');
      return;
    } catch(e){
      if(e.name==='AbortError'||e.name==='SecurityError') return;
    }
  }
  document.getElementById('musicFolderInput').click();
}
 
async function restoreMusic(){
  if(!useLocalFolders)return false;
  if(!HAS_FS)return false;const rec=await dbGet('handles','musicFolder');if(!rec?.handle?.requestPermission)return false;
  try{if(await rec.handle.requestPermission({mode:'read'})!=='granted')return false;}catch(e){return false;}
  const tracks=await dbAll('tracks');const im=new Map();tracks.forEach(t=>im.set(t.relativePath,t));
  async function walk(d){for await(const e of d.values()){if(e.kind==='file'){const f=await e.getFile();const r=im.get(f.webkitRelativePath||f.name);if(r)MusicStore.add(r.id,f);}else if(e.kind==='directory')await walk(e);}}
  await walk(rec.handle);return true;
}
 
let musicLibCache = null;
let musicLibCacheAt = 0;
async function fetchMusicLibrary() {
  const now = Date.now();
  if (musicLibCache && (now - musicLibCacheAt) < LIB_CACHE_TTL) return musicLibCache;
  if (!serverOnline) return musicLibCache || loadLibFromLS(LS_MUSIC_LIB_KEY) || [];
  try {
    const data = await fetchJsonWithRetry(`${SERVER_API}/library/music`, { timeouts: [10000, 20000, 30000] });
    musicLibCache = (data.items && Array.isArray(data.items)) ? data.items : [];
    musicLibCacheAt = now;
    saveLibToLS(LS_MUSIC_LIB_KEY, musicLibCache);
    return musicLibCache;
  } catch(e) {
    console.warn('fetchMusicLibrary failed:', e.message);
    serverOnline = false; updatePingUI();
    return musicLibCache || loadLibFromLS(LS_MUSIC_LIB_KEY) || [];
  }
}

let musicRenderGen = 0;
async function buildAllTracks() {
  let all=await dbAll('tracks');
  const localByFp=new Map(all.map(t=>[`${(t.fullName||t.name||'').toLowerCase()}|${t.size||0}`,t]));

  if (serverOnline) {
    try {
      const rawItems = await fetchMusicLibrary();
      rawItems.forEach(raw => {
        const it = { ...raw };
        const fp=`${(it.fullName||it.name||'').toLowerCase()}|${it.size||0}`;
        const local=localByFp.get(fp);
        const streamUrl = SERVER_API + raw.streamUrl;
        const coverUrl = it.coverUrl || null;
        if (local) {
          local.artist = it.artist || local.artist;
          local.title = it.title || local.title;
          local.album = it.album || local.album;
          local.trackNumber = it.trackNumber || local.trackNumber;
          localFallbackStreamUrl.set(local.id, streamUrl);
          local.coverUrl = coverUrl || local.coverUrl;
          local.streamUrl = streamUrl;
          if (!(local.coverData && local.coverData.byteLength)) {
            local.isServer = true;
          }
          if (!MusicStore.has(local.id)) {
            MusicStore.add(local.id, { name: local.name, isServer: true, streamUrl, coverUrl: local.coverUrl });
          }
          return;
        }
        const id = 'srv-m-' + Math.abs(hsh(it.relativePath)).toString(36);
        it.id = id;
        it.isServer = true;
        it.streamUrl = streamUrl;
        it.title = it.title || it.name;
        it.artist = it.artist || 'Неизвестный';
        it.album = it.album || '';
        it.trackNumber = it.trackNumber || null;
        it.coverUrl = coverUrl;
        it.dateAdded = it.mtime || Date.now();
        serverMusicMap.set(id, it);
        MusicStore.add(id, {
          name: it.name,
          isServer: true,
          streamUrl: it.streamUrl,
          coverUrl: it.coverUrl
        });
        all.push(it);
      });
    } catch(e){ console.warn('Server music failed', e); }
  }
  return all;
}

async function playRandomMix(){
  const btn=document.getElementById('musicRandomMixBtn');
  const oldHtml=btn?btn.innerHTML:null;
  if(btn){btn.disabled=true;btn.innerHTML=ICONS.dice+' Собираю...';}
  try{
    const all=await buildAllTracks();
    if(!all.length){alert('Треков нет — подождите загрузку с сервера.');return;}
 
    const liked=[],disliked=[],neutral=[];
    for(const t of all){
      const st=getTrackLikeStateSync(t.id);
      if(st===1)liked.push(t);
      else if(st===-1)disliked.push(t);
      else neutral.push(t);
    }
 
    const RANDOM_MIX_LIMIT=50;
    const mixed=[...fisherYates(liked),...fisherYates(neutral),...fisherYates(disliked)];
    const limited=mixed.slice(0,RANDOM_MIX_LIMIT);
 
    const ids=limited.map(t=>t.id);
    MP.queue=ids;
    MP.shuffle=true;
    MP.shuffled=ids;
    document.getElementById('mShuf').classList.add('active');
    MP.queueIdx=0;
    showTP('Случайная подборка',`${limited.length} треков${liked.length?' • лайки в приоритете':''}`,limited);
    openTrackPanelIfLoaded();
    await mPlay(ids[0]);
  } finally {
    if(btn){btn.disabled=false;btn.innerHTML=oldHtml;}
  }
}

function effectiveTrackNumber(t){
  if(t.trackNumber!=null && !isNaN(t.trackNumber) && t.trackNumber>0) return t.trackNumber;
  return 999999;
}

async function renderMusicPage(mode='artists', artistFilter=null, albumFilter=null, query=''){
  const myGen = ++musicRenderGen;
  musicTrackPage=0;
  if (!query) {
    MS.mode = mode;
    MS.artist = artistFilter;
    MS.album = albumFilter;
  }
  const grid=document.getElementById('musicGrid');grid.innerHTML='';
  updateBreadcrumb(mode,artistFilter,albumFilter);
  let all=await buildAllTracks();
  if (myGen !== musicRenderGen) return;
  if (myGen !== musicRenderGen) return;
 
  if(!all.length){grid.innerHTML=`<div class="music-empty"><h3>Треков нет</h3><p>Подключите папку с музыкой</p></div>`;MP.queue=[];MP.shuffled=[];return;}
  if(query){const q=query.toLowerCase();const f=all.filter(t=>(t.title&&t.title.toLowerCase().includes(q))||(t.artist&&t.artist.toLowerCase().includes(q))||(t.album&&t.album.toLowerCase().includes(q))||t.name.toLowerCase().includes(q));renderTracks(f.sort((a,b)=>b.dateAdded-a.dateAdded),grid);return;}
  if(mode==='artists'){
    document.getElementById('musicPageTitle').textContent='Музыка';
    const am=new Map();
    all.forEach(t=>{const raw=(t.artist||'Неизвестный').trim();const key=raw.toLowerCase().replace(/\s+/g,' ');if(!am.has(key))am.set(key,{displayName:raw,count:0});am.get(key).count++;});
    const sorted=[...am.entries()].sort((a,b)=>b[1].count-a[1].count);
    const cont=document.createElement('div');cont.style.cssText='display:flex;flex-wrap:wrap;gap:16px;';
    for(const [key,art] of sorted){
      const card=document.createElement('div');card.className='artist-card';
      const av=document.createElement('div');av.className='artist-avatar';
      const profileUrl=getArtistCoverUrl(art.displayName,'profile');
      if(profileUrl){const img=document.createElement('img');img.src=profileUrl;img.style.cssText='width:100%;height:100%;object-fit:cover;border-radius:50%';img.onerror=()=>{img.remove();av.textContent=art.displayName.charAt(0).toUpperCase();};av.appendChild(img);}
      else{av.textContent=art.displayName.charAt(0).toUpperCase();}
      card.innerHTML=`<div class="artist-name">${art.displayName}</div><div class="artist-count">${art.count} тр.</div>`;
      card.insertBefore(av,card.firstChild);card.onclick=()=>renderArtistPage(art.displayName,all);cont.appendChild(card);
    }
    grid.appendChild(cont);return;
  }

  if(mode==='albums'&&artistFilter){
    document.getElementById('musicPageTitle').textContent=`${artistFilter}`;
    const ak=artistFilter.toLowerCase().replace(/\s+/g,' ');
    const at=all.filter(t=>(t.artist||'Неизвестный').trim().toLowerCase().replace(/\s+/g,' ')===ak);
    const alMap=new Map();at.forEach(t=>{const alb=(t.album||'Без альбома').trim();if(!alMap.has(alb))alMap.set(alb,[]);alMap.get(alb).push(t);});
    const cont=document.createElement('div');cont.style.cssText='display:flex;flex-wrap:wrap;gap:16px;';
    [...alMap.keys()].sort().forEach(album=>{
      const tracks=alMap.get(album);
      const card=document.createElement('div');card.className='artist-card';
      const u = getAlbumCover(tracks);
      const artDiv=document.createElement('div');
      artDiv.style.cssText='width:100%;max-width:160px;aspect-ratio:1;border-radius:12px;margin-bottom:12px;overflow:hidden;background:#1e1e1e;display:flex;align-items:center;justify-content:center;font-size:48px;flex-shrink:0;';
      const placeholderSvg=`<svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="#444" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/><line x1="12" y1="2" x2="12" y2="5"/></svg>`;
      if(u){artDiv.innerHTML=`<img src="${u}" style="width:100%;height:100%;object-fit:cover;object-position:center" alt="">`;}
      else{
        artDiv.innerHTML=placeholderSvg;
        getAlbumCoverAsync(tracks).then(cu=>{if(cu)artDiv.innerHTML=`<img src="${cu}" style="width:100%;height:100%;object-fit:cover;object-position:center" alt="">`;});
      }
      const nameDiv=document.createElement('div');nameDiv.className='artist-name';nameDiv.textContent=album;
      const countDiv=document.createElement('div');countDiv.className='artist-count';countDiv.textContent=`${tracks.length} треков`;
      card.append(artDiv,nameDiv,countDiv);card.onclick=()=>showAlbum(artistFilter,album,tracks);cont.appendChild(card);
    });
    grid.appendChild(cont);return;
  }

  if(mode==='tracks'&&artistFilter&&albumFilter){
    document.getElementById('musicPageTitle').textContent=`${artistFilter} — ${albumFilter}`;
    const ak=artistFilter.toLowerCase().replace(/\s+/g,' ');
    let at=all.filter(t=>(t.artist||'Неизвестный').trim().toLowerCase().replace(/\s+/g,' ')===ak&&(t.album||'Без альбома').trim()===albumFilter);
    at.sort((a,b)=>effectiveTrackNumber(a)-effectiveTrackNumber(b));
    renderTracks(at,grid);showTP(artistFilter,albumFilter,at);return;
  }
  if(mode==='tracks_all'){
    document.getElementById('musicPageTitle').textContent='Все треки';
    renderTracks([...all].sort((a,b)=>b.dateAdded-a.dateAdded),grid);return;
  }
}
 
function initTP(){document.getElementById('trackPanelTab').onclick=toggleTP;}
function toggleTP(){const p=document.getElementById('trackPanel');if(!p.classList.contains('show'))return;tpVisible=!tpVisible;p.classList.toggle('collapsed',!tpVisible);}

function showTP(artist,album,tracks){
  const p=document.getElementById('trackPanel');const inner=document.getElementById('trackPanelInner');
  let cu = null;
  if (dynCover && MP.trackId) {
    const currentTrack = tracks.find(t => t.id === MP.trackId);
    if (currentTrack) cu = getCover(currentTrack);
  }
  if (!cu) cu = getAlbumCover(tracks);
  inner.innerHTML='';
  const cw=document.createElement('div');cw.className='tp-cover-wrap';
  if(cu){
    cw.innerHTML=`<img class="track-panel-cover" src="${cu}" alt="">`;
  } else {
    cw.innerHTML=`<div class="track-panel-cover-ph"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#444" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/><line x1="12" y1="19" x2="12" y2="22"/></svg></div>`;
    getAlbumCoverAsync(tracks).then(cu2=>{if(cu2)cw.innerHTML=`<img class="track-panel-cover" src="${cu2}" alt="">`;});
  }
  inner.appendChild(cw);
  const meta=document.createElement('div');meta.innerHTML=`<div class="tp-title">${album}</div><div class="tp-artist">${artist}</div>`;inner.appendChild(meta);
  const div=document.createElement('div');div.style.cssText='height:1px;background:var(--b);margin:10px 0';inner.appendChild(div);
  const list=document.createElement('div');list.id='tpTrackList';
  tracks.forEach(t=>{
    const item=document.createElement('div');item.className='tp-track'+(MP.trackId===t.id?' playing':'')+(getTrackLikeStateSync(t.id)===1?' liked':'');item.dataset.tid=t.id;
    const etn=effectiveTrackNumber(t);
    item.innerHTML=`<span class="tp-track-num">${etn<999999?etn:'—'}</span><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${t.title||t.name}</span>`;
    item.onclick=()=>mPlay(t.id);list.appendChild(item);
  });
  inner.appendChild(list);
  tpVisible=true;p.classList.add('show');p.classList.remove('collapsed');
}

function hlTrack(id){document.querySelectorAll('#tpTrackList .tp-track').forEach(el=>el.classList.toggle('playing',el.dataset.tid===id));}
function showAlbum(artist,album,tracks){
  const sorted=[...tracks].sort((a,b)=>effectiveTrackNumber(a)-effectiveTrackNumber(b));
  MP.queue=sorted.map(t=>t.id);if(MP.shuffle)MP.shuffled=mShuffleArr(MP.queue);
  showTP(artist,album,sorted);
}
function updateBreadcrumb(mode,artist,album){
  const nav=document.getElementById('musicNav');nav.innerHTML='';
  const add=(l,fn)=>{const s=document.createElement('span');s.className='crumb';s.textContent=l;if(fn)s.onclick=fn;nav.appendChild(s);};
  const sep=()=>{const s=document.createElement('span');s.className='sep';s.textContent=' › ';nav.appendChild(s);};
  if(mode==='artists')return;
  add('Исполнители',()=>renderMusicPage('artists'));sep();
  if(mode==='albums'&&artist){const s=document.createElement('span');s.textContent=artist;nav.appendChild(s);}
  if(mode==='tracks'&&artist&&album){add(artist,()=>renderMusicPage('albums',artist));sep();const s=document.createElement('span');s.textContent=album;nav.appendChild(s);}
  if(mode==='tracks_all'){const s=document.createElement('span');s.textContent='Все треки';nav.appendChild(s);}
  if(mode==='artist_page'&&artist){const s=document.createElement('span');s.textContent=artist;nav.appendChild(s);}
}
 
const COVERS_BASE = 'http://localhost:3001/covers';
function getArtistCoverUrl(name,type='profile'){
  return `${COVERS_BASE}/${encodeURIComponent(name)}_${type}.jpg`;
}

async function renderArtistPage(artistName,allTracks){
  const grid=document.getElementById('musicGrid');grid.innerHTML='';
  MS.mode='artist_page';MS.artist=artistName;MS.album=null;
  updateBreadcrumb('artist_page',artistName,null);
  document.getElementById('musicPageTitle').textContent=artistName;
 
  const ak=artistName.toLowerCase().replace(/\s+/g,' ');
  const at=allTracks.filter(t=>(t.artist||'Неизвестный').trim().toLowerCase().replace(/\s+/g,' ')===ak);
  const alMap=new Map();
  at.forEach(t=>{const alb=(t.album||'Без альбома').trim();if(!alMap.has(alb))alMap.set(alb,[]);alMap.get(alb).push(t);});
 
  const page=document.createElement('div');page.className='artist-page on';
 
  const bannerWrap=document.createElement('div');bannerWrap.className='artist-banner-wrap';
  const banner=document.createElement('div');banner.className='artist-banner';
  const bannerImg=document.createElement('img');
  bannerImg.onerror=()=>bannerImg.remove();
  const tryBannerUrls=[
    `${COVERS_BASE}/${encodeURIComponent(artistName)}_banner%20(1).jpg`,
    `${COVERS_BASE}/${encodeURIComponent(artistName)}_banner%20(2).jpg`,
    `${COVERS_BASE}/${encodeURIComponent(artistName)}_banner.jpg`,
  ];
  let bannerIdx=0;
  let heroCopy=null;
  const tryNextBanner=()=>{
    if(bannerIdx<tryBannerUrls.length){bannerImg.src=tryBannerUrls[bannerIdx++];bannerImg.onerror=tryNextBanner;}
    else{
      bannerWrap.style.display='none';
      heroCopy=document.createElement('div');
      heroCopy.className='artist-hero';
      heroCopy.style.cssText='position:static;padding:20px 24px 0;margin-bottom:0;';
      heroCopy.innerHTML=hero.innerHTML;
      page.insertBefore(heroCopy,page.children[1]||null);
    }
  };
  tryNextBanner();
  const overlay=document.createElement('div');overlay.className='artist-banner-overlay';
  banner.append(bannerImg,overlay);

  const hero=document.createElement('div');hero.className='artist-hero';
  const heroAv=document.createElement('div');heroAv.className='artist-hero-avatar';
  const avImg=document.createElement('img');
  const tryProfileUrls=[
    `${COVERS_BASE}/${encodeURIComponent(artistName)}_profile%20(1).jpg`,
    `${COVERS_BASE}/${encodeURIComponent(artistName)}_profile%20(2).jpg`,
    `${COVERS_BASE}/${encodeURIComponent(artistName)}_profile.jpg`,
  ];
  let profIdx=0;
  const tryNextProfile=()=>{if(profIdx<tryProfileUrls.length){avImg.src=tryProfileUrls[profIdx++];avImg.onerror=tryNextProfile;}else{avImg.remove();heroAv.textContent=artistName.charAt(0).toUpperCase();}};
  tryNextProfile();
  heroAv.appendChild(avImg);
  const heroInfo=document.createElement('div');heroInfo.className='artist-hero-info';
  heroInfo.innerHTML=`<div class="artist-hero-name">${artistName}</div><div class="artist-hero-stats">${at.length} треков · ${alMap.size} альбомов</div>`;
  hero.append(heroAv,heroInfo);
  // hero живёт внутри баннера (SoundCloud-стиль)
  banner.appendChild(hero);
  bannerWrap.appendChild(banner);


  const secTitle=document.createElement('div');secTitle.className='artist-section-title';secTitle.textContent='Альбомы';
  const albumsRow=document.createElement('div');albumsRow.className='artist-albums-row';
  [...alMap.keys()].sort().forEach(album=>{
    const tracks=alMap.get(album);
    const card=document.createElement('div');card.className='artist-card';
    const u = getAlbumCover(tracks);
    const artDiv=document.createElement('div');
    artDiv.style.cssText='width:100%;max-width:160px;aspect-ratio:1;border-radius:12px;margin-bottom:12px;overflow:hidden;background:#1e1e1e;display:flex;align-items:center;justify-content:center;flex-shrink:0;';
    const placeholderSvg2=`<svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="#444" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/><line x1="12" y1="2" x2="12" y2="5"/></svg>`;
    if(u){artDiv.innerHTML=`<img src="${u}" style="width:100%;height:100%;object-fit:cover;object-position:center" alt="">`;}
    else{
      artDiv.innerHTML=placeholderSvg2;
      getAlbumCoverAsync(tracks).then(cu=>{if(cu)artDiv.innerHTML=`<img src="${cu}" style="width:100%;height:100%;object-fit:cover;object-position:center" alt="">`;});
    }
    const nameDiv=document.createElement('div');nameDiv.className='artist-name';nameDiv.textContent=album;
    const countDiv=document.createElement('div');countDiv.className='artist-count';countDiv.textContent=`${tracks.length} треков`;
    card.append(artDiv,nameDiv,countDiv);card.onclick=()=>showAlbum(artistName,album,tracks);albumsRow.appendChild(card);
  });
 
  page.append(bannerWrap,secTitle,albumsRow);
  grid.appendChild(page);
}

let musicTrackPage=0;const MUSIC_PAGE_SIZE=100;
function renderTracks(tracks,container){
  container.innerHTML='';
  if(!tracks.length){container.innerHTML='<div class="music-empty"><h3>Треков не найдено</h3></div>';return;}
  MP.queue=tracks.map(t=>t.id);if(MP.shuffle)MP.shuffled=mShuffleArr(MP.queue);
  const totalPages=Math.max(1,Math.ceil(tracks.length/MUSIC_PAGE_SIZE));
  if(musicTrackPage>=totalPages)musicTrackPage=totalPages-1;
  if(musicTrackPage<0)musicTrackPage=0;
  const vis=tracks.slice(musicTrackPage*MUSIC_PAGE_SIZE,(musicTrackPage+1)*MUSIC_PAGE_SIZE);
  for(const t of vis){
    const card=document.createElement('div');card.className='mc'+(MP.trackId===t.id?' playing':'');card.dataset.id=t.id;
    const cu=getCover(t);let artHtml;
    if(cu)artHtml=`<img src="${cu}" alt="">`;else{const clr=COLORS[Math.abs(hsh(t.id))%COLORS.length];artHtml=`<div class="mc-art-placeholder" style="background:linear-gradient(135deg,${clr}22,#1a1a2a)"><svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="${clr}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg></div>`;}
    const isP=MP.trackId===t.id&&!MP.audio.paused;
    const etn=effectiveTrackNumber(t);
    const num=etn<999999?`${etn}. `:'';
    const likeState=getTrackLikeStateSync(t.id);
    const likeBtnHtml=`<button class="mc-like-btn${likeState===1?' liked':''}${likeState===-1?' disliked':''}" data-id="${t.id}" title="Нравится">${likeState===1?ICONS.likeFilled:(likeState===-1?ICONS.dislikeFilled:ICONS.like)}</button>`;
    card.innerHTML=`<div class="mc-art">${artHtml}<div class="mc-play-ov"><span>${ICONS[isP?'pause':'play']}</span></div>${likeBtnHtml}</div><div class="mc-info"><div class="mc-title">${num}${t.title||t.name}</div><div class="mc-artist">${t.artist||t.album||'—'}</div></div>`;
    card.onclick=()=>{if(MP.trackId===t.id){if(MP.audio.paused){MP.audio.play().catch(()=>{});setIcon(document.getElementById('mPlay'),'pause');}else mPause();}else mPlay(t.id);};
    card.querySelector('.mc-like-btn').addEventListener('click', async e=>{
      e.stopPropagation();
      const track=await resolveTrackObj(t.id);
      const cur=await getTrackLikeState(track);
      const next=cur===1?0:1;
      await setTrackLikeState(track,next);
      refreshTrackCardLikeUI(t.id);
      if(MP.trackId===t.id)updateLikeButtons(track);
    });
    container.appendChild(card);
  }
  if(totalPages>1){
    const pager=document.createElement('div');
    pager.style.cssText='grid-column:1/-1;display:flex;align-items:center;justify-content:center;gap:14px;padding:20px 0;color:var(--t2);width:100%;';
    const mkBtn=(label,disabled,onClick)=>{const b=document.createElement('button');b.textContent=label;b.disabled=disabled;b.style.cssText=`background:${disabled?'#1a1a1a':'var(--a)'};color:${disabled?'#666':'#000'};border:none;padding:8px 16px;border-radius:8px;font-weight:600;cursor:${disabled?'default':'pointer'};`;if(!disabled)b.onclick=onClick;return b;};
    pager.appendChild(mkBtn('← Назад',musicTrackPage===0,()=>{musicTrackPage--;renderTracks(tracks,container);}));
    const info=document.createElement('span');info.textContent=`Страница ${musicTrackPage+1} из ${totalPages} (${tracks.length} треков)`;pager.appendChild(info);
    pager.appendChild(mkBtn('Вперёд →',musicTrackPage>=totalPages-1,()=>{musicTrackPage++;renderTracks(tracks,container);}));
    container.appendChild(pager);
  }
}
 
let aCtx,analyser,eqCvs,eqCtx,eqData,eqAnim;
function initEQ(){
  if(aCtx)return;
  aCtx=new(window.AudioContext||window.webkitAudioContext)();
  analyser=aCtx.createAnalyser();analyser.fftSize=256;analyser.smoothingTimeConstant=0.8;
  eqData=new Uint8Array(analyser.frequencyBinCount);
  const src=aCtx.createMediaElementSource(MP.audio);src.connect(analyser);analyser.connect(aCtx.destination);
  eqCvs=document.getElementById('eqCanvas');if(!eqCvs)return;eqCtx=eqCvs.getContext('2d');
}
function drawEQ(){
  if(!analyser||!eqCtx)return;
  analyser.getByteFrequencyData(eqData);eqCtx.clearRect(0,0,eqCvs.width,eqCvs.height);
  const bars=12,bw=7,gap=4,total=eqData.length;
  for(let i=0;i<bars;i++){
    const s=Math.floor((i/bars)*total*.8);const end=Math.floor(((i+1)/bars)*total*.8);
    let sum=0,cnt=0;for(let j=s;j<=end&&j<total;j++){sum+=eqData[j];cnt++;}
    const avg=cnt?sum/cnt:0;const h=Math.max(2,(avg/255)*(eqCvs.height-2));
    eqCtx.fillStyle='#00ff85';eqCtx.fillRect(i*(bw+gap),eqCvs.height-h,bw,h);
  }
  eqAnim=requestAnimationFrame(drawEQ);
}
function startEQ(){initEQ();if(aCtx.state==='suspended')aCtx.resume();drawEQ();}
function stopEQ(){if(eqAnim)cancelAnimationFrame(eqAnim);if(eqCtx&&eqCvs)eqCtx.clearRect(0,0,eqCvs.width,eqCvs.height);}
MP.audio.addEventListener('play',startEQ);
MP.audio.addEventListener('pause',stopEQ);
MP.audio.addEventListener('ended',stopEQ);
 
const useLocalFolders = false;

const serverVideoMap = new Map();
function detectServerOrientation(streamUrl, timeoutMs = 8000) {
  return new Promise(resolve => {
    const v = document.createElement('video');
    v.preload = 'metadata';
    v.muted = true;
    let done = false;
    const finish = (val) => { if(done)return; done=true; v.src=''; v.removeAttribute('src'); v.load(); resolve(val); };
    const timer = setTimeout(() => finish(null), timeoutMs);
    v.onloadedmetadata = () => { clearTimeout(timer); finish(v.videoHeight > v.videoWidth); };
    v.onerror = () => { clearTimeout(timer); finish(null); };
    v.src = streamUrl;
  });
}
async function ensureServerOrientations(items, concurrency = 4) {
  const pending = items.filter(it => it.isServer && it.vertical === undefined);
  let idx = 0;
  async function worker() {
    while (idx < pending.length) {
      const it = pending[idx++];
      const res = await detectServerOrientation(it.streamUrl);
      it.vertical = res === null ? false : res;
    }
  }
  await Promise.all(Array.from({length: Math.min(concurrency, pending.length)}, worker));
}
const serverMusicMap = new Map();
const localFallbackStreamUrl = new Map();
 
// ── Init ──
 
async function init(){
  await openDB();
  if(!localStorage.getItem('ot_user')){const n=prompt('Как вас зовут?','Аноним')||'Аноним';localStorage.setItem('ot_user',n);}
  dynCover=localStorage.getItem('ot_dyn_cover')==='1';
  initEvents();initMusicCtrl();initSearch();initTP();initPlayerControls();
  await checkServerStatus();
  setInterval(checkServerStatus, 20000);
  updateNotice();await renderPage();
  (async()=>{
    const restored=await restoreHandle();
    await restoreMusic();
    if(restored){await renderPage();setTimeout(()=>regenMissing(),2000);}
  })();
  console.log('Owntube v28 + Server integration');
}
 
try{await init();}
catch(e){
  console.error(e);
  document.body.innerHTML=`<div style="padding:60px;text-align:center;color:#fff"><h1>Ошибка</h1><p style="color:#aaa;margin-top:12px">${e.message}</p><br><button onclick="indexedDB.deleteDatabase('${DB_NAME}');location.reload()" style="background:#00ff85;color:#000;border:none;padding:12px 24px;border-radius:8px;font-size:16px;font-weight:700;cursor:pointer">Сбросить базу</button></div>`;
}
})();