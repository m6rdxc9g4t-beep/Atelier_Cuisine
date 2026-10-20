// Moteur IA hybride pour la lecture des tickets de caisse.
//
//  * local : Ollama sur le Mac (http://localhost:11434), hors ligne, gratuit ;
//  * cloud : Claude, via la fonction Supabase « lire-ticket » (la clé API reste
//    côté serveur) ;
//  * auto  : Ollama s'il répond en moins de 3 s, sinon Claude.
//
// Dans tous les cas, la réponse est nettoyée par normaliserTicket : l'app
// reçoit toujours le même format, quel que soit le moteur.

import { supabase, type Product } from "./supabase";
import { normaliserTicket, type TicketDecode } from "./ticket";

export type ModeIA = "local" | "cloud" | "auto";

export interface ReglagesIA {
  modeIA: ModeIA;
  ollamaUrl: string;
  ollamaModele: string;
  ollamaModeleVision: string;
}

export const REGLAGES_IA_DEFAUT: ReglagesIA = {
  modeIA: "auto",
  ollamaUrl: "http://localhost:11434",
  ollamaModele: "llama3.2",
  ollamaModeleVision: "llama3.2-vision",
};

export type Moteur = "ollama" | "claude";

/** Erreur à montrer telle quelle, avec la bascule proposée. */
export class IAIndisponible extends Error {
  readonly proposer: ModeIA | null;
  constructor(message: string, proposer: ModeIA | null) {
    super(message);
    this.proposer = proposer;
  }
}

export interface EntreeTicket {
  texte?: string;
  image?: { media_type: string; data: string };
  pdf?: string;
}

/** Ollama répond-il ? (délai maximal : 3 secondes) */
export async function ollamaDisponible(url: string, delai = 3000): Promise<boolean> {
  const ctrl = new AbortController();
  const minuteur = setTimeout(() => ctrl.abort(), delai);
  try {
    const r = await fetch(url.replace(/\/$/, "") + "/api/tags", { signal: ctrl.signal });
    return r.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(minuteur);
  }
}

const SCHEMA_OLLAMA = {
  type: "object",
  required: ["storeName", "purchaseDate", "paymentMethod", "totalAmount", "items"],
  properties: {
    storeName: { type: "string" },
    purchaseDate: { type: "string" },
    paymentMethod: { type: "string" },
    totalAmount: { type: "number" },
    items: {
      type: "array",
      items: {
        type: "object",
        required: ["rawLabel", "matchedIngredientName", "brand", "packagingSize", "category", "tvaRate", "quantity", "unitPrice", "totalPrice", "isFoodBudget"],
        properties: {
          rawLabel: { type: "string" },
          matchedIngredientName: { type: "string" },
          brand: { type: "string" },
          packagingSize: { type: "string" },
          category: { type: "string" },
          tvaRate: { type: "number" },
          quantity: { type: "number" },
          unitPrice: { type: "number" },
          totalPrice: { type: "number" },
          isFoodBudget: { type: "boolean" },
        },
      },
    },
  },
};

function consignes(produits: Product[]): string {
  return `Tu lis des tickets de caisse français et tu réponds uniquement en JSON.
Ne garde que les articles achetés : ignore adresse, téléphone, horaires, numéros de carte de fidélité, codes-barres et lignes de paiement.
Un libellé comme « 5.5% DUCROS ANETH 13G » donne tvaRate 5.5, brand « Ducros », produit « Aneth », packagingSize « 13g ».
Corrige les montants mal formés (« 2.19. » vaut 2.19). La date est au format AAAA-MM-JJTHH:MM:SS.
category est l'un de : fruits_legumes, viandes_poissons, produits_frais, feculents, surgeles, epicerie_sucree, epicerie_salee, boissons, apero, hygiene, entretien, autre.
isFoodBudget est faux pour hygiene et entretien. TVA 5.5 % = alimentaire ; 20 % = souvent hygiène, entretien ou alcool.
Si le produit est dans ce catalogue, reprends son nom exact et son rayon :
${produits.map((p) => `${p.name} → ${p.aisle_id}`).join("\n")}`;
}

async function viaOllama(entree: EntreeTicket, produits: Product[], r: ReglagesIA): Promise<unknown> {
  if (!entree.texte && !entree.image) {
    throw new IAIndisponible("Ollama ne lit pas les PDF scannés. Passe en mode Cloud pour ce ticket.", "cloud");
  }
  const reponse = await fetch(r.ollamaUrl.replace(/\/$/, "") + "/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model: entree.image ? r.ollamaModeleVision : r.ollamaModele,
      stream: false,
      format: SCHEMA_OLLAMA,
      options: { temperature: 0 },
      messages: [
        { role: "system", content: consignes(produits) },
        entree.image
          ? { role: "user", content: "Voici la photo du ticket.", images: [entree.image.data] }
          : { role: "user", content: `Texte du ticket :\n\n${entree.texte}` },
      ],
    }),
  });
  if (!reponse.ok) {
    const corps = await reponse.text();
    if (/not found/i.test(corps)) {
      const modele = entree.image ? r.ollamaModeleVision : r.ollamaModele;
      throw new IAIndisponible(`Le modèle « ${modele} » n'est pas installé. Dans le Terminal : ollama pull ${modele}`, "cloud");
    }
    throw new Error(`Ollama a répondu ${reponse.status}`);
  }
  const json = (await reponse.json()) as { message?: { content?: string } };
  return JSON.parse(json.message?.content ?? "{}");
}

async function viaClaude(entree: EntreeTicket): Promise<unknown> {
  const { data, error } = await supabase.functions.invoke("lire-ticket", { body: entree });
  if (error) {
    let message = error.message;
    const contexte = (error as { context?: Response }).context;
    if (contexte && typeof contexte.json === "function") {
      try {
        message = ((await contexte.json()) as { erreur?: string }).erreur ?? message;
      } catch {
        /* réponse non JSON */
      }
    }
    if (/failed to send|fetch/i.test(message)) {
      throw new IAIndisponible("Pas de connexion : le mode Cloud a besoin d'Internet. Passe en mode Local avec Ollama.", "local");
    }
    throw new Error(message);
  }
  return (data as { ticket: unknown }).ticket;
}

/** Lit un ticket avec le moteur choisi ; renvoie le ticket nettoyé et le moteur utilisé. */
export async function lireTicketIA(
  entree: EntreeTicket,
  produits: Product[],
  r: ReglagesIA,
): Promise<{ ticket: TicketDecode; moteur: Moteur }> {
  let moteur: Moteur = r.modeIA === "cloud" ? "claude" : "ollama";
  if (r.modeIA !== "cloud") {
    const ok = await ollamaDisponible(r.ollamaUrl);
    if (!ok && r.modeIA === "local") {
      throw new IAIndisponible(
        "Ollama ne répond pas. Lance l'app Ollama sur le Mac (ou « ollama serve » dans le Terminal), ou passe en mode Cloud.",
        "cloud",
      );
    }
    if (!ok) moteur = "claude";
  }
  const brut = moteur === "ollama" ? await viaOllama(entree, produits, r) : await viaClaude(entree);
  return { ticket: normaliserTicket(brut, produits), moteur };
}
