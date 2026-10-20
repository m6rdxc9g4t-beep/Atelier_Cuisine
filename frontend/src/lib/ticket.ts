// Lecture des tickets de caisse (CONTEXT_SPEC.md §5).
//
// 1. decoderTicketTexte : décodeur déterministe des e-tickets texte (format
//    Carrefour de référence). Il fonctionne hors ligne, sans IA.
// 2. normaliserTicket : nettoie la réponse d'un modèle d'IA (Ollama ou Claude)
//    au format JSON de la spec, pour que l'app la traite comme la sienne.
// 3. rapprocher : relie un libellé (« 5.5% DUCROS ANETH 13G ») au produit du
//    catalogue (« Aneth », rayon Épicerie salée), avec marque et conditionnement.

import { capitaliser } from "./aliments";
import { cleAliment, normaliser } from "./normaliser";
import { budgetSelonTva, rayon, rayonDepuisTexte, type RayonId } from "./rayons";
import type { Product } from "./supabase";

export interface LigneTicket {
  rawLabel: string;
  matchedIngredientName: string;
  productId: string | null;
  brand: string | null;
  packagingSize: string | null;
  category: RayonId;
  tvaRate: number | null;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  isFoodBudget: boolean;
}

export interface TicketDecode {
  storeName: string;
  /** Heure locale, AAAA-MM-JJTHH:MM:SS */
  purchaseDate: string | null;
  paymentMethod: string | null;
  totalAmount: number | null;
  items: LigneTicket[];
}

/** « 2.19. », « 2,19 € », "2.19" → 2.19 */
export function montant(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? Math.round(v * 100) / 100 : null;
  if (typeof v !== "string") return null;
  const m = v.replace(/\s/g, "").replace(",", ".").match(/-?\d+(?:\.\d+)?/);
  return m ? Math.round(Number(m[0]) * 100) / 100 : null;
}

const CONDITIONNEMENT = /^(?:\d+(?:[.,]\d+)?\s?(?:G|GR|KG|MG|ML|CL|L|LT|CM)|X\d+|\d+X\d+(?:[.,]\d+)?(?:G|KG|CL|L|ML)?|\d+\s?(?:PCS|TR|ROULEAUX|SACHETS))$/i;

function motsMajuscules(s: string) {
  return s
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((m) => m[0].toUpperCase() + m.slice(1))
    .join(" ");
}

/**
 * Relie un libellé de ticket à un produit du catalogue.
 * Le mot-clé le plus long trouvé dans le libellé l'emporte ; ce qui le précède
 * est la marque, le dernier mot de type « 13G » est le conditionnement.
 */
export function rapprocher(
  libelle: string,
  produits: Product[],
): { produit: Product | null; marque: string | null; conditionnement: string | null; nom: string } {
  const sansTva = libelle.replace(/^\s*\d{1,2}(?:[.,]\d+)?\s?%\s*/, "").trim();
  const mots = sansTva.split(/\s+/);
  let conditionnement: string | null = null;
  if (mots.length > 1 && CONDITIONNEMENT.test(mots[mots.length - 1])) {
    conditionnement = mots.pop()!.toLowerCase().replace(/\s/g, "").replace(",", ".");
  }
  const texte = mots.join(" ");
  const n = " " + cleAliment(texte) + " ";

  let meilleur: { produit: Product; cle: string; position: number } | null = null;
  for (const p of produits) {
    const cles = p.keywords.length ? p.keywords : [cleAliment(p.name)];
    for (const c of cles) {
      const k = cleAliment(c);
      if (!k) continue;
      const position = n.indexOf(" " + k);
      // le mot-clé doit commencer un mot et finir un mot (ou être le début d'un mot au pluriel)
      if (position >= 0 && (!meilleur || k.length > meilleur.cle.length)) {
        meilleur = { produit: p, cle: k, position };
      }
    }
  }

  if (!meilleur) {
    return { produit: null, marque: null, conditionnement, nom: capitaliser(texte.toLowerCase()) };
  }
  // Mots du libellé avant le mot-clé : la marque (« DUCROS »)
  const avant = cleAliment(texte).slice(0, Math.max(0, meilleur.position)).trim();
  const nbMotsMarque = avant ? avant.split(" ").length : 0;
  const marque = nbMotsMarque ? motsMajuscules(mots.slice(0, nbMotsMarque).join(" ")) : null;
  return { produit: meilleur.produit, marque, conditionnement, nom: meilleur.produit.name };
}

/** Ligne d'article : rayon, budget et prix cohérents. */
function ligne(
  brut: string,
  tva: number | null,
  quantite: number,
  pu: number | null,
  total: number | null,
  produits: Product[],
  indices: { nom?: string; marque?: string; conditionnement?: string; rayon?: string; alimentaire?: boolean } = {},
): LigneTicket {
  const r = rapprocher(brut, produits);
  const produit = r.produit;
  let categorie: RayonId = produit ? rayon(produit.aisle_id).id : indices.rayon ? rayonDepuisTexte(indices.rayon) : "autre";
  if (!produit && categorie === "autre" && budgetSelonTva(tva) === "alimentaire") categorie = "epicerie_salee";
  const unitPrice = pu ?? (total != null ? Math.round((total / quantite) * 100) / 100 : 0);
  const totalPrice = total ?? Math.round(unitPrice * quantite * 100) / 100;
  return {
    rawLabel: brut.trim(),
    matchedIngredientName: produit?.name ?? (indices.nom?.trim() || r.nom),
    productId: produit?.id ?? null,
    brand: indices.marque?.trim() || r.marque,
    packagingSize: indices.conditionnement?.trim().toLowerCase() || r.conditionnement,
    category: categorie,
    tvaRate: tva,
    quantity: quantite,
    unitPrice,
    totalPrice,
    isFoodBudget: produit || categorie !== "autre" ? rayon(categorie).budget === "alimentaire" : (indices.alimentaire ?? true),
  };
}

const RE_DATE = /(\d{1,2})[/.](\d{1,2})[/.](\d{2,4})\s*(?:à|a|-)?\s*(\d{1,2})[h:](\d{2})/i;
const RE_ARTICLE =
  /^(\d{1,2}(?:[.,]\d+)?)\s?%\s+(.+?)\s*(?:\|\s*)?(?:(\d+(?:[.,]\d+)?)\s*[x×*]\s*(\d+[.,]\d{2})\.?\s*(?:€\s*)?(?:\|\s*)?)?(-?\d+[.,]\d{2})\.?\s*€?\s*$/;
const BRUIT = /^(t[ée]l|lun\.|mar\.|mer\.|jeu\.|ven\.|sam\.|dim\.|clubs?|ma carte|carte|tva\s*\||total|pay[ée]|rendu|merci|\d{6,})/i;

/** Décode le texte brut d'un e-ticket (PDF Carrefour et formats proches). */
export function decoderTicketTexte(texte: string, produits: Product[]): TicketDecode {
  const lignes = texte
    .split(/\r?\n/)
    // Les colonnes du PDF (« Produit | QTE x P.U. | Montant ») deviennent de simples espaces
    .map((l) => l.replace(/\s*\|\s*/g, " ").replace(/\s+/g, " ").trim())
    .filter(Boolean);

  // Enseigne : première ligne, suivie de la ville si elle est en majuscules
  let storeName = lignes[0] ? motsMajuscules(lignes[0]) : "Magasin";
  if (lignes[1] && /^[A-ZÀ-Ý' -]{3,}$/.test(lignes[1]) && !BRUIT.test(lignes[1])) {
    storeName += " " + motsMajuscules(lignes[1]);
  }

  let purchaseDate: string | null = null;
  let paymentMethod: string | null = null;
  let totalAmount: number | null = null;
  const items: LigneTicket[] = [];

  for (const l of lignes) {
    if (!purchaseDate) {
      const d = l.match(RE_DATE);
      if (d) {
        const annee = d[3].length === 2 ? "20" + d[3] : d[3];
        purchaseDate = `${annee}-${d[2].padStart(2, "0")}-${d[1].padStart(2, "0")}T${d[4].padStart(2, "0")}:${d[5]}:00`;
        continue;
      }
    }
    const total = l.match(/^total(?:\s+[àa]\s+payer)?\s*\|?\s*(\d+[.,]\d{2})/i);
    if (total) {
      totalAmount = montant(total[1]);
      continue;
    }
    const paye = l.match(/^pay[ée]\s+par\s+(.+?)\s*(?:\||\d+[.,]\d{2}|$)/i);
    if (paye) {
      paymentMethod = capitaliser(paye[1].trim().toLowerCase());
      continue;
    }
    const a = l.match(RE_ARTICLE);
    if (a) {
      const tva = montant(a[1]);
      const quantite = a[3] ? montant(a[3]) ?? 1 : 1;
      items.push(ligne(`${a[1]}% ${a[2]}`.replace(/\s*\|\s*$/, ""), tva, quantite, montant(a[4] ?? null), montant(a[5]), produits));
    }
  }

  if (totalAmount == null && items.length) {
    totalAmount = Math.round(items.reduce((s, i) => s + i.totalPrice, 0) * 100) / 100;
  }
  return { storeName, purchaseDate, paymentMethod, totalAmount, items };
}

/** Nettoie un ticket renvoyé par un modèle d'IA (format JSON de la spec). */
export function normaliserTicket(brut: unknown, produits: Product[]): TicketDecode {
  const t = (brut ?? {}) as Record<string, unknown>;
  const lignesBrutes = Array.isArray(t.items) ? (t.items as Record<string, unknown>[]) : [];
  const items = lignesBrutes
    .map((i) => {
      const quantite = montant(i.quantity) ?? 1;
      const libelle = String(i.rawLabel ?? i.matchedIngredientName ?? "").trim();
      if (!libelle) return null;
      const l = ligne(libelle, montant(i.tvaRate), quantite > 0 ? quantite : 1, montant(i.unitPrice), montant(i.totalPrice), produits, {
        nom: typeof i.matchedIngredientName === "string" ? i.matchedIngredientName : undefined,
        marque: typeof i.brand === "string" ? i.brand : undefined,
        conditionnement: typeof i.packagingSize === "string" ? i.packagingSize : undefined,
        rayon: typeof i.category === "string" ? i.category : undefined,
        alimentaire: typeof i.isFoodBudget === "boolean" ? i.isFoodBudget : undefined,
      });
      // Le modèle a peut-être reconnu un produit du catalogue par son nom
      if (!l.productId && l.matchedIngredientName) {
        const p = produits.find((x) => normaliser(x.name) === normaliser(l.matchedIngredientName));
        if (p) {
          l.productId = p.id;
          l.matchedIngredientName = p.name;
          l.category = rayon(p.aisle_id).id;
          l.isFoodBudget = rayon(p.aisle_id).budget === "alimentaire";
        }
      }
      return l;
    })
    .filter((l): l is LigneTicket => l !== null);

  const date = typeof t.purchaseDate === "string" && /^\d{4}-\d{2}-\d{2}/.test(t.purchaseDate) ? t.purchaseDate.slice(0, 19) : null;
  return {
    storeName: typeof t.storeName === "string" && t.storeName.trim() ? t.storeName.trim() : "Magasin",
    purchaseDate: date,
    paymentMethod: typeof t.paymentMethod === "string" && t.paymentMethod.trim() ? t.paymentMethod.trim() : null,
    totalAmount: montant(t.totalAmount) ?? (items.length ? Math.round(items.reduce((s, i) => s + i.totalPrice, 0) * 100) / 100 : null),
    items,
  };
}

/** Récapitulatif d'une session au format Markdown (export / copie). */
export function versMarkdown(
  s: { store_name: string; purchased_at: string; payment_method: string | null; total_amount: number; food_subtotal: number; home_subtotal: number },
  items: { raw_label: string; matched_name: string | null; category: string; quantity: number; unit_price: number; total_price: number }[],
): string {
  const euros = (v: number) => v.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
  const date = new Date(s.purchased_at).toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short" });
  const parRayon = new Map<string, typeof items>();
  for (const i of items) parRayon.set(i.category, [...(parRayon.get(i.category) ?? []), i]);
  const blocs = [...parRayon.entries()]
    .sort(([a], [b]) => rayon(a).position - rayon(b).position)
    .map(([c, l]) => {
      const r = rayon(c);
      return `### ${r.emoji} ${r.nom}\n\n| Produit | Qté | P.U. | Montant |\n|---|---:|---:|---:|\n${l
        .map((i) => `| ${i.matched_name ?? i.raw_label} | ${i.quantity} | ${euros(i.unit_price)} | ${euros(i.total_price)} |`)
        .join("\n")}`;
    });
  return [
    `## 🧾 ${s.store_name} — ${date}`,
    "",
    `- **Total TTC :** ${euros(s.total_amount)}`,
    `- **Alimentaire :** ${euros(s.food_subtotal)}`,
    `- **Maison & hygiène :** ${euros(s.home_subtotal)}`,
    s.payment_method ? `- **Paiement :** ${s.payment_method}` : null,
    "",
    ...blocs.flatMap((b) => [b, ""]),
  ]
    .filter((l) => l !== null)
    .join("\n");
}
