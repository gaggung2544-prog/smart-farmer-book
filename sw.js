const CACHE_NAME = 'smart-farmer-cache-v66';
const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './style.css',
    './survey.html',
    './sync-engine.js',
    './security.js',
    './map-gis.js',
    './voice-guide.js',
    './harvest-queue.js',
    './ai-consultant.js',
    './chat-engine.js',
    './app.js',
    './manifest.json',
    './user_manual.html',
    './smart_farmer_logo.png',
    './smart_farmer_logo_192.png',
    './smart_farmer_logo_512.png',
    './smart_farmer_banner.png',
    './ai_icon.png',
    // PERF: รูป soil_* (5) + menu_support/estimate ถูกย้ายออกจาก precache (~5MB) เพราะไม่แสดงตอนโหลดแรก
    // (อยู่หน้าเลือกดิน/สนับสนุน/ประเมิน) — ตอนนี้จะถูก cache แบบ runtime เมื่อเปิดใช้ครั้งแรก (ดู fetch handler)
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
];

// Install Event - cache the static app shell
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('[Service Worker] Caching App Shell and dependencies');
                const cachePromises = ASSETS_TO_CACHE.map(url => {
                    return fetch(url).then(response => {
                        if (response.status === 200) {
                            // If the response is redirected, clean it to avoid browser security restrictions
                            const clean = response.redirected ? 
                                new Response(response.body, {
                                    status: response.status,
                                    statusText: response.statusText,
                                    headers: response.headers
                                }) : response;
                            return cache.put(url, clean);
                        }
                        throw new Error(`Failed to fetch ${url} (status: ${response.status})`);
                    }).catch(err => {
                        console.error(`[Service Worker] Failed to cache ${url}:`, err);
                    });
                });
                return Promise.all(cachePromises);
            })
            .then(() => self.skipWaiting())
    );
});

// Activate Event - clean up old caches (excluding map-tiles-cache)
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cache => {
                    if (cache !== CACHE_NAME && cache !== 'map-tiles-cache') {
                        console.log('[Service Worker] Clearing old cache:', cache);
                        return caches.delete(cache);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

// Fetch Event - serving cached content
self.addEventListener('fetch', event => {
    // Only cache GET requests
    if (event.request.method !== 'GET') return;

    const requestUrl = new URL(event.request.url);

    // Bypass caching for Apps Script sync endpoints
    if (requestUrl.hostname.includes('script.google.com') || requestUrl.pathname.includes('/exec')) {
        event.respondWith(
            fetch(event.request).catch(() => {
                // If offline and request fails, return a JSON response indicating offline status
                return new Response(JSON.stringify({ 
                    success: false, 
                    error: 'offline',
                    message: 'คุณกำลังออฟไลน์ ข้อมูลถูกเก็บเข้าคิวไว้ในเครื่องแล้วครับ' 
                }), {
                    headers: { 'Content-Type': 'application/json' }
                });
            })
        );
        return;
    }

    // ระบบแคชภาพแผนที่ฐานเมื่อดึงมาใช้งาน สำหรับการเปิดแผนที่ออฟไลน์ (OSM และ Google Satellite)
    const isMapTile = requestUrl.hostname.includes('tile.openstreetmap.org') || 
                      (requestUrl.hostname.includes('google.com') && requestUrl.pathname.includes('/vt')) ||
                      requestUrl.hostname.includes('khms') ||
                      requestUrl.pathname.includes('/lyrs=');

    if (isMapTile) {
        event.respondWith(
            caches.open('map-tiles-cache').then(cache => {
                return cache.match(event.request).then(cachedResponse => {
                    if (cachedResponse) {
                        return cachedResponse; // คืนค่าแผนที่จากหน่วยความจำทันที
                    }
                    return fetch(event.request).then(networkResponse => {
                        if (networkResponse.status === 200) {
                            cache.put(event.request, networkResponse.clone());
                            // จำกัดขนาดคิวเก็บแผนที่หลังบ้านไม่ให้เกิน 300 แผ่นภาพเพื่อรักษาความจุเครื่อง
                            limitCacheSize('map-tiles-cache', 300);
                        }
                        return networkResponse;
                    }).catch(() => {
                        return new Response('', { status: 404 });
                    });
                });
            })
        );
        return;
    }

    // Cache-First or Stale-While-Revalidate for other static assets
    event.respondWith(
        caches.match(event.request).then(cachedResponse => {
            if (cachedResponse) {
                // Fetch in background to update cache for next time (Stale-While-Revalidate)
                fetch(event.request).then(networkResponse => {
                    if (networkResponse.status === 200) {
                        caches.open(CACHE_NAME).then(cache => {
                            // Clean the response if it is redirected
                            const cleanNetwork = networkResponse.redirected ? 
                                new Response(networkResponse.body, {
                                    status: networkResponse.status,
                                    statusText: networkResponse.statusText,
                                    headers: networkResponse.headers
                                }) : networkResponse;
                            cache.put(event.request, cleanNetwork);
                        });
                    }
                }).catch(() => {/* Ignore background sync failures when offline */});
                
                // Return cleaned cached response if it was redirected
                return cachedResponse.redirected ? 
                    new Response(cachedResponse.body, {
                        status: cachedResponse.status,
                        statusText: cachedResponse.statusText,
                        headers: cachedResponse.headers
                    }) : cachedResponse;
            }

            // Fallback to network
            return fetch(event.request).then(networkResponse => {
                // PERF: cache รูปภาพ same-origin แบบ runtime (เช่น soil_*/menu_* ที่ย้ายออกจาก precache)
                // เพื่อให้ยังเปิดออฟไลน์ได้หลังดูครั้งแรก โดยไม่ต้องถ่วง install ให้หนัก
                if (networkResponse.status === 200 &&
                    event.request.destination === 'image' &&
                    requestUrl.origin === self.location.origin) {
                    const imgClone = networkResponse.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(event.request, imgClone));
                    return networkResponse;
                }
                // Cache dynamic static resources (like fonts or external stylesheets)
                if (networkResponse.status === 200 &&
                    (event.request.destination === 'font' ||
                     event.request.url.includes('fonts.gstatic.com') ||
                     event.request.url.includes('fonts.googleapis.com'))) {
                    const cleanNetwork = networkResponse.redirected ? 
                        new Response(networkResponse.body, {
                            status: networkResponse.status,
                            statusText: networkResponse.statusText,
                            headers: networkResponse.headers
                        }) : networkResponse.clone();
                    caches.open(CACHE_NAME).then(cache => {
                        cache.put(event.request, cleanNetwork);
                    });
                }
                return networkResponse;
            });
        })
    );
});

// ฟังก์ชันควบคุมไม่ให้หน่วยความจำภาพแคชแผนที่ขยายใหญ่เกินความจำเป็น
function limitCacheSize(cacheName, maxItems) {
    caches.open(cacheName).then(cache => {
        cache.keys().then(keys => {
            if (keys.length > maxItems) {
                cache.delete(keys[0]).then(() => {
                    limitCacheSize(cacheName, maxItems);
                });
            }
        });
    });
}
