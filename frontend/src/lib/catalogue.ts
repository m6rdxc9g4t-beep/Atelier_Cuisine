import { useCallback, useEffect, useState } from "react";
import { definirCatalogue } from "./aliments";
import { supabase, type MealTemplate, type MealTemplateItem, type Product } from "./supabase";

// Catalogue de produits et repas types : lus une fois puis gardés en mémoire,
// comme les recettes (voir donnees.tsx).

export interface RepasType extends MealTemplate {
  items: MealTemplateItem[];
}

export interface Catalogue {
  produits: Product[];
  repasTypes: RepasType[];
}

let cache: Promise<Catalogue> | null = null;

export function chargerCatalogue(forcer = false): Promise<Catalogue> {
  if (!cache || forcer) {
    cache = (async () => {
      const [p, t, i] = await Promise.all([
        supabase.from("products").select("*").order("name"),
        supabase.from("meal_templates").select("*").order("position"),
        supabase.from("meal_template_items").select("*").order("position"),
      ]);
      if (p.error) throw p.error;
      if (t.error) throw t.error;
      if (i.error) throw i.error;
      const produits = p.data as Product[];
      definirCatalogue(produits);
      const parModele = new Map<string, MealTemplateItem[]>();
      for (const it of i.data as MealTemplateItem[]) {
        parModele.set(it.template_id, [...(parModele.get(it.template_id) ?? []), it]);
      }
      const repasTypes = (t.data as MealTemplate[]).map((m) => ({ ...m, items: parModele.get(m.id) ?? [] }));
      return { produits, repasTypes };
    })();
    cache.catch(() => {
      cache = null;
    });
  }
  return cache;
}

export function useCatalogue() {
  const [catalogue, setCatalogue] = useState<Catalogue | null>(null);
  const recharger = useCallback((forcer = false) => {
    chargerCatalogue(forcer)
      .then(setCatalogue)
      .catch(() => setCatalogue({ produits: [], repasTypes: [] }));
  }, []);
  useEffect(() => recharger(), [recharger]);
  return { catalogue, recharger };
}
