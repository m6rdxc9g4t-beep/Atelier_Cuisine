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
import {
  supabase,
  type Meal,
  type PantryItem,
  type Recipe,
  type RecipeIngredient,
  type ShoppingItem,
} from "./supabase";

type Table = "pantry_items" | "shopping_items" | "meals";

interface Donnees {
  pantry: PantryItem[];
  shopping: ShoppingItem[];
  meals: Meal[];
  chargement: boolean;
  erreur: string | null;
  setPantry: Dispatch<SetStateAction<PantryItem[]>>;
  setShopping: Dispatch<SetStateAction<ShoppingItem[]>>;
  setMeals: Dispatch<SetStateAction<Meal[]>>;
  recharger: (table?: Table) => Promise<void>;
}

const Ctx = createContext<Donnees | null>(null);

export function FournisseurDonnees({ userId, children }: { userId: string; children: ReactNode }) {
  const [pantry, setPantry] = useState<PantryItem[]>([]);
  const [shopping, setShopping] = useState<ShoppingItem[]>([]);
  const [meals, setMeals] = useState<Meal[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const minuteurs = useRef<Partial<Record<Table, number>>>({});

  const recharger = useCallback(async (table?: Table) => {
    const tables: Table[] = table ? [table] : ["pantry_items", "shopping_items", "meals"];
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
          } else {
            // 60 derniers jours : suffisant pour l'historique affiché
            const depuis = new Date(Date.now() - 60 * 86_400_000).toISOString().slice(0, 10);
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
    () => ({ pantry, shopping, meals, chargement, erreur, setPantry, setShopping, setMeals, recharger }),
    [pantry, shopping, meals, chargement, erreur, recharger],
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
export interface Reglages {
  joursAlerte: number;
  theme: "auto" | "light" | "dark";
}

const DEFAUT: Reglages = { joursAlerte: 2, theme: "auto" };

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
