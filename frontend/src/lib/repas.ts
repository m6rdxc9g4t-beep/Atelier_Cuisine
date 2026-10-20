// Liens entre un repas du planning et ce qu'il consomme.

import { deviner } from "./aliments";
import type { RepasType } from "./catalogue";
import type { RecetteComplete } from "./donnees";
import { besoinsDepuisAssemblage, besoinsDepuisRecette, type Besoin } from "./stock";
import type { Meal } from "./supabase";

export type QuoiCuisiner =
  | { type: "recette"; recette: RecetteComplete; meal?: Meal }
  | { type: "assemblage"; modele: RepasType; meal?: Meal };

/** Besoins d'un repas (recette mise à l'échelle des portions, ou assemblage rapide). */
export function besoinsDe(q: QuoiCuisiner, portions = 2): Besoin[] {
  if (q.type === "recette") {
    const facteur = q.recette.servings ? portions / q.recette.servings : 1;
    return besoinsDepuisRecette(q.recette.ingredients, facteur);
  }
  return besoinsDepuisAssemblage(q.modele.items, (nom) => deviner(nom).categorie);
}

/** Ce qu'il faut pour cuisiner un repas du planning (rien pour un repas extérieur ou libre). */
export function quoiPourRepas(meal: Meal, recettes: RecetteComplete[], modeles: RepasType[]): QuoiCuisiner | null {
  const recette = meal.recipe_id ? recettes.find((r) => r.id === meal.recipe_id) : undefined;
  if (recette) return { type: "recette", recette, meal };
  const modele = meal.template_id ? modeles.find((m) => m.id === meal.template_id) : undefined;
  if (modele?.recipe_id) {
    const r = recettes.find((x) => x.id === modele.recipe_id);
    if (r) return { type: "recette", recette: r, meal };
  }
  if (modele && modele.meal_type === "assemblage") return { type: "assemblage", modele, meal };
  return null;
}
