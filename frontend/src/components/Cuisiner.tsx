import { useMemo, useState } from "react";
import { Package } from "lucide-react";
import { Feuille } from "./Feuille";
import { useToast } from "./Toast";
import { formatQuantite } from "../lib/aliments";
import { aujourdhui, libelleEcheance } from "../lib/dates";
import { useDonnees } from "../lib/donnees";
import { besoinsDe, type QuoiCuisiner } from "../lib/repas";
import { planifierConsommation, type ActionStock } from "../lib/stock";
import { creneauDuMoment, messageErreur, SLOTS, supabase, type Meal } from "../lib/supabase";

/**
 * « Cuisiner ce repas » : marque le repas cuisiné et déduit du stock les lots
 * qui périment le plus tôt. Chaque déduction peut être décochée.
 */
export function FeuilleCuisiner({
  quoi,
  onFermer,
  dateInitiale,
  creneauInitial,
}: {
  quoi: QuoiCuisiner | null;
  onFermer: () => void;
  dateInitiale?: string;
  creneauInitial?: Meal["slot"];
}) {
  const { pantry, recharger } = useDonnees();
  const toast = useToast();
  const [date, setDate] = useState(aujourdhui());
  const [creneau, setCreneau] = useState<Meal["slot"]>(creneauDuMoment());
  const [ignores, setIgnores] = useState<Set<string>>(new Set());
  const [pour, setPour] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  const cle = quoi ? (quoi.type === "recette" ? quoi.recette.id : quoi.modele.id) + (quoi.meal?.id ?? "") : null;
  const titre = quoi ? (quoi.type === "recette" ? quoi.recette.title : quoi.modele.name) : "";
  const portions = quoi?.meal?.servings ?? 2;

  const lignes = useMemo(() => (quoi ? planifierConsommation(besoinsDe(quoi, portions), pantry) : []), [quoi, portions, pantry]);

  // Réinitialise à chaque nouveau repas
  if (cle && pour !== cle) {
    setPour(cle);
    setDate(quoi?.meal?.eaten_on ?? dateInitiale ?? aujourdhui());
    setCreneau(quoi?.meal?.slot ?? creneauInitial ?? creneauDuMoment());
    setIgnores(new Set());
  }
  if (!cle && pour) setPour(null);

  async function valider() {
    if (!quoi) return;
    setEnCours(true);
    try {
      let mealId = quoi.meal?.id;
      if (!mealId) {
        const { data, error } = await supabase
          .from("meals")
          .insert({
            title: titre,
            recipe_id: quoi.type === "recette" ? quoi.recette.id : quoi.modele.recipe_id,
            template_id: quoi.type === "assemblage" ? quoi.modele.id : null,
            meal_type: quoi.type,
            status: "prevu",
            eaten_on: date,
            slot: creneau,
            servings: 2,
          })
          .select()
          .single();
        if (error) throw error;
        mealId = (data as Meal).id;
      }
      const actions: ActionStock[] = lignes
        .filter((l) => l.action && !ignores.has(l.action.id))
        .map((l) => l.action!);
      const { error } = await supabase.rpc("cuisiner_repas", { p_meal: mealId, p_consommation: actions });
      if (error) throw error;
      await Promise.all([recharger("meals"), recharger("pantry_items")]);
      toast(
        actions.length
          ? `Repas cuisiné, ${actions.length} produit${actions.length > 1 ? "s" : ""} déduit${actions.length > 1 ? "s" : ""} du stock`
          : "Repas cuisiné",
      );
      onFermer();
    } catch (e) {
      toast(messageErreur(e), { erreur: true });
    } finally {
      setEnCours(false);
    }
  }

  const enStock = lignes.filter((l) => l.lot);
  const manquants = lignes.filter((l) => !l.lot);

  return (
    <Feuille
      ouverte={!!quoi}
      titre={`Cuisiner : ${titre}`}
      onFermer={onFermer}
      pied={
        <button className="bouton bouton--action bouton--plein" onClick={valider} disabled={enCours}>
          {quoi?.meal ? "C'est cuisiné" : "Noter le repas cuisiné"}
        </button>
      }
    >
      <div className="formulaire">
        {!quoi?.meal && (
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
        )}
        {enStock.length > 0 ? (
          <fieldset className="champ-groupe">
            <legend>Déduit du stock (premier périmé, premier utilisé)</legend>
            <ul className="cases">
              {enStock.map((l) => (
                <li key={l.lot!.id}>
                  <label className="case-ligne">
                    <input
                      type="checkbox"
                      checked={!ignores.has(l.lot!.id)}
                      onChange={(e) => {
                        const n = new Set(ignores);
                        if (e.target.checked) n.delete(l.lot!.id);
                        else n.add(l.lot!.id);
                        setIgnores(n);
                      }}
                    />
                    <span>
                      {l.lot!.name}
                      {l.lot!.in_container && (
                        <span className="pastille pastille--boite">
                          <Package size={12} aria-hidden /> boîte
                        </span>
                      )}
                      <span className="case-ligne__sous">
                        {[formatQuantite(l.lot!.quantity, l.lot!.unit), l.lot!.expires_on && libelleEcheance(l.lot!.expires_on)]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </span>
                    <span className="case-ligne__detail">{l.resume}</span>
                  </label>
                </li>
              ))}
            </ul>
            <p className="note">Décoche ce qui n'a pas été utilisé.</p>
          </fieldset>
        ) : (
          <p className="note">Aucun produit du stock n'est utilisé par ce repas.</p>
        )}
        {manquants.length > 0 && (
          <p className="note">Pas en stock : {manquants.map((l) => l.besoin.nom.toLowerCase()).join(", ")}.</p>
        )}
      </div>
    </Feuille>
  );
}
