/* 好彩今日 Service Worker - v5
 * 变更：
 *  - CACHE 版本升级 hc-v5（强制刷新旧缓存，修复空白页问题）
 *  - 修正 ASSETS 列表（移除不存在的 haocai.png）
 *  - install 时逐个缓存资源，单个失败不影响其他
 *  - fetch 数据类请求只缓存 r.ok === true 的成功响应
 *  - data.json 请求统一忽略搜索参数
 *  - 静态资源缓存优先；data.json 与官方 API 网络优先，失败回退缓存
 */
const CACHE='hc-v5';
const ASSETS=['/','/index.html','/manifest.json','/icon-192.PNG','/icon-512.PNG'];

self.addEventListener('install',e=>{
  e.waitUntil(
    caches.open(CACHE).then(function(c){
      return Promise.all(ASSETS.map(function(url){
        return c.add(url).catch(function(){/* 忽略单个资源失败 */});
      }));
    }).then(function(){return self.skipWaiting();})
  );
});

self.addEventListener('activate',e=>{
  e.waitUntil(
    caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k))))
      .then(()=>self.clients.claim())
      .then(()=>self.clients.matchAll({type:'window'}))
      .then(clients=>{
        clients.forEach(c=>{
          try{c.postMessage({type:'SW_UPDATED',cache:CACHE});}catch(e){}
        });
      })
  );
});

function cacheKeyOf(request){
  const url=new URL(request.url);
  if(url.origin===self.location.origin && url.pathname.endsWith('/data.json')){
    return new Request(url.origin+'/data.json',{method:'GET'});
  }
  return request;
}

self.addEventListener('fetch',e=>{
  const url=new URL(e.request.url);
  if(e.request.method!=='GET')return;

  // 数据类：data.json + 官方体彩 API → 网络优先，失败回退缓存
  if(url.pathname.endsWith('/data.json') || url.hostname.includes('sporttery')){
    e.respondWith(
      fetch(e.request,{cache:'no-store'}).then(r=>{
        if(r&&r.ok){
          const cp=r.clone();
          caches.open(CACHE).then(c=>c.put(cacheKeyOf(e.request),cp));
        }
        return r;
      }).catch(()=>caches.match(cacheKeyOf(e.request)))
    );
    return;
  }

  // 静态资源：缓存优先，未命中再网络并写入
  e.respondWith(
    caches.match(e.request).then(c=>{
      if(c)return c;
      return fetch(e.request).then(r=>{
        if(!r||r.status!==200||r.type!=='basic')return r;
        const cp=r.clone();
        caches.open(CACHE).then(cache=>cache.put(e.request,cp));
        return r;
      }).catch(()=>caches.match('/index.html'));
    })
  );
});

self.addEventListener('message',e=>{
  if(e.data&&e.data.type==='SKIP_WAITING'){
    self.skipWaiting();
  }
});
