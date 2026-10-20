/* Fútbol Pulse Community v1.7 — fotos libres, verificación y crédito individual.
   Wikimedia Commons is never assumed to be uniformly licensed. */
(function(root){
'use strict';
const CACHE_KEY='fp17-wikimedia-media:';
const TTL=14*86400000;
const memory=new Map();
const pending=new Map();
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const safeURL=value=>{try{const u=new URL(String(value));return u.protocol==='https:'?u.href:'';}catch{return '';}};
function clean(value){return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim();}
function licenseAllowed(raw){
 const l=String(raw||'').replace(/_/g,' ').replace(/\s+/g,' ').toUpperCase().trim();
 if(/\b(NC|ND|NONCOMMERCIAL|NO DERIVATIVES)\b/.test(l))return false;
 return /^CC(?:-| )?0(?:\s|$|1\.0)|^CC\s?BY(?:-| )?SA\s?[1-4](?:\.\d)?\b|^CC\s?BY\s?[1-4](?:\.\d)?\b|^PUBLIC DOMAIN$|^PD[- ]|^PDM$/.test(l);
}
function plain(value){return String(value||'').replace(/<[^>]+>/g,' ').replace(/&nbsp;|&#160;/gi,' ').replace(/&amp;/gi,'&').replace(/&quot;/gi,'"').replace(/&#39;/gi,"'").replace(/\s+/g,' ').trim().slice(0,180);}
const metadataValue=(obj,key)=>obj?.[key]?.value||'';
async function get(url,timeout=8500){const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),timeout);try{
 const response=await root.fetch(url,{signal:ctl.signal,headers:{Accept:'application/json'}});if(!response.ok)throw new Error('Wikimedia HTTP '+response.status);return await response.json();
}finally{clearTimeout(timer);}}
function imageQuery(name){const args=new URLSearchParams({action:'query',format:'json',formatversion:'2',prop:'imageinfo',iiprop:'url|extmetadata',iiurlwidth:'420',titles:'File:'+name,origin:'*'});return 'https://commons.wikimedia.org/w/api.php?'+args;}
async function resolvePhoto(name,kind='player'){
 const key=kind+':'+clean(name);
 if(!clean(name)||clean(name).length<4)return null;
 if(memory.has(key))return memory.get(key);
 try{const old=JSON.parse(root.localStorage?.getItem(CACHE_KEY+key)||'null');if(old&&Date.now()-old.saved<TTL){memory.set(key,old.media||null);return old.media||null;}}catch{}
 if(pending.has(key))return pending.get(key);
 const promise=(async()=>{
   try{
    const search=new URLSearchParams({action:'wbsearchentities',search:name,language:'es',uselang:'es',limit:'5',format:'json',origin:'*'});
    const found=await get('https://www.wikidata.org/w/api.php?'+search);
    const candidates=(found.search||[]).filter(it=>{
      const label=clean(it.label||'');const q=clean(name);const tokens=q.split(' ').filter(x=>x.length>3);
      const identity=label===q||(q.length>9&&label.includes(q))||(label.length>9&&q.includes(label));
      if(!identity)return false;
      const desc=clean(it.description||'');
      if(kind==='player')return /(futbol|football|soccer|jugador|player|footballeur|calciatore|sportista)/.test(desc);
      if(kind==='stadium')return /(estadio|stadium|futbol|football|arena|campo)/.test(desc);
      return /(futbol|football|soccer|club|equipo|team|sport)/.test(desc)||tokens.length>2;
    });
    for(const item of candidates.slice(0,2)){
      const entityParams=new URLSearchParams({action:'wbgetentities',ids:item.id,props:'claims',format:'json',origin:'*'});
      const detail=await get('https://www.wikidata.org/w/api.php?'+entityParams);
      const pictures=detail.entities?.[item.id]?.claims?.P18||[];
      const filename=pictures.find(c=>c?.mainsnak?.datavalue?.value)?.mainsnak?.datavalue?.value;
      if(typeof filename!=='string'||!filename)continue;
      const image=await get(imageQuery(filename));
      const record=(image.query?.pages||[])[0];const i=record?.imageinfo?.[0],md=i?.extmetadata||{};
      const lic=plain(metadataValue(md,'LicenseShortName'));
      if(!licenseAllowed(lic))continue;
      const url=safeURL(i.thumburl||i.url),source=safeURL(i.descriptionurl),licenseUrl=safeURL(metadataValue(md,'LicenseUrl'));
      if(!url||!source||!lic)continue;
      const media={url,source,license:lic,licenseUrl,author:plain(metadataValue(md,'Artist'))||'Autor indicado en Commons',title:plain(metadataValue(md,'ObjectName'))||filename,kind};
      memory.set(key,media);try{root.localStorage?.setItem(CACHE_KEY+key,JSON.stringify({saved:Date.now(),media}));}catch{}
      return media;
    }
   }catch{/* Offline and provider errors should never hide match data. */}
   memory.set(key,null);return null;
 })().finally(()=>pending.delete(key));
 pending.set(key,promise);return promise;
}
function attribution(m){if(!m)return '';return `<span class="wm-credit">Foto «${escape(m.title)}» · ${escape(m.author)} · <a href="${escape(m.source)}" target="_blank" rel="noopener noreferrer">Commons</a> · <a href="${escape(m.licenseUrl||m.source)}" target="_blank" rel="noopener noreferrer">${escape(m.license)}</a></span>`;}
function renderPhoto(m,alt){if(!m)return '';return `<img src="${escape(m.url)}" alt="${escape(alt)}" loading="lazy" referrerpolicy="no-referrer" onerror="this.parentElement.textContent='Imagen temporalmente no disponible'">`;}
async function fillSlot(slot,subject,kind,alt){if(!slot)return;
 const id=subject+'-'+kind;slot.dataset.wmRequest=id;slot.setAttribute('aria-busy','true');
 const m=await resolvePhoto(subject,kind);if(!slot.isConnected||slot.dataset.wmRequest!==id)return;
 slot.removeAttribute('aria-busy');
 if(m){slot.classList.add('wm-loaded');slot.innerHTML=`<div class="wm-image">${renderPhoto(m,alt||subject)}</div>${attribution(m)}`;}
 else {slot.classList.add('wm-unavailable');slot.innerHTML='<span class="wm-placeholder">Imagen libre no disponible</span>';}
}
async function fillRosterPhoto(node,name){if(!node)return;const idx=node.dataset.communityIndex;
 const m=await resolvePhoto(name,'player');if(!node.isConnected||node.dataset.communityIndex!==idx||!m)return;
 const avatar=node.querySelector('.roster-avatar');if(avatar)avatar.innerHTML=renderPhoto(m,name);
 const credits=node.querySelector('.community-roster-credit');if(credits)credits.innerHTML=attribution(m);
}
const api={resolvePhoto,licenseAllowed,plain,attribution,renderPhoto,fillSlot,fillRosterPhoto,clean};
root.FPCommunity=Object.freeze(api);
if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
