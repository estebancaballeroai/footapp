/* Fútbol Pulse v1.7.1 Hybrid Data — no puede sustituir resultados en vivo. */
(() => {
  'use strict';
  const statusNode = () => document.getElementById('hybrid-status');
  const api = {state:'loading', generatedAt:'', used:0, fallbacks:0, counts:null};
  let snapshot=null;
  const time = x => {
    const d=new Date(x);
    return Number.isFinite(d.getTime())?new Intl.DateTimeFormat('es-ES',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}).format(d):'desconocida';
  };
  const valid = obj => obj && obj.schema===1 && typeof obj.generatedAt==='string' && obj.standings && obj.fixtures && obj.teams;
  const render = () => {
    const el=statusNode(); if(!el)return;
    if(api.state==='ready'){
      el.textContent=`✦ Datos compartidos · ${time(api.generatedAt)}${api.fallbacks?' · respaldo antiguo':''}`;
      el.className='hybrid-status '+(api.fallbacks?'hybrid-warning':'hybrid-ok');
      el.title='La caché comunitaria se utiliza solo para datos secundarios. Los resultados en vivo siempre se consultan directamente.';
    } else if(api.state==='loading'){
      el.textContent='✦ Verificando datos compartidos…';el.className='hybrid-status hybrid-neutral';
    } else {
      el.textContent='○ Modo directo · caché compartida no disponible';el.className='hybrid-status hybrid-neutral';
    }
  };
  const load = fetch('./pulse-data.json',{cache:'no-store',headers:{Accept:'application/json'}})
    .then(res=>{if(!res.ok)throw Error('HTTP '+res.status);return res.json();})
    .then(data=>{if(!valid(data))throw Error('Formato inválido');if(!Object.keys(data.standings).length && !Object.keys(data.fixtures).length && !Object.keys(data.teams).length)throw Error('Sin datos compartidos');snapshot=data;api.generatedAt=data.generatedAt;api.counts=data.counts;api.state='ready';render();return true;})
    .catch(()=>{api.state='missing';render();return false;});
  document.addEventListener('DOMContentLoaded',render,{once:true});

  function select(url) {
    if(!snapshot)return null;
    let u;try{u=new URL(url);}catch{return null;}
    if(u.hostname!=='site.api.espn.com')return null;
    const p=u.pathname;
    let match=p.match(/^\/apis\/v2\/sports\/soccer\/([a-z0-9.]+)\/standings$/i);
    if(match)return {entry:snapshot.standings[match[1]],name:'Tabla'};
    match=p.match(/^\/apis\/site\/v2\/sports\/soccer\/([a-z0-9.]+)\/teams$/i);
    if(match)return {entry:snapshot.teams[match[1]],name:'Clubes'};
    match=p.match(/^\/apis\/site\/v2\/sports\/soccer\/([a-z0-9.]+)\/scoreboard$/i);
    if(match){
      const date=u.searchParams.get('dates');
      // Los datos por día (y el directo) NUNCA usan JSON compartido.
      if(!date || !/^\d{6}$/.test(date))return null;
      // El mes en curso puede contener encuentros EN VIVO: siempre consulta la fuente directa.
      if(date===new Date().toISOString().slice(0,7).replace('-',''))return null;
      return {entry:snapshot.fixtures[match[1]]?.[date],name:'Fixture'};
    }
    return null;
  }
  async function lookup(url) {
    // Puede cargar ligeramente después del script principal; no bloquea indefinidamente.
    await Promise.race([load,new Promise(resolve=>setTimeout(resolve,900))]);
    const selected=select(url);
    if(!selected?.entry?.payload)return null;
    const age=Date.now()-Date.parse(selected.entry.fetchedAt||snapshot.generatedAt);
    if(!Number.isFinite(age)||age<0||age>7*86400000)return null;
    const ttl=selected.name==='Fixture'?8*3600000:selected.name==='Tabla'?14*3600000:3*86400000;
    return {payload:selected.entry.payload,kind:selected.name,stale:age>ttl,stamp:selected.entry.fetchedAt};
  }
  function mark(entry,fallback=false){
    api.used++;if(fallback)api.fallbacks++;
    render();
  }
  function info(){return {...api};}
  window.PulseHybrid={lookup,mark,info,ready:load};
})();
