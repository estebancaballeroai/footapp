/* Fútbol Pulse 1.7.1 · octubre 2026 — aplicación local/PWA, sin dependencias externas. */
(() => {
  'use strict';
  const LEAGUES = [
    {id:'eng.1', name:'Premier League', country:'Inglaterra', flag:'🏴'},
    {id:'esp.1', name:'LaLiga', country:'España', flag:'🇪🇸'},
    {id:'arg.1', name:'Liga Profesional Argentina', country:'Argentina', flag:'🇦🇷'},
    {id:'fra.1', name:'Ligue 1', country:'Francia', flag:'🇫🇷'},
    {id:'ita.1', name:'Serie A', country:'Italia', flag:'🇮🇹'},
    {id:'ger.1', name:'Bundesliga', country:'Alemania', flag:'🇩🇪', openLiga:'bl1'},
    {id:'uefa.champions', name:'Champions League', country:'Europa', flag:'🏆'},
    {id:'uefa.europa', name:'Europa League', country:'Europa', flag:'🏆'},
    {id:'por.1', name:'Primeira Liga', country:'Portugal', flag:'🇵🇹'},
    {id:'ned.1', name:'Eredivisie', country:'Países Bajos', flag:'🇳🇱'},
    {id:'eng.2', name:'Championship', country:'Inglaterra', flag:'🏴'},
    {id:'ger.2', name:'2. Bundesliga', country:'Alemania', flag:'🇩🇪', openLiga:'bl2'},
    {id:'fra.2', name:'Ligue 2', country:'Francia', flag:'🇫🇷'},
    {id:'usa.1', name:'MLS', country:'Estados Unidos', flag:'🇺🇸'},
    {id:'conmebol.libertadores', name:'Copa Libertadores', country:'Sudamérica', flag:'🏆'},
    {id:'fifa.world', name:'Mundial', country:'Selecciones', flag:'🌍'}
  ];
  const DEFAULT_LEAGUES = ['eng.1','esp.1','fra.1','ita.1','ger.1','uefa.champions','uefa.europa','por.1','arg.1'];
  const CONFIG_KEY = 'futbol-pulse-prefs-v1';
  const CACHE_PREFIX = 'fp-cache-v1:';
  const ESPN = 'https://site.api.espn.com/apis/site/v2/sports/soccer/';
  const OLG = 'https://api.openligadb.de/';
  const SPORTSDB = 'https://www.thesportsdb.com/api/v1/json/123/';
  const $ = id => document.getElementById(id);
  const escapeHTML = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const safeUrl = s => { try { const u = new URL(s); return u.protocol === 'https:' ? escapeHTML(u.href) : ''; } catch { return ''; } };
  const parseStore = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } };
  const stored = parseStore(CONFIG_KEY, {});
  const prefs = {
    leagues:Array.isArray(stored.leagues)?stored.leagues.filter(x=>LEAGUES.some(l=>l.id===x)):DEFAULT_LEAGUES.slice(),
    favoriteTeams:Array.isArray(stored.favoriteTeams)?stored.favoriteTeams:[],
    favoriteMatches:Array.isArray(stored.favoriteMatches)?stored.favoriteMatches:[],
    goalAlerts:stored.goalAlerts !== false,
    alertAll:stored.alertAll === true,
    sound:stored.sound === true,
    refreshInterval:[60,90,180,300].includes(Number(stored.refreshInterval))?Number(stored.refreshInterval):90,
    light:stored.light === true,
    kickoffAlerts: stored.kickoffAlerts === true,
    halfAlerts: stored.halfAlerts === true,
    finalAlerts: stored.finalAlerts === true
  };
  // En esta actualización, incorporar la liga argentina una sola vez a las preferencias antiguas.
  if (Array.isArray(stored.leagues) && !stored.argentineV11 && !prefs.leagues.includes('arg.1')) prefs.leagues.push('arg.1');
  prefs.argentineV11=true;
  if (!prefs.leagues.length) prefs.leagues=['ger.1'];
  const state = {
    tab:'matches', date:localDate(new Date()), filter:'all', league:'all', search:'', matches:[],
    loadedOnce:false, loading:false, lastUpdate:null, loadToken:0, diagnostics:[],
    stale:false, needsRefresh:false, dialogMatch:null, matchDetails:new Map(), standingsCache:new Map(), activeFetch:null,
    fixtureStart:localDate(new Date()), fixtureDays:14, fixtureLeague:'arg.1', fixtureOnlyFavorites:false, fixtureRound:'all', fixtureMatches:[], fixtureLoading:false, fixtureToken:0, fixtureCache:new Map(), fixtureMonthCache:new Map(), fixtureMessage:'',
    teamProfile:null, teamToken:0, teamCache:new Map(), teamPane:'overview', teamSearch:'', teamSelectedPlayer:null, playerProfiles:new Map(), favoritesAgenda:[], agendaLoading:false, agendaToken:0, agendaMessage:'', detailTab:'summary', detailPlayerTeam:'all', detailSearch:'', insightsTab:'table', scorersCache:new Map(), scorersToken:0, h2hCache:new Map(), h2hToken:0, h2hOpen:null, h2hYears:3, pitchSide:'home', mediaToken:0
  };
  let pollTimer=null, lastToastTimer=0, audioContext=null, previousFocus=null;
  const discovery={teams:new Map(),players:[],token:0,loading:false,query:'',kind:'clubs',searched:false,error:''};
  let focusBeforeDiscovery=null;
  function savePrefs(){ try {localStorage.setItem(CONFIG_KEY,JSON.stringify(prefs));} catch {} }
  function localDate(date){return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;}
  function isoForApi(date){return date.replaceAll('-','');}
  function addDays(date, n){const [y,m,d]=date.split('-').map(Number);const dt=new Date(y,m-1,d,12,0,0);dt.setDate(dt.getDate()+n);return localDate(dt);}
  function fmtTime(iso){if(!iso)return '—';const d=new Date(iso);return Number.isNaN(d.getTime())?'—':new Intl.DateTimeFormat('es-ES',{hour:'2-digit',minute:'2-digit'}).format(d);}
  function fmtFullDate(date){const [y,m,d]=date.split('-').map(Number);return new Intl.DateTimeFormat('es-ES',{day:'numeric',month:'long',year:'numeric'}).format(new Date(y,m-1,d,12));}
  function dateOfIso(iso){return iso?localDate(new Date(iso)):'';}
  function leagueInfo(id){return LEAGUES.find(l=>l.id===id)||{id,name:id,country:'',flag:'⚽'};}
  function isLive(m){return m.status==='live' && !m.stale;}
  function numOrNull(x){if(x===null||x===undefined||x==='')return null;const n=Number(x);return Number.isFinite(n)?n:null;}
  function parseESPN(event, leagueId){
    const comp=event.competitions?.[0]||{};
    const clubs=comp.competitors||[];
    const home=clubs.find(c=>c.homeAway==='home')||clubs[0]||{};
    const away=clubs.find(c=>c.homeAway==='away')||clubs[1]||{};
    const st=event.status||comp.status||{};
    const stateText=(st.type?.state||'').toLowerCase();
    const status = stateText==='in'?'live':stateText==='post'?'final':'scheduled';
    const rawClock=st.displayClock||st.type?.shortDetail||st.type?.detail||'';
    const clock=status==='live'?String(rawClock||'EN VIVO'):status==='final'?'FINAL':'';
    const scoreHome=numOrNull(home.score);
    const scoreAway=numOrNull(away.score);
    const date=event.date||comp.date||'';
    const roundRaw=event.week?.number??comp.week?.number??null;
    const round=roundRaw!==null&&Number.isInteger(Number(roundRaw))&&Number(roundRaw)>0?Number(roundRaw):null;
    return {
      id:`${leagueId}:${event.id}`, apiId:String(event.id), league:leagueId, source:'ESPN',
      home:{id:String(home.team?.id||home.id||'home'),name:home.team?.displayName||home.team?.name||'Local',logo:home.team?.logo||home.team?.logos?.[0]?.href||''},
      away:{id:String(away.team?.id||away.id||'away'),name:away.team?.displayName||away.team?.name||'Visitante',logo:away.team?.logo||away.team?.logos?.[0]?.href||''},
      scoreHome,scoreAway,date,status,clock,round,venue:comp.venue?.fullName||'',note:'',goals:[]
    };
  }
  function parseOLG(event,leagueId){
    const res=Array.isArray(event.matchResults)?event.matchResults:[];
    const end=res.find(r=>r.resultTypeID===2)||res.find(r=>r.resultTypeId===2);
    const liveResult=end||res.find(r=>r.resultTypeID===1)||res[res.length-1];
    const goals=Array.isArray(event.goals)?event.goals:[];
    const lastGoal=goals.length?goals[goals.length-1]:null;
    const sH = numOrNull(lastGoal?.scoreTeam1??liveResult?.pointsTeam1);
    const sA = numOrNull(lastGoal?.scoreTeam2??liveResult?.pointsTeam2);
    const rawUtc=String(event.matchDateTimeUTC||'').replace(' ','T');
    const date=rawUtc?( /(Z|[+-]\d\d:\d\d)$/.test(rawUtc)?rawUtc:rawUtc+'Z'):String(event.matchDateTime||'').replace(' ','T');
    const kickMs=new Date(date).getTime();
    const recent=Number.isFinite(kickMs)&&(Date.now()-kickMs>=0)&&(Date.now()-kickMs<=150*60*1000);
    const status=event.matchIsFinished?'final':recent?'unconfirmed':'scheduled';
    return {
      id:`${leagueId}:olg-${event.matchID}`,apiId:String(event.matchID),league:leagueId,source:'OpenLigaDB',
      home:{id:String(event.team1?.teamId||'home'),name:event.team1?.teamName||'Local',logo:event.team1?.teamIconUrl||''},
      away:{id:String(event.team2?.teamId||'away'),name:event.team2?.teamName||'Visitante',logo:event.team2?.teamIconUrl||''},
      scoreHome:sH,scoreAway:sA,date,status,round:null,clock:status==='unconfirmed'?'SIN CONFIRMAR':status==='final'?'FINAL':'',
      venue:event.location?.locationStadium||'',note:'Estado sin confirmar en OpenLigaDB',
      goals:goals.map(g=>({minute:g.matchMinute??'',text:g.goalGetterName||'Gol',home:g.scoreTeam1,away:g.scoreTeam2}))
    };
  }
  async function fetchJSON(url,timeout=12000){
    // Híbrido: únicamente tablas, directorios y meses del fixture.
    // Los marcadores diarios / en directo nunca se obtienen de esta caché.
    let shared=null;
    if(window.PulseHybrid){
      try {shared=await window.PulseHybrid.lookup(url);}catch{}
    }
    if(shared&&!shared.stale){
      window.PulseHybrid.mark(shared);
      return shared.payload;
    }
    const ctrl=new AbortController(); const timer=setTimeout(()=>ctrl.abort(),timeout);
    try {
      const response=await fetch(url,{signal:ctrl.signal,cache:'no-store',headers:{Accept:'application/json'}});
      if(!response.ok)throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch(error){
      // Sólo como respaldo, siempre señalando visualmente que está desactualizado.
      if(shared){window.PulseHybrid.mark(shared,true);return shared.payload;}
      throw error;
    } finally {clearTimeout(timer);}
  }
  async function loadLeague(league,date){
    try {
      const response=await fetchJSON(`${ESPN}${encodeURIComponent(league.id)}/scoreboard?dates=${isoForApi(date)}&limit=150`);
      if(!Array.isArray(response.events))throw new Error('Respuesta sin partidos');
      return {items:response.events.map(e=>parseESPN(e,league.id)).filter(e=>e.apiId!=='undefined'),source:'ESPN'};
    } catch(espnError) {
      if(!league.openLiga)throw new Error(`${league.name}: ${espnError.message}`);
      try {
        const startYear=Number(date.substring(0,4))-(Number(date.substring(5,7))<7?1:0);
        const events=await fetchJSON(`${OLG}getmatchdata/${league.openLiga}/${startYear}`,16000);
        if(!Array.isArray(events))throw new Error('Respuesta desconocida');
        const items=events.map(e=>parseOLG(e,league.id)).filter(e=>dateOfIso(e.date)===date);
        return {items,source:'OpenLigaDB',fallback:true};
      } catch(olgError){throw new Error(`${league.name}: ESPN (${espnError.message}); OpenLigaDB (${olgError.message})`);}
    }
  }
  async function runPool(items, limit, callback){
    const output=new Array(items.length); let cursor=0;
    await Promise.all(Array.from({length:Math.min(items.length,limit)},async()=>{
      while(cursor<items.length){const i=cursor++;try{output[i]={ok:true,...await callback(items[i])};}catch(error){output[i]={ok:false,error:String(error?.message||error)};}}
    }));return output;
  }
  function storeLeague(date,leagueId,items){
    try { localStorage.setItem(`${CACHE_PREFIX}${date}:${leagueId}`,JSON.stringify({saved:Date.now(),items}));
      // Descarta cachés antiguos para impedir crecimiento ilimitado.
      for(let i=localStorage.length-1;i>=0;i--){const k=localStorage.key(i);if(k?.startsWith(CACHE_PREFIX)){
        const raw=localStorage.getItem(k);try{if(Date.now()-JSON.parse(raw).saved>7*86400000)localStorage.removeItem(k);}catch{localStorage.removeItem(k);}
      }}
    } catch {} 
  }
  function readLeague(date,leagueId){const entry=parseStore(`${CACHE_PREFIX}${date}:${leagueId}`,null);return entry&&Date.now()-entry.saved<=7*86400000&&Array.isArray(entry.items)?entry.items:null;}
  async function refresh({silent=false}={}){
    if(state.loading){state.needsRefresh=true;return;}
    const token=++state.loadToken, date=state.date;
    const selections=prefs.leagues.map(leagueInfo);
    const oldMatches=state.date===date?state.matches.slice():[];
    state.loading=true;
    $('refresh-button').classList.add('spinning');
    $('refresh-button').disabled=true;
    if(!silent&&!state.loadedOnce){$('matches-list').innerHTML='<div class="loading-card">Consultando los marcadores de Internet…</div>';}
    try {
      const results=await runPool(selections,4,l=>loadLeague(l,date));
      if(token!==state.loadToken || date!==state.date)return;
      let failures=0, successes=0, fromCache=0;const diagnostics=[];let matches=[];
      results.forEach((result,i)=>{
        const league=selections[i];
        if(result.ok){successes++;matches.push(...result.items.filter(m=>dateOfIso(m.date)===date));storeLeague(date,league.id,result.items);diagnostics.push(`${league.name}: ${result.source}${result.fallback?' (respaldo)':''} · ${result.items.length} partidos`);}
        else {failures++;const cached=readLeague(date,league.id);if(cached){fromCache++;matches.push(...cached.map(m=>({...m,stale:true})));}
          diagnostics.push(`${league.name}: ERROR ${result.error}${cached?' · caché guardada':''}`);}
      });
      const seen=new Set();matches=matches.filter(m=>m&&m.id&&!seen.has(m.id)&&seen.add(m.id));
      if(successes>0 && date===localDate(new Date()) && state.loadedOnce && oldMatches.length){detectChanges(oldMatches,matches);}
      state.matches=matches;state.diagnostics=diagnostics;state.stale=failures>0;state.lastUpdate=successes>0?new Date():state.lastUpdate;
      state.loadedOnce=true;
      if(successes===0){setBanner(`No se ha podido consultar ninguna fuente en directo. ${fromCache?'Se muestran datos guardados anteriormente, no actualizados.':'Comprueba la conexión o vuelve a intentar la consulta.'}`);}
      else if(failures){setBanner(`${successes} de ${selections.length} fuentes consultadas. ${failures} fallaron; los datos que aparezcan de ellas pueden estar desactualizados.`);}
      else setBanner('');
      $('source-diagnostics').textContent=diagnostics.join('\n');
      $('sidebar-status').textContent=successes?`${successes}/${selections.length} fuentes disponibles`:'Sin conexión a las fuentes';
      $('sidebar-dot').className=`connection-dot ${successes?'ok':'bad'}`;
      render();
    } catch(error){setBanner(`Error inesperado: ${error.message}`);}
    finally{state.loading=false;$('refresh-button').classList.remove('spinning');$('refresh-button').disabled=false;reschedule();if(state.needsRefresh){state.needsRefresh=false;queueMicrotask(()=>refresh());}}
  }
  function detectChanges(oldList,newList){
    if(![prefs.goalAlerts,prefs.kickoffAlerts,prefs.halfAlerts,prefs.finalAlerts].some(Boolean))return;
    const oldMap=new Map(oldList.map(m=>[m.id,m]));
    newList.forEach(m=>{
      const old=oldMap.get(m.id);
      if(!old||m.stale||old.stale)return;
      if(!prefs.alertAll && !prefs.favoriteMatches.includes(m.id) && ![m.home,m.away].some(t=>prefs.favoriteTeams.some(f=>f.id===t.id&&f.league===m.league)))return;
      const body=`${m.home.name} ${m.scoreHome??'–'}–${m.scoreAway??'–'} ${m.away.name}`;
      let title='';
      const changed=m.scoreHome!==null&&m.scoreAway!==null&&old.scoreHome!==null&&old.scoreAway!==null&&(m.scoreHome!==old.scoreHome||m.scoreAway!==old.scoreAway);
      if(changed && prefs.goalAlerts && ['live','unconfirmed'].includes(m.status)){
        const team=m.scoreHome>old.scoreHome?m.home.name:m.scoreAway>old.scoreAway?m.away.name:'Marcador corregido';
        title=m.scoreHome>old.scoreHome||m.scoreAway>old.scoreAway?`⚽ ¡Gol de ${team}!`:'Marcador rectificado';
      }else if(prefs.kickoffAlerts && old.status==='scheduled'&&m.status==='live')title='▶ Comenzó el partido';
      else if(prefs.halfAlerts && old.status==='live'&&m.status==='live'&&/half|descanso|ht/i.test(m.clock)&&!/half|descanso|ht/i.test(old.clock))title='⏸ Descanso';
      else if(prefs.finalAlerts && old.status==='live'&&m.status==='final')title='🏁 Final del partido';
      if(!title)return;
      toast(`${title} · ${body}`);
      if(prefs.sound)playSound();
      try{if('Notification' in window && Notification.permission==='granted' && document.visibilityState==='visible'){new Notification(title,{body,icon:'icon-192.png',tag:`event-${m.id}`});}}catch{}
    });
  }
  function playSound(){try{const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return;audioContext ||= new AC(); const osc=audioContext.createOscillator(),gain=audioContext.createGain();osc.type='sine';osc.frequency.setValueAtTime(660,audioContext.currentTime);osc.frequency.exponentialRampToValueAtTime(990,audioContext.currentTime+.13);gain.gain.setValueAtTime(.055,audioContext.currentTime);gain.gain.exponentialRampToValueAtTime(.001,audioContext.currentTime+.22);osc.connect(gain);gain.connect(audioContext.destination);osc.start();osc.stop(audioContext.currentTime+.22);}catch{}}
  function setBanner(text){const el=$('status-message');el.hidden=!text;el.textContent=text;if(text){const b=document.createElement('button');b.type='button';b.className='banner-retry';b.dataset.action='retry-network';b.textContent='↻ Reintentar';el.append(b);}}
  function toast(message){const node=document.createElement('div');node.className='toast';node.textContent=message;$('toast-root').append(node);setTimeout(()=>node.remove(),5500);}
  function teamLogo(team){const image=safeUrl(team.logo);return image?`<img class="team-logo" src="${image}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.style.display='none'">`:`<span class="team-monogram">${escapeHTML((team.name||'?').trim().charAt(0).toUpperCase())}</span>`;}
  function teamKey(league,team){return `${league}:${team.id}`;}
  function isFavTeam(league,team){return prefs.favoriteTeams.some(f=>f.league===league && f.id===team.id);}
  function renderMatch(m){
    const time=m.stale?'<div class="match-time" title="Resultado anterior, sin actualizar">DATOS<br>GUARD.</div>':m.status==='live'?`<div class="match-time live">● ${escapeHTML(m.clock||'EN VIVO')}</div>`:m.status==='final'?'<div class="match-time final">FINAL</div>':m.status==='unconfirmed'?'<div class="match-time" title="Estado sin confirmar por la fuente">SIN<br>CONF.</div>':`<div class="match-time">${escapeHTML(fmtTime(m.date))}</div>`;
    const scored=m.status!=='scheduled'&&m.scoreHome!==null&&m.scoreAway!==null;
    const score=scored?`<div class="score"><div class="score-number">${m.scoreHome}</div><div class="score-number">${m.scoreAway}</div></div>`:`<div class="score kickoff-score">–<br>–</div>`;
    const teamLine=(team)=>`<div class="team-line">${teamLogo(team)}<button type="button" class="team-name team-link" data-action="open-team" data-league="${escapeHTML(m.league)}" data-team="${escapeHTML(team.id)}" data-match="${escapeHTML(m.id)}" title="Ficha de ${escapeHTML(team.name)}">${escapeHTML(team.name)}</button><button type="button" class="fav-team-button ${isFavTeam(m.league,team)?'active':''}" data-action="team-fav" data-team="${escapeHTML(team.id)}" data-match="${escapeHTML(m.id)}" title="${isFavTeam(m.league,team)?'Quitar favorito':'Seguir equipo'}" aria-label="Seguir o dejar de seguir a ${escapeHTML(team.name)}">${isFavTeam(m.league,team)?'★':'☆'}</button></div>`;
    return `<div class="match-row" role="button" tabindex="0" data-match="${escapeHTML(m.id)}" title="Abrir detalles">${time}<div class="teams">${teamLine(m.home)}${teamLine(m.away)}</div>${score}<div class="match-action"><button type="button" title="Detalles" data-action="details" data-match="${escapeHTML(m.id)}" aria-label="Ver detalles">›</button></div></div>`;
  }
  function renderGrouped(matches,target){
    if(!matches.length){$(target).innerHTML='<div class="empty-card"><strong>No hay partidos para mostrar</strong>Prueba con otra fecha, liga o filtro.</div>';return;}
    const groups=new Map();
    for(const m of matches){if(!groups.has(m.league))groups.set(m.league,[]);groups.get(m.league).push(m);}
    $(target).innerHTML=[...groups].map(([id,items])=>{
      const l=leagueInfo(id);items.sort((a,b)=>statusSort(a)-statusSort(b)||(Date.parse(a.date)||0)-(Date.parse(b.date)||0));
      return `<section class="league-card"><header class="league-header"><div class="league-info"><span class="league-flag">${l.flag}</span><div><div class="league-name">${escapeHTML(l.name)}</div><div class="league-country">${escapeHTML(l.country)}</div></div></div><span class="league-count">${items.length} ${items.length===1?'partido':'partidos'}${items.some(x=>x.source==='OpenLigaDB')?' · respaldo':''}</span></header>${items.map(renderMatch).join('')}</section>`;
    }).join('');
  }
  function statusSort(m){return m.status==='live'?0:m.status==='unconfirmed'?1:m.status==='scheduled'?2:3;}
  function filteredMatches(){return state.matches.filter(m=>{
    if(state.league!=='all'&&m.league!==state.league)return false;
    if(state.filter==='live'&&!isLive(m))return false;
    if(state.filter==='final'&&m.status!=='final')return false;
    if(state.filter==='scheduled'&&m.status!=='scheduled'&&m.status!=='unconfirmed')return false;
    if(state.search&&!`${m.home.name} ${m.away.name} ${leagueInfo(m.league).name}`.toLowerCase().includes(state.search.toLowerCase()))return false;
    return true;
  });}
  function renderMetrics(){const all=state.matches;const live=all.filter(isLive).length;const final=all.filter(m=>m.status==='final').length;const forthcoming=all.filter(m=>m.status==='scheduled'||m.status==='unconfirmed').length;
    $('dashboard-metrics').innerHTML=`<div class="metric-card live"><small>EN DIRECTO</small><strong>${live}</strong><span class="metric-icon">◉</span></div><div class="metric-card"><small>POR JUGAR</small><strong>${forthcoming}</strong><span class="metric-icon">◷</span></div><div class="metric-card"><small>FINALIZADOS</small><strong>${final}</strong><span class="metric-icon">▥</span></div>`;
    $('nav-live-count').textContent=live;
    renderMatchdayExtras();
  }
  function renderMatchdayExtras(){
    const date=state.date;const d=new Date(date+'T12:00:00');
    $('hero-date').textContent=new Intl.DateTimeFormat('es-ES',{weekday:'long',day:'numeric',month:'long'}).format(d);
    const matches=state.matches.slice().sort((a,b)=>statusSort(a)-statusSort(b)||(Date.parse(a.date)||0)-(Date.parse(b.date)||0));
    const active=matches.filter(isLive);
    const highlighted=(active.length?active:matches.filter(m=>m.status==='scheduled')).slice(0,5);
    $('pulse-live-strip').innerHTML=highlighted.length?highlighted.map(m=>`<button type="button" class="pulse-spotlight-card" data-spotlight-match="${escapeHTML(m.id)}"><span class="spotlight-league">${escapeHTML(leagueInfo(m.league).flag)} ${escapeHTML(leagueInfo(m.league).name)}</span><span class="spotlight-teams"><span>${teamLogo(m.home)} ${escapeHTML(m.home.name)}</span><span>${teamLogo(m.away)} ${escapeHTML(m.away.name)}</span></span><span class="spotlight-score">${m.status==='scheduled'?escapeHTML(fmtTime(m.date)):(m.scoreHome??'–')+' : '+(m.scoreAway??'–')}</span><span class="spotlight-state ${isLive(m)?'hot':''}">${isLive(m)?'● EN VIVO':m.status==='final'?'FINAL':'PRÓXIMO'}</span></button>`).join(''):'<div class="spotlight-empty">Todavía no hay encuentros destacados para esta fecha. Elegí otro día o actualizá.</div>';
    const weekdays=['dom','lun','mar','mié','jue','vie','sáb'];const center=localDate(new Date());
    $('quick-date-strip').innerHTML=Array.from({length:7},(_,i)=>{
      const date=addDays(state.date,i-3);const dt=new Date(date+'T12:00:00');
      return `<button type="button" class="quick-day ${date===state.date?'chosen':''} ${date===center?'is-today':''}" data-quick-date="${date}" aria-pressed="${date===state.date}"><small>${weekdays[dt.getDay()]}</small><b>${dt.getDate()}</b>${date===center?'<i>HOY</i>':''}</button>`;
    }).join('');
    const leagues=prefs.leagues.map(leagueInfo).filter(l=>l.id).slice(0,9);
    $('quick-leagues').innerHTML=`<button type="button" data-quick-league="all" class="quick-league ${state.league==='all'?'selected':''}">Todas</button>`+leagues.map(l=>`<button type="button" data-quick-league="${escapeHTML(l.id)}" class="quick-league ${state.league===l.id?'selected':''}">${l.flag} ${escapeHTML(l.name)}</button>`).join('');
  }
  function renderFavorites(){
    const teams=prefs.favoriteTeams;
    $('favorite-teams').innerHTML=teams.length?teams.map(t=>`<span class="fav-tag">${teamLogo(t)} <button type="button" class="fav-team-name" data-action="open-team" data-league="${escapeHTML(t.league)}" data-team="${escapeHTML(t.id)}">${escapeHTML(t.name)}</button> <button type="button" data-action="remove-team" data-teamkey="${escapeHTML(teamKey(t.league,t))}" title="Quitar favorito">✕</button></span>`).join(''):'<p class="disclaimer">Pulsa ☆ al lado de un equipo para seguirlo.</p>';
    const matches=state.matches.filter(m=>prefs.favoriteMatches.includes(m.id)||[m.home,m.away].some(t=>isFavTeam(m.league,t)));
    renderGrouped(matches,'favorite-matches');
    renderFavoritesAgenda();
  }
  function updateNav(){document.querySelectorAll('[data-tab]').forEach(b=>b.classList.toggle('active',b.dataset.tab===state.tab));['matches','fixture','favorites','standings','settings'].forEach(k=>{ $(`${k}-view`).hidden=k!==state.tab; });
    const titles={matches:['Resultados',state.date===localDate(new Date())?'de hoy':fmtFullDate(state.date)],fixture:['Calendario','y fixture'],favorites:['Tus','favoritos'],standings:['Tablas','de posiciones'],settings:['Configuración','personal']};
    $('page-title').innerHTML=`${escapeHTML(titles[state.tab][0])} <span>${escapeHTML(titles[state.tab][1])}</span>`;
    $('page-description').textContent=state.tab==='matches'?'Resultados reales y seguimiento de competiciones.':state.tab==='fixture'?'Próximos encuentros por liga, semana o mes.':state.tab==='favorites'?'Tu agenda, fichas y partidos favoritos.':state.tab==='standings'?'Consulta puntos, victorias y diferencias de gol.':'Decide qué quieres seguir y cómo recibir avisos.';
  }
  function render(){
    document.body.classList.toggle('light',prefs.light);
    $('match-date').value=state.date;
    $('last-update').textContent=state.lastUpdate?`Actualizado ${new Intl.DateTimeFormat('es-ES',{hour:'2-digit',minute:'2-digit'}).format(state.lastUpdate)}${state.stale?' · parcial':''}`:'Sin actualizar';
    renderMetrics();renderGrouped(filteredMatches(),'matches-list');renderFavorites();renderFixture();updateNav();
    document.querySelectorAll('[data-filter]').forEach(b=>b.classList.toggle('active',b.dataset.filter===state.filter));
  }
  function selectedTab(tab){if(!['matches','fixture','favorites','standings','settings'].includes(tab))return;state.tab=tab;render();if(tab==='standings')loadStandings();if(tab==='fixture')loadFixture();if(tab==='favorites')loadFavoritesAgenda();if(tab==='settings')syncSettings();}
  function findMatch(id){return state.matches.find(x=>x.id===id)||state.fixtureMatches.find(x=>x.id===id)||state.favoritesAgenda.find(x=>x.id===id)||[...state.teamCache.values()].flatMap(c=>c.events).find(x=>x.id===id)||[...state.h2hCache.values()].flatMap(c=>c.items).find(x=>x.id===id);}
  function fixtureKey(){return `${state.fixtureLeague}:${state.fixtureStart}:${state.fixtureDays}`;}
  function updateFixtureSelectors(){
    const choices=prefs.leagues.map(id=>leagueInfo(id));
    const selected=$('fixture-league').value||state.fixtureLeague;
    $('fixture-league').innerHTML='<option value="all">Todas las ligas activadas</option>'+choices.map(l=>`<option value="${escapeHTML(l.id)}">${l.flag} ${escapeHTML(l.name)}</option>`).join('');
    state.fixtureLeague=selected==='all'?'all':choices.some(l=>l.id===selected)?selected:(choices.some(l=>l.id==='arg.1')?'arg.1':choices[0]?.id||'all');
    $('fixture-league').value=state.fixtureLeague;
  }
  function renderFixture(){
    $('fixture-start').value=state.fixtureStart;
    $('fixture-days').value=String(state.fixtureDays);
    $('fixture-favorites').checked=state.fixtureOnlyFavorites;
    const rounds=[...new Set(state.fixtureMatches.map(m=>m.round).filter(Number.isInteger))].sort((a,b)=>a-b);
    const roundSelect=$('fixture-round');
    const showRounds=rounds.length>0;
    $('fixture-round-wrapper').hidden=!showRounds;
    if(showRounds){roundSelect.innerHTML='<option value="all">Todas las jornadas</option>'+rounds.map(n=>`<option value="${n}">Jornada ${n}</option>`).join('');
      if(state.fixtureRound!=='all'&&!rounds.includes(Number(state.fixtureRound)))state.fixtureRound='all';roundSelect.value=state.fixtureRound;}
    const end=addDays(state.fixtureStart,state.fixtureDays-1);
    $('fixture-range-label').textContent=`Del ${fmtFullDate(state.fixtureStart)} al ${fmtFullDate(end)}`;
    if(state.fixtureLoading){$('fixture-list').innerHTML='<div class="loading-card">Buscando el fixture...</div>';return;}
    if(state.fixtureMessage){$('fixture-message').hidden=false;$('fixture-message').textContent=state.fixtureMessage;}else{$('fixture-message').hidden=true;}
    const matches=state.fixtureMatches.filter(m=>(state.fixtureRound==='all'||m.round===Number(state.fixtureRound))&&(!state.fixtureOnlyFavorites||prefs.favoriteMatches.includes(m.id)||[m.home,m.away].some(t=>isFavTeam(m.league,t)))).slice();
    matches.sort((a,b)=>(Date.parse(a.date)||0)-(Date.parse(b.date)||0));
    if(!matches.length){$('fixture-list').innerHTML='<div class="empty-card"><strong>Sin partidos para este intervalo</strong>Prueba otra liga, fecha o desactiva «Solo favoritos». Si hubo errores, comprueba los avisos superiores.</div>';return;}
    const days=new Map();
    for(const m of matches){const date=dateOfIso(m.date);if(!date)continue;if(!days.has(date))days.set(date,[]);days.get(date).push(m);}
    $('fixture-list').innerHTML=[...days].map(([day,list])=>`<div class="fixture-date"><span>${escapeHTML(new Intl.DateTimeFormat('es-ES',{weekday:'long',day:'numeric',month:'long'}).format(new Date(day+'T12:00:00')))}</span><span>${list.length} ${list.length===1?'partido':'partidos'}</span></div><div class="fixture-day-matches">${groupHTML(list)}</div>`).join('');
  }
  function groupHTML(matches){
    const grouped=new Map();for(const m of matches){if(!grouped.has(m.league))grouped.set(m.league,[]);grouped.get(m.league).push(m);}
    return [...grouped].map(([id,list])=>{const l=leagueInfo(id);return `<section class="league-card"><header class="league-header"><div class="league-info"><span class="league-flag">${l.flag}</span><div><div class="league-name">${escapeHTML(l.name)}</div><div class="league-country">${escapeHTML(l.country)}</div></div></div><span class="league-count">${list.length}</span></header>${list.map(renderMatch).join('')}</section>`;}).join('');
  }
  // La API pública de ESPN rechaza ?dates=AAAAMMDD-AAAAMMDD (HTTP 400).
  // Consulta meses completos (?dates=AAAAMM) y aplica el intervalo en el navegador.
  function fixtureMonths(start,end){
    const result=[];
    let month=start.slice(0,7);
    while(month <= end.slice(0,7)){
      result.push(month.replace('-',''));
      const year=Number(month.slice(0,4)),m=Number(month.slice(5,7));
      month=localDate(new Date(year,m,1,12)).slice(0,7);
    }
    return result;
  }
  function daysInMonthRange(month,start,end){
    const begin=month.slice(0,4)+'-'+month.slice(4,6)+'-01';
    const finish=localDate(new Date(Number(month.slice(0,4)),Number(month.slice(4,6)),0,12));
    const first=begin>start?begin:start,last=finish<end?finish:end,days=[];
    for(let date=first;date<=last;date=addDays(date,1))days.push(date);
    return days;
  }
  async function loadFixtureMonth(league,month,start,end,force=false,limitedFallback=false){
    const key=league.id+':'+month;
    const saved=state.fixtureMonthCache.get(key);
    if(!force&&saved&&Date.now()-saved.saved<180000)return {items:saved.items,warning:''};
    const base=`${ESPN}${encodeURIComponent(league.id)}/scoreboard`;
    try {
      const data=await fetchJSON(`${base}?dates=${month}&limit=500`,18000);
      if(!Array.isArray(data.events))throw new Error('Formato de respuesta no válido');
      const items=data.events.map(e=>parseESPN(e,league.id)).filter(m=>m.apiId!=='undefined'&&m.date);
      state.fixtureMonthCache.set(key,{saved:Date.now(),items});
      return {items,warning:''};
    } catch (monthError) {
      // Respaldo mediante fechas individuales, si el proveedor no admite un mes.
      // Para «Todas las ligas» se limita la consulta de respaldo y se avisa de cobertura parcial.
      const allDays=daysInMonthRange(month,start,end);
      const days=limitedFallback?allDays.slice(0,7):allDays;
      const responses=await runPool(days,3,async date=>{
        const data=await fetchJSON(`${base}?dates=${isoForApi(date)}&limit=150`,13000);
        if(!Array.isArray(data.events))throw new Error('Formato de respuesta no válido');
        return {items:data.events.map(e=>parseESPN(e,league.id)).filter(m=>m.apiId!=='undefined'&&m.date)};
      });
      const passed=responses.filter(r=>r.ok),failed=responses.length-passed.length;
      if(!passed.length)throw new Error(`consulta mensual (${monthError.message}) y diaria (${responses[0]?.error||'sin acceso'})`);
      const items=passed.flatMap(r=>r.items);
      const incomplete=failed>0||days.length<allDays.length;
      const warning=incomplete?`${league.name}: calendario parcial (${passed.length}/${allDays.length} días consultados, algunos días sin respuesta o sin consultar).`:
        `${league.name}: consultado por días porque ESPN rechazó la petición mensual.`;
      return {items,warning};
    }
  }
  async function loadFixture(force=false){
    if(state.tab!=='fixture')return;
    const leagues=state.fixtureLeague==='all'?prefs.leagues.map(leagueInfo):[leagueInfo(state.fixtureLeague)];
    const start=state.fixtureStart,end=addDays(start,state.fixtureDays-1),key=fixtureKey(),token=++state.fixtureToken;
    if(!force&&state.fixtureCache.has(key)){
      const cached=state.fixtureCache.get(key);
      if(Date.now()-cached.saved<180000){state.fixtureMatches=cached.items;state.fixtureMessage=cached.message;renderFixture();return;}
    }
    state.fixtureLoading=true;state.fixtureMessage='';renderFixture();
    const months=fixtureMonths(start,end),allLeagues=state.fixtureLeague==='all';
    const results=await runPool(leagues,3,async league=>{
      const monthly=await runPool(months,2,month=>loadFixtureMonth(league,month,start,end,force,allLeagues));
      const valid=monthly.filter(r=>r.ok);
      if(!valid.length)throw new Error(monthly.map(r=>r.error).filter(Boolean).slice(0,2).join(' · ')||'Ninguna fecha disponible');
      const warnings=valid.map(r=>r.warning).filter(Boolean);
      if(valid.length<months.length)warnings.push(`${league.name}: faltan ${months.length-valid.length} meses.`);
      return {items:valid.flatMap(r=>r.items).filter(m=>dateOfIso(m.date)>=start&&dateOfIso(m.date)<=end),warnings};
    });
    if(token!==state.fixtureToken)return;
    let successes=0,failures=0;const all=[],warnings=[];
    results.forEach((result,i)=>{
      if(result.ok){successes++;all.push(...result.items);warnings.push(...result.warnings);}
      else{failures++;warnings.push(`${leagues[i].name}: ${result.error}`);}
    });
    state.fixtureMatches=[...new Map(all.map(m=>[m.id,m])).values()].sort((a,b)=>(Date.parse(a.date)||0)-(Date.parse(b.date)||0));
    state.fixtureMessage=failures?`${successes}/${leagues.length} ligas consultadas. ${warnings.slice(0,3).join(' · ')}`:warnings.slice(0,3).join(' · ');
    if(!successes)state.fixtureMessage='No se pudo consultar el calendario. '+warnings.slice(0,2).join(' · ');
    state.fixtureLoading=false;
    if(successes)state.fixtureCache.set(key,{saved:Date.now(),items:state.fixtureMatches,message:state.fixtureMessage});
    renderFixture();
  }
  function toggleTeam(m,id){const team=[m.home,m.away].find(t=>t.id===id);if(!team)return;const ix=prefs.favoriteTeams.findIndex(f=>f.league===m.league&&f.id===id);if(ix>=0){prefs.favoriteTeams.splice(ix,1);toast(`Ya no sigues a ${team.name}`);}else{prefs.favoriteTeams.push({...team,league:m.league,source:m.source});toast(`Siguiendo a ${team.name}`);}savePrefs();render();}
  function toggleMatch(id){const idx=prefs.favoriteMatches.indexOf(id);if(idx>=0){prefs.favoriteMatches.splice(idx,1);toast('Partido eliminado de favoritos');}else{prefs.favoriteMatches.push(id);toast('Partido añadido a favoritos');}savePrefs();render();}
  function readStat(stats,keys){if(!Array.isArray(stats))return null;const s=stats.find(v=>keys.some(k=>[v.name,v.abbreviation,v.shortDisplayName,v.displayName].map(x=>String(x||'').toLowerCase()).includes(k.toLowerCase())));return s?numOrNull(s.value??s.displayValue):null;}
  function findEntries(obj,seen=new Set()){
    if(!obj||typeof obj!=='object'||seen.has(obj))return [];
    seen.add(obj);
    let out=[];
    if(Array.isArray(obj.entries))out.push(...obj.entries);
    for(const child of obj.children||[])out.push(...findEntries(child,seen));
    if(obj.standings){
      if(Array.isArray(obj.standings))for(const item of obj.standings)out.push(...findEntries(item,seen));
      else out.push(...findEntries(obj.standings,seen));
    }
    return out;
  }
  function standingsESPN(data){
    const raw=findEntries(data);
    return raw.map((item,index)=>{
      const s=item.stats||[];const team=item.team||{};
      return {id:String(team.id||''),pos:readStat(s,['rank','position'])??index+1,name:team.displayName||team.name||'',logo:team.logos?.[0]?.href||team.logo||'',
        gp:readStat(s,['gamesPlayed','GP','played']),w:readStat(s,['wins','W']),d:readStat(s,['ties','draws','D']),l:readStat(s,['losses','L']),
        gf:readStat(s,['pointsFor','goalsFor','F','GF']),ga:readStat(s,['pointsAgainst','goalsAgainst','A','GA']),
        gd:readStat(s,['pointDifferential','goalDifference','GD']),pts:readStat(s,['points','pointTotal','totalPoints','PTS','P'])};
    }).filter(x=>x.name).sort((a,b)=>a.pos-b.pos);
  }
  // LPF 2026: zonas oficiales para Apertura y Clausura, publicadas por la AFA.
  // Solo se usan para rescatar una respuesta PLANA de 2026; no se inventan estadísticas.
  const LPF_2026 = Object.freeze({
    A:['Platense','Defensa y Justicia','Central Córdoba','Lanús','Deportivo Riestra','Talleres','Boca','Estudiantes','Instituto','Gimnasia Mza','San Lorenzo','Independiente','Newells','Unión','Vélez'],
    B:['Argentinos','Aldosivi','Atlético Tucumán','Banfield','Barracas Central','Belgrano','River','Gimnasia','Estudiantes Río Cuarto','Independiente Rivadavia','Huracán','Racing','Rosario Central','Sarmiento','Tigre']
  });
  function foldName(value){return String(value||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim();}
  function arg2026Zone(value){
    const n=foldName(value);
    if(!n)return null;
    // Los tres clubes homónimos y el Independiente mendocino se distinguen ANTES de las coincidencias genéricas.
    if(/estudiantes/.test(n))return /rio cuarto|r c(?:\b|$)|estudiantes rc/.test(n)?'B':'A';
    if(/gimnasia/.test(n))return /mendoza|mza|mend/.test(n)?'A':'B';
    if(/independiente/.test(n))return /rivadavia|mendoza|mza/.test(n)?'B':'A';
    const aliases={
      A:[['platense'],['defensa y justicia'],['central cordoba'],['lanus'],['riestra'],['talleres'],['boca'],['instituto'],['san lorenzo'],['newell'],['union santa fe','union'],['velez']],
      B:[['argentinos'],['aldosivi'],['atletico tucuman'],['banfield'],['barracas'],['belgrano'],['river'],['huracan'],['racing'],['rosario central'],['sarmiento'],['tigre']]
    };
    for(const [group,options] of Object.entries(aliases))if(options.some(patterns=>patterns.some(x=>n.includes(x))))return group;
    return null;
  }
  function groupLabel(name){const n=foldName(name);if(/(?:zona|grupo|group)\s*a\b/.test(n))return 'A';if(/(?:zona|grupo|group)\s*b\b/.test(n))return 'B';return null;}
  // Distingue grupos verdaderos de las tablas globales y conserva el orden que devuelva el proveedor.
  function standingsGroups(data){
    const found={};const visited=new Set();
    function walk(node){
      if(!node||typeof node!=='object'||visited.has(node))return;visited.add(node);
      if(Array.isArray(node)){node.forEach(walk);return;}
      const title=String(node.name||node.displayName||node.abbreviation||node.group?.name||'');
      const label=groupLabel(title);
      const entries=Array.isArray(node.entries)?node.entries:Array.isArray(node.standings?.entries)?node.standings.entries:null;
      if(label&&entries?.length){const rows=standingsESPN({entries});if(rows.length>=(found[label]?.length||0))found[label]=rows;}
      walk(node.children);walk(node.standings);walk(node.groups);
    }
    walk(data);
    if(!found.A?.length||!found.B?.length)return [];
    const a=new Set(found.A.map(x=>x.id||foldName(x.name)));
    if(found.B.some(x=>a.has(x.id||foldName(x.name))))return [];
    return [{name:'Zona A',rows:found.A},{name:'Zona B',rows:found.B}];
  }
  function argentinaGroups(data,rows){
    const native=standingsGroups(data);
    if(native.length===2)return {groups:native,note:'Zonas publicadas por ESPN',source:'ESPN'};
    const season=Number(data?.season?.year||data?.season?.startYear||new Date().getFullYear());
    if(season!==2026)return {groups:[],note:'ESPN no identifica zonas para esta temporada',source:'ESPN'};
    const a=[],b=[],unknown=[];
    for(const row of rows){const zone=arg2026Zone(row.name);if(zone==='A')a.push({...row});else if(zone==='B')b.push({...row});else unknown.push(row);}
    // Exactamente los 30 clubes, sin homónimos duplicados o no identificados.
    if(rows.length!==30||a.length!==15||b.length!==15||unknown.length){return {groups:[],note:`No es seguro separar esta tabla: ${a.length} Zona A, ${b.length} Zona B, ${unknown.length} sin identificar. No se muestran grupos inventados.`,source:'ESPN'};}
    const sortRows=(list)=>{
      const ranks=list.map(r=>r.pos);
      if(new Set(ranks).size===15&&ranks.every(n=>n>=1&&n<=15))return list.sort((x,y)=>x.pos-y.pos);
      list.sort((x,y)=>(y.pts??-1)-(x.pts??-1)||(y.gd??-999)-(x.gd??-999)||(y.gf??-1)-(x.gf??-1));
      return list.map((r,i)=>({...r,pos:i+1}));
    };
    return {groups:[{name:'Zona A',rows:sortRows(a)},{name:'Zona B',rows:sortRows(b)}],note:'Zonas según LPF/AFA 2026; orden provisional por puntos, diferencia y goles si ESPN no identifica el puesto por zona. Los desempates oficiales pueden diferir.',source:'ESPN + LPF/AFA 2026'};
  }
  function standingsOLG(data){return data.map((x,index)=>({pos:index+1,name:x.teamInfo?.teamName||x.teamName||'',logo:x.teamInfo?.teamIconUrl||'',gp:numOrNull(x.matches),w:numOrNull(x.won),d:numOrNull(x.draw),l:numOrNull(x.lost),gf:numOrNull(x.goals),ga:numOrNull(x.opponentGoals),gd:numOrNull(x.goalDiff),pts:numOrNull(x.points)}));}
  function tableCell(value){return value===null||value===undefined?'—':escapeHTML(value);}
  function renderLeagueInsights(code){
    const target=$('league-insights-content'),info=state.standingsCache.get(code);
    if(!info){target.innerHTML='<div class="loading-card">Consultando estadísticas de temporada…</div>';return;}
    const rows=info.rows||[];
    const usable=rows.filter(r=>r.gp!==null && r.gp>0);
    if(!usable.length){target.innerHTML='<div class="empty-card"><strong>Datos insuficientes</strong>La fuente no ofrece partidos jugados para calcular la temporada.</div>';return;}
    const valid=(key)=>usable.filter(r=>r[key]!==null&&Number.isFinite(r[key]));
    const rank=(title,key,reversed=false,unit='')=>{
      const data=valid(key).slice().sort((a,b)=>(reversed?a[key]-b[key]:b[key]-a[key])).slice(0,8);
      return `<section class="insight-panel"><h3>${escapeHTML(title)}</h3>${data.length?data.map((r,i)=>`<div class="rank-item"><span class="rank-position">${i+1}</span>${teamLogo(r)}<span class="rank-name">${escapeHTML(r.name)}</span><strong>${tableCell(r[key])}${unit}</strong></div>`).join(''):'<p class="disclaimer">Sin datos suficientes.</p>'}</section>`;
    };
    const totalPlayed=usable.reduce((sum,r)=>sum+r.gp,0)/2;
    const totalGoals=valid('gf').length===usable.length?usable.reduce((sum,r)=>sum+r.gf,0):null;
    const avg=totalGoals!==null&&totalPlayed>0?(totalGoals/totalPlayed).toFixed(2):null;
    target.innerHTML=`<div class="insights-intro"><div><small>ESTADÍSTICAS DE LA COMPETICIÓN</small><h2>${escapeHTML(leagueInfo(code).name)}</h2><p>Resumen calculado con las posiciones publicadas, no estimaciones de partidos ausentes.</p></div><button type="button" class="outline-button" data-action="refresh-league-stats">↻ Actualizar</button></div><div class="insight-kpis"><div><small>Equipos con datos</small><strong>${usable.length}</strong></div><div><small>Partidos contabilizados*</small><strong>${Number.isInteger(totalPlayed)?totalPlayed:totalPlayed.toFixed(1)}</strong></div><div><small>Goles registrados</small><strong>${totalGoals??'—'}</strong></div><div><small>Media de goles/partido</small><strong>${avg??'—'}</strong></div></div><div class="insight-grid">${rank('Ataques más goleadores','gf')}${rank('Defensas menos goleadas','ga',true)}${rank('Más victorias','w')}${rank('Mayor diferencia de gol','gd')}</div><p class="disclaimer">Fuente: ${escapeHTML(info.source)}. *Los partidos se calculan dividiendo entre dos la suma de encuentros jugados por equipo; en torneos por fases o con partidos intergrupales puede no representar el total oficial. Datos actuales de la tabla, no necesariamente de toda una competición histórica.</p>`;
  }
  function chooseInsights(tab){
    if(!['table','stats','scorers'].includes(tab))return;
    state.insightsTab=tab;
    document.querySelectorAll('[data-insight]').forEach(b=>{b.classList.toggle('active',b.dataset.insight===tab);b.setAttribute('aria-selected',String(b.dataset.insight===tab));});
    $('standings-content').hidden=tab!=='table';$('league-insights-content').hidden=tab!=='stats';$('league-scorers-content').hidden=tab!=='scorers';
    const code=$('standing-league').value;
    if(tab==='stats'){if(!state.standingsCache.has(code))loadStandings();else renderLeagueInsights(code);}
    if(tab==='scorers')loadScorers();
  }
  function validatedRef(raw){
    if(!raw)return '';
    try{const u=new URL(String(raw).replace(/^http:/,'https:'));return u.protocol==='https:'&&['sports.core.api.espn.com','site.api.espn.com','site.web.api.espn.com'].includes(u.hostname)?u.href:'';}catch{return '';}
  }
  function scorerNumber(x){const n=numOrNull(x?.value??x?.displayValue??x?.stat?.value??x?.statistics?.goals);return n===null||n<0?null:n;}
  function parseScorersPayload(raw){
    const categories=[];
    const seen=new Set();
    function scan(node,depth=0){if(!node||typeof node!=='object'||seen.has(node)||depth>4)return;seen.add(node);
      if(Array.isArray(node)){node.forEach(n=>scan(n,depth+1));return;}
      if(Array.isArray(node.leaders))categories.push(node);
      for(const k of ['categories','items','leaders','statistics','splits'])if(Array.isArray(node[k]))scan(node[k],depth+1);
    }
    scan(raw);
    const specific=categories.filter(c=>{const label=[c.name,c.displayName,c.abbreviation,c.shortDisplayName].filter(Boolean).join(' ').toLowerCase();return /(^|[^a-z])(goals?|goals?scored|totalgoals|goles)([^a-z]|$)/i.test(label)&&!/against|allowed|conceded|assists|received|own\s*goal|penalty\s*goal/.test(label);});
    const chosen=specific.length?specific:categories.filter(c=>/scoring/.test(String(c.name||'').toLowerCase())&&c.leaders.some(x=>x.athlete));
    let players=[];
    for(const cat of chosen){for(const x of cat.leaders||[]){const athlete=x.athlete||x.player||x.competitor?.athlete||{};
      const team=x.team||athlete.team||x.competitor?.team||{};const value=scorerNumber(x);
      const name=athlete.displayName||athlete.fullName||athlete.name||x.displayName||x.name||'';
      if(value!==null)players.push({id:String(athlete.id||''),name,team:team.displayName||team.name||'',value,ref:validatedRef(athlete.$ref||athlete.ref),image:athlete.headshot?.href||''});
    }}
    const map=new Map();for(const player of players){const key=player.id||player.name.toLowerCase();if(!map.has(key)||map.get(key).value<player.value)map.set(key,player);}
    return [...map.values()].sort((a,b)=>b.value-a.value).slice(0,20);
  }
  async function fetchScorers(code){
    const base=`https://sports.core.api.espn.com/v2/sports/soccer/leagues/${encodeURIComponent(code)}/leaders`;
    const year=new Date().getFullYear();
    let list=[],lastError=null;
    for(const endpoint of [base,`https://sports.core.api.espn.com/v2/sports/soccer/leagues/${encodeURIComponent(code)}/seasons/${year}/leaders`]){
      try{
        const root=await fetchJSON(endpoint,9000);
        list=parseScorersPayload(root);
        if(!list.length){
          const refs=[...(Array.isArray(root.items)?root.items:[]),...(Array.isArray(root.leaders)?root.leaders:[])].map(v=>validatedRef(typeof v==='string'?v:v.$ref)).filter(Boolean).slice(0,5);
          if(refs.length){const replies=await runPool(refs,3,async u=>({value:await fetchJSON(u,8000)}));list=replies.filter(r=>r.ok).flatMap(r=>parseScorersPayload(r.value)).sort((a,b)=>b.value-a.value).slice(0,20);}
        }
        if(list.length)break;
      }catch(error){lastError=error;}
    }
    if(!list.length&&lastError)throw lastError;
    if(list.length){
      const missing=list.filter(x=>!x.name&&x.ref).slice(0,15);
      if(missing.length){const resolved=await runPool(missing,4,async player=>({player,athlete:await fetchJSON(player.ref,7000)}));
        resolved.filter(r=>r.ok).forEach(r=>{r.player.name=r.athlete.displayName||r.athlete.fullName||r.player.name;r.player.team=r.athlete.team?.displayName||r.athlete.team?.name||r.player.team;});
      }
    }
    return list.filter(x=>x.name&&x.value!==null);
  }
  function renderScorers(code,items,error=''){
    const target=$('league-scorers-content');
    const rows=items.map((p,i)=>`<div class="scorer-item"><span class="scorer-pos">${i+1}</span><div class="scorer-identity"><strong>${escapeHTML(p.name)}</strong><small>${escapeHTML(p.team||'Club no indicado')}</small></div><strong class="scorer-goals">${p.value} <small>goles</small></strong></div>`).join('');
    target.innerHTML=`<div class="insights-intro"><div><small>LÍDERES PUBLICADOS</small><h2>Goleadores · ${escapeHTML(leagueInfo(code).name)}</h2><p>Clasificación externa, solo cuando ESPN proporciona líderes identificables.</p></div><button type="button" class="outline-button" data-action="refresh-scorers">↻ Actualizar</button></div>${items.length?`<div class="scorers-list">${rows}</div><p class="disclaimer">Fuente: ESPN Core · ${items.length} registros publicados. La lista puede ser incompleta, no incluir empates, o carecer de datos para ciertos torneos. No se calcula a partir de resultados estimados.</p>`:`<div class="empty-card"><strong>Goleadores no disponibles</strong>${escapeHTML(error||'La fuente no devuelve un ranking verificable para esta competición.')}<p>Se conservan los goleadores de cada partido cuando el proveedor los publica.</p></div>`}`;
  }
  async function loadScorers(force=false){
    const code=$('standing-league').value;if(!code)return;
    const cached=state.scorersCache.get(code);
    if(!force&&cached&&Date.now()-cached.saved<600000){renderScorers(code,cached.items,cached.error);return;}
    const token=++state.scorersToken;
    $('league-scorers-content').innerHTML='<div class="loading-card">Consultando líderes estadísticos de ESPN…</div>';
    try{const items=await fetchScorers(code);if(token!==state.scorersToken||$('standing-league').value!==code)return;
      const error=items.length?'':'ESPN no ha publicado una lista de goleadores interpretable para esta liga.';
      state.scorersCache.set(code,{items,error,saved:Date.now()});renderScorers(code,items,error);
    }catch(e){if(token!==state.scorersToken||$('standing-league').value!==code)return;
      const error=`No se pudo acceder al servicio de líderes: ${e.message}. Es un acceso público no oficial y puede estar bloqueado por el navegador.`;
      state.scorersCache.set(code,{items:[],error,saved:Date.now()});renderScorers(code,[],error);
    }
  }
  function renderStandings(rows,source,leagueName,groups=[],note=''){
    if(!rows.length){if(state.insightsTab==='stats')$('league-insights-content').innerHTML='<div class="empty-card">Estadísticas de temporada no disponibles.</div>';$('standings-content').innerHTML='<div class="empty-card"><strong>No hay clasificación disponible</strong>Esta competición o fuente no ofrece tabla para el momento seleccionado.</div>';return;}
    const code=$('standing-league').value;
    const table=(entries)=>`<div class="table-scroller"><table class="standings-table"><thead><tr><th>#</th><th>Equipo</th><th>PJ</th><th>G</th><th>E</th><th>P</th><th>GF</th><th>GC</th><th>DG</th><th>Pts</th></tr></thead><tbody>${entries.map(r=>`<tr><td class="rank">${tableCell(r.pos)}</td><td>${teamLogo(r)}${r.id&&source.startsWith('ESPN')?`<button class="table-team-link" data-action="open-team" data-league="${escapeHTML(code)}" data-team="${escapeHTML(r.id)}">${escapeHTML(r.name)}</button>`:`<span>${escapeHTML(r.name)}</span>`}</td><td>${tableCell(r.gp)}</td><td>${tableCell(r.w)}</td><td>${tableCell(r.d)}</td><td>${tableCell(r.l)}</td><td>${tableCell(r.gf)}</td><td>${tableCell(r.ga)}</td><td>${tableCell(r.gd)}</td><td class="points">${tableCell(r.pts)}</td></tr>`).join('')}</tbody></table></div>`;
    const groupContent=groups.length>1?`<div class="zone-jump"><a href="#pulse-zona-a">Zona A · ${groups[0].rows.length} equipos</a><a href="#pulse-zona-b">Zona B · ${groups[1].rows.length} equipos</a></div>`+groups.map((g,i)=>`<section id="pulse-zona-${i===0?'a':'b'}"><div class="standings-group-title">${escapeHTML(g.name)} <span>${g.rows.length} equipos</span></div>${table(g.rows)}</section>`).join(''):table(rows);
    $('standings-content').innerHTML=`<div class="league-header"><div class="league-name">${escapeHTML(leagueName)}</div><div class="league-count">Fuente: ${escapeHTML(source)}</div></div>${note?`<p class="table-source-note">${escapeHTML(note)}</p>`:''}${groupContent}`;if(state.insightsTab==='stats')renderLeagueInsights(code);
  }
  async function loadStandings(force=false){const code=$('standing-league').value;const league=leagueInfo(code);if(!code)return;
    if(!force&&state.standingsCache.has(code)){const c=state.standingsCache.get(code);renderStandings(c.rows,c.source,league.name,c.groups||[],c.note||'');return;}
    $('standings-content').innerHTML='<div class="loading-card">Consultando clasificación...</div>';
    try{let rows,source;
      let groups=[],note='';
      try{const data=await fetchJSON(`https://site.api.espn.com/apis/v2/sports/soccer/${encodeURIComponent(code)}/standings`);rows=standingsESPN(data);groups=standingsGroups(data);source='ESPN';if(code==='arg.1'){const split=argentinaGroups(data,rows);groups=split.groups;note=split.note;source=split.source;}if(!rows.length)throw new Error('Tabla sin posiciones');}
      catch(error){if(!league.openLiga)throw error;const year=new Date().getMonth()<6?new Date().getFullYear()-1:new Date().getFullYear();rows=standingsOLG(await fetchJSON(`${OLG}getbltable/${league.openLiga}/${year}`));source='OpenLigaDB';}
      if($('standing-league').value!==code)return;state.standingsCache.set(code,{rows,source,groups,note});renderStandings(rows,source,league.name,groups,note);
    }catch(error){if($('standing-league').value===code)$('standings-content').innerHTML=`<div class="empty-card"><strong>Clasificación no disponible</strong>${escapeHTML(error.message)}<br>Prueba con otra liga o vuelve a intentarlo.</div>`;}
  }
  function renderDetail(m,summary=null,error=''){
    const scored=m.status!=='scheduled'&&m.scoreHome!==null&&m.scoreAway!==null;
    const score=scored?`${m.scoreHome} – ${m.scoreAway}`:'vs';
    const status=m.stale?'Datos guardados: no en directo':m.status==='live'?m.clock:m.status==='final'?'Finalizado':m.status==='unconfirmed'?'En curso sin confirmar':fmtFullDate(dateOfIso(m.date)||state.date)+' · '+fmtTime(m.date);
    const head=`<div class="modal-head"><div class="modal-comp">${escapeHTML(leagueInfo(m.league).name)} · ${escapeHTML(m.source)}</div><div class="detail-versus"><div class="team-name-block">${teamLogo(m.home)}<button type="button" class="team-link detail-team-link" data-action="open-team" data-match="${escapeHTML(m.id)}" data-team="${escapeHTML(m.home.id)}" data-league="${escapeHTML(m.league)}">${escapeHTML(m.home.name)} ↗</button></div><div><div class="big-score">${escapeHTML(score)}</div><div class="big-time">${escapeHTML(status)}</div></div><div class="team-name-block">${teamLogo(m.away)}<button type="button" class="team-link detail-team-link" data-action="open-team" data-match="${escapeHTML(m.id)}" data-team="${escapeHTML(m.away.id)}" data-league="${escapeHTML(m.league)}">${escapeHTML(m.away.name)} ↗</button></div></div><div class="big-time" style="color:var(--muted);margin-top:17px">${escapeHTML(m.venue||'')}</div><button type="button" class="outline-button" data-action="match-fav" data-match="${escapeHTML(m.id)}" style="margin-top:16px">${prefs.favoriteMatches.includes(m.id)?'★ Dejar de seguir partido':'☆ Seguir este partido'}</button><button type="button" class="outline-button community-share" data-action="share-match" data-match="${escapeHTML(m.id)}" aria-label="Compartir este partido">↗ Compartir</button></div>`;
    let extra='';
    if(m.source==='OpenLigaDB'){
      extra=m.goals.length?`<div class="detail-section"><h3>Goles publicados</h3>${m.goals.map(g=>`<div class="event-line"><b>${escapeHTML(g.minute)}'</b><span>⚽ ${escapeHTML(g.text)} ${tableCell(g.home)}–${tableCell(g.away)}</span></div>`).join('')}</div>`:'<div class="detail-section"><p class="disclaimer">La fuente comunitaria no ha publicado los goleadores del partido.</p></div>';
      extra+='<p class="disclaimer">OpenLigaDB no proporciona aquí alineaciones ni métricas individuales verificadas. Los goleadores solo aparecen cuando esta fuente los publica.</p>';
    }else if(error)extra=`<div class="empty-card"><strong>Datos adicionales no disponibles</strong>No se pudieron cargar los detalles: ${escapeHTML(error)}. El marcador mostrado procede de la consulta principal.</div>`;
    else if(!summary)extra='<div class="loading-card">Consultando alineaciones, goles y estadísticas...</div>';
    else {
      const tabs=[['summary','Resumen'],['lineups','Alineaciones'],['players','Jugadores'],['goals','Goles']];
      const selection=tabs.find(t=>t[0]===state.detailTab)?state.detailTab:'summary';
      extra=`<div class="detail-tabs" role="tablist" aria-label="Secciones del partido">${tabs.map(([key,label])=>`<button role="tab" id="tab-${key}" aria-controls="detail-panel" aria-selected="${selection===key}" class="detail-tab ${selection===key?'active':''}" data-detail-tab="${key}" type="button">${label}</button>`).join('')}</div><div id="detail-panel" role="tabpanel" aria-labelledby="tab-${selection}">`;
      if(selection==='summary')extra+=renderSummaryStats(summary);
      else if(selection==='lineups')extra+=renderLineups(summary,m);
      else if(selection==='players')extra+=renderPlayerStats(summary,m);
      else extra+=renderGoalsPane(summary,m);
      extra+='</div>';
    }
    $('detail-content').innerHTML=head+extra+renderH2hShell(m);
  }
  // ESPN: la hoja de partido usa rosters[].roster con starter, position, stats y athlete.
  // Los campos no publicados se conservan como ausentes; nunca se imputan cero goles.
  function statKey(value){return String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');}
  function playerStatEntries(raw){
    if(!raw)return [];
    if(Array.isArray(raw))return raw.filter(x=>x&&typeof x==='object'&&!Array.isArray(x)).map(x=>({key:statKey(x.name||x.abbreviation||x.label||x.displayName),label:String(x.label||x.displayName||x.name||'Dato'),value:String(x.displayValue??x.value??'—')})).filter(x=>x.key);
    if(typeof raw==='object')return Object.entries(raw).filter(([k,v])=>['string','number'].includes(typeof v)).map(([k,v])=>({key:statKey(k),label:k,value:String(v)}));
    return [];
  }
  const PLAYER_METRICS=[['goals','Goles',['goals','goalsscored','goalsscoredtotal','goal','totalgoals']],['assists','Asistencias',['assists','goalassists','totalassists']],['shots','Remates',['shots','totalshots','shotsattempted','shotattempts']],['onTarget','Al arco',['shotsontarget','shotsongoal']],['minutes','Minutos',['minutesplayed','minutes','minsplayed']],['saves','Atajadas',['saves','goalsaved','savesmade']],['passes','Pases',['totalpasses','passes']]];
  function playerMetric(p,metric){const info=PLAYER_METRICS.find(x=>x[0]===metric);if(!info)return null;return p.stats.find(x=>info[2].includes(x.key))?.value??null;}
  function playerRow(raw){
    const athlete=raw?.athlete||raw?.player||{};
    const name=athlete.displayName||athlete.fullName||raw?.displayName||raw?.name||'';
    if(!name||typeof name!=='string')return null;
    const pos=raw.position?.abbreviation||raw.position?.name||athlete.position?.abbreviation||athlete.position?.name||'';
    const starter=typeof raw.starter==='boolean'?raw.starter:(typeof raw.isStarter==='boolean'?raw.isStarter:null);
    const jersey=raw.jersey??athlete.jersey??raw.jerseyNumber??'';
    return {id:String(athlete.id||raw.id||''),name,position:String(pos),jersey:String(jersey),starter,formationPlace:numOrNull(raw.formationPlace),stats:playerStatEntries(raw.stats||raw.statistics),subIn:raw.subbedIn,subOut:raw.subbedOut};
  }
  function getMatchPlayers(summary,m){
    const sheets=Array.isArray(summary.rosters)?summary.rosters:Array.isArray(summary.boxscore?.rosters)?summary.boxscore.rosters:[];
    const fromRoster=sheets.filter(x=>Array.isArray(x?.roster)).map((r,i)=>({source:'match-roster',team:r.team,homeAway:r.homeAway||'',index:i,players:r.roster.map(playerRow).filter(Boolean),formation:r.formation||''}));
    // El segundo esquema solo contiene estadísticas; no garantiza titulares.
    const boxPlayers=Array.isArray(summary.boxscore?.players)?summary.boxscore.players:[];
    const fromBox=boxPlayers.map((g,i)=>{
      const group=[];
      for(const sec of (g.statistics||[])){
        for(const a of (sec.athletes||[])){
          const athlete=playerRow(a);if(!athlete)continue;
          if(Array.isArray(a.stats)&&Array.isArray(sec.labels)) athlete.stats.push(...sec.labels.map((label,j)=>({key:statKey(label),label:String(label),value:String(a.stats[j]??'—')})));
          group.push(athlete);
        }
      }
      return {source:'boxscore',team:g.team,index:i,homeAway:g.homeAway||'',players:group,formation:''};
    }).filter(g=>g.players.length);
    const groups=[...fromRoster,...fromBox];
    const result=[{team:m.home,homeAway:'home',players:[],formation:'',source:''},{team:m.away,homeAway:'away',players:[],formation:'',source:''}];
    groups.forEach((group,i)=>{
      let dest=[m.home,m.away].findIndex(t=>group.team?.id!=null&&String(group.team.id)===String(t.id));
      if(dest<0 && group.homeAway)dest=group.homeAway==='home'?0:group.homeAway==='away'?1:-1;
      if(dest<0 && i<2)dest=i;
      if(dest<0)return;
      const entries=result[dest].players;
      for(const p of group.players){const ix=entries.findIndex(x=>(p.id&&x.id===p.id)||x.name===p.name);
        if(ix<0)entries.push(p);else{const prev=entries[ix];prev.stats=[...new Map([...prev.stats,...p.stats].map(x=>[x.key,x])).values()];if(prev.starter===null)prev.starter=p.starter;}
      }
      result[dest].formation=String(group.formation||result[dest].formation||'');result[dest].source=group.source;
    });
    return result;
  }
  function squadLine(p){
    const tags=[];const goals=playerMetric(p,'goals'),assists=playerMetric(p,'assists');
    if(goals!==null && numOrNull(goals)>0)tags.push(`⚽ ${escapeHTML(goals)}`);
    if(assists!==null && numOrNull(assists)>0)tags.push(`↗ ${escapeHTML(assists)} as.`);
    return `<div class=\"squad-player\"><span class=\"squad-number\">${escapeHTML(p.jersey||'·')}</span><span class=\"squad-name\">${escapeHTML(p.name)}</span><span class=\"squad-position\">${escapeHTML(p.position)}</span>${tags.length?`<span class=\"squad-tags\">${tags.join(' · ')}</span>`:''}</div>`;
  }
  // Vista del campo: solo posiciones confirmadas como titulares. Distribución visual
  // orientativa cuando ESPN no entrega coordenadas; nunca confundir con tracking real.
  function renderPitch(summary,m){
    const sides=getMatchPlayers(summary,m),idx=state.pitchSide==='away'?1:0,side=sides[idx];
    const switches=`<div class="pitch-switch" role="group" aria-label="Equipo en el campo">${sides.map((x,i)=>`<button type="button" data-action="pitch-side" data-side="${i?'away':'home'}" class="${idx===i?'active':''}">${escapeHTML(x.team.name)}</button>`).join('')}</div>`;
    const starters=side.players.filter(x=>x.starter===true),schema=String(side.formation||'').replace(/\s/g,'').replace(/[^0-9-]/g,'');
    const lines=schema.split('-').map(Number).filter(Number.isInteger);
    const valid=lines.length>=2&&lines.length<=5&&lines.every(n=>n>=1&&n<=6)&&lines.reduce((a,b)=>a+b,0)===10;
    if(!valid||starters.length!==11)return `<div class="pitch-wrap"><h3>Formación sobre el césped</h3>${switches}<div class="pitch-unavailable">No hay once titulares y formación verificables para visualizar este equipo. La lista publicada aparece debajo.</div></div>`;
    const sorted=starters.slice().sort((a,b)=>(a.formationPlace??999)-(b.formationPlace??999));
    const goalie=sorted.find(p=>/^(GK|G|POR|ARQ)$/i.test(p.position))||sorted[0];
    const fieldPlayers=sorted.filter(p=>p!==goalie),rows=[...lines].reverse(),layers=[];let taken=0;
    for(const count of rows){const group=fieldPlayers.slice(taken,taken+count);taken+=count;layers.push(group);}
    const bubble=p=>`<div class="pitch-player" title="${escapeHTML(p.name)}"><span>${escapeHTML(p.jersey||'•')}</span><b>${escapeHTML(p.name.split(/\s+/).slice(-1)[0])}</b></div>`;
    return `<section class="pitch-wrap"><div class="feature-title"><div><h3>Formación en el campo</h3><p>${escapeHTML(schema)} · ${escapeHTML(side.team.name)}</p></div><span class="subtle-label">Ilustrativa</span></div>${switches}<div class="pitch-field"><div class="pitch-lines"></div>${layers.map(group=>`<div class="pitch-layer">${group.map(bubble).join('')}</div>`).join('')}<div class="pitch-layer pitch-goalie">${bubble(goalie)}</div></div><p class="disclaimer">Visualización orientativa con nombres de titulares publicados por ESPN. Las ubicaciones individuales pueden diferir de las posiciones reales.</p></section>`;
  }
  function renderLineups(summary,m){
    const sides=getMatchPlayers(summary,m);
    if(!sides.some(x=>x.players.length))return '<section class=\"detail-section\"><div class=\"feature-empty\">♟<strong>Alineaciones todavía no publicadas</strong><p>La fuente no ofrece una hoja de titulares y suplentes para este encuentro. No se sustituye por la plantilla general del club.</p></div></section>';
    const cols=sides.map(x=>{
      const hasStarter=x.players.some(p=>p.starter!==null);
      const starters=x.players.filter(p=>p.starter===true);
      const subs=x.players.filter(p=>p.starter===false);
      const unknown=x.players.filter(p=>p.starter===null);
      const order=list=>list.slice().sort((a,b)=>(a.formationPlace??999)-(b.formationPlace??999)||(Number(a.jersey)||999)-(Number(b.jersey)||999));
      return `<div class=\"lineup-side\"><div class=\"lineup-side-head\">${teamLogo(x.team)}<strong>${escapeHTML(x.team.name)}</strong>${x.formation?`<span class=\"formation-badge\">${escapeHTML(x.formation)}</span>`:''}</div>${starters.length?`<div class=\"squad-subheading\">XI INICIAL · ${starters.length} publicados</div>${order(starters).map(squadLine).join('')}`:''}${subs.length?`<div class=\"squad-subheading\">SUPLENTES · ${subs.length}</div>${order(subs).map(squadLine).join('')}`:''}${unknown.length?`<div class=\"squad-subheading\">${hasStarter?'OTROS CONVOCADOS':'JUGADORES PUBLICADOS (sin XI confirmado)'}</div>${order(unknown).map(squadLine).join('')}`:''}${!x.players.length?'<p class=\"detail-data-note\">No se publicó alineación de este equipo.</p>':''}</div>`;
    });
    return `<section class=\"detail-section\"><div class=\"feature-title\"><div><h3>Hoja del partido</h3><p>Titulares y suplentes según la información disponible.</p></div><span class=\"subtle-label\">ESPN</span></div>${renderPitch(summary,m)}<div class=\"lineups-grid\">${cols.join('')}</div></section>`;
  }
  function renderPlayerStats(summary,m){
    const sides=getMatchPlayers(summary,m);
    const players=sides.flatMap((side,index)=>side.players.map(p=>({...p,side:index,teamName:side.team.name})));
    const documented=players.filter(p=>p.stats.length);
    if(!documented.length)return '<section class=\"detail-section\"><div class=\"feature-empty\">▥<strong>Sin estadísticas individuales</strong><p>ESPN no facilita métricas por jugador para este partido. Puedes consultar las alineaciones si están publicadas.</p></div></section>';
    const validTeam=state.detailPlayerTeam==='all'||state.detailPlayerTeam==='home'||state.detailPlayerTeam==='away'?state.detailPlayerTeam:'all';
    const q=state.detailSearch.trim().toLocaleLowerCase('es');
    const filtered=documented.filter(p=>(validTeam==='all'||(validTeam==='home'&&p.side===0)||(validTeam==='away'&&p.side===1))&&p.name.toLocaleLowerCase('es').includes(q));
    const score=p=>Number(playerMetric(p,'goals')||0)*1000+Number(playerMetric(p,'assists')||0)*100+Number(playerMetric(p,'shots')||0)*10;
    filtered.sort((a,b)=>score(b)-score(a)||a.name.localeCompare(b.name,'es'));
    const opts=[['all','Todos'],['home',m.home.name],['away',m.away.name]];
    const cards=filtered.map(p=>{
      const visible=PLAYER_METRICS.map(([id,label])=>({id,label,value:playerMetric(p,id)})).filter(x=>x.value!==null);
      const other=p.stats.filter(s=>!PLAYER_METRICS.some(x=>x[2].includes(s.key))).slice(0,12);
      return `<details class=\"player-stats-card\"><summary><span class=\"player-badge\">${escapeHTML(p.jersey||'·')}</span><span class=\"player-summary-name\"><strong>${escapeHTML(p.name)}</strong><small>${escapeHTML(p.teamName)}${p.position?' · '+escapeHTML(p.position):''}</small></span><span class=\"player-metrics-summary\">${visible.filter(x=>['goals','assists','shots'].includes(x.id)).slice(0,2).map(x=>`<b>${escapeHTML(x.value)} <small>${escapeHTML(x.label.toLowerCase())}</small></b>`).join('')||'<span>Ver datos</span>'}</span><span class=\"player-expand\">⌄</span></summary><div class=\"player-metrics-grid\">${[...visible,...other].map(x=>`<div class=\"player-metric\"><b>${escapeHTML(x.value)}</b><span>${escapeHTML(x.label)}</span></div>`).join('')}</div></details>`;
    }).join('');
    return `<section class=\"detail-section\"><div class=\"feature-title\"><div><h3>Rendimiento individual</h3><p>${documented.length} jugadores con estadísticas publicadas</p></div></div><div class=\"player-filters\">${opts.map(([id,label])=>`<button type=\"button\" class=\"player-filter-btn ${validTeam===id?'active':''}\" data-player-team=\"${id}\">${escapeHTML(label)}</button>`).join('')}</div><label class=\"sr-only\" for=\"player-search\">Buscar jugador</label><input id=\"player-search\" class=\"player-search\" type=\"search\" value=\"${escapeHTML(state.detailSearch)}\" placeholder=\"Buscar jugador...\" autocomplete=\"off\"><div class=\"player-list\">${cards||'<p class=\"detail-data-note\">No hay jugadores con datos para este filtro.</p>'}</div><p class=\"disclaimer\">Las estadísticas representan únicamente este encuentro. Las métricas varían según la competición y la fuente.</p></section>`;
  }
  function renderGoalsPane(summary,m){
    const goals=normalizedEvents(summary).filter(e=>e.kind==='goal');
    const total=(m.scoreHome??0)+(m.scoreAway??0);
    const cards=goals.map(e=>`<div class=\"goal-card\"><span class=\"goal-minute\">${escapeHTML(e.time)}</span><span class=\"goal-ball\">⚽</span><span class=\"goal-description\"><strong>${escapeHTML(e.athlete||'Goleador no indicado')}</strong><small>${escapeHTML(e.team||'Equipo no indicado')}${e.label!=='Gol'?' · '+escapeHTML(e.label):''}</small></span></div>`).join('');
    return `<section class=\"detail-section\"><div class=\"feature-title\"><div><h3>Goles del encuentro</h3><p>${goals.length} ${goals.length===1?'incidencia de gol publicada':'incidencias de gol publicadas'}${total>goals.length?' · detalles incompletos':''}</p></div><span class=\"goal-total\">⚽ ${total&&m.status!=='scheduled'?total:'—'}</span></div>${cards||'<div class=\"feature-empty\">⚽<strong>Goleadores sin identificar</strong><p>No se publicaron incidencias de gol con información suficiente. El marcador, si aparece, sigue siendo el obtenido de la fuente.</p></div>'}<p class=\"disclaimer\">Los nombres y minutos dependen de la cobertura; los goles anulados y penales fallados no se cuentan como goles.</p></section>`;
  }
  function translateStat(label){
    const n=String(label||'').toLowerCase().replace(/[^a-z0-9]/g,'');
    const dict={possession:'Posesión',possessionpct:'Posesión',shotsontarget:'Tiros a puerta',totalshots:'Remates',shots:'Remates',fouls:'Faltas',yellowcards:'Tarjetas amarillas',redcards:'Tarjetas rojas',cornerkicks:'Saques de esquina',offsides:'Fueras de juego',saves:'Paradas',passes:'Pases',totalpasses:'Pases',passaccuracy:'Precisión de pases',shotsblocked:'Tiros bloqueados'};
    return dict[n]||label||'Dato';
  }
  const EVENTS={goal:['goal','gol','scored','own goal','autogol'],penalty:['penalty','penal','penalty kick'],red:['red card','tarjeta roja','second yellow','segunda amarilla'],yellow:['yellow card','tarjeta amarilla','booking'],substitution:['substitution','sustitución','substituted','substitute','cambio'],var:['var','video assistant'],period:['start 1st half','start 2nd half','end 1st half','end 2nd half','halftime','full time','kickoff','start of match','end of match'],delay:['delay','injury time','stoppage','pause','interruption']};
  function eventKind(text){const t=String(text||'').toLowerCase();if(/disallowed|overturned|no goal|annulled|anulado|goal cancelled/.test(t))return 'var';if(/\bvar\b/.test(t))return 'var';for(const [type,words] of Object.entries(EVENTS))if(words.some(w=>t.includes(w)))return type;return 'other';}
  function translateEvent(kind,raw){
    const t=String(raw||'').toLowerCase();
    if(kind==='goal')return t.includes('own goal')?'Gol en propia puerta':t.includes('penalty')?'Gol de penal':'Gol';
    if(kind==='penalty')return t.includes('miss')?'Penal fallado':t.includes('save')?'Penal detenido':'Penal';
    if(kind==='red')return 'Tarjeta roja';if(kind==='yellow')return 'Tarjeta amarilla';
    if(kind==='substitution')return 'Cambio';if(kind==='var')return /disallowed|overturned|no goal|annulled|anulado|cancelled/.test(t)?'Gol anulado / revisión':'Revisión VAR';
    if(kind==='period')return t.includes('2nd half')?'Inicio / final del segundo tiempo':t.includes('1st half')?'Inicio / final del primer tiempo':'Inicio o final del encuentro';
    if(kind==='delay')return 'Interrupción';
    return String(raw||'Incidencia').replace(/\s*\([^)]*\)\s*$/,'');
  }
  function eventMinute(clock){const raw=typeof clock==='object'?(clock?.displayValue??clock?.value??''):clock;let text=String(raw||'').trim();if(!text)return '—';const m=text.match(/^(\d+)(?::\d+)?(?:\+(\d+))?/);return m?`${m[1]}${m[2]?'+'+m[2]:''}′`:text;}
  function normalizeEvent(e){
    const type=String(e.type?.text||e.type?.displayName||e.type?.name||e.text||e.shortText||'Incidencia');
    const kind=eventKind(type);
    const team=e.team?.displayName||e.team?.name||type.match(/\(([^)]+)\)\s*$/)?.[1]||'';
    const athlete=e.athletes?.[0]?.displayName||e.athlete?.displayName||e.players?.[0]?.athlete?.displayName||'';
    return {id:String(e.id||''),kind,time:eventMinute(e.clock||e.time),team,athlete,label:translateEvent(kind,type),priority:['goal','penalty','red','yellow','var'].includes(kind)};
  }
  function normalizedEvents(summary){
    const competition=summary.header?.competitions?.[0]||{};
    const all=[...(Array.isArray(summary.keyEvents)?summary.keyEvents:[]),...(Array.isArray(competition.details)?competition.details:[])];
    const events=[],seen=new Set();
    for(const e of all){const x=normalizeEvent(e);const signature=[x.time,x.kind,x.team.toLowerCase(),x.athlete.toLowerCase(),x.kind==='substitution'?x.id:''].join('|');
      if(seen.has(signature))continue;seen.add(signature);events.push(x);}
    return events.sort((a,b)=>(parseInt(a.time)||0)-(parseInt(b.time)||0));
  }
  function eventIcon(kind){return ({goal:'⚽',penalty:'🎯',red:'🟥',yellow:'🟨',var:'📺',substitution:'🔄',period:'⏱',delay:'⏸',other:'•'})[kind]||'•';}
  function renderEvents(events){
    const priority=events.filter(e=>e.priority),other=events.filter(e=>!e.priority);
    const line=e=>`<div class="timeline-event ${e.kind==='goal'?'highlight':''}"><div class="timeline-time">${escapeHTML(e.time)}</div><div class="timeline-icon">${eventIcon(e.kind)}</div><div class="timeline-body"><b>${escapeHTML(e.label)}</b>${e.team?`<span>${escapeHTML(e.team)}</span>`:''}${e.athlete?`<small>${escapeHTML(e.athlete)}</small>`:''}</div></div>`;
    if(!events.length)return '';
    // Las sustituciones simultáneas del mismo equipo se agrupan en lugar de repetirse.
    const compact=new Map();for(const e of other){const key=`${e.kind}|${e.time}|${e.team}`;if(compact.has(key)&&e.kind==='substitution')compact.get(key).count++;else compact.set(key,{...e,count:1});}
    const otherHTML=[...compact.values()].map(e=>line({...e,label:e.count>1?`${e.count} cambios`:e.label})).join('');
    return `<section class="detail-section"><div class="timeline-header"><h3>Momentos del partido</h3><span>${priority.length} destacados</span></div>${priority.length?`<div class="timeline">${priority.map(line).join('')}</div>`:'<p class="disclaimer">No hay goles ni tarjetas publicados.</p>'}${other.length?`<details class="timeline-more"><summary>Ver todas las incidencias (${other.length} adicionales)</summary><div class="timeline">${otherHTML}</div></details>`:''}</section>`;
  }
  function renderSummaryStats(summary){
    const box=summary.boxscore||{};const teams=box.teams||[];
    const homeStat=teams.find(t=>t.homeAway==='home')||teams[0]||{};
    const awayStat=teams.find(t=>t.homeAway==='away')||teams[1]||{};
    const hs=homeStat.statistics||[];const as=awayStat.statistics||[];
    const normalizeLabel=x=>String(x||'').toLowerCase().replace(/[^a-záéíóúüñ0-9]/g,'');
    const chosen=['possessionPct','possession','shotsOnTarget','totalShots','shots','fouls','yellowCards','redCards','cornerKicks','offsides','saves','passes'];
    const candidates=hs.filter(s=>chosen.some(k=>normalizeLabel(s.name)===normalizeLabel(k))).slice(0,12);
    if(!candidates.length)candidates.push(...hs.slice(0,10));
    let html='';
    if(candidates.length){html+='<section class="detail-section"><h3>Estadísticas del partido</h3>';
      candidates.forEach(item=>{
        const other=as.find(x=>x.name===item.name||x.label===item.label)||{};
        const lhs=String(item.displayValue??item.value??'—');const rhs=String(other.displayValue??other.value??'—');
        const ln=Number.parseFloat(lhs),rn=Number.parseFloat(rhs);const pct=Number.isFinite(ln)&&Number.isFinite(rn)&&ln+rn>0?Math.round(ln/(ln+rn)*100):50;
        html+=`<div class="stat-row"><span>${escapeHTML(lhs)}</span><div><div class="stat-track"><span style="width:${pct}%"></span></div><div class="stat-label">${escapeHTML(translateStat(item.label||item.name||'Dato'))}</div></div><span>${escapeHTML(rhs)}</span></div>`;
      });html+='</section>';
    }
    html+=renderEvents(normalizedEvents(summary));
    if(!html)html='<div class="empty-card">La fuente no facilita estadísticas ni incidencias adicionales para este partido.</div>';
    return html;
  }
  async function showDetail(id){const m=findMatch(id);if(!m)return;state.h2hOpen=null;++state.h2hToken;if(!$('team-modal').hidden)closeTeam();previousFocus=document.activeElement;state.dialogMatch=id;state.detailTab='summary';state.pitchSide='home';state.detailPlayerTeam='all';state.detailSearch='';
    $('detail-modal').hidden=false;document.body.style.overflow='hidden';renderDetail(m);
    $('close-detail').focus();
    if(m.source==='OpenLigaDB')return;
    try{const cached=state.matchDetails.get(id);if(cached && Date.now()-cached.saved<(m.status==='live'?45000:300000)){if(state.dialogMatch===id)renderDetail(m,cached.data);return;}
      const response=await fetchJSON(`${ESPN}${encodeURIComponent(m.league)}/summary?event=${encodeURIComponent(m.apiId)}`,15000);
      state.matchDetails.set(id,{data:response,saved:Date.now()});if(state.dialogMatch===id)renderDetail(m,response);
    }catch(error){if(state.dialogMatch===id)renderDetail(m,null,error.message);}
  }
  function closeDetail(){$('detail-modal').hidden=true;state.dialogMatch=null;state.h2hOpen=null;++state.h2hToken;document.body.style.overflow='';if(previousFocus?.isConnected)previousFocus.focus();}
  function h2hKey(m,n){return `${m.league}:${[m.home.id,m.away.id].sort().join(':')}:${n}`;}
  function h2hMatches(events,homeId,awayId){
    const one=String(homeId),two=String(awayId);
    return [...new Map(events.filter(x=>x.status==='final'&&x.scoreHome!==null&&x.scoreAway!==null&&[x.home.id,x.away.id].some(a=>a===one)&&[x.home.id,x.away.id].some(a=>a===two)).map(x=>[x.id,x])).values()].sort((a,b)=>Date.parse(b.date)-Date.parse(a.date));
  }
  function h2hCounts(items,id){let wins=0,draws=0,losses=0;for(const x of items){const me=x.home.id===String(id)?x.scoreHome:x.scoreAway,other=x.home.id===String(id)?x.scoreAway:x.scoreHome;if(me>other)wins++;else if(me<other)losses++;else draws++;}return {wins,draws,losses};}
  function renderH2hShell(m){
    const open=state.h2hOpen===m.id;
    const cached=state.h2hCache.get(h2hKey(m,state.h2hYears));
    let content='';
    if(open){
      if(cached){const games=cached.items,counts=h2hCounts(games,m.home.id);
        content=`<div class="h2h-summary"><div><strong>${counts.wins}</strong><small>${escapeHTML(m.home.name)} gana</small></div><div><strong>${counts.draws}</strong><small>Empates</small></div><div><strong>${counts.losses}</strong><small>${escapeHTML(m.away.name)} gana</small></div></div>${games.length?games.slice(0,20).map(x=>`<button type="button" class="h2h-game" data-action="details" data-match="${escapeHTML(x.id)}"><span>${escapeHTML(new Intl.DateTimeFormat('es-ES',{month:'short',year:'numeric',day:'numeric'}).format(new Date(x.date)))}</span><span>${escapeHTML(x.home.name)} <b>${x.scoreHome}–${x.scoreAway}</b> ${escapeHTML(x.away.name)}</span></button>`).join(''):'<div class="empty-card">No se encontraron enfrentamientos finalizados en los calendarios recibidos. No significa que nunca hayan jugado.</div>'}<p class="disclaimer">${escapeHTML(cached.note)} · ${games.length} encuentros encontrados · solo esta competición; no es un historial universal ni necesariamente exhaustivo.</p>`;
      }else content='<div class="loading-card">Consultando los calendarios históricos publicados…</div>';
    }
    return `<section class="detail-section h2h-section"><div class="h2h-heading"><div><small>HISTORIAL ENTRE EQUIPOS</small><h3>↔ Cara a cara</h3></div><button type="button" class="outline-button" data-action="toggle-h2h" data-match="${escapeHTML(m.id)}">${open?'Ocultar':'Ver historial'}</button></div>${open?`<div class="h2h-controls"><label>Temporadas a consultar<select id="h2h-years" aria-label="Temporadas históricas"><option value="1" ${state.h2hYears===1?'selected':''}>1</option><option value="3" ${state.h2hYears===3?'selected':''}>3</option><option value="5" ${state.h2hYears===5?'selected':''}>5</option></select></label><button class="outline-button" type="button" data-action="reload-h2h" data-match="${escapeHTML(m.id)}">↻</button></div><div id="h2h-content">${content}</div>`:''}</section>`;
  }
  async function fetchH2h(m,years){
    const key=h2hKey(m,years),cache=state.h2hCache.get(key);if(cache&&Date.now()-cache.saved<900000)return cache;
    const start=new Date(m.date||Date.now()).getFullYear();const seasons=Array.from({length:years},(_,i)=>start-i);
    const olg=m.source==='OpenLigaDB';
    const urls=seasons.map(y=>olg?`${OLG}getmatchdata/${encodeURIComponent(leagueInfo(m.league).openLiga||'bl1')}/${y}`:`${ESPN}${encodeURIComponent(m.league)}/teams/${encodeURIComponent(m.home.id)}/schedule?season=${y}`);
    const loaded=await runPool(urls,2,async(url,i)=>{const response=await fetchJSON(url,14000);const rows=olg?response:response.events;if(!Array.isArray(rows))throw new Error('Sin calendario');
      return {matches:rows.map(e=>olg?parseOLG(e,m.league):parseESPN(e,m.league)),year:seasons[i]};});
    const successes=loaded.filter(x=>x.ok);const matches=h2hMatches(successes.flatMap(x=>x.matches),m.home.id,m.away.id);
    const note=successes.length?`Consulta de ${successes.length}/${years} temporadas (${successes.map(x=>x.year).join(', ')}). ${years-successes.length?'Algunas fuentes fallaron.':''}`:`No se pudieron consultar calendarios históricos: ${loaded.map(x=>x.error).filter(Boolean).slice(0,2).join(' · ')}`;
    const result={items:matches,note,saved:Date.now()};state.h2hCache.set(key,result);return result;
  }
  async function loadH2h(m,force=false){
    const key=h2hKey(m,state.h2hYears);if(force)state.h2hCache.delete(key);
    const token=++state.h2hToken;state.h2hOpen=m.id;
    if(state.dialogMatch===m.id)renderDetail(m,state.matchDetails.get(m.id)?.data||null);
    try{await fetchH2h(m,state.h2hYears);}catch(error){state.h2hCache.set(key,{items:[],note:`Error de consulta: ${error.message}`,saved:Date.now()});}
    if(token===state.h2hToken&&state.dialogMatch===m.id&&state.h2hOpen===m.id)renderDetail(m,state.matchDetails.get(m.id)?.data||null);
  }
  function teamProfileKey(league,teamId){return `${league}:${teamId}`;}
  function teamMatchResult(match,teamId){
    const atHome=match.home.id===String(teamId);
    if(!atHome && match.away.id!==String(teamId))return null;
    if(match.scoreHome===null||match.scoreAway===null||match.status!=='final')return null;
    const gf=atHome?match.scoreHome:match.scoreAway,ga=atHome?match.scoreAway:match.scoreHome;
    return {gf,ga,form:gf>ga?'G':gf<ga?'P':'E',atHome};
  }
  function renderTeamMatch(m,id){
    const result=teamMatchResult(m,id),home=m.home.id===String(id),opp=home?m.away:m.home;
    const date=new Date(m.date);
    const dateText=Number.isNaN(date.getTime())?'—':new Intl.DateTimeFormat('es-ES',{day:'2-digit',month:'short'}).format(date);
    const score=result?`${m.scoreHome} – ${m.scoreAway}`:(m.status==='scheduled'?fmtTime(m.date):`${m.scoreHome??'–'} – ${m.scoreAway??'–'}`);
    return `<button type="button" class="team-fixture-row" data-action="details" data-match="${escapeHTML(m.id)}"><span class="team-fixture-date">${escapeHTML(dateText)}</span><span class="team-fixture-opponent">${teamLogo(opp)}<span>${home?'vs':'@'} ${escapeHTML(opp.name)}</span></span><strong>${escapeHTML(score)}</strong>${result?`<small class="form-pill ${result.form==='G'?'won':result.form==='P'?'lost':'drew'}">${result.form}</small>`:''}</button>`;
  }
  function parseRosterESPN(data){
    const players=[];const seen=new Set();
    function scan(node,depth=0){
      if(!node||depth>5)return;
      if(Array.isArray(node)){node.forEach(x=>scan(x,depth+1));return;}
      if(typeof node!=='object')return;
      const a=node.athlete||node;
      const name=a.displayName||a.fullName||a.name;
      if(a.id&&name&&(a.position||a.jersey||a.headshot||a.age||a.birthDate)){
        const id=String(a.id);if(!seen.has(id)){seen.add(id);players.push({id,name,position:a.position?.displayName||a.position?.name||a.position?.abbreviation||a.position||'',number:a.jersey||'',nationality:a.citizenship||a.nationality||a.country?.name||'',age:a.age||null,birth:a.birthDate||'',photo:a.headshot?.href||a.headshot||a.photo||'',source:'ESPN'});}
      }
      for(const field of ['athletes','items','roster','players','groups','team'])if(node[field]&&node[field]!==node)scan(node[field],depth+1);
    }
    scan(data);return players;
  }
  function parseSportsDBPlayers(data){
    return (Array.isArray(data?.player)?data.player:Array.isArray(data?.players)?data.players:[]).map(p=>({
      id:String(p.idPlayer||p.strPlayer||''),name:p.strPlayer||'',position:p.strPosition||'',number:p.strNumber||'',nationality:p.strNationality||'',age:null,birth:p.dateBorn||'',photo:p.strCutout||p.strThumb||'',source:'TheSportsDB',biography:p.strDescriptionES||'',sportsdbId:p.idPlayer||''
    })).filter(p=>p.name);
  }
  async function sportsDBTeam(name){
    const d=await fetchJSON(`${SPORTSDB}searchteams.php?t=${encodeURIComponent(name)}`,9000);
    const items=(d?.teams||[]).filter(t=>/soccer|football/i.test(String(t.strSport||'Soccer')));
    const norm=foldName(name).replace(/\b(fc|cf|club|de|futbol|football|ac|sc)\b/g,'').trim();
    const team=items.find(t=>{const target=foldName(t.strTeam||'').replace(/\b(fc|cf|club|de|futbol|football|ac|sc)\b/g,'').trim();return target===norm||target.includes(norm)&&norm.length>5||norm.includes(target)&&target.length>5;});
    if(!team)return null;
    let roster=[];
    if(team.idTeam){try{roster=parseSportsDBPlayers(await fetchJSON(`${SPORTSDB}lookup_all_players.php?id=${encodeURIComponent(team.idTeam)}`,9000));}catch{}}
    return {team,roster};
  }
  async function wikiClub(name){
    const search=`${name} fútbol`;
    const params=new URLSearchParams({action:'query',format:'json',formatversion:'2',generator:'search',gsrsearch:search,gsrnamespace:'0',gsrlimit:'2',prop:'extracts|info',inprop:'url',exintro:'1',explaintext:'1',exsentences:'2',origin:'*'});
    const result=await fetchJSON(`https://es.wikipedia.org/w/api.php?${params}`,9000);
    const normalized=foldName(name).replace(/\b(club|de|futbol|football|fc|cf)\b/g,'').trim();
    const candidate=(result.query?.pages||[]).find(p=>{
      const title=foldName(p.title);return title.includes(normalized)&&/(futbol|club|atletico|river|boca|madrid|barcelona|football|sport)/.test(foldName(p.title+' '+p.extract).slice(0,220));
    });
    return candidate?{extract:String(candidate.extract||'').slice(0,440),url:candidate.fullurl||''}:null;
  }
  function rosterGroup(position){const n=foldName(position);if(/goal|portero|arquero|keeper/.test(n))return 'Arqueros';if(/defend|back|defensa|zaguero/.test(n))return 'Defensores';if(/mid|medi|volant|centrocamp/.test(n))return 'Mediocampistas';if(/forward|attack|atac|delanter|winger|striker/.test(n))return 'Delanteros';return 'Otros';}
  function renderPlayerCard(player,index){
    return `<div class="community-player-wrap" data-community-index="${index}"><button class="roster-player" type="button" data-action="team-player" data-index="${index}" aria-label="Ver ficha de ${escapeHTML(player.name)}"><span class="roster-avatar">👤</span><span class="roster-person"><strong>${escapeHTML(player.name)}</strong><small>${escapeHTML(player.position||'Posición no disponible')}${player.number?' · #'+escapeHTML(player.number):''}</small></span><span class="roster-arrow">›</span></button><div class="community-roster-credit"></div></div>`;
  }
  function teamPlayerDetail(player,extra=null){
    const p={...player,...(extra||{})};const wikiLink=`https://es.wikipedia.org/w/index.php?search=${encodeURIComponent(p.name+' futbolista')}`;
    return `<div class="player-profile-card"><div class="player-profile-head"><div class="community-avatar" id="community-player-photo">👤</div><div><h3>${escapeHTML(p.name)}</h3><p>${escapeHTML(p.position||'Posición desconocida')} · ${escapeHTML(p.nationality||'Nacionalidad no disponible')}</p><small>${p.number?'Dorsal '+escapeHTML(p.number)+' · ':''}${p.birth?'Nacimiento: '+escapeHTML(p.birth)+' · ':''}Fuente: ${escapeHTML(p.source)}</small></div></div>${p.biography?`<p>${escapeHTML(String(p.biography).slice(0,520))}</p>`:''}${p.detailsLoading?'<p class="team-missing">Buscando más información…</p>':''}<a href="${safeUrl(wikiLink)}" target="_blank" rel="noopener noreferrer" class="player-external">Buscar biografía en Wikipedia ↗</a><p class="disclaimer">Las estadísticas de temporada no siempre están disponibles en la fuente gratuita. La pertenencia a la plantilla debe verificarse con el club.</p></div>`;
  }
  function renderTeamProfile(team,league,events=[],loading=false,message='',enrichment={}){
    const filtered=events.filter(m=>m.home.id===String(team.id)||m.away.id===String(team.id));
    const unique=[...new Map(filtered.map(m=>[m.id,m])).values()].sort((a,b)=>(Date.parse(a.date)||0)-(Date.parse(b.date)||0));
    const today=Date.now(),completed=unique.filter(m=>m.status==='final'&&teamMatchResult(m,team.id)).filter(m=>Date.parse(m.date)<=today+86400000).slice(-5).reverse();
    const future=unique.filter(m=>m.status==='scheduled'&&Date.parse(m.date)>=today-7200000).slice(0,5);
    const form=completed.map(m=>teamMatchResult(m,team.id)?.form||'').reverse();
    const gf=completed.reduce((sum,m)=>sum+(teamMatchResult(m,team.id)?.gf||0),0),ga=completed.reduce((sum,m)=>sum+(teamMatchResult(m,team.id)?.ga||0),0);
    const followed=isFavTeam(league,team);
    const itemList=(items)=>items.length?items.map(m=>renderTeamMatch(m,team.id)).join(''):'<p class="team-missing">No hay partidos publicados para mostrar.</p>';
    const neutral=loading?'<div class="loading-card">Consultando ficha, plantilla y partidos…</div>':message?`<p class="team-warning">${escapeHTML(message)}</p>`:'';
    const meta=enrichment?.club||{};const biography=enrichment?.wiki||{};
    const roster=enrichment?.roster||[];
    const pane=state.teamPane||'overview';
    const tabs=`<div class="club-panes"><button type="button" data-action="team-pane" data-pane="overview" class="${pane==='overview'?'selected':''}">🏟 Club y partidos</button><button type="button" data-action="team-pane" data-pane="roster" class="${pane==='roster'?'selected':''}">👥 Jugadores ${roster.length?'('+roster.length+')':''}</button></div>`;
    const facts=[meta.intFormedYear&&`Fundado: ${meta.intFormedYear}`,meta.strStadium&&`Estadio: ${meta.strStadium}`,meta.strCountry&&`País: ${meta.strCountry}`].filter(Boolean);
    const overview=`<section class="community-club-art"><h3>Postales del club</h3><div class="community-media-grid"><div class="community-media-slot" id="community-club-photo"><span class="wm-placeholder">Foto del club: buscar en Commons</span></div><div class="community-media-slot" id="community-stadium-photo"><span class="wm-placeholder">Estadio: buscar imagen libre</span></div></div><p class="community-source-note">Solo se muestran fotografías con licencia identificada y crédito a su autor.</p></section>${facts.length?`<div class="club-facts">${facts.map(x=>`<span>${escapeHTML(x)}</span>`).join('')}</div>`:''}${biography.extract?`<p class="club-bio">${escapeHTML(biography.extract)} <a href="${safeUrl(biography.url)}" target="_blank" rel="noopener noreferrer">Wikipedia ↗</a></p>`:''}<div class="team-profile-stats"><div><span>FORMA RECIENTE</span><div class="form-line">${form.length?form.map(f=>`<b class="form-pill ${f==='G'?'won':f==='P'?'lost':'drew'}">${f}</b>`).join(''):'—'}</div></div><div><span>GOLES A FAVOR</span><b>${completed.length?gf:'—'}</b></div><div><span>GOLES EN CONTRA</span><b>${completed.length?ga:'—'}</b></div></div><div class="team-profile-grid"><section class="team-profile-panel"><h3>Últimos ${completed.length||''} partidos</h3>${itemList(completed)}</section><section class="team-profile-panel"><h3>Próximos ${future.length||''} partidos</h3>${itemList(future)}</section></div><p class="disclaimer">Partidos: ESPN / OpenLigaDB. Historia: Wikipedia. Datos institucionales: TheSportsDB. Las cifras recientes se calculan solo con partidos completos disponibles.</p>`;
    const groupOrder=['Arqueros','Defensores','Mediocampistas','Delanteros','Otros'];
    const search=foldName(state.teamSearch);
    const filteredRoster=roster.map((p,i)=>({...p,index:i})).filter(p=>foldName(p.name).includes(search));
    const grouped=groupOrder.map(g=>({name:g,items:filteredRoster.filter(p=>rosterGroup(p.position)===g)})).filter(g=>g.items.length);
    const rosterNotice=enrichment?.rosterSource==='TheSportsDB'?'TheSportsDB gratis solo ofrece hasta 10 jugadores por club. Esta NO es la plantilla completa.':enrichment?.rosterSource==='ESPN'?'Plantilla facilitada por ESPN; cobertura y fecha de actualización sujetas al proveedor.':'Sin plantilla confirmada. ESPN y TheSportsDB no han entregado jugadores de este club.';
    const selected=state.teamSelectedPlayer;
    const players=`<p class="roster-notice">${escapeHTML(rosterNotice)}</p>${roster.length?`<button type="button" class="outline-button community-photo-button" data-action="load-community-portraits">◉ Cargar hasta 6 retratos con licencia libre</button><p class="community-source-note">Wikimedia Commons · búsqueda limitada · fotos sujetas a disponibilidad</p><label class="roster-search-label">Buscar jugador <input id="team-player-search" type="search" placeholder="Nombre del jugador…" value="${escapeHTML(state.teamSearch)}"></label>`:''}${selected!==null&&roster[selected]?`<div id="player-profile-slot">${teamPlayerDetail(roster[selected],state.playerProfiles.get(`${league}:${team.id}:${selected}`))}</div>`:''}${grouped.length?grouped.map(g=>`<section class="roster-group"><h3>${g.name} <span>${g.items.length}</span></h3>${g.items.map(p=>renderPlayerCard(p,p.index)).join('')}</section>`).join(''):'<div class="empty-card"><strong>No hay jugadores para mostrar</strong>Prueba con otro nombre o vuelve a consultar más tarde.</div>'}<p class="disclaimer">Datos de ESPN y TheSportsDB. Nunca se añaden jugadores inventados. El proveedor puede no reflejar transferencias recientes.</p>`;
    $('team-content').innerHTML=`<div class="team-profile-hero"><div class="team-profile-brand">${teamLogo(team)}<div><span>${escapeHTML(leagueInfo(league).name)}</span><h2>${escapeHTML(team.name)}</h2><p>Club, jugadores y partidos · Fuentes gratuitas</p></div></div><button type="button" class="outline-button" data-action="profile-follow" data-league="${escapeHTML(league)}" data-team="${escapeHTML(team.id)}">${followed?'★ Siguiendo':'☆ Seguir equipo'}</button></div>${neutral}${tabs}${pane==='roster'?players:overview}`;
  }
  function decorateCommunityClub(team,club){
    if(!window.FPCommunity)return;
    const stadium=String(club?.strStadium||'').trim(),clubSlot=$('community-club-photo'),stadiumSlot=$('community-stadium-photo');
    if(clubSlot)window.FPCommunity.fillSlot(clubSlot,team.name,'club','Foto ilustrativa de '+team.name);
    if(stadiumSlot){if(stadium.length>4)window.FPCommunity.fillSlot(stadiumSlot,stadium,'stadium','Estadio '+stadium);
      else stadiumSlot.innerHTML='<span class="wm-placeholder">Nombre del estadio no disponible</span>';}
  }
  async function loadCommunityPortraits(){
    const c=state.teamCache.get(state.teamProfile);if(!c?.enrichment?.roster?.length)return;
    const names=c.enrichment.roster;const cards=[...document.querySelectorAll('.community-player-wrap')].slice(0,6);
    const button=document.querySelector('.community-photo-button');if(button){button.disabled=true;button.textContent='Consultando licencias y fotografías…';}
    await runPool(cards,2,card=>window.FPCommunity.fillRosterPhoto(card,names[Number(card.dataset.communityIndex)]?.name||''));
    if(button?.isConnected){button.disabled=false;button.textContent='↻ Volver a consultar retratos';}
  }
  function decorateSelectedPlayer(name){
    const el=$('community-player-photo');if(!el||!window.FPCommunity)return;
    window.FPCommunity.fillSlot(el,name,'player','Retrato de '+name);
  }
  async function shareMatch(m){
    const date=dateOfIso(m.date)||state.date,params=new URLSearchParams({match:m.id,date});
    const link=(location.protocol==='file:'?location.href.split('?')[0]:location.origin+location.pathname)+'?'+params.toString();
    const score=m.status==='scheduled'?'vs':`${m.scoreHome??'–'}–${m.scoreAway??'–'}`;
    const text=`⚽ ${m.home.name} ${score} ${m.away.name} · Fútbol Pulse`;
    try{if(navigator.share){await navigator.share({title:'Fútbol Pulse · partido',text,url:link});return;}}catch(e){if(e.name==='AbortError')return;}
    try{if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(text+'\n'+link);toast('Enlace copiado. Puedes pegarlo en WhatsApp.');return;}}catch{}
    const a=document.createElement('a');a.href='https://wa.me/?'+new URLSearchParams({text:text+'\n'+link});a.target='_blank';a.rel='noopener noreferrer';a.click();
  }
  async function openSharedMatch(){
    const params=new URLSearchParams(location.search),id=params.get('match')||'',date=params.get('date')||'';
    const match=/^([a-z0-9.]+):((?:olg-)?\d{1,15})$/.exec(id);
    if(!match||!/^\d{4}-\d{2}-\d{2}$/.test(date)||!LEAGUES.some(l=>l.id===match[1]))return;
    try{const league=leagueInfo(match[1]),result=await loadLeague(league,date);const matchEvent=result.items?.find(x=>x.id===id);
      if(!matchEvent){toast('El proveedor no publicó este partido en la fecha compartida.');return;}
      state.date=date;state.matches=[...state.matches.filter(x=>x.id!==id),matchEvent];state.fixtureMatches=[...state.fixtureMatches.filter(x=>x.id!==id),matchEvent];state.loadedOnce=true;
      render();await showDetail(id);
    }catch(e){toast('Enlace reconocido, pero el proveedor no respondió. Vuelve a intentarlo desde Partidos.');}
  }
  async function fetchTeam(league,team,force=false){
    const key=teamProfileKey(league,team.id);const cached=state.teamCache.get(key);
    if(!force&&cached&&Date.now()-cached.saved<300000)return cached;
    // Los identificadores de OpenLigaDB no equivalen a los identificadores de ESPN.
    if(team.source==='OpenLigaDB'){
      const olgCode=leagueInfo(league).openLiga;
      const seasonYear=new Date().getMonth()<6?new Date().getFullYear()-1:new Date().getFullYear();
      try{
        if(!olgCode)throw new Error('Competición sin calendario OpenLigaDB');
        const raw=await fetchJSON(`${OLG}getmatchdata/${olgCode}/${seasonYear}`,18000);
        if(!Array.isArray(raw))throw new Error('La fuente no devolvió partidos');
        const events=raw.map(x=>parseOLG(x,league)).filter(x=>x.home.id===String(team.id)||x.away.id===String(team.id));
        const result={team,league,events,message:'OpenLigaDB es comunitaria y no garantiza calendario completo ni minuto exacto.',saved:Date.now()};
        state.teamCache.set(key,result);return result;
      }catch(error){
        const events=[...state.matches,...state.fixtureMatches].filter(m=>m.league===league&&(m.home.id===String(team.id)||m.away.id===String(team.id)));
        const result={team,league,events,message:`OpenLigaDB no disponible: ${error.message}. Datos parciales del dispositivo.`,saved:Date.now()};
        state.teamCache.set(key,result);return result;
      }
    }
    const url=`${ESPN}${encodeURIComponent(league)}/teams/${encodeURIComponent(team.id)}`;
    const scheduleUrl=`${ESPN}${encodeURIComponent(league)}/teams/${encodeURIComponent(team.id)}/schedule`;
    const [profile,schedule,rosterCall,sdbCall,wikiCall]=await Promise.allSettled([fetchJSON(url,12000),fetchJSON(scheduleUrl,18000),fetchJSON(url+'/roster',13000),sportsDBTeam(team.name),wikiClub(team.name)]);
    let canonical={...team};
    if(profile.status==='fulfilled'){
      const t=profile.value?.team||{};
      canonical={...team,name:t.displayName||t.name||team.name,logo:t.logos?.[0]?.href||t.logo||team.logo};
    }
    let events=[];let message='';
    if(schedule.status==='fulfilled'&&Array.isArray(schedule.value?.events)){
      events=schedule.value.events.map(e=>parseESPN(e,league)).filter(m=>m.apiId!=='undefined'&&m.date);
      if(!events.length)message='ESPN respondió, pero no ofreció partidos para este equipo.';
    }else message='Calendario de este equipo no disponible en ESPN. Se muestran únicamente los encuentros ya consultados en la aplicación.';
    if(!events.length){events=[...state.matches,...state.fixtureMatches].filter(m=>m.league===league&&(m.home.id===String(team.id)||m.away.id===String(team.id)));}
    const espnRoster=rosterCall.status==='fulfilled'?parseRosterESPN(rosterCall.value):[];
    const sportsDB=sdbCall.status==='fulfilled'?sdbCall.value:null;
    const roster=espnRoster.length?espnRoster:(sportsDB?.roster||[]);
    const enrichment={roster,rosterSource:espnRoster.length?'ESPN':sportsDB?.roster?.length?'TheSportsDB':'',club:sportsDB?.team||null,wiki:wikiCall.status==='fulfilled'?wikiCall.value:null};
    const result={team:canonical,league,events,message,enrichment,saved:Date.now()};
    state.teamCache.set(key,result);return result;
  }
  async function openTeam(league,team){
    // El modal de equipo no se superpone al del encuentro.
    if(!$('detail-modal').hidden)closeDetail();
    previousFocus=document.activeElement;const token=++state.teamToken;
    state.teamProfile=teamProfileKey(league,team.id);state.teamPane='overview';state.teamSearch='';state.teamSelectedPlayer=null;
    $('team-modal').hidden=false;document.body.style.overflow='hidden';renderTeamProfile(team,league,[],true);
    $('close-team').focus();
    try{const result=await fetchTeam(league,team);if(token!==state.teamToken||state.teamProfile!==teamProfileKey(league,team.id))return;renderTeamProfile(result.team,league,result.events,false,result.message,result.enrichment);decorateCommunityClub(result.team,result.enrichment?.club);}
    catch(error){if(token===state.teamToken)renderTeamProfile(team,league,[],false,`Error al obtener datos: ${error.message}`);}
  }
  function closeTeam(){++state.teamToken;state.teamProfile=null;$('team-modal').hidden=true;document.body.style.overflow='';if(previousFocus?.isConnected)previousFocus.focus();}
  function renderFavoritesAgenda(){
    const target=$('favorite-agenda');if(!target)return;
    if(state.agendaLoading){target.innerHTML='<div class="loading-card">Consultando próximos partidos de tus favoritos…</div>';return;}
    if(!prefs.favoriteTeams.length){target.innerHTML='<div class="empty-card"><strong>Empieza siguiendo un equipo</strong>Después encontrarás aquí sus próximos partidos.</div>';return;}
    const followed=new Set(prefs.favoriteTeams.map(t=>teamProfileKey(t.league,t.id)));
    const fixtures=state.favoritesAgenda.filter(m=>m.status==='scheduled'&&Date.parse(m.date)>=Date.now()-7200000&&[m.home,m.away].some(t=>followed.has(teamProfileKey(m.league,t.id)))).sort((a,b)=>Date.parse(a.date)-Date.parse(b.date)).slice(0,30);
    target.innerHTML=(state.agendaMessage?`<p class="team-warning">${escapeHTML(state.agendaMessage)}</p>`:'')+(fixtures.length?groupHTML(fixtures):'<div class="empty-card"><strong>Sin futuros partidos disponibles</strong>Las fuentes pueden no ofrecer todo el calendario de tus favoritos.</div>');
  }
  async function loadFavoritesAgenda(force=false){
    if(state.tab!=='favorites')return;
    if(!prefs.favoriteTeams.length){state.favoritesAgenda=[];state.agendaMessage='';renderFavoritesAgenda();return;}
    const token=++state.agendaToken;state.agendaLoading=true;renderFavoritesAgenda();
    const targets=prefs.favoriteTeams.slice(0,6),responses=await runPool(targets,3,t=>fetchTeam(t.league,t,force));
    if(token!==state.agendaToken)return;
    const all=[],warnings=[];
    for(let i=0;i<responses.length;i++){
      const rr=responses[i];if(rr.ok){all.push(...rr.events);if(rr.message)warnings.push(targets[i].name+': datos parciales');}
      else warnings.push(targets[i].name+': sin acceso');
    }
    state.favoritesAgenda=[...new Map(all.map(m=>[m.id,m])).values()];
    state.agendaLoading=false;
    state.agendaMessage=(prefs.favoriteTeams.length>6?'Se consultan los primeros seis equipos. ':'')+(warnings.length?'Cobertura parcial: '+warnings.slice(0,3).join(' · '):'');
    renderFavoritesAgenda();
  }
  function rebuildSelectors(){
    const options=prefs.leagues.map(x=>{const l=leagueInfo(x);return `<option value="${escapeHTML(l.id)}">${escapeHTML(l.name)}</option>`;}).join('');
    const prev=$('standing-league').value;
    $('standing-league').innerHTML=options;
    $('standing-league').value=prefs.leagues.includes(prev)?prev:prefs.leagues[0];
    $('league-select').innerHTML='<option value="all">Todas las ligas</option>'+options;
    state.league=prefs.leagues.includes(state.league)?state.league:'all';$('league-select').value=state.league;
    updateFixtureSelectors();
    $('league-toggles').innerHTML=LEAGUES.map(l=>`<label class="league-toggle"><input type="checkbox" data-league-toggle="${escapeHTML(l.id)}" ${prefs.leagues.includes(l.id)?'checked':''}><span>${l.flag} ${escapeHTML(l.name)}</span></label>`).join('');
  }
  function syncSettings(){
    $('goal-alerts').checked=prefs.goalAlerts;$('alert-kickoff').checked=prefs.kickoffAlerts;$('alert-half').checked=prefs.halfAlerts;$('alert-final').checked=prefs.finalAlerts;$('alert-all').checked=prefs.alertAll;$('alert-sound').checked=prefs.sound;
    $('refresh-interval').value=String(prefs.refreshInterval);$('light-theme').checked=prefs.light;
    $('permission-state').textContent=!('Notification' in window)?'Este navegador no permite notificaciones. Los avisos dentro de la aplicación sí funcionarán.':`Permiso actual: ${Notification.permission}. No hay notificaciones con la aplicación cerrada.`;
  }
  function changeDate(newDate){if(!/^\d{4}-\d{2}-\d{2}$/.test(newDate))return;state.date=newDate;state.matches=[];state.loadedOnce=false;state.stale=false;render();refresh();}
  function reschedule(){if(pollTimer)clearTimeout(pollTimer);pollTimer=setTimeout(()=>{if(!document.hidden && state.date===localDate(new Date())&&state.tab!=='settings')refresh({silent:true});else reschedule();},prefs.refreshInterval*1000);}
  async function requestNotifications(){if(!('Notification' in window)){toast('Este navegador no admite notificaciones');return;}try{const value=await Notification.requestPermission();syncSettings();toast(value==='granted'?'Avisos del navegador activados':'Sin permiso: se mostrarán avisos dentro de la aplicación');}catch{toast('Este navegador ha bloqueado la solicitud de permiso');}}
  // Global discovery deliberately keeps ESPN IDs and TheSportsDB IDs separate.
  function collectDiscoverTeams(){
    const map=new Map();const add=(league,team)=>{if(!league||!team?.name||!team?.id)return;map.set(`${league}:${team.id}`,{league,team:{id:String(team.id),name:team.name,logo:team.logo||'',source:team.source||'ESPN'}});};
    [...state.matches,...state.fixtureMatches,...state.favoritesAgenda].forEach(m=>{add(m.league,m.home);add(m.league,m.away);});
    prefs.favoriteTeams.forEach(t=>add(t.league,t));
    state.standingsCache.forEach((cached,league)=>{(cached.rows||[]).forEach(r=>add(league,r));});
    state.teamCache.forEach(c=>{if(c?.team)add(c.league,c.team);});
    discovery.teams.forEach((v,key)=>map.set(key,v));return [...map.values()];
  }
  function foldSearch(text){return String(text||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('es').trim();}
  function renderDiscovery(){
    const results=$('discovery-results');if(!results)return;
    const q=foldSearch(discovery.query);
    const currentLeague=$('discovery-league')?.value||'all';
    $('discovery-league-label').hidden=discovery.kind!=='clubs';
    const hint=$('discovery-availability');
    hint.textContent=discovery.loading?'Consultando fuentes gratuitas…':discovery.error|| (discovery.searched? 'Búsqueda consultada · los listados pueden ser parciales.':'Primero se muestran clubes de partidos, favoritos y tablas cargadas. Pulsa Buscar para consultar Internet.');
    hint.classList.toggle('search-error',!!discovery.error);
    if(discovery.kind==='players'){
      if(!q){results.innerHTML='<div class="empty-card"><strong>¿A qué jugador buscamos?</strong>Escribí un nombre y pulsá Buscar. TheSportsDB gratuito puede devolver solo una coincidencia.</div>';return;}
      const players=discovery.players.filter(p=>foldSearch(p.strPlayer).includes(q));
      results.innerHTML=players.length?players.map((p,i)=>`<div class="discovery-card"><div class="search-avatar">♙</div><div class="discovery-card-copy"><strong>${escapeHTML(p.strPlayer||'Jugador')}</strong><small>${escapeHTML([p.strTeam,p.strNationality,p.strPosition].filter(Boolean).join(' · '))}</small><small>Fuente: TheSportsDB · perfil informativo</small></div><button type="button" class="search-open" data-discover-player="${i}">Perfil ›</button></div>`).join('')+'<div id="discovery-player-detail"></div>':'<div class="empty-card"><strong>Sin jugadores encontrados</strong>Escribí el nombre y pulsá Buscar. La búsqueda gratuita puede ser incompleta.</div>';
      return;
    }
    const teams=collectDiscoverTeams().filter(({league,team})=>(currentLeague==='all'||league===currentLeague)&&(!q||foldSearch(team.name).includes(q))).slice(0,40);
    results.innerHTML=teams.length?teams.map(({league,team})=>`<div class="discovery-card"><span class="search-avatar">${teamLogo(team)}</span><div class="discovery-card-copy"><strong>${escapeHTML(team.name)}</strong><small>${escapeHTML(leagueInfo(league).name)} · ESPN / fuentes consultadas</small></div><button type="button" class="search-open" data-discover-team="${escapeHTML(league+':'+team.id)}">Ficha ›</button></div>`).join(''):'<div class="empty-card"><strong>No aparecen clubes en los datos cargados</strong>Elegí una liga y pulsá Buscar para consultar su listado por Internet.</div>';
  }
  function openDiscovery(){
    focusBeforeDiscovery=document.activeElement;
    $('global-search-modal').hidden=false;document.body.style.overflow='hidden';
    const sel=$('discovery-league');const prev=sel.value||'all';sel.innerHTML='<option value="all">Todas las activas</option>'+prefs.leagues.map(id=>`<option value="${escapeHTML(id)}">${escapeHTML(leagueInfo(id).name)}</option>`).join('');sel.value=prefs.leagues.includes(prev)?prev:'all';
    discovery.loading=false;discovery.error='';discovery.searched=false;discovery.players=[];
    discovery.query=$('discovery-query').value.trim();discovery.kind=$('discovery-kind').value;
    renderDiscovery();$('discovery-query').focus();
  }
  function closeDiscovery(){++discovery.token;$('global-search-modal').hidden=true;discovery.loading=false;document.body.style.overflow='';if(focusBeforeDiscovery?.isConnected)focusBeforeDiscovery.focus();}
  function normalizeESPNDirectory(raw,league){
    const teams=[];const push=t=>{const obj=t?.team||t;if(!obj?.id||!(obj.displayName||obj.name))return;teams.push({league,team:{id:String(obj.id),name:obj.displayName||obj.name,logo:obj.logos?.[0]?.href||obj.logo||'',source:'ESPN'}});};
    if(Array.isArray(raw?.sports)){for(const sport of raw.sports)for(const lv of sport.leagues||[])for(const t of lv.teams||[])push(t);}
    if(Array.isArray(raw?.teams))raw.teams.forEach(push);
    return teams;
  }
  async function searchDiscovery(){
    const query=$('discovery-query').value.trim();if(query.length<2){toast('Escribí dos letras como mínimo');return;}
    discovery.query=query;discovery.kind=$('discovery-kind').value;discovery.loading=true;discovery.error='';discovery.searched=true;const token=++discovery.token;renderDiscovery();
    try{
      if(discovery.kind==='players'){
        const response=await fetchJSON(`${SPORTSDB}searchplayers.php?p=${encodeURIComponent(query)}`,11000);
        if(token!==discovery.token||$('global-search-modal').hidden)return;
        discovery.players=(response.player||response.players||[]).filter(p=>p.strSport==='Soccer'||!p.strSport).slice(0,10);
        if(!discovery.players.length)discovery.error='No hay coincidencias publicadas por TheSportsDB para este nombre.';
      }else{
        const league=$('discovery-league').value;
        // Limit remote requests: only selected league or first 3 active leagues; user action only.
        const ids=league==='all'?prefs.leagues.slice(0,3):[league];
        const responses=await runPool(ids,2,async leagueId=>({leagueId,raw:await fetchJSON(`${ESPN}${encodeURIComponent(leagueId)}/teams?limit=200`,13000)}));
        if(token!==discovery.token||$('global-search-modal').hidden)return;
        let found=0;for(const result of responses){if(!result.ok)continue;for(const t of normalizeESPNDirectory(result.raw,result.leagueId)){discovery.teams.set(t.league+':'+t.team.id,t);found++;}}
        if(!found)discovery.error='ESPN no facilitó listados de clubes. Seguimos mostrando los ya consultados. Prueba eligiendo una liga específica.';
        else if(league==='all')discovery.error='Se consultaron las primeras 3 ligas activadas. Para otra, selecciónala en el filtro.';
      }
    }catch(error){if(token!==discovery.token)return;discovery.error=`Fuente no disponible: ${error.message}. La búsqueda local sigue funcionando.`;}
    finally{if(token===discovery.token){discovery.loading=false;renderDiscovery();}}
  }
  function renderDiscoveryPlayer(index){const p=discovery.players[index];if(!p)return;const target=$('discovery-player-detail');if(!target)return;
    const fields=[['Club',p.strTeam],['Posición',p.strPosition],['Nacionalidad',p.strNationality],['Nacimiento',p.dateBorn],['Fuente','TheSportsDB (información no necesariamente actualizada)']].filter(x=>x[1]);
    target.innerHTML=`<section class="search-player-profile"><div class="search-player-head"><div class="community-avatar" id="community-search-photo">👤</div><div><h3>${escapeHTML(p.strPlayer)}</h3><p>${escapeHTML(p.strTeam||'Club no confirmado')}</p></div></div><div class="search-player-facts">${fields.map(([k,v])=>`<div><small>${escapeHTML(k)}</small><strong>${escapeHTML(v)}</strong></div>`).join('')}</div>${(p.strDescriptionES||p.strDescriptionEN)?`<p>${escapeHTML((p.strDescriptionES||p.strDescriptionEN).slice(0,450))}</p>`:''}</section>`;
    window.FPCommunity?.fillSlot($('community-search-photo'),p.strPlayer,'player',p.strPlayer);target.scrollIntoView({behavior:'smooth',block:'nearest'});
  }

  function bindEvents(){
    document.addEventListener('click',event=>{
      const tab=event.target.closest('[data-tab]');if(tab){selectedTab(tab.dataset.tab);return;}
      const fastDate=event.target.closest('[data-quick-date]');if(fastDate){changeDate(fastDate.dataset.quickDate);return;}
      const fastLeague=event.target.closest('[data-quick-league]');if(fastLeague){state.league=fastLeague.dataset.quickLeague;$('league-select').value=state.league;render();return;}
      const spotlight=event.target.closest('[data-spotlight-match]');if(spotlight){showDetail(spotlight.dataset.spotlightMatch);return;}
      const searchedTeam=event.target.closest('[data-discover-team]');if(searchedTeam){const t=collectDiscoverTeams().find(x=>x.league+':'+x.team.id===searchedTeam.dataset.discoverTeam);if(t){closeDiscovery();openTeam(t.league,t.team);}return;}
      const searchedPlayer=event.target.closest('[data-discover-player]');if(searchedPlayer){renderDiscoveryPlayer(Number(searchedPlayer.dataset.discoverPlayer));return;}
      const detailTab=event.target.closest('[data-detail-tab]');
      if(detailTab&&!$('detail-modal').hidden){state.detailTab=detailTab.dataset.detailTab;const m=findMatch(state.dialogMatch);if(m)renderDetail(m,state.matchDetails.get(m.id)?.data||null);document.getElementById('tab-'+state.detailTab)?.focus();return;}
      const playerTeam=event.target.closest('[data-player-team]');
      if(playerTeam&&!$('detail-modal').hidden){state.detailPlayerTeam=playerTeam.dataset.playerTeam;const m=findMatch(state.dialogMatch);if(m)renderDetail(m,state.matchDetails.get(m.id)?.data||null);return;}
      const insight=event.target.closest('[data-insight]');if(insight){chooseInsights(insight.dataset.insight);return;}
      const fav=event.target.closest('[data-action]');
      if(fav){const action=fav.dataset.action,id=fav.dataset.match;
        if(action==='retry-network'){refresh();return;}
        if(action==='refresh-league-stats'){state.standingsCache.delete($('standing-league').value);loadStandings(true);return;}
        if(action==='refresh-scorers'){state.scorersCache.delete($('standing-league').value);loadScorers(true);return;}
        if(action==='toggle-h2h'){const m=findMatch(id);if(m){if(state.h2hOpen===id){state.h2hOpen=null;++state.h2hToken;renderDetail(m,state.matchDetails.get(m.id)?.data||null);}else loadH2h(m);}return;}
        if(action==='reload-h2h'){const m=findMatch(id);if(m)loadH2h(m,true);return;}
        if(action==='team-fav'){const m=findMatch(id);if(m)toggleTeam(m,fav.dataset.team);}
        if(action==='details')showDetail(id);
        if(action==='team-pane'){
          state.teamPane=fav.dataset.pane==='roster'?'roster':'overview';state.teamSelectedPlayer=null;
          const c=state.teamCache.get(state.teamProfile);if(c){renderTeamProfile(c.team,c.league,c.events,false,c.message,c.enrichment);if(state.teamPane==='overview')decorateCommunityClub(c.team,c.enrichment?.club);}return;
        }
        if(action==='load-community-portraits'){loadCommunityPortraits();return;}
        if(action==='pitch-side'){state.pitchSide=fav.dataset.side==='away'?'away':'home';const m=findMatch(state.dialogMatch);if(m)renderDetail(m,state.matchDetails.get(m.id)?.data||null);return;}
        if(action==='share-match'){const m=findMatch(id);if(m)shareMatch(m);return;}
        if(action==='team-player'){
          const c=state.teamCache.get(state.teamProfile);if(!c)return;
          const ix=Number(fav.dataset.index),p=c.enrichment?.roster?.[ix];if(!p)return;
          state.teamSelectedPlayer=ix;renderTeamProfile(c.team,c.league,c.events,false,c.message,c.enrichment);decorateSelectedPlayer(p.name);
          const token=state.teamToken,teamKey=state.teamProfile,cacheKey=`${c.league}:${c.team.id}:${ix}`;
          const cached=state.playerProfiles.get(cacheKey);
          if(!cached&&p.source==='TheSportsDB'&&p.sportsdbId){
            state.playerProfiles.set(cacheKey,{detailsLoading:true});
            const slot=$('player-profile-slot');if(slot)slot.innerHTML=teamPlayerDetail(p,{detailsLoading:true});
            fetchJSON(`${SPORTSDB}lookupplayer.php?id=${encodeURIComponent(p.sportsdbId)}`,9000).then(r=>{
              const t=r?.players?.[0];if(!t)return;
              const info={biography:t.strDescriptionES||t.strDescriptionEN||'',nationality:t.strNationality||p.nationality,birth:t.dateBorn||p.birth,photo:t.strCutout||t.strThumb||p.photo,position:t.strPosition||p.position};
              state.playerProfiles.set(cacheKey,info);
              if(token===state.teamToken&&teamKey===state.teamProfile&&state.teamSelectedPlayer===ix){const box=$('player-profile-slot');if(box){box.innerHTML=teamPlayerDetail(p,info);decorateSelectedPlayer(p.name);}}
            }).catch(()=>{state.playerProfiles.set(cacheKey,{});if(token===state.teamToken&&teamKey===state.teamProfile){const box=$('player-profile-slot');if(box){box.innerHTML=teamPlayerDetail(p);decorateSelectedPlayer(p.name);}}});
          }
          const slot=$('player-profile-slot');slot?.scrollIntoView({behavior:'smooth',block:'nearest'});
          return;
        }
        if(action==='profile-follow'){
          const key=teamProfileKey(fav.dataset.league,fav.dataset.team);
          const current=state.teamCache.get(key)?.team||prefs.favoriteTeams.find(t=>teamProfileKey(t.league,t.id)===key);
          if(current){const m={league:fav.dataset.league,home:current,away:{id:'',name:'',logo:''}};toggleTeam(m,fav.dataset.team);renderTeamProfile(current,m.league,state.teamCache.get(key)?.events||[],false,state.teamCache.get(key)?.message||'',state.teamCache.get(key)?.enrichment);if(state.tab==='favorites')loadFavoritesAgenda(true);}
        }
        if(action==='open-team'){
          const match=findMatch(id);const team=match?({...([match.home,match.away].find(x=>x.id===fav.dataset.team)||{}),source:match.source}):prefs.favoriteTeams.find(x=>x.league===fav.dataset.league&&x.id===fav.dataset.team)||null;
          if(team)openTeam(fav.dataset.league||match.league,team);
          else if(fav.dataset.team)openTeam(fav.dataset.league,{id:fav.dataset.team,name:fav.textContent.trim(),logo:''});
        }
        if(action==='match-fav'){
          toggleMatch(id);if(state.dialogMatch){const m=findMatch(state.dialogMatch);if(m)renderDetail(m,state.matchDetails.get(m.id)?.data||null);}
        }
        if(action==='remove-team'){prefs.favoriteTeams=prefs.favoriteTeams.filter(x=>teamKey(x.league,x)!==fav.dataset.teamkey);savePrefs();render();}
        return;
      }
      const match=event.target.closest('.match-row[data-match]');if(match)showDetail(match.dataset.match);
    });
    document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!$('global-search-modal').hidden){closeDiscovery();return;}if(event.key==='Escape'&&!$('team-modal').hidden)closeTeam();if(event.key==='Escape'&&!$('guide-modal').hidden)closeGuide();if(event.key==='Escape'&&!$('detail-modal').hidden)closeDetail();if((event.key==='Enter'||event.key===' ')&&event.target.matches('.match-row')){event.preventDefault();showDetail(event.target.dataset.match);}});
    ['global-search-button','desktop-search-button','mobile-global-search'].forEach(id=>$(id).addEventListener('click',openDiscovery));
    $('settings-top-button').addEventListener('click',()=>selectedTab('settings'));
    $('global-search-close').addEventListener('click',closeDiscovery);
    $('global-search-modal').addEventListener('click',e=>{if(e.target===$('global-search-modal'))closeDiscovery();});
    $('discovery-query').addEventListener('input',e=>{discovery.query=e.target.value.trim();discovery.players=[];discovery.searched=false;discovery.error='';renderDiscovery();});
    $('discovery-form').addEventListener('submit',e=>{e.preventDefault();searchDiscovery();});
    $('discovery-kind').addEventListener('change',e=>{++discovery.token;discovery.kind=e.target.value;discovery.players=[];discovery.searched=false;discovery.error='';renderDiscovery();});
    $('discovery-league').addEventListener('change',()=>renderDiscovery());
    $('close-detail').addEventListener('click',closeDetail);
    $('detail-modal').addEventListener('click',e=>{if(e.target===$('detail-modal'))closeDetail();});
    $('detail-modal').addEventListener('input',e=>{if(e.target.id==='player-search'){
      state.detailSearch=e.target.value;
      const m=findMatch(state.dialogMatch),summary=state.matchDetails.get(m?.id)?.data;
      if(m&&summary){const pos=e.target.selectionStart;renderDetail(m,summary);const input=$('player-search');if(input){input.focus();input.setSelectionRange(pos,pos);}}
    }});
    $('refresh-button').addEventListener('click',()=>refresh());
    $('notify-button').addEventListener('click',requestNotifications);
    $('permission-btn').addEventListener('click',requestNotifications);
    $('match-date').addEventListener('change',e=>changeDate(e.target.value));
    $('fixture-league').addEventListener('change',e=>{state.fixtureLeague=e.target.value;state.fixtureRound='all';loadFixture();});
    $('fixture-start').addEventListener('change',e=>{if(/^\d{4}-\d{2}-\d{2}$/.test(e.target.value)){state.fixtureStart=e.target.value;state.fixtureRound='all';loadFixture();}});
    $('fixture-days').addEventListener('change',e=>{state.fixtureDays=Number(e.target.value);state.fixtureRound='all';loadFixture();});
    $('fixture-round').addEventListener('change',e=>{state.fixtureRound=e.target.value;renderFixture();});
    $('fixture-prev').addEventListener('click',()=>{state.fixtureStart=addDays(state.fixtureStart,-state.fixtureDays);state.fixtureRound='all';loadFixture();});
    $('fixture-next').addEventListener('click',()=>{state.fixtureStart=addDays(state.fixtureStart,state.fixtureDays);state.fixtureRound='all';loadFixture();});
    $('fixture-today').addEventListener('click',()=>{state.fixtureStart=localDate(new Date());state.fixtureRound='all';loadFixture();});
    $('fixture-reload').addEventListener('click',()=>loadFixture(true));
    $('fixture-favorites').addEventListener('change',e=>{state.fixtureOnlyFavorites=e.target.checked;renderFixture();});
    $('reload-fav-agenda').addEventListener('click',()=>loadFavoritesAgenda(true));
    $('close-team').addEventListener('click',closeTeam);
    $('team-modal').addEventListener('click',e=>{if(e.target===$('team-modal'))closeTeam();});
    $('team-modal').addEventListener('input',e=>{if(e.target.id==='team-player-search'){state.teamSearch=e.target.value;const pos=e.target.selectionStart;const c=state.teamCache.get(state.teamProfile);if(c){renderTeamProfile(c.team,c.league,c.events,false,c.message,c.enrichment);const input=$('team-player-search');input?.focus();try{input?.setSelectionRange(pos,pos);}catch{}}}});
    $('help-button').addEventListener('click',()=>openGuide('help'));
    $('settings-help-button').addEventListener('click',()=>openGuide('help'));
    $('close-guide').addEventListener('click',closeGuide);
    $('guide-accept').addEventListener('click',closeGuide);
    $('guide-modal').addEventListener('click',e=>{if(e.target===$('guide-modal'))closeGuide();});
    $('prev-date').addEventListener('click',()=>changeDate(addDays(state.date,-1)));
    $('next-date').addEventListener('click',()=>changeDate(addDays(state.date,1)));
    $('today-btn').addEventListener('click',()=>changeDate(localDate(new Date())));
    $('league-select').addEventListener('change',e=>{state.league=e.target.value;render();});
    $('search-input').addEventListener('input',e=>{state.search=e.target.value.trim();render();});
    $('filter-chips').addEventListener('click',e=>{const el=e.target.closest('[data-filter]');if(el){state.filter=el.dataset.filter;render();}});
    $('standing-league').addEventListener('change',()=>{++state.scorersToken;loadStandings();if(state.insightsTab==='scorers')loadScorers();});
    $('detail-modal').addEventListener('change',e=>{if(e.target.id==='h2h-years'){state.h2hYears=Number(e.target.value);const m=findMatch(state.dialogMatch);if(m)loadH2h(m);}});
    $('reload-standings').addEventListener('click',()=>loadStandings(true));
    $('league-toggles').addEventListener('change',e=>{
      const id=e.target.dataset.leagueToggle;if(!id)return;
      const previous=prefs.leagues.slice();
      prefs.leagues=LEAGUES.filter(l=>l.id===id?e.target.checked:previous.includes(l.id)).map(l=>l.id);
      if(!prefs.leagues.length){e.target.checked=true;prefs.leagues=[id];toast('Debe quedar al menos una competición activada');return;}
      savePrefs();rebuildSelectors();state.matches=[];state.fixtureCache.clear();state.fixtureMonthCache.clear();state.fixtureMatches=[];state.loadedOnce=false;render();refresh();if(state.tab==='fixture')loadFixture(true);
    });
    for(const [id,key] of [['goal-alerts','goalAlerts'],['alert-kickoff','kickoffAlerts'],['alert-half','halfAlerts'],['alert-final','finalAlerts'],['alert-all','alertAll'],['alert-sound','sound'],['light-theme','light']])$(id).addEventListener('change',e=>{prefs[key]=e.target.checked;savePrefs();render();});
    $('refresh-interval').addEventListener('change',e=>{prefs.refreshInterval=Number(e.target.value);savePrefs();reschedule();});
    $('clear-cache').addEventListener('click',()=>{for(let i=localStorage.length-1;i>=0;i--){const k=localStorage.key(i);if(k?.startsWith(CACHE_PREFIX))localStorage.removeItem(k);}state.standingsCache.clear();toast('Caché de resultados limpiada');});
    $('clear-favorites').addEventListener('click',()=>{if(!confirm('¿Eliminar todos los equipos y partidos favoritos?'))return;prefs.favoriteTeams=[];prefs.favoriteMatches=[];state.favoritesAgenda=[];savePrefs();render();toast('Favoritos eliminados');});
    document.addEventListener('visibilitychange',()=>{if(!document.hidden && state.date===localDate(new Date()))refresh({silent:true});else reschedule();});
    window.addEventListener('online',()=>{if(!state.loading)refresh({silent:true});});
  }
  function openGuide(mode='help'){
    const intro = mode==='intro'; const changes=mode==='changes';
    $('guide-title').textContent=intro?'Bienvenido a Fútbol Pulse':changes?'Novedades · v1.7.1':'Ayuda y funcionamiento';
    $('guide-content').innerHTML=intro?
      '<p>Consulta fútbol en directo y sigue a tus equipos sin pagar ni registrarte.</p><ol><li><b>Partidos:</b> pulsa un resultado para ver Resumen, Alineaciones, Jugadores y Goles. Toca un equipo para su ficha.</li><li><b>Fixture:</b> calendario por liga, fecha y jornada (cuando el proveedor la publique).</li><li><b>Favoritos:</b> guarda equipos y consulta su próximo calendario conjunto.</li><li><b>Clasificaciones:</b> tablas y grupos oficiales que facilite ESPN.</li><li><b>Alertas:</b> configura goles, comienzos, descanso y finales en Ajustes.</li></ol><p>Los datos proceden de servicios externos que pueden fallar o retrasarse; las alertas funcionan mientras la página permanezca abierta.</p>':
      changes?'<p><b>Octubre 2026 · v1.7.1 Hybrid Data</b></p><ul><li>Actualizaciones comunitarias con GitHub Actions cada 6 horas para tablas, fichas del directorio y calendarios futuros.</li><li>Los marcadores en vivo permanecen en modo directo.</li><li>Respaldo identificado como desactualizado si fallan los proveedores.</li></ul><p><b>Octubre 2026 · v1.7 Community</b></p><ul><li>Fotografías con licencia libre verificadas en Wikimedia Commons, con créditos y enlaces.</li><li>Fichas de clubes con imágenes del estadio cuando están publicadas, y retratos bajo demanda.</li><li>Alineación gráfica ilustrativa sobre un campo cuando el once y la formación están identificados.</li><li>Compartir partido con enlace directo y reintentar tras fallos de conexión.</li></ul><p><b>Octubre 2026 · v1.6.1 — Nocturne Club</b></p><ul><li>Identidad premium en azul tinta, marfil, coral y champán, con nuevos iconos de la aplicación.</li><li>Cabecera y portada más compactas: los resultados aparecen antes en móvil.</li><li>Tarjetas de partido y de competición más elegantes y controles táctiles mejor espaciados.</li><li>Barra inferior flotante y mejoras de contraste, accesibilidad y animación reducida.</li></ul><p><b>Octubre 2026 · v1.6</b></p><ul><li>Rediseño gráfico mobile-first con colores más vivos, fondos artísticos y tarjetas más legibles.</li><li>Cabecera y navegación inferior optimizadas para uso con una mano, con mejor jerarquía visual.</li><li>Filtros, chips y selectores retocados para táctil, manteniendo partidos, fixture, búsqueda y favoritos.</li><li>La base funcional de la v1.5 se mantiene, pero con una experiencia más alegre y deportiva.</li></ul><p><b>Octubre 2026 · v1.5</b></p><ul><li>Nuevo diseño Match Center adaptable, más compacto y con marcadores destacados.</li><li>Selector rápido de los siete días y filtros por ligas activas.</li><li>Buscar clubes en la lista ESPN de una competición y jugadores por nombre con TheSportsDB gratuito (cobertura parcial).</li><li>Accesos a búsqueda y ajustes desde la cabecera, sin quitar fixture ni las zonas de Argentina.</li></ul><p><b>Octubre 2026 · v1.4.2</b></p><ul><li>Clasificación argentina 2026 separada por Zona A/B con correspondencia oficial LPF en caso de respuesta plana.</li><li>Fichas de clubes con estadio, historia de Wikipedia y plantilla ESPN, con respaldo parcial TheSportsDB.</li><li>Buscador y ficha individual de jugadores con datos disponibles, fuentes y advertencias.</li></ul><p><b>Octubre 2026 · v1.4.1</b></p><ul><li>Fixture: reparación del error HTTP 400 causado por rangos de fechas no admitidos.</li><li>Consultas mensuales y respaldo diario, con advertencias cuando la cobertura sea parcial.</li><li>Actualización de caché PWA y pruebas de calendario en Android y escritorio.</li></ul><p><b>Octubre 2026 · v1.4</b></p><ul><li>Estadísticas de temporada por equipo, calculadas desde las clasificaciones.</li><li>Goleadores por liga cuando el servicio público de ESPN devuelve líderes identificables, sin inventar listas.</li><li>Cara a cara desde la ficha de partido con consulta de 1, 3 o 5 temporadas; período y cobertura indicados.</li><li>Caché independiente para evitar sobrecargar las fuentes y mejoras de actualización PWA.</li></ul><p><b>v1.3 · 10/2026:</b></p><ul><li>Detalle del partido con cuatro pestañas, alineaciones, jugadores y goles.</li></ul><p><b>Octubre 2026 · v1.3</b></p><ul><li>Detalle de partido con cuatro pestañas: Resumen, Alineaciones, Jugadores y Goles.</li><li>XI, suplentes, números, posiciones y estadísticas individuales cuando ESPN las publica.</li><li>Goleadores, minuto e incidencias destacadas; filtros por equipo y búsqueda de jugadores.</li><li>Caché de fichas renovada durante el directo y correcciones de navegación.</li></ul><p><b>v1.2 · 10/2026:</b></p><ul><li>Nuevas fichas de equipo con forma reciente y siguientes partidos, sujetos a la cobertura de ESPN.</li><li>Agenda conjunta de tus equipos favoritos.</li><li>Clasificaciones por grupos cuando la fuente los identifica (incluida Argentina).</li><li>Filtro por jornada del fixture, si la API proporciona el número.</li><li>Alertas optativas de inicio, descanso y final, además de goles.</li><li>Correcciones de navegación y caché PWA renovada.</li></ul><p><b>v1.1 · 10/2026:</b> fixture, Liga Argentina y cronología en español.</p><p><b>v1.0 · 10/2026:</b> marcadores, favoritos y estadísticas.</p>':
      '<p><b>v1.7.1 Hybrid Data:</b> una caché generada por GitHub Actions ayuda con las clasificaciones, listas de clubes y calendario de próximos meses. Bajo la cabecera se ve cuándo se ha actualizado. Los partidos en directo siguen consultándose desde el móvil. Para activarla hay que configurar Pages → GitHub Actions y ejecutar el workflow.</p><p><b>v1.7 Community:</b> fotos comprobadas en Wikimedia Commons (no todas están disponibles), alineaciones orientativas en campo, enlace directo para compartir partidos y botón de reintento. En Jugadores se puede pedir hasta seis retratos con licencia. La atribución se muestra junto a cada foto. Los avisos siguen limitados a la app abierta.</p><p><b>v1.6.1:</b> diseño premium Nocturne Club: nueva paleta, iconos exclusivos, mayor claridad para móvil y tarjetas compactas.</p><p><b>v1.6:</b> rediseño visual mobile-first con paleta más alegre, tarjetas tipo glass, barra inferior más cómoda y pantallas de partidos más compactas.</p><p><b>v1.5:</b> interfaz Match Center y tarjetas compactas; selección de día (semana móvil) y ligas rápidas. Pulsa ⌕ Buscar para buscar clubes por liga en ESPN o jugadores en TheSportsDB; la versión gratuita puede devolver resultados parciales. No introduce registros ni suscripciones.</p><p><b>v1.4.2:</b> Clasificación argentina 2026 en zonas A/B y fichas de clubes y jugadores enriquecidas con ESPN, TheSportsDB y Wikipedia (cobertura desigual).</p><p><b>v1.4.1:</b> Fixture corregido con consultas por mes en lugar de rangos rechazados por ESPN; si el proveedor no acepta el mes, se intenta por día y se indica cualquier cobertura parcial.</p><p><b>Versión 1.4:</b> en Clasificaciones puedes elegir Tabla, Temporada (equipos más goleadores, defensas, victorias y diferencia de gol) o Goleadores. Esta última usa un servicio ESPN no oficial y puede no estar disponible. En la ficha de cada partido utiliza el botón <b>Cara a cara</b> para comparar enfrentamientos publicados en 1, 3 o 5 temporadas: su cobertura no es exhaustiva.</p><p><b>Partido · v1.3:</b> abre cualquier marcador y utiliza las pestañas Resumen, Alineaciones, Jugadores o Goles. En Jugadores, filtra por equipo y busca un nombre. Pulsa un jugador para desplegar sus estadísticas. Solo se muestran titulares y datos que la fuente aporta; si no hay cobertura, se indica expresamente.</p><p><b>Ficha de equipo:</b> pulsa el nombre de un equipo en Partidos, Fixture, Clasificación o Favoritos. Muestra sus últimos 5 resultados, 5 próximos encuentros y la forma reciente en esa competición. Si ESPN no facilita suficientes partidos, aparecerá una advertencia.</p><p><b>Agenda favorita:</b> en Favoritos, consulta el próximo calendario de equipos seguidos, con un límite de 6 equipos por consulta para no saturar la API.</p><p><b>Fixture:</b> explora fechas o filtra por jornada cuando la fuente la indique expresamente. El filtro por jornada afecta solo al intervalo cargado.</p><p><b>Clasificación:</b> Argentina 2026 se divide por Zona A/B usando información oficial LPF/AFA si ESPN entrega una tabla plana de los 30 clubes. No se inventan estadísticas.</p><p><b>Alertas:</b> se comprueban al refrescar los marcadores mientras la app está visible. No funcionan con la app completamente cerrada.</p><h3>Historial</h3><p>v1.7.1 · 10/2026 — datos secundarios compartidos con GitHub Actions. v1.7 · 10/2026 — Commons con licencias individuales, campo de alineaciones, enlaces compartibles y recuperación de conexión.</p><p>v1.6.1 · 10/2026 — Nocturne Club, diseño premium y ergonomía móvil.</p><p>v1.6 · 10/2026 — Rediseño colorido mobile-first.</p><p>v1.5 · 10/2026 — Match Center, búsqueda de clubes y jugadores, filtros rápidos, nueva navegación móvil.</p><p>v1.4.2 · 10/2026 — zonas LPF 2026, fichas enriquecidas y plantilla consultable.</p><p>v1.4.1 · 10/2026 — arreglo HTTP 400 del fixture, cobertura mensual y respaldo diario.</p><p>v1.4 · 10/2026 — estadísticas de temporada, goleadores según disponibilidad, cara a cara.</p><p>v1.3 · 10/2026 — alineaciones, goleadores, jugadores, detalle por pestañas.</p><p>v1.2 · 10/2026 — fichas, agenda favorita, grupos, jornadas, alertas.</p><p>v1.1 · 10/2026 — comentarios traducidos, fixture, Argentina.</p><p>v1.0 · 10/2026 — lanzamiento.</p>';
    $('guide-modal').hidden=false;document.body.style.overflow='hidden';$('close-guide').focus();
  }
  function closeGuide(){$('guide-modal').hidden=true;if($('detail-modal').hidden)document.body.style.overflow='';}
  function boot(){rebuildSelectors();syncSettings();bindEvents();render();refresh();if(location.search.includes('match='))setTimeout(()=>openSharedMatch(),350);
    const guideVersion='futbol-pulse-guide-v1.7.1';
    try{const old=localStorage.getItem('futbol-pulse-guide-seen');if(old!=='1')openGuide(Object.keys(stored).length?'changes':'intro');else if(localStorage.getItem(guideVersion)!=='1')openGuide('changes');localStorage.setItem('futbol-pulse-guide-seen','1');localStorage.setItem(guideVersion,'1');}catch{}
    if('serviceWorker' in navigator && (location.protocol==='https:' || location.hostname==='localhost' || location.hostname==='127.0.0.1')){
      navigator.serviceWorker.register('./sw.js').catch(()=>{});
    }
  }
  window.FutbolPulseDebug = Object.freeze({normalizeESPNDirectory,collectDiscoverTeams,parseESPN,parseOLG,standingsESPN,standingsOLG,normalizedEvents,renderEvents,standingsGroups,argentinaGroups,arg2026Zone,parseRosterESPN,parseSportsDBPlayers,teamMatchResult,getMatchPlayers,playerMetric,renderGoalsPane,parseScorersPayload,h2hMatches,h2hCounts,renderPitch,shareMatch,openSharedMatch,getState:()=>({date:state.date,tab:state.tab,matches:state.matches.length,fixtureMatches:state.fixtureMatches.length,fixtureLoading:state.fixtureLoading,agendaMatches:state.favoritesAgenda.length,teamProfile:state.teamProfile,loading:state.loading,diagnostics:state.diagnostics,stale:state.stale})});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
