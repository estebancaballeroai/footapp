/* Fútbol Pulse 1.7.1: archivos de la app actualizados primero desde red. */
const CACHE = 'futbol-pulse-shell-v1.7.1';
const SHELL = ['./', './index.html', './style.css', './premium.css', './community.css', './app.js', './community.js', './pulse-hybrid.js', './manifest.webmanifest', './icon.svg', './icon-192.png', './icon-512.png'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)));
  self.skipWaiting();
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('futbol-pulse-shell-') && k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener('fetch', event => {
  const url=new URL(event.request.url);
  if(url.origin !== self.location.origin || event.request.method!=='GET' || url.pathname.endsWith('/pulse-data.json')) return;
  // Nunca cacheamos ni sustituimos resultados deportivos de proveedores externos.
  event.respondWith((async()=>{
    const cache=await caches.open(CACHE);
    try {
      const res=await fetch(event.request,{cache:'no-cache'});
      if(res.ok && res.type==='basic') await cache.put(event.request,res.clone());
      return res;
    }catch(e){
      const fallback=await cache.match(event.request,{ignoreSearch:true});
      if(fallback)return fallback;
      if(event.request.mode==='navigate')return await cache.match('./index.html');
      throw e;
    }
  })());
});
