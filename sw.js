"use strict";

// Increase APP_VERSION whenever an application-shell file changes.
const APP_VERSION = "12";
const CACHE_PREFIX = "hido-app-shell-v";
const CACHE_NAME = CACHE_PREFIX + APP_VERSION;
const APP_SHELL = [
  "./",
  "./index.html",
  "./exercises.html",
  "./styles.css",
  "./app.js",
  "./manifest.webmanifest",
  "./full_body.svg",
  "./assets/fonts/Vazirmatn-VF.woff2",
  "./assets/fonts/OFL.txt",
  "./assets/icons/hido.svg",
  "./assets/icons/hido-192.png",
  "./assets/icons/hido-512.png"
];

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(function (cache) { return cache.addAll(APP_SHELL); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys()
      .then(function (keys) {
        const oldAppCaches = keys.filter(function (key) {
          return key.indexOf(CACHE_PREFIX) === 0 && key !== CACHE_NAME || key.indexOf("hido-simple-") === 0;
        });
        return Promise.all(oldAppCaches.map(function (key) { return caches.delete(key); }));
      })
      .then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function (event) {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(event.request).then(function (cached) {
      if (cached) return cached;
      return fetch(event.request).then(function (response) {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(function (cache) { cache.put(event.request, copy); });
        }
        return response;
      });
    }).catch(function () {
      if (event.request.mode === "navigate") return caches.match("./index.html");
      throw new Error("Network request failed");
    })
  );
});
