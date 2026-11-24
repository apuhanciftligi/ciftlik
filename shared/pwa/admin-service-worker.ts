/**
 * The admin panel's service worker (public/admin-sw.js): offline fallback for
 * admin pages + push notifications. Registered by the admin layout
 * (admin-offline-support.tsx) and by the bell's notification switch, which
 * needs the active registration to subscribe to push.
 *
 * Browser-only helpers; callers check `"serviceWorker" in navigator` first.
 */
export const ADMIN_SW_URL = "/admin-sw.js";
export const ADMIN_SW_SCOPE = "/";

/** Registers (or returns the existing) admin worker and waits until it is
 *  active — pushManager.subscribe() refuses a registration that is still
 *  installing. Not `navigator.serviceWorker.ready`: on /routes that resolves
 *  to the route page's own worker (drive-sw.js), not this one. */
export async function getActiveAdminServiceWorker(): Promise<ServiceWorkerRegistration> {
  const registration = await navigator.serviceWorker.register(ADMIN_SW_URL, {
    scope: ADMIN_SW_SCOPE,
  });
  if (registration.active) return registration;
  const worker = registration.installing ?? registration.waiting;
  if (!worker) return registration;
  await new Promise<void>((resolve) => {
    const onChange = () => {
      if (worker.state === "activated" || worker.state === "redundant") {
        worker.removeEventListener("statechange", onChange);
        resolve();
      }
    };
    worker.addEventListener("statechange", onChange);
    onChange();
  });
  return registration;
}
