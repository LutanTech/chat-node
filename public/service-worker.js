const CACHE_NAME = "anonchat-v1";

const STATIC_FILES = [
    "/",
    "/index.html",
    "/manifest.json",
    "/logo/icon.png",
    "/logo/icon_5.png",
    "/logo/icon_9.png",

    "/scripts/tailwind.js",

    "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css",
    "https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap"
];

self.addEventListener("install", event => {
    self.skipWaiting();

    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(STATIC_FILES))
    );
});

self.addEventListener("activate", event => {
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(
                keys
                    .filter(key => key !== CACHE_NAME)
                    .map(key => caches.delete(key))
            )
        )
    );

    self.clients.claim();
});

self.addEventListener("fetch", event => {

    const request = event.request;

    if (request.method !== "GET") return;

    const url = new URL(request.url);

    if (url.pathname.startsWith("/socket.io")) return;

    if (url.pathname.startsWith("/api")) return;

    event.respondWith(
        caches.match(request).then(cached => {

            if (cached) return cached;

            return fetch(request)
                .then(response => {

                    if (
                        response.status === 200 &&
                        request.url.startsWith(self.location.origin)
                    ) {
                        const copy = response.clone();

                        caches.open(CACHE_NAME).then(cache => {
                            cache.put(request, copy);
                        });
                    }

                    return response;
                })
                .catch(() => caches.match("/index.html"));
        })
    );
});