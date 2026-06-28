const CACHE_NAME = 'smart-farmer-cache-v29';
const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './style.css',
    './sync-engine.js',
    './security.js',
    './map-gis.js',
    './voice-guide.js',
    './harvest-queue.js',
    './app.js',
    './manifest.json',
    './smart_farmer_logo.png',
    './smart_farmer_banner.png',
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
    'https://cdn.jsdelivr.net/npm/chart.js@4.4.6/dist/chart.umd.min.js',
    'https://unpkg.com/leaflet.heat@0.2.0/dist/leaflet-heat.js'
];

// Install Event - cache the static app shell
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('[Service Worker] Caching App Shell and dependencies');
                return cache.addAll(ASSETS_TO_CACHE);
            })
            .then(() => self.skipWaiting())
    );
});

// Activate Event - clean up old caches
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cache => {
                    if (cache !== CACHE_NAME) {
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

    // Skip caching for non-http(s) schemes (e.g. chrome-extension) to avoid errors
    if (requestUrl.protocol !== 'http:' && requestUrl.protocol !== 'https:') return;

    // Cache-First or Stale-While-Revalidate for other static assets
    event.respondWith(
        caches.match(event.request).then(cachedResponse => {
            if (cachedResponse) {
                // Fetch in background to update cache for next time (Stale-While-Revalidate)
                fetch(event.request).then(networkResponse => {
                    if (networkResponse.status === 200) {
                        caches.open(CACHE_NAME).then(cache => {
                            cache.put(event.request, networkResponse);
                        });
                    }
                }).catch(() => {/* Ignore background sync failures when offline */});
                
                return cachedResponse;
            }

            // Fallback to network
            return fetch(event.request).then(networkResponse => {
                // Cache dynamic static resources (like fonts or external stylesheets)
                if (networkResponse.status === 200 && 
                    (event.request.destination === 'font' || 
                     event.request.url.includes('fonts.gstatic.com') || 
                     event.request.url.includes('fonts.googleapis.com'))) {
                    const responseClone = networkResponse.clone();
                    caches.open(CACHE_NAME).then(cache => {
                        cache.put(event.request, responseClone);
                    });
                }
                return networkResponse;
            });
        })
    );
});

// Push Event - แสดงการแจ้งเตือนเมื่อได้รับ push จากเซิร์ฟเวอร์ (ต้องมี VAPID sender)
self.addEventListener('push', event => {
    let payload = { title: 'Smart Farmer', body: 'มีการแจ้งเตือนใหม่' };
    try {
        if (event.data) {
            const d = event.data.json();
            payload = { ...payload, ...d };
        }
    } catch (e) {
        if (event.data) payload.body = event.data.text();
    }
    event.waitUntil(
        self.registration.showNotification(payload.title, {
            body: payload.body,
            icon: './smart_farmer_logo.png',
            badge: './smart_farmer_logo.png',
            data: payload.data || {},
            vibrate: [80, 40, 80]
        })
    );
});

// Notification Click - โฟกัส/เปิดแอปเมื่อแตะการแจ้งเตือน
self.addEventListener('notificationclick', event => {
    event.notification.close();
    const targetUrl = (event.notification.data && event.notification.data.url) || './index.html';
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
            for (const client of list) {
                if ('focus' in client) return client.focus();
            }
            if (clients.openWindow) return clients.openWindow(targetUrl);
        })
    );
});
