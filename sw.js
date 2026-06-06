/**
 * Service Worker for offline support
 * Caches the app shell and data on first load
 */

const CACHE_NAME = 'morris-minor-v2';

const APP_SHELL = [
    '/',
    '/index.html',
    '/style.css',
    '/app.js',
    '/lunr.min.js',
    '/manifest.json',
    '/icon.svg',
    '/data/search_data.json',
];

// Install: cache app shell
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
            return cache.addAll(APP_SHELL);
        })
    );
    self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys => {
            return Promise.all(
                keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
            );
        })
    );
    self.clients.claim();
});

// Fetch: cache-first for app shell, network-first for images
self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);

    // Images: cache on first use (lazy caching)
    if (url.pathname.includes('/images/')) {
        event.respondWith(
            caches.open(CACHE_NAME).then(cache => {
                return cache.match(event.request).then(cached => {
                    if (cached) return cached;
                    return fetch(event.request).then(response => {
                        if (response.ok) {
                            cache.put(event.request, response.clone());
                        }
                        return response;
                    }).catch(() => {
                        // Return a placeholder if offline and not cached
                        return new Response('', { status: 404 });
                    });
                });
            })
        );
        return;
    }

    // App shell: cache first
    event.respondWith(
        caches.match(event.request).then(cached => {
            return cached || fetch(event.request);
        })
    );
});
