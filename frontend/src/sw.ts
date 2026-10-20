/// <reference lib="webworker" />
import { cleanupOutdatedCaches, precacheAndRoute } from "workbox-precaching";

declare const self: ServiceWorkerGlobalScope;

// Fichiers de l'app mis en cache : ouverture instantanée depuis l'écran d'accueil
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

// Rappels de péremption envoyés chaque matin par la fonction Supabase
self.addEventListener("push", (event) => {
  let donnees: { title?: string; body?: string; badge?: number } = {};
  try {
    donnees = event.data?.json() ?? {};
  } catch {
    donnees = { body: event.data?.text() };
  }
  const titre = donnees.title ?? "Atelier Cuisine";
  event.waitUntil(
    Promise.all([
      self.registration.showNotification(titre, {
        body: donnees.body ?? "Des produits arrivent à échéance.",
        icon: "/icone-192.png",
        badge: "/icone-192.png",
        tag: "peremption",
        data: { url: "/#garde-manger" },
      }),
      donnees.badge != null && "setAppBadge" in navigator
        ? (navigator as unknown as { setAppBadge: (n: number) => Promise<void> }).setAppBadge(donnees.badge)
        : Promise.resolve(),
    ]),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data?.url as string) ?? "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((fenetres) => {
      const ouverte = fenetres.find((f) => "focus" in f);
      if (ouverte) {
        (ouverte as WindowClient).navigate(url).catch(() => {});
        return (ouverte as WindowClient).focus();
      }
      return self.clients.openWindow(url);
    }),
  );
});
