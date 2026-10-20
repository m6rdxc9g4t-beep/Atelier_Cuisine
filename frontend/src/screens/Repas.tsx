import { useState, type FormEvent } from "react";
import { ChevronLeft, ChevronRight, Plus, Trash2 } from "lucide-react";
import { Feuille } from "../components/Feuille";
import { useToast } from "../components/Toast";
import { capitaliser } from "../lib/aliments";
import { ajouterJours, aujourdhui, debutSemaine, jourCourt, jourLong, versDate } from "../lib/dates";
import { useDonnees, useRecettes, type RecetteComplete } from "../lib/donnees";
import { cleAliment } from "../lib/normaliser";
import { messageErreur, SLOTS, supabase, type Meal } from "../lib/supabase";
import { FeuilleCuisiner } from "./Idees";

export function Repas() {
  const { meals, setMeals } = useDonnees();
  const toast = useToast();
  const [jour, setJour] = useState(aujourdhui());
  const [ajout, setAjout] = useState<Meal["slot"] | null>(null);
  const [cuisiner, setCuisiner] = useState<{ recette: RecetteComplete; slot: Meal["slot"] } | null>(null);

  const lundi = debutSemaine(jour);
  const semaine = Array.from({ length: 7 }, (_, i) => ajouterJours(lundi, i));
  const duJour = meals.filter((m) => m.eaten_on === jour);
  const deLaSemaine = meals.filter((m) => m.eaten_on >= lundi && m.eaten_on <= semaine[6]);
  const faitsMaison = deLaSemaine.filter((m) => m.recipe_id).length;

  async function supprimer(m: Meal) {
    setMeals((l) => l.filter((x) => x.id !== m.id));
    const { error } = await supabase.from("meals").delete().eq("id", m.id);
    if (error) {
      setMeals((l) => [m, ...l]);
      return toast(messageErreur(error), { erreur: true });
    }
    toast(`« ${m.title} » retiré du journal`, {
      action: {
        label: "Annuler",
        faire: async () => {
          const { id, eaten_on, slot, title, recipe_id, servings, notes } = m;
          await supabase.from("meals").insert({ id, eaten_on, slot, title, recipe_id, servings, notes });
          setMeals((l) => [m, ...l]);
        },
      },
    });
  }

  const moisSemaine = versDate(lundi).toLocaleDateString("fr-FR", { month: "long", year: "numeric" });

  return (
    <div className="ecran">
      <header className="ecran__tete">
        <h1>Repas</h1>
        <p className="ecran__sous-titre">
          {deLaSemaine.length === 0
            ? "Note ce que tu manges pour garder le fil de la semaine"
            : `${deLaSemaine.length} repas cette semaine, dont ${faitsMaison} avec une recette`}
        </p>
      </header>

      <nav className="semaine" aria-label={`Semaine, ${moisSemaine}`}>
        <button className="bouton-icone" onClick={() => setJour(ajouterJours(jour, -7))} aria-label="Semaine précédente">
          <ChevronLeft size={20} />
        </button>
        <ol className="semaine__jours">
          {semaine.map((d) => {
            const n = meals.filter((m) => m.eaten_on === d).length;
            return (
              <li key={d}>
                <button
                  className={"jour" + (d === aujourdhui() ? " jour--aujourdhui" : "")}
                  aria-pressed={d === jour}
                  aria-label={`${jourLong(d)}, ${n} repas`}
                  onClick={() => setJour(d)}
                >
                  <span className="jour__nom">{jourCourt(d)}</span>
                  <span className="jour__num">{versDate(d).getDate()}</span>
                  <span className="jour__points" aria-hidden>
                    {Array.from({ length: Math.min(n, 4) }, (_, i) => (
                      <span key={i} />
                    ))}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
        <button className="bouton-icone" onClick={() => setJour(ajouterJours(jour, 7))} aria-label="Semaine suivante">
          <ChevronRight size={20} />
        </button>
      </nav>

      <h2 className="jour-titre">{jourLong(jour)}</h2>
      <ul className="creneaux">
        {SLOTS.map((s) => {
          const items = duJour.filter((m) => m.slot === s.id);
          return (
            <li key={s.id} className="creneau">
              <h3 className="creneau__nom">{s.label}</h3>
              <div className="creneau__contenu">
                {items.map((m) => (
                  <div key={m.id} className="repas">
                    <span className="repas__titre">{m.title}</span>
                    {m.notes && <span className="repas__note">{m.notes}</span>}
                    <button
                      className="bouton-icone repas__suppr"
                      onClick={() => supprimer(m)}
                      aria-label={`Retirer ${m.title}`}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
                <button className="creneau__ajout" onClick={() => setAjout(s.id)}>
                  <Plus size={16} aria-hidden /> {items.length ? "Ajouter" : `Noter le ${s.label.toLowerCase()}`}
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      <AjoutRepas
        creneau={ajout}
        jour={jour}
        onFermer={() => setAjout(null)}
        onRecette={(recette) => {
          const slot = ajout!;
          setAjout(null);
          setCuisiner({ recette, slot });
        }}
      />
      <FeuilleCuisiner
        recette={cuisiner?.recette ?? null}
        dateInitiale={jour}
        creneauInitial={cuisiner?.slot}
        onFermer={() => setCuisiner(null)}
      />
    </div>
  );
}

function AjoutRepas({
  creneau,
  jour,
  onFermer,
  onRecette,
}: {
  creneau: Meal["slot"] | null;
  jour: string;
  onFermer: () => void;
  onRecette: (r: RecetteComplete) => void;
}) {
  const { setMeals } = useDonnees();
  const { recettes } = useRecettes();
  const toast = useToast();
  const [titre, setTitre] = useState("");
  const [notes, setNotes] = useState("");
  const [enCours, setEnCours] = useState(false);

  const q = cleAliment(titre);
  const proposees = q.length >= 2 ? (recettes ?? []).filter((r) => cleAliment(r.title).includes(q)).slice(0, 4) : [];

  async function noter(e: FormEvent) {
    e.preventDefault();
    if (!titre.trim() || !creneau) return;
    setEnCours(true);
    const { data, error } = await supabase
      .from("meals")
      .insert({ title: capitaliser(titre), notes: notes.trim() || null, eaten_on: jour, slot: creneau })
      .select()
      .single();
    setEnCours(false);
    if (error) return toast(messageErreur(error), { erreur: true });
    setMeals((l) => [data as Meal, ...l]);
    setTitre("");
    setNotes("");
    onFermer();
  }

  const label = SLOTS.find((s) => s.id === creneau)?.label ?? "";

  return (
    <Feuille
      ouverte={!!creneau}
      titre={`${label}, ${jourLong(jour).toLowerCase()}`}
      onFermer={onFermer}
      pied={
        <button type="submit" form="form-repas" className="bouton bouton--action bouton--plein" disabled={enCours}>
          Noter le repas
        </button>
      }
    >
      <form id="form-repas" className="formulaire" onSubmit={noter}>
        <label className="champ-groupe">
          <span>Qu'as-tu mangé ?</span>
          <input
            className="champ"
            required
            maxLength={120}
            placeholder="Restes de lasagnes, salade…"
            value={titre}
            onChange={(e) => setTitre(e.target.value)}
            autoComplete="off"
          />
        </label>
        {proposees.length > 0 && (
          <div className="champ-groupe">
            <span>Depuis une recette (retire les ingrédients utilisés)</span>
            <div className="puces">
              {proposees.map((r) => (
                <button key={r.id} type="button" className="puce" onClick={() => onRecette(r)}>
                  {r.emoji} {r.title}
                </button>
              ))}
            </div>
          </div>
        )}
        <label className="champ-groupe">
          <span>Note (facultatif)</span>
          <input className="champ" maxLength={200} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
      </form>
    </Feuille>
  );
}
