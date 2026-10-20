import { describe, expect, it } from "vitest";
import { depenses, historiquePrix, produitsAchetes, suivis } from "./budget";
import type { Meal, ShoppingSession, ShoppingSessionItem } from "./supabase";

const session = (id: string, jour: string, food: number, home: number, store = "Carrefour Lille"): ShoppingSession => ({
  id,
  purchased_at: `${jour}T10:00:00`,
  store_name: store,
  payment_method: null,
  total_amount: food + home,
  food_subtotal: food,
  home_subtotal: home,
  items_count: 1,
  notes: null,
  source: "liste",
  created_at: jour,
});
const meal = (jour: string, extra: Partial<Meal> = {}): Meal => ({
  id: jour + Math.random(),
  eaten_on: jour,
  slot: "diner",
  title: "x",
  recipe_id: null,
  servings: 2,
  notes: null,
  meal_type: "assemblage",
  status: "cuisine",
  cooked_at: null,
  template_id: null,
  external_cost: null,
  created_at: jour,
  ...extra,
});
const item = (session_id: string, matched_name: string, unit_price: number): ShoppingSessionItem => ({
  id: session_id + matched_name,
  session_id,
  position: 1,
  raw_label: matched_name.toUpperCase(),
  matched_name,
  product_id: null,
  brand: null,
  packaging_size: null,
  category: "epicerie_salee",
  tva_rate: 5.5,
  quantity: 1,
  unit_price,
  total_price: unit_price,
  is_food: true,
  expires_on: null,
});

const S = [session("a", "2026-10-03", 80, 20), session("b", "2026-10-15", 40.5, 0, "Leclerc"), session("c", "2026-09-28", 99, 1)];
const M = [
  meal("2026-10-04"),
  meal("2026-10-05"),
  meal("2026-10-06", { meal_type: "exterieur", external_cost: 32 }),
  meal("2026-10-07", { status: "prevu" }),
];

describe("dépenses", () => {
  it("sépare alimentaire, maison et sorties sur la période", () => {
    const d = depenses(S, M, "2026-10-01", "2026-10-31");
    expect(d).toMatchObject({ alimentaire: 120.5, maison: 20, sorties: 32, global: 172.5, nbTickets: 2, nbRepasCuisines: 2 });
    expect(d.panierMoyen).toBe(60.25);
    expect(d.coutParRepas).toBe(60.25);
  });
  it("suit chaque budget sur sa période", () => {
    const s = suivis([{ id: "1", scope: "alimentaire", period: "mois", amount: 400 }], S, M, "2026-10-20");
    const ali = s.find((x) => x.scope === "alimentaire")!;
    expect(ali.depense).toBe(120.5);
    expect(ali.part).toBeCloseTo(0.30125);
    expect(s.find((x) => x.scope === "maison")!.budget).toBeNull();
  });
});

describe("prix", () => {
  const items = [item("c", "Aneth", 2.09), item("a", "Aneth", 2.19), item("b", "Riz", 1.5)];
  it("retrace l'historique du prix unitaire", () => {
    expect(historiquePrix("aneth", items, S).map((p) => p.prix)).toEqual([2.09, 2.19]);
  });
  it("calcule la dernière variation", () => {
    const aneth = produitsAchetes(items, S).find((p) => p.nom === "Aneth")!;
    expect(aneth).toMatchObject({ achats: 2, dernier: 2.19, variation: 0.1 });
  });
});
