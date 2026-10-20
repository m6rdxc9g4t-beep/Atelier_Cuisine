// Atelier Cuisine — lecture d'un ticket de caisse par Claude (mode « cloud »)
//
// Reçoit le texte d'un e-ticket (extrait du PDF dans l'app), une photo ou un
// PDF scanné, et renvoie le ticket décodé au format de CONTEXT_SPEC.md §5 :
// enseigne, date, moyen de paiement, total, et pour chaque ligne le libellé
// brut, le produit du catalogue reconnu, la marque, le conditionnement, le
// rayon, la TVA, la quantité et les prix.
//
// Secrets (Supabase → Edge Functions → Secrets) :
//   ANTHROPIC_API_KEY  clé API Claude (obligatoire)
//   ANTHROPIC_MODEL    modèle à utiliser (facultatif, claude-sonnet-5-5 par défaut)
//
// L'appel exige un utilisateur connecté (JWT vérifié par Supabase) ; le
// catalogue de produits est lu avec ses droits.

import { createClient } from "npm:@supabase/supabase-js@2";

const RAYONS = [
  "fruits_legumes", "viandes_poissons", "produits_frais", "feculents", "surgeles", "epicerie_sucree",
  "epicerie_salee", "boissons", "apero", "hygiene", "entretien", "autre",
] as const;

const LIBELLES: Record<string, string> = {
  fruits_legumes: "🥬 Fruits & légumes",
  viandes_poissons: "🥩 Viandes / poissons / protéines",
  produits_frais: "🧀 Produits frais",
  feculents: "🥖 Féculents / céréales",
  surgeles: "🍟 Surgelés / plats rapides",
  epicerie_sucree: "🍫 Épicerie sucrée",
  epicerie_salee: "🧂 Épicerie salée / sauces",
  boissons: "🥤 Boissons",
  apero: "🍿 Apéro",
  hygiene: "🧼 Hygiène",
  entretien: "🧽 Entretien maison",
  autre: "📦 Autre",
};

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["storeName", "purchaseDate", "paymentMethod", "totalAmount", "items"],
  properties: {
    storeName: { type: "string", description: "Enseigne et ville, ex. « Carrefour Lille »" },
    purchaseDate: { type: "string", description: "Date et heure locales au format AAAA-MM-JJTHH:MM:SS, chaîne vide si absente" },
    paymentMethod: { type: "string", description: "ex. « Carte bancaire », chaîne vide si absent" },
    totalAmount: { type: "number", description: "Total payé en euros" },
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "rawLabel", "matchedIngredientName", "brand", "packagingSize", "category", "tvaRate",
          "quantity", "unitPrice", "totalPrice", "isFoodBudget",
        ],
        properties: {
          rawLabel: { type: "string", description: "Ligne du ticket telle quelle, ex. « 5.5% DUCROS ANETH 13G »" },
          matchedIngredientName: {
            type: "string",
            description: "Nom exact d'un produit du catalogue fourni si le produit y figure, sinon un nom court et propre en français",
          },
          brand: { type: "string", description: "Marque avec majuscule initiale (« Ducros »), chaîne vide si inconnue" },
          packagingSize: { type: "string", description: "Conditionnement en minuscules (« 13g », « 1l », « x6 »), chaîne vide si absent" },
          category: { type: "string", enum: [...RAYONS] },
          tvaRate: { type: "number", description: "Taux de TVA en pourcentage (5.5, 10, 20), 0 si absent" },
          quantity: { type: "number" },
          unitPrice: { type: "number" },
          totalPrice: { type: "number" },
          isFoodBudget: { type: "boolean", description: "Vrai pour les rayons alimentaires (1 à 9), faux pour hygiène et entretien" },
        },
      },
    },
  },
};

function consignes(catalogue: string): string {
  return `Tu lis des tickets de caisse français pour l'application de cuisine d'un foyer de deux personnes (Auré et François).

Règles :
- Ne garde que les lignes d'articles achetés. Ignore l'adresse, le téléphone, les horaires, les numéros de carte de fidélité (« Ma carte Club Carrefour »…), les codes-barres, les totaux intermédiaires et les lignes de paiement.
- Un libellé contient souvent le taux de TVA, la marque, le produit et le conditionnement : « 5.5% DUCROS ANETH 13G » → TVA 5.5, marque « Ducros », produit « Aneth », conditionnement « 13g ».
- Corrige les montants mal formés : « 2.19. » vaut 2.19. Les prix sont en euros, avec un point décimal.
- Si une ligne indique « 2 x 1.50 », la quantité est 2, le prix unitaire 1.50 et le total 3.00.
- Rapproche chaque article d'un produit du catalogue ci-dessous quand c'est le même produit (même sans la marque) et reprends alors son nom exact et son rayon. Sinon, choisis le rayon le plus probable : la TVA à 5.5 % signale l'alimentaire, 20 % signale souvent l'hygiène, l'entretien ou l'alcool.
- isFoodBudget est vrai pour les rayons 1 à 9 et faux pour « hygiene » et « entretien ».
- L'enseigne inclut la ville si elle figure sur le ticket (« Carrefour Lille »). La date est l'heure locale du ticket (« 14/11/2025 à 14h11 » → « 2025-11-14T14:11:00 »).

Catalogue du foyer (nom canonique → rayon) :
${catalogue}`;
}

type Contenu =
  | { type: "text"; text: string }
  | { type: "image"; source: { type: "base64"; media_type: string; data: string } }
  | { type: "document"; source: { type: "base64"; media_type: "application/pdf"; data: string } };

interface Demande {
  texte?: string;
  image?: { media_type: string; data: string };
  pdf?: string;
}

const TAILLE_MAX = 7_000_000; // ~5 Mo une fois décodé

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return Response.json({ erreur: "Méthode non autorisée" }, { status: 405, headers: CORS });

  try {
    const cle = Deno.env.get("ANTHROPIC_API_KEY");
    if (!cle) {
      return Response.json(
        { erreur: "Le mode cloud n'est pas configuré : ajoute le secret ANTHROPIC_API_KEY dans Supabase." },
        { status: 503, headers: CORS },
      );
    }
    const auth = req.headers.get("Authorization");
    if (!auth) return Response.json({ erreur: "Connexion requise" }, { status: 401, headers: CORS });

    const corps = (await req.json()) as Demande;
    const contenu: Contenu[] = [];
    if (corps.texte?.trim()) {
      contenu.push({ type: "text", text: `Texte du ticket :\n\n${corps.texte.slice(0, 50_000)}` });
    } else if (corps.image?.data && /^image\/(jpeg|png|webp|gif)$/.test(corps.image.media_type)) {
      if (corps.image.data.length > TAILLE_MAX) throw new Error("Photo trop lourde (5 Mo maximum)");
      contenu.push({ type: "image", source: { type: "base64", media_type: corps.image.media_type, data: corps.image.data } });
      contenu.push({ type: "text", text: "Voici la photo du ticket." });
    } else if (corps.pdf) {
      if (corps.pdf.length > TAILLE_MAX) throw new Error("PDF trop lourd (5 Mo maximum)");
      contenu.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: corps.pdf } });
      contenu.push({ type: "text", text: "Voici le ticket en PDF." });
    } else {
      return Response.json({ erreur: "Envoie le texte, la photo ou le PDF du ticket." }, { status: 400, headers: CORS });
    }

    // Catalogue lu avec les droits de l'utilisateur (référentiel commun + ses produits)
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: auth } },
      auth: { persistSession: false },
    });
    const { data: produits, error } = await supabase.from("products").select("name, aisle_id").order("name");
    if (error) throw error;
    const catalogue = (produits ?? []).map((p) => `${p.name} → ${p.aisle_id}`).join("\n");

    const reponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": cle,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: Deno.env.get("ANTHROPIC_MODEL") || "claude-sonnet-5-5",
        max_tokens: 8000,
        system: consignes(catalogue),
        messages: [{ role: "user", content: contenu }],
        output_config: { format: { type: "json_schema", schema: SCHEMA } },
      }),
    });
    const resultat = await reponse.json();
    if (!reponse.ok) {
      console.error(resultat);
      throw new Error(resultat?.error?.message ?? `Erreur de l'API Claude (${reponse.status})`);
    }
    if (resultat.stop_reason === "max_tokens") throw new Error("Ticket trop long pour être lu en une fois");
    const bloc = (resultat.content as { type: string; text?: string }[]).find((c) => c.type === "text");
    if (!bloc?.text) throw new Error("Réponse vide de Claude");

    const ticket = JSON.parse(bloc.text);
    for (const item of ticket.items ?? []) item.categoryLabel = LIBELLES[item.category] ?? LIBELLES.autre;
    return Response.json({ ticket, modele: resultat.model }, { headers: CORS });
  } catch (err) {
    console.error(err);
    return Response.json({ erreur: (err as Error).message }, { status: 500, headers: CORS });
  }
});
