import { aujourdhui, fraicheur, joursRestants } from "./dates";
import { estTauri } from "./plateforme";
import { supabase, type PantryItem } from "./supabase";

// Clé publique VAPID (Web Push). La clé privée est un secret de la fonction
// Supabase "alertes-peremption", jamais dans l'app.
const VAPID_PUBLIQUE =
  import.meta.env.VITE_VAPID_PUBLIC_KEY ??
  "BAUq2I7yQtUg9HJAyAoIsiW0i1jKO8AzarUIfy9CCWYpJez19jUjIxNSrZaiZSjLss-n7lNvdwx2BY0yNZQ11c0";

/** Produits à signaler : périmés, à consommer aujourd'hui/demain, ou dans le délai d'alerte. */
export function produitsAAlerter(pantry: PantryItem[], joursAlerte: number) {
  return pantry
    .filter((p) => ["perime", "urgent", "bientot"].includes(fraicheur(p.expires_on, joursAlerte)))
    .sort((a, b) => (a.expires_on ?? "").localeCompare(b.expires_on ?? ""));
}

export function messageAlerte(items: PantryItem[]): { titre: string; corps: string } {
  const perimes = items.filter((p) => (joursRestants(p.expires_on) ?? 0) < 0).length;
  const titre =
    items.length === 1
      ? `${items[0].name} est à consommer vite`
      : `${items.length} produits à consommer vite`;
  const liste = items
    .slice(0, 4)
    .map((p) => {
      const j = joursRestants(p.expires_on)!;
      const quand = j < 0 ? "périmé" : j === 0 ? "aujourd'hui" : j === 1 ? "demain" : `dans ${j} j`;
      return `${p.name} (${quand})`;
    })
    .join(", ");
  const suite = items.length > 4 ? ` et ${items.length - 4} autres` : "";
  const corps = liste + suite + (perimes ? ". Pense à vérifier les produits périmés." : ".");
  return { titre, corps };
}

export type EtatNotif = "accordee" | "refusee" | "a_demander" | "indisponible";

export async function etatNotifications(): Promise<EtatNotif> {
  if (estTauri) {
    const { isPermissionGranted } = await import("@tauri-apps/plugin-notification");
    return (await isPermissionGranted()) ? "accordee" : "a_demander";
  }
  if (!("Notification" in window)) return "indisponible";
  return Notification.permission === "granted"
    ? "accordee"
    : Notification.permission === "denied"
      ? "refusee"
      : "a_demander";
}

/** Demande l'autorisation ; sur iPhone/navigateur, abonne aussi l'appareil aux rappels quotidiens. */
export async function activerNotifications(joursAlerte: number): Promise<EtatNotif> {
  if (estTauri) {
    const { isPermissionGranted, requestPermission } = await import("@tauri-apps/plugin-notification");
    if (await isPermissionGranted()) return "accordee";
    return (await requestPermission()) === "granted" ? "accordee" : "refusee";
  }
  if (!("Notification" in window)) return "indisponible";
  const perm = await Notification.requestPermission();
  if (perm !== "granted") return perm === "denied" ? "refusee" : "a_demander";
  await abonnerPush(joursAlerte).catch((e) => console.warn("Abonnement push impossible", e));
  return "accordee";
}

async function abonnerPush(joursAlerte: number) {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
  const reg = await navigator.serviceWorker.ready;
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64UrlVersOctets(VAPID_PUBLIQUE),
    }));
  const json = sub.toJSON();
  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      endpoint: sub.endpoint,
      p256dh: json.keys?.p256dh ?? "",
      auth: json.keys?.auth ?? "",
      alert_days: joursAlerte,
    },
    { onConflict: "endpoint" },
  );
  if (error) throw error;
}

/** Met à jour le délai d'alerte des rappels quotidiens de cet appareil. */
export async function majDelaiPush(joursAlerte: number) {
  if (estTauri || !("serviceWorker" in navigator)) return;
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager?.getSubscription();
  if (!sub) return;
  await supabase.from("push_subscriptions").update({ alert_days: joursAlerte }).eq("endpoint", sub.endpoint);
}

export async function desactiverPush() {
  if (estTauri || !("serviceWorker" in navigator)) return;
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager?.getSubscription();
  if (!sub) return;
  await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
  await sub.unsubscribe();
}

/**
 * Affiche une notification système au plus une fois par jour et par appareil,
 * à l'ouverture de l'app, s'il y a des produits à consommer vite.
 */
export async function alerterAuDemarrage(pantry: PantryItem[], joursAlerte: number) {
  const items = produitsAAlerter(pantry, joursAlerte);
  if (!items.length) return;
  const cle = "atelier.derniere-alerte";
  try {
    if (localStorage.getItem(cle) === aujourdhui()) return;
  } catch {
    return;
  }
  if ((await etatNotifications()) !== "accordee") return;
  const { titre, corps } = messageAlerte(items);
  if (estTauri) {
    const { sendNotification } = await import("@tauri-apps/plugin-notification");
    sendNotification({ title: titre, body: corps });
  } else if ("serviceWorker" in navigator) {
    const reg = await navigator.serviceWorker.getRegistration();
    if (reg) await reg.showNotification(titre, { body: corps, icon: "/icone-192.png", tag: "peremption" });
    else new Notification(titre, { body: corps });
  } else {
    new Notification(titre, { body: corps });
  }
  try {
    localStorage.setItem(cle, aujourdhui());
  } catch {
    /* rien */
  }
}

function base64UrlVersOctets(b64: string): Uint8Array<ArrayBuffer> {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const bin = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
