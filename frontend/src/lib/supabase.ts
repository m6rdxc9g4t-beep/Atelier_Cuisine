import { createClient } from "@supabase/supabase-js";

// La clé publiable est faite pour être embarquée dans l'app : les règles RLS
// de la base protègent les données de chaque compte.
export const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL ?? "https://hcdiuxznceuixindcvhp.supabase.co";
const SUPABASE_KEY =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "sb_publishable_u73IIIZSlDPm-1Aqrq95MQ_wwz4xtGm";

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

export type Emplacement = "frigo" | "congelateur" | "placard" | "corbeille" | "maison";
export type NiveauStock = "plein" | "moitie" | "un_repas" | "fin";

export interface PantryItem {
  id: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  category: string;
  location: Emplacement;
  expires_on: string | null;
  stock_level: NiveauStock | null;
  opened_on: string | null;
  in_container: boolean;
  note: string | null;
  product_id: string | null;
  purchase_price: number | null;
  created_at: string;
}

export interface ShoppingItem {
  id: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  category: string;
  checked: boolean;
  checked_at?: string | null;
  recipe_id: string | null;
  product_id: string | null;
  source: "manuel" | "planning" | "a_racheter" | "ticket";
  meal_id: string | null;
  note: string | null;
  unit_price: number | null;
  total_price: number | null;
  expires_on: string | null;
  created_at: string;
}

export type TypeRepas = "recette" | "assemblage" | "exterieur" | "libre";

export interface Meal {
  id: string;
  eaten_on: string;
  slot: "petit_dejeuner" | "dejeuner" | "gouter" | "diner";
  title: string;
  recipe_id: string | null;
  servings: number | null;
  notes: string | null;
  meal_type: TypeRepas;
  status: "prevu" | "cuisine";
  cooked_at: string | null;
  template_id: string | null;
  external_cost: number | null;
  created_at: string;
}

export interface Recipe {
  id: string;
  user_id: string | null;
  title: string;
  summary: string | null;
  emoji: string | null;
  minutes: number | null;
  servings: number | null;
  steps: string[];
  tags: string[];
}

export interface RecipeIngredient {
  id: string;
  recipe_id: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  match_key: string;
  exclude_keys: string[];
  category: string;
  is_staple: boolean;
  position: number;
  quantity_max: number | null;
  note: string | null;
  is_optional: boolean;
  alt_group: string | null;
}

export interface Suggestion {
  recipe_id: string;
  title: string;
  summary: string | null;
  emoji: string | null;
  minutes: number | null;
  tags: string[];
  total: number;
  matched: number;
  missing: string[];
  urgent: string[];
  score: number;
}

/** Produit du catalogue (référentiel commun si user_id est nul). */
export interface Product {
  id: string;
  user_id: string | null;
  name: string;
  aisle_id: string;
  keywords: string[];
  default_unit: string | null;
  usual_quantity: number | null;
  usual_unit: string | null;
  note: string | null;
}

export interface MealTemplate {
  id: string;
  user_id: string | null;
  name: string;
  meal_type: Exclude<TypeRepas, "libre">;
  recipe_id: string | null;
  is_favorite: boolean;
  position: number;
}

export interface MealTemplateItem {
  id: string;
  template_id: string;
  name: string;
  match_key: string;
  quantity: number | null;
  unit: string | null;
  position: number;
}

export type SourceSession = "liste" | "ticket_pdf" | "ticket_photo" | "ticket_texte" | "manuel";

export interface ShoppingSession {
  id: string;
  purchased_at: string;
  store_name: string;
  payment_method: string | null;
  total_amount: number;
  food_subtotal: number;
  home_subtotal: number;
  items_count: number;
  notes: string | null;
  source: SourceSession;
  created_at: string;
}

export interface ShoppingSessionItem {
  id: string;
  session_id: string;
  position: number;
  raw_label: string;
  matched_name: string | null;
  product_id: string | null;
  brand: string | null;
  packaging_size: string | null;
  category: string;
  tva_rate: number | null;
  quantity: number;
  unit_price: number;
  total_price: number;
  is_food: boolean;
  expires_on: string | null;
}

export type PerimetreBudget = "global" | "alimentaire" | "maison" | "sorties";

export interface Budget {
  id: string;
  scope: PerimetreBudget;
  period: "semaine" | "mois";
  amount: number;
}

export const SLOTS: { id: Meal["slot"]; label: string }[] = [
  { id: "petit_dejeuner", label: "Petit-déjeuner" },
  { id: "dejeuner", label: "Déjeuner" },
  { id: "gouter", label: "Goûter" },
  { id: "diner", label: "Dîner" },
];

/** Créneau de repas le plus probable selon l'heure. */
export function creneauDuMoment(): Meal["slot"] {
  const h = new Date().getHours();
  if (h < 10) return "petit_dejeuner";
  if (h < 15) return "dejeuner";
  if (h < 18) return "gouter";
  return "diner";
}

export function messageErreur(e: unknown): string {
  const msg =
    typeof e === "object" && e && "message" in e ? String((e as { message: unknown }).message) : String(e);
  if (/invalid login credentials/i.test(msg)) return "E-mail ou mot de passe incorrect.";
  if (/email not confirmed/i.test(msg)) return "Confirme ton adresse avec le lien reçu par e-mail, puis reconnecte-toi.";
  if (/already registered/i.test(msg)) return "Un compte existe déjà avec cet e-mail. Connecte-toi.";
  if (/password should be at least/i.test(msg)) return "Le mot de passe doit faire au moins 6 caractères.";
  if (/failed to fetch|network/i.test(msg)) return "Pas de connexion. Vérifie le réseau et réessaie.";
  return msg;
}
