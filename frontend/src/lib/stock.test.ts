import { describe, expect, it } from "vitest";
import { ajouterJours, aujourdhui } from "./dates";
import { aAcheterPourPlanning, besoinsDepuisRecette, planifierConsommation, type Besoin } from "./stock";
import type { Meal, PantryItem, RecipeIngredient, ShoppingItem } from "./supabase";

const auj = aujourdhui();
let n = 0;
const lot = (name: string, extra: Partial<PantryItem> = {}): PantryItem => ({
  id: `lot-${++n}`,
  name,
  quantity: null,
  unit: null,
  category: "autre",
  location: "frigo",
  expires_on: null,
  stock_level: null,
  opened_on: null,
  in_container: false,
  note: null,
  product_id: null,
  purchase_price: null,
  created_at: `2026-10-0${n % 9}T10:00:00Z`,
  ...extra,
});
const besoin = (nom: string, cle: string, quantite: number | null = null, unite: string | null = null): Besoin => ({
  nom,
  cle,
  exclusions: [],
  quantite,
  unite,
  categorie: "autre",
  base: false,
});

describe("consommation FEFO", () => {
  it("prend le lot qui périme le plus tôt, pas les périmés", () => {
    const vieux = lot("Jambon", { expires_on: ajouterJours(auj, -1) });
    const boite = lot("Jambon", { expires_on: ajouterJours(auj, 4), in_container: true, opened_on: ajouterJours(auj, -8) });
    const neuf = lot("Jambon", { expires_on: ajouterJours(auj, 10) });
    const [l] = planifierConsommation([besoin("Jambon", "jambon")], [neuf, vieux, boite]);
    expect(l.lot?.id).toBe(boite.id);
    // quantité inconnue : le lot est entamé, pas retiré
    expect(l.action).toEqual({ id: boite.id, action: "niveau", stock_level: "moitie" });
  });

  it("soustrait les quantités dans des unités compatibles", () => {
    const lait = lot("Lait", { quantity: 1, unit: "l" });
    const [l] = planifierConsommation([besoin("Lait", "lait", 210, "ml")], [lait]);
    expect(l.action).toEqual({ id: lait.id, action: "quantite", quantity: 0.79 });
    const steaks = lot("Steak haché", { quantity: 6 });
    const [s] = planifierConsommation([besoin("Steak haché", "steak hache", 2)], [steaks]);
    expect(s.action).toEqual({ id: steaks.id, action: "quantite", quantity: 4 });
  });

  it("descend d'un niveau quand le stock est noté rapidement", () => {
    const brocolis = lot("Brocolis", { stock_level: "un_repas" });
    const [l] = planifierConsommation([besoin("Brocoli", "brocoli", 1)], [brocolis]);
    expect(l.action).toEqual({ id: brocolis.id, action: "niveau", stock_level: "fin" });
    const presqueFini = lot("Sauce salade", { stock_level: "fin" });
    expect(planifierConsommation([besoin("Sauce salade", "sauce salade")], [presqueFini])[0].action?.action).toBe("retirer");
  });

  it("ignore les produits de base et signale ce qui manque", () => {
    const lignes = planifierConsommation([{ ...besoin("Sel", "sel"), base: true }, besoin("Crevettes", "crevette", 200, "g")], []);
    expect(lignes).toHaveLength(1);
    expect(lignes[0]).toMatchObject({ lot: null, resume: "Pas en stock" });
  });
});

describe("recettes", () => {
  const ing = (name: string, extra: Partial<RecipeIngredient> = {}): RecipeIngredient => ({
    id: name,
    recipe_id: "r",
    name,
    quantity: 1,
    unit: null,
    match_key: name.toLowerCase(),
    exclude_keys: [],
    category: "autre",
    is_staple: false,
    position: 0,
    quantity_max: null,
    note: null,
    is_optional: false,
    alt_group: null,
    ...extra,
  });
  it("écarte les ingrédients facultatifs et met à l'échelle", () => {
    const b = besoinsDepuisRecette(
      [ing("Farine", { quantity: 90, unit: "g" }), ing("Vanille", { is_optional: true, alt_group: "vanille" }), ing("Sucre vanillé", { is_optional: true, alt_group: "vanille" })],
      2,
    );
    expect(b.map((x) => [x.nom, x.quantite])).toEqual([["Farine", 180]]);
  });
});

describe("liste de courses depuis le planning", () => {
  const meal = (title: string, status: Meal["status"] = "prevu", meal_type: Meal["meal_type"] = "recette"): Meal => ({
    id: title,
    eaten_on: auj,
    slot: "diner",
    title,
    recipe_id: null,
    servings: 2,
    notes: null,
    meal_type,
    status,
    cooked_at: null,
    template_id: null,
    external_cost: null,
    created_at: auj,
  });
  it("calcule besoins − stock − liste, sans doublon ni repas cuisiné ou extérieur", () => {
    const pantry = [lot("Carottes"), lot("Ail", { expires_on: ajouterJours(auj, -2) })];
    const shopping = [{ name: "Sauce soja salée", checked: false } as ShoppingItem];
    const res = aAcheterPourPlanning(
      [
        { meal: meal("Nouilles"), besoins: [besoin("Carotte", "carotte"), besoin("Ail", "ail"), besoin("Sauce soja", "sauce soja"), besoin("Crevettes", "crevette")] },
        { meal: meal("Autres nouilles"), besoins: [besoin("Crevettes", "crevette")] },
        { meal: meal("Déjà fait", "cuisine"), besoins: [besoin("Moules", "moule")] },
        { meal: meal("Resto", "prevu", "exterieur"), besoins: [besoin("Pizza", "pizza")] },
      ],
      pantry,
      shopping,
    );
    expect(res.map((r) => r.besoin.nom)).toEqual(["Ail", "Crevettes"]);
  });
});
