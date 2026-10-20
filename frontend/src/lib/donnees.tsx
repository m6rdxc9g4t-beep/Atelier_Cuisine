import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import { REGLAGES_IA_DEFAUT, type ReglagesIA } from "./ia";
import {
  supabase,
  type Budget,
  type Meal,
  type PantryItem,
  type Recipe,
  type RecipeIngredient,
  type ShoppingItem,
  type ShoppingSession,
  type ShoppingSessionItem,
} from "./supabase";

type Table = "pantry_items" | "shopping_items" | "meals" | "shopping_sessions" | "budgets";
const TABLES: Table[] = ["pantry_items", "shopping_items", "meals", "shopping_sessions", "budgets"];

interface Donnees {
  pantry: PantryItem[];
  shopping: ShoppingItem[];
  meals: Meal[];
  sessions: ShoppingSession[];
  sessionItems: ShoppingSessionItem[];
  budgets: Budget[];
  chargement: boolean;
  erreur: string | null;
  setPantry: Dispatch<SetStateAction<PantryItem[]>>;
  setShopping: Dispatch<SetStateAction<ShoppingItem[]>>;
  setMeals: Dispatch<SetStateAction<Meal[]>>;
  setBudgets: Dispatch<SetStateAction<Budget[]>>;
  recharger: (table?: Table) => Promise<void>;
}

const Ctx = createContext<Donnees | null>(null);

export function FournisseurDonnees({ userId, children }: { userId: string; children: ReactNode }) {
  const [pantry, setPantry] = useState<PantryItem[]>([]);
  const [shopping, setShopping] = useState<ShoppingItem[]>([]);
  const [meals, setMeals] = useState<Meal[]>([]);
  const [sessions, setSessions] = useState<ShoppingSession[]>([]);
  const [sessionItems, setSessionItems] = useState<ShoppingSessionItem[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const minuteurs = useRef<Partial<Record<Table, number>>>({});

  const recharger = useCallback(async (table?: Table) => {
    const tables: Table[] = table ? [table] : TABLES;
    try {
      await Promise.all(
        tables.map(async (t) => {
          if (t === "pantry_items") {
            const { data, error } = await supabase
              .from("pantry_items")
              .select("*")
              .order("expires_on", { ascending: true, nullsFirst: false })
              .order("name");
            if (error) throw error;
            setPantry(data as PantryItem[]);
          } else if (t === "shopping_items") {
            const { data, error } = await supabase
              .from("shopping_items")
              .select("*")
              .order("created_at", { ascending: true });
            if (error) throw error;
            setShopping(data as ShoppingItem[]);
          } else if (t === "shopping_sessions") {
            // Tickets archivés et leurs articles (historique des prix, récapitulatif)
            const [s, i] = await Promise.all([
              supabase.from("shopping_sessions").select("*").order("purchased_at", { ascending: false }),
              supabase.from("shopping_session_items").select("*").order("position"),
            ]);
            if (s.error) throw s.error;
            if (i.error) throw i.error;
            setSessions((s.data as ShoppingSession[]).map((x) => ({
              ...x,
              total_amount: Number(x.total_amount),
              food_subtotal: Number(x.food_subtotal),
              home_subtotal: Number(x.home_subtotal),
            })));
            setSessionItems((i.data as ShoppingSessionItem[]).map((x) => ({
              ...x,
              quantity: Number(x.quantity),
              unit_price: Number(x.unit_price),
              total_price: Number(x.total_price),
            })));
          } else if (t === "budgets") {
            const { data, error } = await supabase.from("budgets").select("*");
            if (error) throw error;
            setBudgets((data as Budget[]).map((b) => ({ ...b, amount: Number(b.amount) })));
          } else {
            // 120 derniers jours et les repas prévus : historique, budget et planning
            const depuis = new Date(Date.now() - 120 * 86_400_000).toISOString().slice(0, 10);
            const { data, error } = await supabase
              .from("meals")
              .select("*")
              .gte("eaten_on", depuis)
              .order("eaten_on", { ascending: false })
              .order("created_at", { ascending: true });
            if (error) throw error;
            setMeals(data as Meal[]);
          }
        }),
      );
      setErreur(null);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e));
    } finally {
      setChargement(false);
    }
  }, []);

  useEffect(() => {
    recharger();
    // Synchro en direct : un changement sur un autre appareil recharge la table concernée.
    const canal = supabase
      .channel(`atelier-${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "pantry_items" }, () =>
        planifier("pantry_items"),
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "shopping_items" }, () =>
        planifier("shopping_items"),
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "meals" }, () =>
        planifier("meals"),
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "shopping_sessions" }, () =>
        planifier("shopping_sessions"),
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "budgets" }, () =>
        planifier("budgets"),
      )
      .subscribe();

    function planifier(t: Table) {
      window.clearTimeout(minuteurs.current[t]);
      minuteurs.current[t] = window.setTimeout(() => recharger(t), 250);
    }

    // Au retour sur l'app (iPhone en arrière-plan, Mac en veille), on resynchronise.
    const auRetour = () => {
      if (document.visibilityState === "visible") recharger();
    };
    document.addEventListener("visibilitychange", auRetour);
    return () => {
      document.removeEventListener("visibilitychange", auRetour);
      supabase.removeChannel(canal);
    };
  }, [userId, recharger]);

  const valeur = useMemo(
    () => ({
      pantry,
      shopping,
      meals,
      sessions,
      sessionItems,
      budgets,
      chargement,
      erreur,
      setPantry,
      setShopping,
      setMeals,
      setBudgets,
      recharger,
    }),
    [pantry, shopping, meals, sessions, sessionItems, budgets, chargement, erreur, recharger],
  );
  return <Ctx.Provider value={valeur}>{children}</Ctx.Provider>;
}

export function useDonnees() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useDonnees hors du FournisseurDonnees");
  return c;
}

// ---------------------------------------------------------------------------
// Recettes : catalogue lu une fois puis gardé en mémoire
// ---------------------------------------------------------------------------
export interface RecetteComplete extends Recipe {
  ingredients: RecipeIngredient[];
}

let cache: Promise<RecetteComplete[]> | null = null;

export function chargerRecettes(forcer = false): Promise<RecetteComplete[]> {
  if (!cache || forcer) {
    cache = (async () => {
      const [r, i] = await Promise.all([
        supabase.from("recipes").select("*").order("title"),
        supabase.from("recipe_ingredients").select("*").order("position"),
      ]);
      if (r.error) throw r.error;
      if (i.error) throw i.error;
      const parRecette = new Map<string, RecipeIngredient[]>();
      for (const ing of i.data as RecipeIngredient[]) {
        const liste = parRecette.get(ing.recipe_id) ?? [];
        liste.push(ing);
        parRecette.set(ing.recipe_id, liste);
      }
      return (r.data as Recipe[]).map((rec) => ({ ...rec, ingredients: parRecette.get(rec.id) ?? [] }));
    })();
    cache.catch(() => {
      cache = null;
    });
  }
  return cache;
}

export function useRecettes() {
  const [recettes, setRecettes] = useState<RecetteComplete[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const recharger = useCallback((forcer = false) => {
    chargerRecettes(forcer)
      .then((r) => {
        setRecettes(r);
        setErreur(null);
      })
      .catch((e) => setErreur(e.message ?? String(e)));
  }, []);
  useEffect(() => recharger(), [recharger]);
  return { recettes, erreur, recharger };
}

// ---------------------------------------------------------------------------
// Réglages locaux à l'appareil
// ---------------------------------------------------------------------------
export interface Reglages extends ReglagesIA {
  joursAlerte: number;
  theme: "auto" | "light" | "dark";
  /** Planning : semaine complète ou focus week-end (vendredi → dimanche) */
  vuePlanning: "semaine" | "weekend";
}

const DEFAUT: Reglages = { joursAlerte: 2, theme: "dark", vuePlanning: "semaine", ...REGLAGES_IA_DEFAUT };

function lireReglages(): Reglages {
  try {
    return { ...DEFAUT, ...JSON.parse(localStorage.getItem("atelier.reglages") ?? "{}") };
  } catch {
    return DEFAUT;
  }
}

// Petit magasin partagé : tous les écrans voient les mêmes réglages.
let reglagesActuels = lireReglages();
const abonnes = new Set<() => void>();

function appliquerTheme(theme: Reglages["theme"]) {
  const racine = document.documentElement;
  if (theme === "auto") racine.removeAttribute("data-theme");
  else racine.setAttribute("data-theme", theme);
}
appliquerTheme(reglagesActuels.theme);

export function majReglages(p: Partial<Reglages>) {
  reglagesActuels = { ...reglagesActuels, ...p };
  try {
    localStorage.setItem("atelier.reglages", JSON.stringify(reglagesActuels));
  } catch {
    /* stockage indisponible : on garde en mémoire */
  }
  appliquerTheme(reglagesActuels.theme);
  abonnes.forEach((f) => f());
}

export function useReglages(): [Reglages, (r: Partial<Reglages>) => void] {
  const r = useSyncExternalStore(
    (f) => {
      abonnes.add(f);
      return () => abonnes.delete(f);
    },
    () => reglagesActuels,
  );
  return [r, majReglages];
}
