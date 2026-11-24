/**
 * Offline fallback for the admin panel (the Android app opens it full-screen).
 *
 * Why: every admin page is server-rendered, so with no signal — or a stalled
 * one — the app showed Chrome's error page or a blank white screen, which on a
 * phone with no address bar looks like the app crashed. This worker answers
 * such a page load with a small built-in "İnternet yok" page whose button (and
 * the phone regaining a connection) retries the page the admin was opening.
 *
 * It also shows the panel's push notifications (new order, recurring request,
 * due reminder — features/admin-notifications/application/dispatch-push.ts)
 * and opens the notification's page when it is tapped. In the Android app
 * Chrome hands these to the app, so they appear under its name and icon.
 *
 * What it does NOT do, on purpose:
 *   - It never stores a real page. Admin pages carry customer names, phones and
 *     addresses; only the static /offline.html is cached.
 *   - It only answers page loads (navigations) of admin paths and /login.
 *     Everything else — the storefront, checkout, payment, API calls, scripts,
 *     images — goes to the network exactly as if this worker did not exist.
 *   - /routes keeps its own worker (drive-sw.js), which stores the route page
 *     for driving offline; a narrower scope wins, so the two never overlap.
 *
 * Deliberately plain JS, no build step and no dependencies: it is served as-is
 * from /public. Behaviour is covered by tests/admin-sw.test.ts, which also
 * keeps ADMIN_PREFIXES in step with shared/routes/admin-route-prefixes.ts.
 */

const VERSION = "v1";
const OFFLINE_CACHE = `admin-offline-${VERSION}`;
const OFFLINE_URL = "/offline.html";

/** Wait this long for the server to START answering before showing the
 *  offline page. Generous on purpose: a slow-but-working connection must still
 *  get the real page (the server streams the shell within a second or two). */
const NETWORK_TIMEOUT_MS = 12000;

/** Top-level admin sections — mirror of shared/routes/admin-route-prefixes.ts. */
const ADMIN_PREFIXES = [
  "/admin",
  "/animsaticilar",
  "/customers",
  "/faturalar",
  "/finans",
  "/kargo",
  "/magaza-ayarlari",
  "/map",
  "/orders",
  "/products",
  "/recurring",
  "/reklam",
  "/routes",
  "/takvim",
  "/vitrin",
];

function isAdminNavigation(request, url) {
  if (request.mode !== "navigate" || request.method !== "GET") return false;
  if (url.origin !== self.location.origin) return false;
  const path = url.pathname;
  if (path === "/login") return true;
  return ADMIN_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

async function offlinePage() {
  const cache = await caches.open(OFFLINE_CACHE);
  return cache.match(OFFLINE_URL);
}

async function handleNavigation(request) {
  const network = fetch(request);
  // If we answer with the offline page first, a late network failure must not
  // surface as an unhandled rejection.
  network.catch(() => {});

  let timer;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve(null), NETWORK_TIMEOUT_MS);
  });

  try {
    const winner = await Promise.race([network, timeout]);
    clearTimeout(timer);
    if (winner) return winner;
  } catch (error) {
    clearTimeout(timer);
    const fallback = await offlinePage();
    if (fallback) return fallback;
    throw error;
  }

  // Timed out with no answer at all: show the offline page, or — if it was
  // never stored — keep waiting on the network rather than show nothing.
  return (await offlinePage()) ?? network;
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(OFFLINE_CACHE);
      await cache.add(new Request(OFFLINE_URL, { cache: "reload" }));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys()) {
        if (name.startsWith("admin-offline-") && name !== OFFLINE_CACHE) {
          await caches.delete(name);
        }
      }
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }
  if (!isAdminNavigation(request, url)) return;
  event.respondWith(handleNavigation(request));
});

// ---- Push notifications ------------------------------------------------------

const NOTIFICATION_ICON = "/brand/apuhan-icon-192.png";

/** Only same-site paths are ever opened (the server already enforces this). */
function safePath(link) {
  return typeof link === "string" && link.startsWith("/") && !link.startsWith("//") ? link : "/admin";
}

function parsePush(event) {
  try {
    const data = event.data ? event.data.json() : null;
    if (data && typeof data.title === "string") return data;
  } catch {
    /* not JSON — fall through to a generic notification */
  }
  return { title: "Apuhan Çiftliği", body: "Yeni bildirim", link: "/admin", tag: "apuhan" };
}

self.addEventListener("push", (event) => {
  const data = parsePush(event);
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: typeof data.body === "string" ? data.body : "",
      tag: typeof data.tag === "string" ? data.tag : undefined,
      icon: NOTIFICATION_ICON,
      data: { link: safePath(data.link) },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(safePath(event.notification.data && event.notification.data.link), self.location.origin);
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      // Reuse an open panel window: bring it forward on the notification's page.
      for (const client of windows) {
        if (new URL(client.url).origin === self.location.origin && "focus" in client) {
          await client.focus();
          if ("navigate" in client) await client.navigate(target.href).catch(() => {});
          return;
        }
      }
      await self.clients.openWindow(target.href);
    })(),
  );
});
