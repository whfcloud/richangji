// 日常集 · Service Worker
// 作用：
//  ① 满足浏览器「添加到主屏幕 / 安装为应用」的必要条件（注册 SW + fetch 监听）
//  ② 保证「永远打得开」：页面用 stale-while-revalidate 缓存。
//     云端沙箱休眠（返回 403）或断网时，直接用缓存打开，功能照常用、数据在 localStorage，
//     联网/沙箱恢复后自动同步。
var CACHE = 'richangji-v2';
var NAV = './index.html';
var PRECACHE = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png'];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) {
      return Promise.all(PRECACHE.map(function (u) {
        return c.add(u)['catch'](function () {});
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        return k === CACHE ? null : caches['delete'](k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url;
  try { url = new URL(req.url); } catch (err) { return; }
  if (url.origin !== self.location.origin) return;

  var accept = '';
  try { accept = req.headers.get('accept') || ''; } catch (err2) {}
  var isNav = req.mode === 'navigate' || accept.indexOf('text/html') >= 0;

  // 页面本身：stale-while-revalidate
  //  - 有缓存 → 立刻返回（秒开；沙箱 403 / 断网也能正常用）
  //  - 同时后台拉新版更新缓存，下次打开就是最新的
  if (isNav) {
    e.respondWith(
      caches.match(NAV).then(function (cached) {
        var net = fetch(req).then(function (res) {
          if (res && res.status === 200) {
            var copy = res.clone();
            caches.open(CACHE).then(function (c) { c.put(NAV, copy); })['catch'](function () {});
            return res;
          }
          // 403 / 404 / 500（沙箱被暂停时就是 403）→ 回退缓存
          if (cached) return cached;
          return res;
        })['catch'](function () {
          return cached || caches.match(NAV);
        });
        return cached || net;
      })
    );
    return;
  }

  // 静态资源（图标 / manifest 等）：网络优先 + 缓存兜底
  e.respondWith(
    fetch(req).then(function (res) {
      // 带 query 的请求（如 ping 探针）不缓存，避免无限堆积
      if (res && res.status === 200 && !url.search) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(req, copy); })['catch'](function () {});
      }
      return res;
    })['catch'](function () {
      return caches.match(req);
    })
  );
});
