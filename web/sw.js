const V='turnos-v25';
const SHELL=['./','index.html','manifest.webmanifest','icon-192.png','icon-512.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(V).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==V).map(x=>caches.delete(x)))).then(()=>self.clients.claim()))});
/* Abre al instante desde lo guardado en el celular y, por detrás, baja la versión nueva (queda lista para la próxima apertura). */
self.addEventListener('fetch',e=>{
  const u=new URL(e.request.url);
  if(e.request.method!=='GET'||u.origin!==location.origin)return; // la API (Google) nunca se intercepta
  if(u.pathname.endsWith('/config.json'))return; // la dirección del servidor siempre se pide fresca
  /* La página (index.html) siempre se pide primero a la red: así los cambios se ven al abrir; si no hay internet usa lo guardado. */
  if(e.request.mode==='navigate'||u.pathname.endsWith('/')||u.pathname.endsWith('index.html')){
    /* Red primero (así los cambios se ven al abrir), pero si la red tarda más de 2,5 s abre al instante lo guardado y la versión nueva queda lista para la próxima vez. */
    e.respondWith((async()=>{
      const c=await caches.open(V);
      const red=fetch(e.request,{cache:'no-store'}).then(r=>{if(r&&r.ok){const k=r.clone();c.put(e.request,k)}return r});
      const guardado=()=>c.match(e.request,{ignoreSearch:true}).then(m=>m||c.match('index.html'));
      try{return await Promise.race([red,new Promise((_,ko)=>setTimeout(()=>ko(new Error('lenta')),2500))])}
      catch(_){const m=await guardado();if(m){e.waitUntil(red.catch(()=>{}));return m}return red.catch(()=>guardado())}
    })());
    return;
  }
  e.respondWith(caches.open(V).then(c=>c.match(e.request,{ignoreSearch:true}).then(m=>{
    const red=fetch(e.request).then(r=>{if(r&&r.ok)c.put(e.request,r.clone());return r}).catch(()=>m||c.match('index.html'));
    return m||red;
  })));
});
self.addEventListener('notificationclick',e=>{e.notification.close();e.waitUntil(clients.matchAll({type:'window'}).then(l=>l.length?l[0].focus():clients.openWindow('./')))});
