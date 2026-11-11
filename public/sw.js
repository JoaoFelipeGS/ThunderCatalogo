const CACHE_NAME = "thunder-sthormy-pwa-v2";
const IMAGE_CACHE = `${CACHE_NAME}-images`;
const PRODUCT_CACHE = `${CACHE_NAME}-products`;
const CONFIG_CACHE = `${CACHE_NAME}-config`;
const APP_SHELL = [
  "/",
  "/manifest.webmanifest",
  "/styles.css?v=19",
  "/app.js?v=11",
  "/assets/banner-thunder-sthormy.webp",
  "/assets/logo-thunder.jpg?v=2",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-maskable-512.png",
];
const MAX_CACHED_IMAGES = 60;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key.startsWith("thunder-sthormy-pwa-") && !key.startsWith(CACHE_NAME))
          .map((key) => caches.delete(key)),
      ))
      .then(() => self.clients.claim()),
  );
});

async function cachePublicProducts(request, response) {
  if (!response.ok) return response;
  const products = await response.clone().json();
  if (!Array.isArray(products)) return response;
  const publicProducts = products.filter((product) => product && product.active !== false);
  const cachedResponse = new Response(JSON.stringify(publicProducts), {
    status: 200,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
  const cache = await caches.open(PRODUCT_CACHE);
  try {
    await cache.put(request, cachedResponse);
  } catch (error) {
    console.warn("Não foi possível guardar o catálogo para uso offline.", error);
  }
  return response;
}

async function cacheSuccessfulResponse(cacheName, request, response) {
  if (response.ok) {
    const cache = await caches.open(cacheName);
    try {
      await cache.put(request, response.clone());
    } catch (error) {
      console.warn("Não foi possível guardar os dados para uso offline.", error);
    }
  }
  return response;
}

async function networkFirst(request, cacheName, prepareResponse) {
  let response;
  try {
    response = await fetch(request);
  } catch (error) {
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      const headers = new Headers(cachedResponse.headers);
      headers.set("X-Offline-Cache", "true");
      return new Response(await cachedResponse.arrayBuffer(), {
        status: cachedResponse.status,
        statusText: cachedResponse.statusText,
        headers,
      });
    }
    throw error;
  }
  return prepareResponse ? prepareResponse(request, response) : cacheSuccessfulResponse(cacheName, request, response);
}

async function cacheImage(request) {
  const cache = await caches.open(IMAGE_CACHE);
  const cachedResponse = await cache.match(request);
  if (cachedResponse) return cachedResponse;

  const response = await fetch(request);
  if (response.ok) {
    try {
      await cache.put(request, response.clone());
      const keys = await cache.keys();
      await Promise.all(keys.slice(0, Math.max(0, keys.length - MAX_CACHED_IMAGES)).map((key) => cache.delete(key)));
    } catch (error) {
      console.warn("Não foi possível guardar esta imagem para uso offline.", error);
    }
  }
  return response;
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request, CACHE_NAME).catch(async () => {
      if (url.pathname !== "/" && url.pathname !== "/index.html") {
        return new Response("Esta página precisa de conexão com a internet.", {
          status: 503,
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        });
      }
      const cachedPage = await caches.match("/");
      return cachedPage || new Response("O catálogo ainda não foi carregado neste dispositivo.", {
        status: 503,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }));
    return;
  }

  if (url.pathname === "/api/products") {
    event.respondWith(networkFirst(request, PRODUCT_CACHE, cachePublicProducts));
    return;
  }
  if (url.pathname === "/api/config") {
    event.respondWith(networkFirst(request, CONFIG_CACHE));
    return;
  }
  if (/^\/(?:assets\/products|uploads)\//.test(url.pathname)) {
    event.respondWith(cacheImage(request));
    return;
  }
  if (APP_SHELL.includes(`${url.pathname}${url.search}`) || APP_SHELL.includes(url.pathname)) {
    event.respondWith(caches.match(request).then((cachedResponse) => cachedResponse || fetch(request)));
  }
});
