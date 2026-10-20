// Calculs du budget (fonctions pures, testées dans budget.test.ts).
// Les dépenses viennent des tickets archivés : Alimentaire = rayons 1 à 9,
// Maison & Hygiène = rayons 10 et 11 ; Sorties = coût des repas extérieurs.

import { jourDe, periode } from "./dates";
import type { Budget, Meal, PerimetreBudget, ShoppingSession, ShoppingSessionItem } from "./supabase";

export interface Depenses {
  alimentaire: number;
  maison: number;
  sorties: number;
  global: number;
  nbTickets: number;
  nbRepasCuisines: number;
  /** Panier alimentaire moyen par ticket */
  panierMoyen: number | null;
  /** Dépense alimentaire / repas cuisinés à la maison */
  coutParRepas: number | null;
}

const arrondi = (v: number) => Math.round(v * 100) / 100;

export function depenses(sessions: ShoppingSession[], meals: Meal[], debut: string, fin: string): Depenses {
  const s = sessions.filter((x) => {
    const j = jourDe(x.purchased_at);
    return j >= debut && j <= fin;
  });
  const m = meals.filter((x) => x.eaten_on >= debut && x.eaten_on <= fin);
  const alimentaire = arrondi(s.reduce((t, x) => t + Number(x.food_subtotal), 0));
  const maison = arrondi(s.reduce((t, x) => t + Number(x.home_subtotal), 0));
  const sorties = arrondi(m.reduce((t, x) => t + Number(x.external_cost ?? 0), 0));
  const cuisines = m.filter((x) => x.status === "cuisine" && x.meal_type !== "exterieur").length;
  const avecAlimentaire = s.filter((x) => Number(x.food_subtotal) > 0).length;
  return {
    alimentaire,
    maison,
    sorties,
    global: arrondi(alimentaire + maison + sorties),
    nbTickets: s.length,
    nbRepasCuisines: cuisines,
    panierMoyen: avecAlimentaire ? arrondi(alimentaire / avecAlimentaire) : null,
    coutParRepas: cuisines ? arrondi(alimentaire / cuisines) : null,
  };
}

export interface Suivi {
  scope: PerimetreBudget;
  budget: Budget | null;
  depense: number;
  /** Part consommée, 0 à 1+ */
  part: number | null;
  debut: string;
  fin: string;
}

/** Avancement de chaque budget sur sa période en cours. */
export function suivis(budgets: Budget[], sessions: ShoppingSession[], meals: Meal[], auj: string): Suivi[] {
  const ordre: PerimetreBudget[] = ["global", "alimentaire", "maison", "sorties"];
  return ordre.map((scope) => {
    const budget = budgets.find((b) => b.scope === scope) ?? null;
    const { debut, fin } = periode(auj, budget?.period ?? "mois");
    const d = depenses(sessions, meals, debut, fin);
    const depense = d[scope];
    return { scope, budget, depense, part: budget ? depense / Number(budget.amount) : null, debut, fin };
  });
}

export interface PointPrix {
  date: string;
  prix: number;
  magasin: string;
}

/** Historique du prix unitaire d'un produit, du plus ancien au plus récent. */
export function historiquePrix(nom: string, items: ShoppingSessionItem[], sessions: ShoppingSession[]): PointPrix[] {
  const parId = new Map(sessions.map((s) => [s.id, s]));
  const cible = nom.trim().toLowerCase();
  return items
    .filter((i) => (i.matched_name ?? i.raw_label).trim().toLowerCase() === cible)
    .map((i) => {
      const s = parId.get(i.session_id);
      return s ? { date: s.purchased_at, prix: Number(i.unit_price), magasin: s.store_name } : null;
    })
    .filter((p): p is PointPrix => p !== null)
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Produits achetés au moins une fois, avec leur dernier prix et la tendance. */
export function produitsAchetes(items: ShoppingSessionItem[], sessions: ShoppingSession[]) {
  const noms = new Map<string, string>();
  for (const i of items) {
    const n = (i.matched_name ?? i.raw_label).trim();
    noms.set(n.toLowerCase(), n);
  }
  return [...noms.values()]
    .map((nom) => {
      const h = historiquePrix(nom, items, sessions);
      const dernier = h[h.length - 1];
      const avant = h.length > 1 ? h[h.length - 2] : null;
      return {
        nom,
        achats: h.length,
        dernier: dernier?.prix ?? null,
        variation: avant && dernier ? arrondi(dernier.prix - avant.prix) : null,
        historique: h,
      };
    })
    .sort((a, b) => b.achats - a.achats || a.nom.localeCompare(b.nom, "fr"));
}
