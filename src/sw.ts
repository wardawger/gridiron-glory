/// <reference lib="webworker" />
import { precacheAndRoute, cleanupOutdatedCaches, createHandlerBoundToURL } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { clientsClaim } from 'workbox-core';

declare const self: ServiceWorkerGlobalScope;

// Only the built app shell (JS/CSS/HTML/fonts/icons) is cached. Supabase,
// Netlify Functions, and CFBD calls are never intercepted — this is a live
// league app, so stale scores or picks served from a cache would be worse
// than an offline error.
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// SPA navigations fall back to the cached index.html so the shell opens
// offline and on flaky connections; /.netlify/ paths are excluded so
// function endpoints are never answered with HTML.
registerRoute(
  new NavigationRoute(createHandlerBoundToURL('/index.html'), {
    denylist: [/^\/\.netlify\//],
  })
);

self.skipWaiting();
clientsClaim();
