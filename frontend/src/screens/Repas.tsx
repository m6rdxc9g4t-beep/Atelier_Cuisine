import { useMemo, useState, type FormEvent } from "react";
import { Check, ChefHat, ChevronLeft, ChevronRight, Plus, Store, Trash2, Utensils, Zap } from "lucide-react";
import { FeuilleCuisiner } from "../components/Cuisiner";
import { Feuille } from "../components/Feuille";
import { useToast } from "../components/Toast";
import { capitaliser, formatPrix } from "../lib/aliments";
import { useCatalogue, type RepasType } from "../lib/catalogue";
import { ajouterJours, aujourdhui, debutSemaine, jourCourt, jourLong, versDate } from "../lib/dates";
import { useDonnees, useRecettes, useReglages, type RecetteComplete } from "../lib/donnees";
import { cleAliment } from "../lib/normaliser";
import { quoiPourRepas, type QuoiCuisiner } from "../lib/repas";
import { messageErreur, SLOTS, supabase, type Meal, type TypeRepas } from "../lib/supabase";
import { Idees } from "./Idees";

const TYPES: { id: Exclude<TypeRepas, "libre">; label: string; aide: string; icone: typeof ChefHat }[] = [
  { id: "recette", label: "Recette", aide: "Déduit les quantités de la recette", icone: ChefHat },
  { id: "assemblage", label: "Assemblage rapide", aide: "Déduit les produits du stock", icone: Zap },
  { id: "exterieur", label: "Extérieur", aide: "Resto, livraison, repas séparés : rien n'est déduit", icone: Store },
];

const iconeType = (t: TypeRepas) => TYPES.find((x) => x.id === t)?.icone ?? Utensils;

export function Repas({ vue, versGardeManger }: { vue: "planning" | "idees"; versGardeManger: () => void }) {
  const [mode, setMode] = useState(vue);
  return (
    <div className="ecran">
      <header className="ecran__tete">
        <h1>Repas</h1>
        <p className="ecran__sous-titre">
          {mode === "planning" ? "Le semainier de la maison" : "Des plats avec ce qu'il reste, en commençant par ce qui presse"}
        </p>
      </header>
      <div className="segments" role="tablist" aria-label="Vue">
        <button role="tab" className="segment" aria-selected={mode === "planning"} onClick={() => setMode("planning")}>
          Planning
        </button>
        <button role="tab" className="segment" aria-selected={mode === "idees"} onClick={() => setMode("idees")}>
          Idées de plats
        </button>
      </div>
      {mode === "planning" ? <Planning /> : <Idees versGardeManger={versGardeManger} embarque />}
    </div>
  );
}

function Planning() {
  const { meals, setMeals } = useDonnees();
  const [{ vuePlanning }, majReglages] = useReglages();
  const { recettes } = useRecettes();
  const { catalogue } = useCatalogue();
  const toast = useToast();
  const [lundi, setLundi] = useState(debutSemaine(aujourdhui()));
  const [ajout, setAjout] = useState<{ jour: string; slot: Meal["slot"] } | null>(null);
  const [edition, setEdition] = useState<Meal | null>(null);
  const [cuisiner, setCuisiner] = useState<QuoiCuisiner | null>(null);

  const jours = Array.from({ length: 7 }, (_, i) => ajouterJours(lundi, i)).slice(vuePlanning === "weekend" ? 4 : 0);
  const deLaPeriode = meals.filter((m) => m.eaten_on >= jours[0] && m.eaten_on <= jours[jours.length - 1]);
  const prevus = deLaPeriode.filter((m) => m.status === "prevu").length;
  const fin = versDate(jours[jours.length - 1]);
  const titrePeriode =
    vuePlanning === "weekend"
      ? `Week-end du ${versDate(jours[0]).getDate()} au ${fin.toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}`
      : `Semaine du ${versDate(jours[0]).getDate()} au ${fin.toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}`;

  async function basculer(m: Meal) {
    // Recette ou assemblage : « Cuisiner ce repas » déduit le stock
    if (m.status === "prevu") {
      const quoi = quoiPourRepas(m, recettes ?? [], catalogue?.repasTypes ?? []);
      if (quoi) return setCuisiner(quoi);
    }
    const status: Meal["status"] = m.status === "prevu" ? "cuisine" : "prevu";
    setMeals((l) => l.map((x) => (x.id === m.id ? { ...x, status } : x)));
    const { error } = await supabase
      .from("meals")
      .update({ status, cooked_at: status === "cuisine" ? new Date().toISOString() : null })
      .eq("id", m.id);
    if (error) {
      setMeals((l) => l.map((x) => (x.id === m.id ? m : x)));
      toast(messageErreur(error), { erreur: true });
    }
  }

  return (
    <>
      <div className="planning__barre">
        <nav className="planning__nav" aria-label={titrePeriode}>
          <button className="bouton-icone" onClick={() => setLundi(ajouterJours(lundi, -7))} aria-label="Semaine précédente">
            <ChevronLeft size={20} />
          </button>
          <span className="planning__titre">{titrePeriode}</span>
          <button className="bouton-icone" onClick={() => setLundi(ajouterJours(lundi, 7))} aria-label="Semaine suivante">
            <ChevronRight size={20} />
          </button>
        </nav>
        <div className="puces" role="group" aria-label="Période affichée">
          <button className="puce" aria-pressed={vuePlanning === "semaine"} onClick={() => majReglages({ vuePlanning: "semaine" })}>
            Semaine
          </button>
          <button className="puce" aria-pressed={vuePlanning === "weekend"} onClick={() => majReglages({ vuePlanning: "weekend" })}>
            Week-end
          </button>
        </div>
      </div>
      <p className="note planning__resume">
        {deLaPeriode.length === 0
          ? "Rien de prévu pour l'instant. Touche un créneau pour planifier un repas."
          : `${deLaPeriode.length} repas, dont ${prevus} à faire.`}
      </p>

      <ol className="semainier">
        {jours.map((jour) => {
          const duJour = deLaPeriode.filter((m) => m.eaten_on === jour);
          const slots = SLOTS.filter((s) => s.id === "dejeuner" || s.id === "diner" || duJour.some((m) => m.slot === s.id));
          return (
            <li key={jour} className={"jour-carte" + (jour === aujourdhui() ? " jour-carte--aujourdhui" : "")}>
              <h2 className="jour-carte__titre">
                <span className="jour-carte__nom">{jourCourt(jour)}</span>
                <span className="jour-carte__num">{versDate(jour).getDate()}</span>
                {jour === aujourdhui() && <span className="pastille">Aujourd'hui</span>}
              </h2>
              <div className="jour-carte__creneaux">
                {slots.map((s) => {
                  const items = duJour.filter((m) => m.slot === s.id);
                  return (
                    <section key={s.id} className="creneau" aria-label={`${s.label}, ${jourLong(jour)}`}>
                      <div className="creneau__tete">
                        <h3 className="creneau__nom">{s.id === "dejeuner" ? "Midi" : s.id === "diner" ? "Soir" : s.label}</h3>
                        <button
                          className="bouton-icone creneau__plus"
                          onClick={() => setAjout({ jour, slot: s.id })}
                          aria-label={`Ajouter un repas, ${s.label.toLowerCase()} ${jourLong(jour).toLowerCase()}`}
                        >
                          <Plus size={18} />
                        </button>
                      </div>
                      {items.length === 0 && <p className="creneau__vide">Rien de prévu</p>}
                      {items.map((m) => {
                        const Icone = iconeType(m.meal_type);
                        return (
                          <div key={m.id} className={`plat plat--${m.meal_type}` + (m.status === "cuisine" ? " plat--fait" : "")}>
                            <button
                              className="case"
                              role="checkbox"
                              aria-checked={m.status === "cuisine"}
                              aria-label={m.status === "cuisine" ? `${m.title} : cuisiné` : `Cuisiner ${m.title}`}
                              onClick={() => basculer(m)}
                            >
                              {m.status === "cuisine" && <Check size={16} strokeWidth={3} />}
                            </button>
                            <button className="plat__corps" onClick={() => setEdition(m)}>
                              <span className="plat__titre">
                                <Icone size={14} aria-hidden className="plat__icone" /> {m.title}
                              </span>
                              {(m.notes || m.external_cost != null) && (
                                <span className="plat__note">
                                  {[m.notes, m.external_cost != null && formatPrix(m.external_cost)].filter(Boolean).join(" · ")}
                                </span>
                              )}
                            </button>
                          </div>
                        );
                      })}
                    </section>
                  );
                })}
              </div>
            </li>
          );
        })}
      </ol>

      <AjoutRepas
        cible={ajout}
        recettes={recettes ?? []}
        modeles={catalogue?.repasTypes ?? []}
        onFermer={() => setAjout(null)}
      />
      <EditionRepas
        meal={edition}
        onFermer={() => setEdition(null)}
        onCuisiner={(m) => {
          setEdition(null);
          const quoi = quoiPourRepas(m, recettes ?? [], catalogue?.repasTypes ?? []);
          if (quoi) setCuisiner(quoi);
          else basculer(m);
        }}
      />
      <FeuilleCuisiner quoi={cuisiner} onFermer={() => setCuisiner(null)} />
    </>
  );
}

interface Proposition {
  id: string;
  titre: string;
  type: Exclude<TypeRepas, "libre">;
  recetteId: string | null;
  modeleId: string | null;
  favori: boolean;
}

function AjoutRepas({
  cible,
  recettes,
  modeles,
  onFermer,
}: {
  cible: { jour: string; slot: Meal["slot"] } | null;
  recettes: RecetteComplete[];
  modeles: RepasType[];
  onFermer: () => void;
}) {
  const { setMeals } = useDonnees();
  const toast = useToast();
  const [titre, setTitre] = useState("");
  const [type, setType] = useState<Exclude<TypeRepas, "libre">>("assemblage");
  const [choix, setChoix] = useState<Proposition | null>(null);
  const [cout, setCout] = useState("");
  const [notes, setNotes] = useState("");
  const [slot, setSlot] = useState<Meal["slot"]>("diner");
  const [pour, setPour] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  const cle = cible ? cible.jour + cible.slot : null;
  if (cle && pour !== cle) {
    setPour(cle);
    setSlot(cible!.slot);
    setTitre("");
    setChoix(null);
    setCout("");
    setNotes("");
    setType("assemblage");
  }
  if (!cle && pour) setPour(null);

  // Favoris d'abord, puis recettes ; filtrés par la saisie
  const propositions = useMemo<Proposition[]>(() => {
    const deModeles: Proposition[] = modeles.map((m) => ({
      id: "m" + m.id,
      titre: m.name,
      type: m.meal_type,
      recetteId: m.recipe_id,
      modeleId: m.id,
      favori: m.is_favorite,
    }));
    const dejaLiees = new Set(modeles.map((m) => m.recipe_id).filter(Boolean));
    const deRecettes: Proposition[] = recettes
      .filter((r) => !dejaLiees.has(r.id))
      .map((r) => ({ id: "r" + r.id, titre: r.title, type: "recette", recetteId: r.id, modeleId: null, favori: false }));
    const q = cleAliment(titre);
    const toutes = [...deModeles, ...deRecettes];
    if (!q) return toutes.filter((p) => p.favori);
    return toutes.filter((p) => cleAliment(p.titre).includes(q)).slice(0, 8);
  }, [modeles, recettes, titre]);

  async function enregistrer(e: FormEvent) {
    e.preventDefault();
    if (!cible || !titre.trim()) return;
    setEnCours(true);
    const t = choix && choix.titre === titre ? choix.type : type;
    const { data, error } = await supabase
      .from("meals")
      .insert({
        title: capitaliser(titre),
        eaten_on: cible.jour,
        slot,
        status: "prevu",
        meal_type: t,
        recipe_id: choix && choix.titre === titre ? choix.recetteId : null,
        template_id: choix && choix.titre === titre ? choix.modeleId : null,
        servings: 2,
        notes: notes.trim() || null,
        external_cost: t === "exterieur" && cout ? Number(cout.replace(",", ".")) : null,
      })
      .select()
      .single();
    setEnCours(false);
    if (error) return toast(messageErreur(error), { erreur: true });
    setMeals((l) => [...l, data as Meal]);
    onFermer();
  }

  const typeEffectif = choix && choix.titre === titre ? choix.type : type;

  return (
    <Feuille
      ouverte={!!cible}
      titre={cible ? `${jourLong(cible.jour)}` : ""}
      onFermer={onFermer}
      pied={
        <button type="submit" form="form-repas" className="bouton bouton--action bouton--plein" disabled={enCours || !titre.trim()}>
          Planifier le repas
        </button>
      }
    >
      <form id="form-repas" className="formulaire" onSubmit={enregistrer}>
        <div className="segments" role="radiogroup" aria-label="Créneau">
          {SLOTS.map((s) => (
            <button
              key={s.id}
              type="button"
              role="radio"
              className="segment"
              aria-checked={slot === s.id}
              aria-selected={slot === s.id}
              onClick={() => setSlot(s.id)}
            >
              {s.id === "dejeuner" ? "Midi" : s.id === "diner" ? "Soir" : s.label}
            </button>
          ))}
        </div>
        <label className="champ-groupe">
          <span>Quel repas ?</span>
          <input
            className="champ"
            required
            maxLength={120}
            placeholder="Burger frites, Saumon riz, Auré resto / François : MacDo…"
            value={titre}
            onChange={(e) => setTitre(e.target.value)}
            autoComplete="off"
          />
        </label>
        {propositions.length > 0 && (
          <div className="champ-groupe">
            <span>{titre ? "Suggestions" : "Vos favoris"}</span>
            <div className="puces">
              {propositions.map((p) => {
                const Icone = iconeType(p.type);
                return (
                  <button
                    key={p.id}
                    type="button"
                    className="puce"
                    aria-pressed={choix?.id === p.id && titre === p.titre}
                    onClick={() => {
                      setChoix(p);
                      setTitre(p.titre);
                      setType(p.type);
                    }}
                  >
                    <Icone size={14} aria-hidden /> {p.titre}
                  </button>
                );
              })}
            </div>
          </div>
        )}
        <fieldset className="champ-groupe">
          <legend>Type de repas</legend>
          <div className="types-repas">
            {TYPES.map((t) => (
              <label key={t.id} className={"type-repas" + (typeEffectif === t.id ? " type-repas--actif" : "")}>
                <input
                  type="radio"
                  name="type-repas"
                  checked={typeEffectif === t.id}
                  onChange={() => {
                    setType(t.id);
                    setChoix(null);
                  }}
                />
                <t.icone size={18} aria-hidden />
                <span>
                  <strong>{t.label}</strong>
                  <span className="note">{t.aide}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        {typeEffectif === "exterieur" && (
          <label className="champ-groupe">
            <span>Coût (facultatif, compté dans Sorties / Resto)</span>
            <input className="champ" inputMode="decimal" placeholder="0,00 €" value={cout} onChange={(e) => setCout(e.target.value)} />
          </label>
        )}
        <label className="champ-groupe">
          <span>Note (facultatif)</span>
          <input className="champ" maxLength={200} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
      </form>
    </Feuille>
  );
}

function EditionRepas({
  meal,
  onFermer,
  onCuisiner,
}: {
  meal: Meal | null;
  onFermer: () => void;
  onCuisiner: (m: Meal) => void;
}) {
  const { setMeals } = useDonnees();
  const toast = useToast();
  const [b, setB] = useState<Meal | null>(meal);
  if (meal && b?.id !== meal.id) setB(meal);

  async function enregistrer(e: FormEvent) {
    e.preventDefault();
    if (!b) return;
    const maj = {
      title: b.title.trim(),
      eaten_on: b.eaten_on,
      slot: b.slot,
      notes: b.notes?.trim() || null,
      external_cost: b.meal_type === "exterieur" ? b.external_cost : null,
    };
    const { error } = await supabase.from("meals").update(maj).eq("id", b.id);
    if (error) return toast(messageErreur(error), { erreur: true });
    setMeals((l) => l.map((m) => (m.id === b.id ? { ...b, ...maj } : m)));
    onFermer();
  }

  async function supprimer() {
    if (!b) return;
    setMeals((l) => l.filter((m) => m.id !== b.id));
    onFermer();
    const { error } = await supabase.from("meals").delete().eq("id", b.id);
    if (error) {
      setMeals((l) => [...l, b]);
      return toast(messageErreur(error), { erreur: true });
    }
    toast(`« ${b.title} » retiré du planning`, {
      action: {
        label: "Annuler",
        faire: async () => {
          const { id, eaten_on, slot, title, recipe_id, servings, notes, meal_type, status, template_id, external_cost } = b;
          await supabase
            .from("meals")
            .insert({ id, eaten_on, slot, title, recipe_id, servings, notes, meal_type, status, template_id, external_cost });
          setMeals((l) => [...l, b]);
        },
      },
    });
  }

  return (
    <Feuille
      ouverte={!!meal}
      titre={meal?.title ?? ""}
      onFermer={onFermer}
      pied={
        b && (
          <>
            <button type="button" className="bouton bouton--discret" onClick={supprimer}>
              <Trash2 size={18} aria-hidden /> Retirer
            </button>
            {b.status === "prevu" && b.meal_type !== "exterieur" && (
              <button type="button" className="bouton bouton--discret" onClick={() => onCuisiner(b)}>
                <ChefHat size={18} aria-hidden /> Cuisiner
              </button>
            )}
            <button type="submit" form="form-edition-repas" className="bouton bouton--action">
              Enregistrer
            </button>
          </>
        )
      }
    >
      {b && (
        <form id="form-edition-repas" className="formulaire" onSubmit={enregistrer}>
          <p className="note">
            {TYPES.find((t) => t.id === b.meal_type)?.label ?? "Repas libre"} ·{" "}
            {b.status === "cuisine" ? "cuisiné" : "à faire"}
          </p>
          <label className="champ-groupe">
            <span>Repas</span>
            <input className="champ" value={b.title} required maxLength={120} onChange={(e) => setB({ ...b, title: e.target.value })} />
          </label>
          <div className="formulaire__ligne">
            <label className="champ-groupe">
              <span>Jour</span>
              <input className="champ" type="date" value={b.eaten_on} onChange={(e) => setB({ ...b, eaten_on: e.target.value || b.eaten_on })} />
            </label>
            <label className="champ-groupe">
              <span>Créneau</span>
              <select className="champ" value={b.slot} onChange={(e) => setB({ ...b, slot: e.target.value as Meal["slot"] })}>
                {SLOTS.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {b.meal_type === "exterieur" && (
            <label className="champ-groupe">
              <span>Coût (Sorties / Resto)</span>
              <input
                className="champ"
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                value={b.external_cost ?? ""}
                onChange={(e) => setB({ ...b, external_cost: e.target.value === "" ? null : Number(e.target.value) })}
              />
            </label>
          )}
          <label className="champ-groupe">
            <span>Note</span>
            <input className="champ" maxLength={200} value={b.notes ?? ""} onChange={(e) => setB({ ...b, notes: e.target.value })} />
          </label>
        </form>
      )}
    </Feuille>
  );
}
