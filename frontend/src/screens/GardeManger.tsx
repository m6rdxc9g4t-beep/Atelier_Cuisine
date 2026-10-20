import { useMemo, useState, type FormEvent } from "react";
import { Check, ChefHat, Package, Plus, RotateCcw, Trash2 } from "lucide-react";
import { ChoixDate } from "../components/ChoixDate";
import { Feuille } from "../components/Feuille";
import { CompteARebours, Echeance } from "../components/Fraicheur";
import { useToast } from "../components/Toast";
import {
  analyserSaisie,
  CATEGORIES,
  deviner,
  EMPLACEMENTS,
  formatQuantite,
  labelNiveau,
  NIVEAUX,
  type Emplacement,
} from "../lib/aliments";
import { aAlerter, ajouterJours, aujourdhui, fraicheur, versDate } from "../lib/dates";
import { useDonnees, useReglages } from "../lib/donnees";
import { messageErreur, supabase, type PantryItem } from "../lib/supabase";

type Filtre = "tout" | Emplacement;

export function GardeManger({ versIdees }: { versIdees: () => void }) {
  const { pantry, setPantry, chargement } = useDonnees();
  const [{ joursAlerte }] = useReglages();
  const toast = useToast();
  const [filtre, setFiltre] = useState<Filtre>("tout");
  const [saisie, setSaisie] = useState("");
  const [edition, setEdition] = useState<PantryItem | null>(null);

  const aFinir = useMemo(
    () => pantry.filter((p) => aAlerter(p.expires_on, joursAlerte)),
    [pantry, joursAlerte],
  );

  const visibles = filtre === "tout" ? pantry : pantry.filter((p) => p.location === filtre);
  const groupes = EMPLACEMENTS.map((e) => ({
    ...e,
    items: visibles.filter((p) => p.location === e.id),
  })).filter((g) => g.items.length);

  const apercu = saisie.trim() ? { ...analyserSaisie(saisie), ...deviner(saisie) } : null;

  async function ajouter(e: FormEvent) {
    e.preventDefault();
    if (!apercu || !apercu.name) return;
    const ligne = {
      name: apercu.name,
      quantity: apercu.quantity,
      unit: apercu.unit,
      category: apercu.categorie,
      location: filtre === "tout" ? apercu.emplacement : filtre,
      expires_on: apercu.jours != null ? ajouterJours(aujourdhui(), apercu.jours) : null,
      product_id: apercu.produit?.id ?? null,
    };
    setSaisie("");
    const { data, error } = await supabase.from("pantry_items").insert(ligne).select().single();
    if (error) return toast(messageErreur(error), { erreur: true });
    const item = data as PantryItem;
    setPantry((l) => trier([...l, item]));
    toast(
      item.expires_on
        ? `${item.name} ajouté, date estimée au ${versDate(item.expires_on).toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}`
        : `${item.name} ajouté`,
      { action: { label: "Modifier", faire: () => setEdition(item) } },
    );
  }

  async function retirer(item: PantryItem, texte = `${item.name} retiré`) {
    setPantry((l) => l.filter((p) => p.id !== item.id));
    const { error } = await supabase.from("pantry_items").delete().eq("id", item.id);
    if (error) {
      setPantry((l) => trier([...l, item]));
      return toast(messageErreur(error), { erreur: true });
    }
    toast(texte, {
      action: {
        label: "Annuler",
        faire: async () => {
          const { id, name, quantity, unit, category, location, expires_on, stock_level, opened_on, in_container, note, product_id } = item;
          await supabase
            .from("pantry_items")
            .insert({ id, name, quantity, unit, category, location, expires_on, stock_level, opened_on, in_container, note, product_id });
          setPantry((l) => trier([...l, item]));
        },
      },
    });
  }

  return (
    <div className="ecran">
      <header className="ecran__tete">
        <h1>Stock</h1>
        <p className="ecran__sous-titre">
          {pantry.length === 0
            ? "Ce que tu as à la maison"
            : `${pantry.length} produit${pantry.length > 1 ? "s" : ""} à la maison`}
        </p>
      </header>

      {aFinir.length > 0 && (
        <section className="a-finir" aria-labelledby="a-finir-titre">
          <div className="a-finir__tete">
            <h2 id="a-finir-titre">À finir en premier</h2>
            <button className="lien" onClick={versIdees}>
              <ChefHat size={16} aria-hidden /> Que cuisiner ?
            </button>
          </div>
          <ul className="a-finir__bande">
            {aFinir.map((p) => (
              <li key={p.id}>
                <button
                  className={`tuile tuile--${fraicheur(p.expires_on)}` + (p.in_container ? " tuile--boite" : "")}
                  onClick={() => setEdition(p)}
                >
                  <CompteARebours date={p.expires_on} />
                  <span className="tuile__nom">{p.name}</span>
                  <span className="tuile__lieu">
                    {p.in_container && <Package size={12} aria-hidden />} {EMPLACEMENTS.find((e) => e.id === p.location)?.label}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <form className="ajout-rapide" onSubmit={ajouter}>
        <label htmlFor="ajout-gm" className="visuellement-cache">
          Ajouter un aliment
        </label>
        <input
          id="ajout-gm"
          className="champ champ--grand"
          placeholder="Ajouter… ex. 6 œufs"
          value={saisie}
          onChange={(e) => setSaisie(e.target.value)}
          autoComplete="off"
          enterKeyHint="done"
        />
        <button className="bouton bouton--action" disabled={!saisie.trim()} aria-label="Ajouter">
          <Plus size={20} />
        </button>
        {apercu && (
          <p className="ajout-rapide__apercu">
            {apercu.produit ? `${apercu.produit.name} · ` : ""}
            {CATEGORIES.find((c) => c.id === apercu.categorie)?.label}
            {", "}
            {EMPLACEMENTS.find((e) => e.id === (filtre === "tout" ? apercu.emplacement : filtre))?.label.toLowerCase()}
            {apercu.jours != null
              ? `, se garde environ ${apercu.jours} jour${apercu.jours > 1 ? "s" : ""}`
              : ", sans date"}
          </p>
        )}
      </form>

      <div className="segments" role="tablist" aria-label="Emplacement">
        {[{ id: "tout", label: "Tout" } as const, ...EMPLACEMENTS].map((e) => (
          <button
            key={e.id}
            role="tab"
            aria-selected={filtre === e.id}
            className="segment"
            onClick={() => setFiltre(e.id)}
          >
            {"court" in e ? e.court : e.label}
          </button>
        ))}
      </div>

      {!chargement && visibles.length === 0 && (
        <div className="vide">
          <p className="vide__titre">
            {pantry.length === 0 ? "Le stock est vide" : "Rien à cet endroit"}
          </p>
          <p>
            {pantry.length === 0
              ? "Note ce qu'il y a dans ton frigo et tes placards, avec les dates. L'app te dira quoi finir en premier et quoi cuisiner avec."
              : "Ajoute un produit avec le champ ci-dessus : il sera rangé ici."}
          </p>
        </div>
      )}

      {groupes.map((g) => (
        <section key={g.id} className="groupe" aria-label={g.label}>
          {filtre === "tout" && <h2 className="groupe__titre">{g.label}</h2>}
          <ul className="liste">
            {g.items.map((p) => (
              <li
                key={p.id}
                className={`ligne ligne--${p.in_container ? "boite" : fraicheur(p.expires_on)}`}
              >
                <button className="ligne__principal" onClick={() => setEdition(p)}>
                  <span className="ligne__nom">{p.name}</span>
                  <span className="ligne__detail">
                    {formatQuantite(p.quantity, p.unit) && <span>{formatQuantite(p.quantity, p.unit)}</span>}
                    {p.stock_level && <span className={`niveau niveau--${p.stock_level}`}>{labelNiveau(p.stock_level)}</span>}
                    {(p.expires_on || !p.stock_level) && <Echeance date={p.expires_on} boite={p.in_container} ouvertLe={p.opened_on} />}
                    {!p.expires_on && p.stock_level && p.in_container && <Echeance date={null} boite ouvertLe={p.opened_on} />}
                  </span>
                  {p.note && <span className="ligne__note">{p.note}</span>}
                </button>
                <button
                  className="bouton-icone ligne__fini"
                  onClick={() => retirer(p, `${p.name} fini`)}
                  aria-label={`${p.name} : fini`}
                  title="Fini"
                >
                  <Check size={18} />
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <EditionProduit
        item={edition}
        onFermer={() => setEdition(null)}
        onRetirer={(p) => {
          setEdition(null);
          retirer(p);
        }}
      />
    </div>
  );
}

function trier(l: PantryItem[]) {
  return [...l].sort(
    (a, b) =>
      (a.expires_on ?? "9999").localeCompare(b.expires_on ?? "9999") || a.name.localeCompare(b.name, "fr"),
  );
}

function EditionProduit({
  item,
  onFermer,
  onRetirer,
}: {
  item: PantryItem | null;
  onFermer: () => void;
  onRetirer: (p: PantryItem) => void;
}) {
  const { setPantry, recharger } = useDonnees();
  const toast = useToast();
  const [brouillon, setBrouillon] = useState<PantryItem | null>(item);
  const [enCours, setEnCours] = useState(false);
  if (item && brouillon?.id !== item.id) setBrouillon(item);
  const b = brouillon;

  async function enregistrer(e: FormEvent) {
    e.preventDefault();
    if (!b) return;
    setEnCours(true);
    const { id, name, quantity, unit, category, location, expires_on, stock_level, opened_on, in_container } = b;
    const note = b.note?.trim() || null;
    const { error } = await supabase
      .from("pantry_items")
      .update({ name: name.trim(), quantity, unit: unit?.trim() || null, category, location, expires_on, stock_level, opened_on, in_container, note })
      .eq("id", id);
    setEnCours(false);
    if (error) return toast(messageErreur(error), { erreur: true });
    setPantry((l) => trier(l.map((p) => (p.id === id ? { ...b, name: name.trim(), note } : p))));
    onFermer();
  }

  async function aRacheter() {
    if (!b) return;
    const { error } = await supabase.from("shopping_items").insert({
      name: b.name,
      category: b.category,
      product_id: b.product_id,
      source: "a_racheter",
      note: b.note,
    });
    if (error) return toast(messageErreur(error), { erreur: true });
    recharger("shopping_items");
    toast(`${b.name} ajouté à la liste de courses`);
  }

  return (
    <Feuille
      ouverte={!!item}
      titre={item?.name ?? ""}
      onFermer={onFermer}
      pied={
        b && (
          <>
            <button type="button" className="bouton bouton--discret" onClick={() => onRetirer(b)}>
              <Trash2 size={18} aria-hidden /> Retirer
            </button>
            <button type="button" className="bouton bouton--discret" onClick={aRacheter}>
              <RotateCcw size={18} aria-hidden /> À racheter
            </button>
            <button type="submit" form="form-produit" className="bouton bouton--action" disabled={enCours}>
              Enregistrer
            </button>
          </>
        )
      }
    >
      {b && (
        <form id="form-produit" className="formulaire" onSubmit={enregistrer}>
          <label className="champ-groupe">
            <span>Nom</span>
            <input
              className="champ"
              value={b.name}
              required
              maxLength={80}
              onChange={(e) => setBrouillon({ ...b, name: e.target.value })}
            />
          </label>
          <div className="formulaire__ligne">
            <label className="champ-groupe">
              <span>Quantité</span>
              <input
                className="champ"
                type="number"
                inputMode="decimal"
                min={0}
                step="any"
                value={b.quantity ?? ""}
                onChange={(e) =>
                  setBrouillon({ ...b, quantity: e.target.value === "" ? null : Number(e.target.value) })
                }
              />
            </label>
            <label className="champ-groupe">
              <span>Unité</span>
              <input
                className="champ"
                placeholder="g, cl, pot…"
                maxLength={20}
                value={b.unit ?? ""}
                onChange={(e) => setBrouillon({ ...b, unit: e.target.value })}
              />
            </label>
          </div>
          <fieldset className="champ-groupe">
            <legend>Niveau (au lieu d'une quantité exacte)</legend>
            <div className="puces" role="group">
              {NIVEAUX.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  className="puce"
                  aria-pressed={b.stock_level === n.id}
                  onClick={() => setBrouillon({ ...b, stock_level: b.stock_level === n.id ? null : n.id })}
                >
                  {n.label}
                </button>
              ))}
            </div>
          </fieldset>
          <div className="champ-groupe">
            <label htmlFor="date-produit">Date de l'emballage (à consommer avant)</label>
            <ChoixDate
              id="date-produit"
              valeur={b.expires_on}
              onChange={(d) => setBrouillon({ ...b, expires_on: d })}
            />
          </div>
          <div className="champ-groupe">
            <button
              type="button"
              className={"bascule" + (b.in_container ? " bascule--actif bascule--boite" : "")}
              role="switch"
              aria-checked={b.in_container}
              onClick={() =>
                setBrouillon({ ...b, in_container: !b.in_container, opened_on: !b.in_container ? (b.opened_on ?? aujourdhui()) : b.opened_on })
              }
            >
              <Package size={18} aria-hidden />
              <span>Mis dans une boîte hermétique</span>
              <span className="bascule__piste" aria-hidden>
                <span className="bascule__curseur" />
              </span>
            </button>
          </div>
          <label className="champ-groupe">
            <span>{b.in_container ? "Mis dans la boîte le" : "Ouvert le (facultatif)"}</span>
            <input
              className="champ"
              type="date"
              value={b.opened_on ?? ""}
              max={aujourdhui()}
              onChange={(e) => setBrouillon({ ...b, opened_on: e.target.value || null })}
            />
          </label>
          <label className="champ-groupe">
            <span>Note</span>
            <input
              className="champ"
              maxLength={200}
              placeholder="je pense assez jusqu'aux prochaines courses…"
              value={b.note ?? ""}
              onChange={(e) => setBrouillon({ ...b, note: e.target.value })}
            />
          </label>
          <div className="formulaire__ligne">
            <label className="champ-groupe">
              <span>Rangé dans</span>
              <select
                className="champ"
                value={b.location}
                onChange={(e) => setBrouillon({ ...b, location: e.target.value as Emplacement })}
              >
                {EMPLACEMENTS.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="champ-groupe">
              <span>Rayon</span>
              <select
                className="champ"
                value={b.category}
                onChange={(e) => setBrouillon({ ...b, category: e.target.value })}
              >
                {CATEGORIES.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </form>
      )}
    </Feuille>
  );
}
