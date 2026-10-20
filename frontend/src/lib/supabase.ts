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

export interface PantryItem {
  id: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  category: string;
  location: "frigo" | "congelateur" | "placard" | "corbeille";
  expires_on: string | null;
  created_at: string;
}

export interface ShoppingItem {
  id: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  category: string;
  checked: boolean;
  recipe_id: string | null;
  created_at: string;
}

export interface Meal {
  id: string;
  eaten_on: string;
  slot: "petit_dejeuner" | "dejeuner" | "gouter" | "diner";
  title: string;
  recipe_id: string | null;
  servings: number | null;
  notes: string | null;
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
