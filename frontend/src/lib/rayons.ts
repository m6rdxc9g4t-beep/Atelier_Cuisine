// Les 11 rayons officiels du foyer (CONTEXT_SPEC.md §3), dans l'ordre du
// parcours en magasin. Même liste que la table public.aisles
// (backend/supabase/migrations/20261021080000_rayons_catalogue.sql).

import type { Emplacement } from "./supabase";

export type RayonId =
  | "fruits_legumes"
  | "viandes_poissons"
  | "produits_frais"
  | "feculents"
  | "surgeles"
  | "epicerie_sucree"
  | "epicerie_salee"
  | "boissons"
  | "apero"
  | "hygiene"
  | "entretien"
  | "autre";

export type BudgetRayon = "alimentaire" | "maison";

export interface Rayon {
  id: RayonId;
  position: number;
  emoji: string;
  nom: string;
  budget: BudgetRayon;
  emplacement: Emplacement;
  /** Durée de conservation typique (jours), à défaut d'une valeur propre au produit. */
  jours: number | null;
}

export const RAYONS: Rayon[] = [
  { id: "fruits_legumes", position: 1, emoji: "🥬", nom: "Fruits & légumes", budget: "alimentaire", emplacement: "corbeille", jours: 7 },
  { id: "viandes_poissons", position: 2, emoji: "🥩", nom: "Viandes / poissons / protéines", budget: "alimentaire", emplacement: "frigo", jours: 3 },
  { id: "produits_frais", position: 3, emoji: "🧀", nom: "Produits frais", budget: "alimentaire", emplacement: "frigo", jours: 10 },
  { id: "feculents", position: 4, emoji: "🥖", nom: "Féculents / céréales", budget: "alimentaire", emplacement: "placard", jours: null },
  { id: "surgeles", position: 5, emoji: "🍟", nom: "Surgelés / plats rapides", budget: "alimentaire", emplacement: "congelateur", jours: 90 },
  { id: "epicerie_sucree", position: 6, emoji: "🍫", nom: "Épicerie sucrée", budget: "alimentaire", emplacement: "placard", jours: null },
  { id: "epicerie_salee", position: 7, emoji: "🧂", nom: "Épicerie salée / sauces", budget: "alimentaire", emplacement: "placard", jours: null },
  { id: "boissons", position: 8, emoji: "🥤", nom: "Boissons", budget: "alimentaire", emplacement: "placard", jours: null },
  { id: "apero", position: 9, emoji: "🍿", nom: "Apéro", budget: "alimentaire", emplacement: "placard", jours: null },
  { id: "hygiene", position: 10, emoji: "🧼", nom: "Hygiène", budget: "maison", emplacement: "maison", jours: null },
  { id: "entretien", position: 11, emoji: "🧽", nom: "Entretien maison", budget: "maison", emplacement: "maison", jours: null },
  { id: "autre", position: 99, emoji: "📦", nom: "Autre", budget: "alimentaire", emplacement: "frigo", jours: null },
];

const PAR_ID = new Map(RAYONS.map((r) => [r.id, r]));

export function rayon(id: string | null | undefined): Rayon {
  return PAR_ID.get(id as RayonId) ?? PAR_ID.get("autre")!;
}

/** « 🧂 Épicerie salée / sauces » : le libellé de la spec et des tickets décodés. */
export const libelleRayon = (id: string | null | undefined) => {
  const r = rayon(id);
  return `${r.emoji} ${r.nom}`;
};

export const estRayon = (id: string): id is RayonId => PAR_ID.has(id as RayonId);

/** Rayons 1 à 9 : budget alimentaire ; 10 et 11 : maison & hygiène. */
export const estAlimentaire = (id: string | null | undefined) => rayon(id).budget === "alimentaire";

/**
 * Retrouve un rayon à partir d'un libellé ou d'un identifiant, tels que les
 * renvoient les modèles d'IA (« 🧂 Épicerie salée / sauces », « epicerie_salee »,
 * « Épicerie salée »…).
 */
export function rayonDepuisTexte(texte: string | null | undefined): RayonId {
  if (!texte) return "autre";
  const t = texte.trim();
  if (estRayon(t)) return t;
  const sansEmoji = t.replace(/^[^\p{L}]+/u, "").toLowerCase();
  const trouve = RAYONS.find(
    (r) => r.nom.toLowerCase() === sansEmoji || t.startsWith(r.emoji) || sansEmoji.startsWith(r.nom.toLowerCase().split(" ")[0]),
  );
  return trouve?.id ?? "autre";
}

/** Rayon probable d'après le taux de TVA d'une ligne de ticket : 5,5 % = alimentaire. */
export function budgetSelonTva(tva: number | null | undefined): BudgetRayon | null {
  if (tva == null) return null;
  if (tva <= 10) return "alimentaire";
  return null; // 20 % : hygiène, entretien… mais aussi l'alcool : on ne tranche pas
}
