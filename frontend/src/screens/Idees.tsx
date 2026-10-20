import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Check, Clock, Plus, Search, ShoppingBasket } from "lucide-react";
import { Feuille } from "../components/Feuille";
import { useToast } from "../components/Toast";
import { analyserSaisie, capitaliser, deviner, formatQuantite } from "../lib/aliments";
import { aujourdhui, fraicheur } from "../lib/dates";
import { chargerRecettes, useDonnees, useRecettes, type RecetteComplete } from "../lib/donnees";
import { cleAliment, correspond } from "../lib/normaliser";
import {
  creneauDuMoment,
  messageErreur,
  SLOTS,
  supabase,
  type Meal,
  type PantryItem,
  type Suggestion,
} from "../lib/supabase";

const FILTRES = [
  { id: "tout", label: "Tout" },
  { id: "rapide", label: "Rapide" },
  { id: "végétarien", label: "Végétarien" },
  { id: "anti-gaspi", label: "Anti-gaspi" },
  { id: "sucré", label: "Sucré" },
] as const;

type Filtre = (typeof FILTRES)[number]["id"];

const passeFiltre = (f: Filtre, tags: string[], minutes: number | null) =>
  f === "tout" || (f === "rapide" ? (minutes ?? 99) <= 20 || tags.includes("rapide") : tags.includes(f));

export function Idees({ versGardeManger }: { versGardeManger: () => void }) {
  const { pantry, recharger } = useDonnees();
  const toast = useToast();
  const { recettes, recharger: rechargerRecettes } = useRecettes();
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null);
  const [filtre, setFiltre] = useState<Filtre>("tout");
  const [recherche, setRecherche] = useState("");
  const [ouverte, setOuverte] = useState<string | null>(null);
  const [aCuisiner, setACuisiner] = useState<string | null>(null);
  const [creation, setCreation] = useState(false);

  // Recalcule les suggestions à chaque changement du garde-manger
  const empreinte = pantry.map((p) => p.id + (p.expires_on ?? "") + p.name).join("|");
  useEffect(() => {
    let annule = false;
    supabase.rpc("suggest_recipes", { max_results: 40 }).then(({ data, error }) => {
      if (annule) return;
      if (error) toast(messageErreur(error), { erreur: true });
      else setSuggestions(data as Suggestion[]);
    });
    return () => {
      annule = true;
    };
  }, [empreinte, toast]);

  const visibles = (suggestions ?? []).filter((s) => passeFiltre(filtre, s.tags, s.minutes));
  const catalogue = useMemo(() => {
    const q = cleAliment(recherche);
    return (recettes ?? []).filter(
      (r) =>
        passeFiltre(filtre, r.tags, r.minutes) &&
        (!q ||
          cleAliment(r.title).includes(q) ||
          r.ingredients.some((i) => cleAliment(i.name).includes(q))),
    );
  }, [recettes, recherche, filtre]);

  async function ajouterManquants(id: string, titre: string) {
    const { data, error } = await supabase.rpc("add_missing_to_shopping", { p_recipe: id });
    if (error) return toast(messageErreur(error), { erreur: true });
    recharger("shopping_items");
    toast(
      data
        ? `${data} ingrédient${data > 1 ? "s" : ""} pour « ${titre} » ajouté${data > 1 ? "s" : ""} aux courses`
        : "Tout est déjà dans le garde-manger ou sur la liste",
    );
  }

  return (
    <div className="ecran">
      <header className="ecran__tete">
        <h1>Idées</h1>
        <p className="ecran__sous-titre">Des plats avec ce qu'il te reste, en commençant par ce qui presse</p>
      </header>

      <div className="puces puces--defile" role="group" aria-label="Filtrer">
        {FILTRES.map((f) => (
          <button key={f.id} className="puce" aria-pressed={filtre === f.id} onClick={() => setFiltre(f.id)}>
            {f.label}
          </button>
        ))}
      </div>

      {pantry.length === 0 ? (
        <div className="vide">
          <p className="vide__titre">Rien à cuisiner pour l'instant</p>
          <p>Ajoute ce qu'il y a dans ton frigo et tes placards : les idées de plats apparaîtront ici.</p>
          <button className="bouton bouton--action" onClick={versGardeManger}>
            Remplir le garde-manger
          </button>
        </div>
      ) : suggestions && visibles.length === 0 ? (
        <div className="vide">
          <p className="vide__titre">Aucune idée avec ce filtre</p>
          <p>Essaie un autre filtre ou parcours toutes les recettes plus bas.</p>
        </div>
      ) : (
        <ol className="idees" aria-label="Suggestions">
          {visibles.map((s) => (
            <li key={s.recipe_id} className="idee">
              <button className="idee__titre" onClick={() => setOuverte(s.recipe_id)}>
                <span className="idee__emoji" aria-hidden>
                  {s.emoji}
                </span>
                <span>
                  <span className="idee__nom">{s.title}</span>
                  <span className="idee__meta">
                    {s.minutes != null && (
                      <>
                        <Clock size={14} aria-hidden /> {s.minutes} min,{" "}
                      </>
                    )}
                    {s.matched} ingrédient{s.matched > 1 ? "s" : ""} sur {s.total}
                  </span>
                </span>
              </button>
              <span
                className="jauge"
                role="img"
                aria-label={`${s.matched} ingrédients sur ${s.total} disponibles`}
              >
                {Array.from({ length: s.total }, (_, i) => (
                  <span key={i} className={i < s.matched ? "jauge__plein" : ""} />
                ))}
              </span>
              {s.urgent.length > 0 && (
                <p className="idee__urgent">Utilise vite : {s.urgent.join(", ").toLowerCase()}</p>
              )}
              {s.missing.length > 0 && (
                <p className="idee__manque">Il manque : {s.missing.join(", ").toLowerCase()}</p>
              )}
              <div className="idee__actions">
                <button className="bouton bouton--action" onClick={() => setACuisiner(s.recipe_id)}>
                  Je cuisine ça
                </button>
                {s.missing.length > 0 && (
                  <button className="bouton bouton--discret" onClick={() => ajouterManquants(s.recipe_id, s.title)}>
                    <ShoppingBasket size={18} aria-hidden /> Ajouter le manquant
                  </button>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}

      <section className="catalogue" aria-labelledby="catalogue-titre">
        <div className="catalogue__tete">
          <h2 id="catalogue-titre">Toutes les recettes</h2>
          <button className="bouton bouton--discret" onClick={() => setCreation(true)}>
            <Plus size={18} aria-hidden /> Nouvelle recette
          </button>
        </div>
        <label className="recherche">
          <Search size={18} aria-hidden />
          <span className="visuellement-cache">Rechercher une recette ou un ingrédient</span>
          <input
            className="champ"
            type="search"
            placeholder="Recette ou ingrédient"
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
          />
        </label>
        <ul className="liste">
          {catalogue.map((r) => (
            <li key={r.id} className="ligne">
              <button className="ligne__principal" onClick={() => setOuverte(r.id)}>
                <span className="ligne__nom">
                  <span aria-hidden>{r.emoji ?? "🍽️"}</span> {r.title}
                </span>
                <span className="ligne__detail">
                  {r.minutes != null && `${r.minutes} min`}
                  {r.user_id && ", ma recette"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <FeuilleRecette
        recette={recettes?.find((r) => r.id === ouverte) ?? null}
        pantry={pantry}
        onFermer={() => setOuverte(null)}
        onCuisiner={(id) => {
          setOuverte(null);
          setACuisiner(id);
        }}
        onAjouterManquants={ajouterManquants}
      />
      <FeuilleCuisiner
        recette={recettes?.find((r) => r.id === aCuisiner) ?? null}
        onFermer={() => setACuisiner(null)}
      />
      <FeuilleNouvelleRecette
        ouverte={creation}
        onFermer={() => setCreation(false)}
        onCree={() => {
          setCreation(false);
          rechargerRecettes(true);
          setSuggestions(null);
          supabase
            .rpc("suggest_recipes", { max_results: 40 })
            .then(({ data }) => data && setSuggestions(data as Suggestion[]));
        }}
      />
    </div>
  );
}

/** Ingrédients de la recette présents dans le garde-manger (produits non périmés). */
export function correspondances(recette: RecetteComplete, pantry: PantryItem[]) {
  const dispo = pantry.filter((p) => fraicheur(p.expires_on) !== "perime");
  return recette.ingredients.map((ing) => ({
    ing,
    produits: dispo.filter((p) => correspond(p.name, ing.match_key, ing.exclude_keys)),
  }));
}

function FeuilleRecette({
  recette,
  pantry,
  onFermer,
  onCuisiner,
  onAjouterManquants,
}: {
  recette: RecetteComplete | null;
  pantry: PantryItem[];
  onFermer: () => void;
  onCuisiner: (id: string) => void;
  onAjouterManquants: (id: string, titre: string) => void;
}) {
  const lignes = recette ? correspondances(recette, pantry) : [];
  const manque = lignes.some((l) => !l.ing.is_staple && l.produits.length === 0);
  return (
    <Feuille
      ouverte={!!recette}
      titre={recette ? `${recette.emoji ?? ""} ${recette.title}`.trim() : ""}
      onFermer={onFermer}
      large
      pied={
        recette && (
          <>
            {manque && (
              <button className="bouton bouton--discret" onClick={() => onAjouterManquants(recette.id, recette.title)}>
                <ShoppingBasket size={18} aria-hidden /> Ajouter le manquant
              </button>
            )}
            <button className="bouton bouton--action" onClick={() => onCuisiner(recette.id)}>
              Je cuisine ça
            </button>
          </>
        )
      }
    >
      {recette && (
        <div className="recette">
          {recette.summary && <p className="recette__resume">{recette.summary}</p>}
          <p className="recette__meta">
            {[
              recette.minutes != null && `${recette.minutes} min`,
              recette.servings != null && `${recette.servings} personnes`,
              ...recette.tags,
            ]
              .filter(Boolean)
              .join(", ")}
          </p>
          <h3>Ingrédients</h3>
          <ul className="ingredients">
            {lignes.map(({ ing, produits }) => {
              const ok = produits.length > 0;
              return (
                <li key={ing.id} className={ok ? "ingredient ingredient--ok" : "ingredient"}>
                  <span className="ingredient__statut" aria-hidden>
                    {ok && <Check size={14} strokeWidth={3} />}
                  </span>
                  <span>
                    {ing.name}
                    {formatQuantite(ing.quantity, ing.unit) && (
                      <span className="ingredient__qte"> {formatQuantite(ing.quantity, ing.unit)}</span>
                    )}
                    <span className="visuellement-cache">{ok ? " (à la maison)" : ing.is_staple ? "" : " (manquant)"}</span>
                  </span>
                  {ing.is_staple && !ok && <span className="ingredient__note">placard</span>}
                </li>
              );
            })}
          </ul>
          {recette.steps.length > 0 && (
            <>
              <h3>Préparation</h3>
              <ol className="etapes">
                {recette.steps.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ol>
            </>
          )}
        </div>
      )}
    </Feuille>
  );
}

/** Note le repas et retire du garde-manger ce qui a été utilisé. */
export function FeuilleCuisiner({
  recette,
  onFermer,
  dateInitiale,
  creneauInitial,
}: {
  recette: RecetteComplete | null;
  onFermer: () => void;
  dateInitiale?: string;
  creneauInitial?: Meal["slot"];
}) {
  const { pantry, setPantry, setMeals } = useDonnees();
  const toast = useToast();
  const [date, setDate] = useState(aujourdhui());
  const [creneau, setCreneau] = useState<Meal["slot"]>(creneauDuMoment());
  const [aRetirer, setARetirer] = useState<Set<string>>(new Set());
  const [pour, setPour] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  const utilises = useMemo(() => {
    if (!recette) return [];
    const vus = new Map<string, PantryItem>();
    for (const { ing, produits } of correspondances(recette, pantry)) {
      if (ing.is_staple) continue;
      // le produit qui périme le plus tôt est celui qu'on utilise
      const p = [...produits].sort((a, b) => (a.expires_on ?? "9").localeCompare(b.expires_on ?? "9"))[0];
      if (p) vus.set(p.id, p);
    }
    return [...vus.values()];
  }, [recette, pantry]);

  // Réinitialise à chaque nouvelle recette
  if (recette && pour !== recette.id) {
    setPour(recette.id);
    setDate(dateInitiale ?? aujourdhui());
    setCreneau(creneauInitial ?? creneauDuMoment());
    setARetirer(new Set(utilises.map((u) => u.id)));
  }
  if (!recette && pour) setPour(null);

  async function valider() {
    if (!recette) return;
    setEnCours(true);
    const { data, error } = await supabase
      .from("meals")
      .insert({ title: recette.title, recipe_id: recette.id, eaten_on: date, slot: creneau })
      .select()
      .single();
    if (error) {
      setEnCours(false);
      return toast(messageErreur(error), { erreur: true });
    }
    setMeals((l) => [data as Meal, ...l]);
    const ids = [...aRetirer];
    if (ids.length) {
      const { error: e2 } = await supabase.from("pantry_items").delete().in("id", ids);
      if (!e2) setPantry((l) => l.filter((p) => !ids.includes(p.id)));
    }
    setEnCours(false);
    toast(
      ids.length
        ? `Repas noté, ${ids.length} produit${ids.length > 1 ? "s" : ""} retiré${ids.length > 1 ? "s" : ""} du garde-manger`
        : "Repas noté",
    );
    onFermer();
  }

  return (
    <Feuille
      ouverte={!!recette}
      titre={recette ? `Cuisiner : ${recette.title}` : ""}
      onFermer={onFermer}
      pied={
        <button className="bouton bouton--action bouton--plein" onClick={valider} disabled={enCours}>
          Noter le repas
        </button>
      }
    >
      <div className="formulaire">
        <div className="formulaire__ligne">
          <label className="champ-groupe">
            <span>Jour</span>
            <input className="champ" type="date" value={date} onChange={(e) => setDate(e.target.value || aujourdhui())} />
          </label>
          <label className="champ-groupe">
            <span>Repas</span>
            <select className="champ" value={creneau} onChange={(e) => setCreneau(e.target.value as Meal["slot"])}>
              {SLOTS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        {utilises.length > 0 ? (
          <fieldset className="champ-groupe">
            <legend>Retirer du garde-manger</legend>
            <ul className="cases">
              {utilises.map((p) => (
                <li key={p.id}>
                  <label className="case-ligne">
                    <input
                      type="checkbox"
                      checked={aRetirer.has(p.id)}
                      onChange={(e) => {
                        const n = new Set(aRetirer);
                        if (e.target.checked) n.add(p.id);
                        else n.delete(p.id);
                        setARetirer(n);
                      }}
                    />
                    <span>{p.name}</span>
                    <span className="case-ligne__detail">{formatQuantite(p.quantity, p.unit)}</span>
                  </label>
                </li>
              ))}
            </ul>
            <p className="note">Décoche ce qu'il te reste après le repas.</p>
          </fieldset>
        ) : (
          <p className="note">Aucun produit du garde-manger n'est utilisé par cette recette.</p>
        )}
      </div>
    </Feuille>
  );
}

const DESCRIPTEURS = new Set(
  "frais fraiche rape rapee fume nature bio entier entiere coupe coupee en boite de du des la le les d bien mur mure rassi gros grosse petit petite moyen moyenne".split(
    " ",
  ),
);
const BASES = ["sel", "poivre", "huile", "eau", "sucre", "vinaigre", "epice", "bouillon", "levure"];

/** Mot-clé de rapprochement pour un ingrédient saisi librement. */
function cleIngredient(nom: string): string {
  const mots = cleAliment(nom)
    .split(" ")
    .filter((m) => m && !DESCRIPTEURS.has(m));
  return mots.join(" ") || cleAliment(nom);
}

function FeuilleNouvelleRecette({
  ouverte,
  onFermer,
  onCree,
}: {
  ouverte: boolean;
  onFermer: () => void;
  onCree: () => void;
}) {
  const toast = useToast();
  const [titre, setTitre] = useState("");
  const [minutes, setMinutes] = useState("");
  const [portions, setPortions] = useState("4");
  const [ingredients, setIngredients] = useState("");
  const [etapes, setEtapes] = useState("");
  const [enCours, setEnCours] = useState(false);

  async function creer(e: FormEvent) {
    e.preventDefault();
    const lignes = ingredients.split("\n").map((l) => l.trim()).filter(Boolean);
    if (!titre.trim() || !lignes.length) return;
    setEnCours(true);
    const { data: rec, error } = await supabase
      .from("recipes")
      .insert({
        title: capitaliser(titre),
        minutes: minutes ? Number(minutes) : null,
        servings: portions ? Number(portions) : null,
        emoji: "🍽️",
        steps: etapes.split("\n").map((l) => l.trim()).filter(Boolean),
        tags: Number(minutes) && Number(minutes) <= 20 ? ["rapide"] : [],
      })
      .select()
      .single();
    if (error) {
      setEnCours(false);
      return toast(messageErreur(error), { erreur: true });
    }
    const rows = lignes.map((l, position) => {
      const s = analyserSaisie(l);
      const cle = cleIngredient(s.name);
      const base = BASES.some((b) => cle === b || cle.startsWith(b + " "));
      return {
        recipe_id: rec.id,
        name: s.name,
        quantity: s.quantity,
        unit: s.unit,
        match_key: cle,
        category: base ? "epicerie" : deviner(s.name).categorie,
        is_staple: base,
        position,
      };
    });
    const { error: e2 } = await supabase.from("recipe_ingredients").insert(rows);
    setEnCours(false);
    if (e2) return toast(messageErreur(e2), { erreur: true });
    await chargerRecettes(true);
    toast(`« ${capitaliser(titre)} » ajoutée à tes recettes`);
    setTitre("");
    setMinutes("");
    setIngredients("");
    setEtapes("");
    onCree();
  }

  return (
    <Feuille
      ouverte={ouverte}
      titre="Nouvelle recette"
      onFermer={onFermer}
      large
      pied={
        <button type="submit" form="form-recette" className="bouton bouton--action bouton--plein" disabled={enCours}>
          Ajouter la recette
        </button>
      }
    >
      <form id="form-recette" className="formulaire" onSubmit={creer}>
        <label className="champ-groupe">
          <span>Nom du plat</span>
          <input className="champ" required maxLength={120} value={titre} onChange={(e) => setTitre(e.target.value)} />
        </label>
        <div className="formulaire__ligne">
          <label className="champ-groupe">
            <span>Temps (min)</span>
            <input
              className="champ"
              type="number"
              inputMode="numeric"
              min={0}
              value={minutes}
              onChange={(e) => setMinutes(e.target.value)}
            />
          </label>
          <label className="champ-groupe">
            <span>Personnes</span>
            <input
              className="champ"
              type="number"
              inputMode="numeric"
              min={1}
              value={portions}
              onChange={(e) => setPortions(e.target.value)}
            />
          </label>
        </div>
        <label className="champ-groupe">
          <span>Ingrédients, un par ligne</span>
          <textarea
            className="champ"
            rows={6}
            required
            placeholder={"200 g de lardons\n3 œufs\n20 cl de crème"}
            value={ingredients}
            onChange={(e) => setIngredients(e.target.value)}
          />
        </label>
        <label className="champ-groupe">
          <span>Étapes, une par ligne</span>
          <textarea className="champ" rows={5} value={etapes} onChange={(e) => setEtapes(e.target.value)} />
        </label>
      </form>
    </Feuille>
  );
}
