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

// ── Web push ────────────────────────────────────────────────────────────────
// Payload shape comes from netlify/functions/send-notifications.mjs.
self.addEventListener('push', event => {
  let data: { title?: string; body?: string; url?: string; tag?: string } = {};
  try { data = event.data?.json() ?? {}; } catch { /* non-JSON payload: fall through to defaults */ }
  event.waitUntil(
    self.registration.showNotification(data.title || 'Gridiron Glory', {
      body: data.body,
      tag: data.tag,
      icon: '/android-chrome-192x192.png',
      badge: '/favicon-32x32.png',
      data: { url: data.url || '/' },
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = new URL((event.notification.data?.url as string) || '/', self.location.origin).href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const w of windows) {
      if (new URL(w.url).origin === self.location.origin) {
        await w.focus();
        if ('navigate' in w) await (w as WindowClient).navigate(url);
        return;
      }
    }
    await self.clients.openWindow(url);
  })());
});
