// Calculs de stock — fonctions pures, sans accès réseau (testées dans stock.test.ts).
//
// * consommation : quels lots du garde-manger un repas utilise, en prenant
//   d'abord celui qui périme le plus tôt (FEFO : premier périmé, premier sorti),
//   la date de mise en boîte comptant comme date d'ouverture ;
// * besoins : ce qu'il faut acheter pour les repas prévus
//   (À acheter = ingrédients des repas non cuisinés − stock non périmé + articles à racheter).

import { NIVEAUX } from "./aliments";
import { joursRestants } from "./dates";
import { correspond, cleAliment } from "./normaliser";
import type { Meal, NiveauStock, PantryItem, RecipeIngredient, ShoppingItem } from "./supabase";

/** Un ingrédient demandé par un repas (recette ou assemblage rapide). */
export interface Besoin {
  nom: string;
  cle: string;
  exclusions: string[];
  quantite: number | null;
  unite: string | null;
  categorie: string;
  /** Produit de placard supposé présent (sel, poivre…) : jamais acheté ni déduit. */
  base: boolean;
}

export type ActionStock =
  | { id: string; action: "retirer" }
  | { id: string; action: "quantite"; quantity: number }
  | { id: string; action: "niveau"; stock_level: NiveauStock };

export interface LigneConsommation {
  besoin: Besoin;
  lot: PantryItem | null;
  action: ActionStock | null;
  /** Phrase lisible : « 200 g sur 400 g », « passe à Presque fini »… */
  resume: string;
}

export function besoinsDepuisRecette(ingredients: RecipeIngredient[], facteur = 1): Besoin[] {
  // Parmi des ingrédients interchangeables (même groupe), seul le premier compte.
  const groupesVus = new Set<string>();
  const out: Besoin[] = [];
  for (const i of [...ingredients].sort((a, b) => a.position - b.position)) {
    if (i.is_optional) continue;
    if (i.alt_group) {
      if (groupesVus.has(i.alt_group)) continue;
      groupesVus.add(i.alt_group);
    }
    out.push({
      nom: i.name,
      cle: i.match_key,
      exclusions: i.exclude_keys ?? [],
      quantite: i.quantity != null ? i.quantity * facteur : null,
      unite: i.unit,
      categorie: i.category,
      base: i.is_staple,
    });
  }
  return out;
}

export function besoinsDepuisAssemblage(
  items: { name: string; match_key: string; quantity: number | null; unit: string | null }[],
  categorie: (nom: string) => string,
): Besoin[] {
  return items.map((i) => ({
    nom: i.name,
    cle: i.match_key,
    exclusions: [],
    quantite: i.quantity,
    unite: i.unit,
    categorie: categorie(i.name),
    base: false,
  }));
}

/** Date à partir de laquelle le lot doit partir en premier. */
function echeance(p: PantryItem): string {
  return p.expires_on ?? "9999-12-31";
}

/** Lots utilisables (non périmés) pour un besoin, du plus urgent au moins urgent. */
export function lotsPour(besoin: Besoin, pantry: PantryItem[]): PantryItem[] {
  return pantry
    .filter((p) => (joursRestants(p.expires_on) ?? 0) >= 0)
    .filter((p) => correspond(p.name, besoin.cle, besoin.exclusions))
    .sort(
      (a, b) =>
        echeance(a).localeCompare(echeance(b)) ||
        Number(b.in_container) - Number(a.in_container) ||
        (a.opened_on ?? "9999").localeCompare(b.opened_on ?? "9999") ||
        a.created_at.localeCompare(b.created_at),
    );
}

const UNITES_EQUIVALENTES: Record<string, [string, number]> = {
  g: ["g", 1],
  gr: ["g", 1],
  kg: ["g", 1000],
  ml: ["ml", 1],
  cl: ["ml", 10],
  l: ["ml", 1000],
};

function versBase(q: number, u: string | null): [number, string] {
  const k = (u ?? "").toLowerCase().trim().replace(/s$/, "");
  const eq = UNITES_EQUIVALENTES[k];
  if (eq) return [q * eq[1], eq[0]];
  return [q, k || "piece"];
}

function niveauSuivant(n: NiveauStock | null): NiveauStock | null {
  const ordre = NIVEAUX.map((x) => x.id);
  const i = n ? ordre.indexOf(n) : 0;
  return i >= ordre.length - 1 ? null : ordre[i + 1];
}

/** Ce qu'un repas retire du stock, lot par lot (FEFO). */
export function planifierConsommation(besoins: Besoin[], pantry: PantryItem[]): LigneConsommation[] {
  const dejaPris = new Set<string>();
  return besoins
    .filter((b) => !b.base)
    .map((besoin) => {
      const lot = lotsPour(besoin, pantry).find((p) => !dejaPris.has(p.id)) ?? null;
      if (!lot) return { besoin, lot: null, action: null, resume: "Pas en stock" };
      dejaPris.add(lot.id);

      // Quantités comparables : on soustrait
      if (lot.quantity != null && besoin.quantite != null) {
        const [qLot, uLot] = versBase(lot.quantity, lot.unit);
        const [qBesoin, uBesoin] = versBase(besoin.quantite, besoin.unite);
        if (uLot === uBesoin) {
          const reste = Math.round((qLot - qBesoin) * 1000) / 1000;
          if (reste <= 0) return { besoin, lot, action: { id: lot.id, action: "retirer" }, resume: "Fini" };
          const facteur = lot.quantity / qLot; // revient à l'unité du lot
          const quantity = Math.round(reste * facteur * 1000) / 1000;
          return {
            besoin,
            lot,
            action: { id: lot.id, action: "quantite", quantity },
            resume: `Il en restera ${quantity}${lot.unit ? " " + lot.unit : ""}`,
          };
        }
      }
      // Niveau rapide : on descend d'un cran
      if (lot.stock_level) {
        const suivant = niveauSuivant(lot.stock_level);
        if (!suivant) return { besoin, lot, action: { id: lot.id, action: "retirer" }, resume: "Fini" };
        return {
          besoin,
          lot,
          action: { id: lot.id, action: "niveau", stock_level: suivant },
          resume: `Passe à « ${NIVEAUX.find((n) => n.id === suivant)!.label} »`,
        };
      }
      // Quantité inconnue (« Ail », « Jambon ») : le produit est entamé, pas forcément fini
      return {
        besoin,
        lot,
        action: { id: lot.id, action: "niveau", stock_level: "moitie" },
        resume: "Entamé : passe à « Moitié »",
      };
    });
}

/** Besoins des repas prévus qui ne sont couverts ni par le stock ni par la liste. */
export function aAcheterPourPlanning(
  repas: { meal: Meal; besoins: Besoin[] }[],
  pantry: PantryItem[],
  shopping: ShoppingItem[],
): { besoin: Besoin; meal: Meal }[] {
  const surListe = shopping.filter((s) => !s.checked);
  const vus = new Set<string>();
  const out: { besoin: Besoin; meal: Meal }[] = [];
  for (const { meal, besoins } of repas) {
    if (meal.status === "cuisine" || meal.meal_type === "exterieur") continue;
    for (const b of besoins) {
      if (b.base) continue;
      const cle = cleAliment(b.cle);
      if (vus.has(cle)) continue;
      if (lotsPour(b, pantry).length) continue;
      if (surListe.some((s) => correspond(s.name, b.cle, b.exclusions))) continue;
      vus.add(cle);
      out.push({ besoin: b, meal });
    }
  }
  return out;
}
