// Atelier Cuisine — rappels quotidiens de péremption (Web Push)
//
// Appelée chaque matin par pg_cron (voir migration 20261020120500_alertes.sql).
// Pour chaque appareil abonné, liste les produits qui périment dans le délai
// choisi par l'utilisateur et envoie une notification au téléphone.
//
// Les clés VAPID et le secret d'appel sont dans Supabase Vault et lus via
// public.secret_alertes(), accessible uniquement au rôle service.

import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

async function secret(nom: string): Promise<string> {
  const { data, error } = await supabase.rpc("secret_alertes", { nom });
  if (error || !data) throw new Error(`Secret ${nom} introuvable`);
  return data as string;
}

/** Date du jour en heure de Paris, au format AAAA-MM-JJ. */
function aujourdhui(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(new Date());
}

function plusJours(iso: string, n: number): string {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function ecart(iso: string, depuis: string): number {
  return Math.round((Date.parse(iso + "T12:00:00Z") - Date.parse(depuis + "T12:00:00Z")) / 86_400_000);
}

interface Produit {
  name: string;
  expires_on: string;
}

function message(items: Produit[], auj: string) {
  const perimes = items.filter((p) => ecart(p.expires_on, auj) < 0).length;
  const title =
    items.length === 1 ? `${items[0].name} est à consommer vite` : `${items.length} produits à consommer vite`;
  const liste = items
    .slice(0, 4)
    .map((p) => {
      const j = ecart(p.expires_on, auj);
      const quand = j < 0 ? "périmé" : j === 0 ? "aujourd'hui" : j === 1 ? "demain" : `dans ${j} j`;
      return `${p.name} (${quand})`;
    })
    .join(", ");
  const suite = items.length > 4 ? ` et ${items.length - 4} autres` : "";
  const body = liste + suite + (perimes ? ". Pense à vérifier les produits périmés." : ".");
  return { title, body, badge: items.length };
}

Deno.serve(async (req) => {
  try {
    if (req.headers.get("x-cron-secret") !== (await secret("alertes_cron_secret"))) {
      return new Response("Accès refusé", { status: 401 });
    }

    webpush.setVapidDetails(
      await secret("alertes_vapid_sujet"),
      await secret("alertes_vapid_publique"),
      await secret("alertes_vapid_privee"),
    );

    const auj = aujourdhui();
    const { data: abonnements, error } = await supabase
      .from("push_subscriptions")
      .select("id, user_id, endpoint, p256dh, auth, alert_days");
    if (error) throw error;

    let envoyes = 0;
    let sansAlerte = 0;
    const echecs: string[] = [];

    for (const ab of abonnements ?? []) {
      const { data: produits, error: e2 } = await supabase
        .from("pantry_items")
        .select("name, expires_on")
        .eq("user_id", ab.user_id)
        .not("expires_on", "is", null)
        .gte("expires_on", plusJours(auj, -7)) // les périmés de la semaine, pas les oubliés de longue date
        .lte("expires_on", plusJours(auj, ab.alert_days))
        .order("expires_on");
      if (e2) throw e2;
      if (!produits?.length) {
        sansAlerte++;
        continue;
      }
      try {
        await webpush.sendNotification(
          { endpoint: ab.endpoint, keys: { p256dh: ab.p256dh, auth: ab.auth } },
          JSON.stringify(message(produits as Produit[], auj)),
          { TTL: 12 * 3600, urgency: "normal" },
        );
        envoyes++;
      } catch (err) {
        const code = (err as { statusCode?: number }).statusCode;
        // Abonnement expiré ou révoqué : on le supprime
        if (code === 404 || code === 410) {
          await supabase.from("push_subscriptions").delete().eq("id", ab.id);
        }
        echecs.push(`${code ?? "?"}: ${(err as Error).message}`.slice(0, 200));
      }
    }

    return Response.json({ date: auj, abonnements: abonnements?.length ?? 0, envoyes, sansAlerte, echecs });
  } catch (err) {
    console.error(err);
    return Response.json({ erreur: (err as Error).message }, { status: 500 });
  }
});
