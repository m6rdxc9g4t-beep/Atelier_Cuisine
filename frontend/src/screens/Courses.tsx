import { useState, type FormEvent } from "react";
import { Check, Plus, Share, Trash2 } from "lucide-react";
import { Feuille } from "../components/Feuille";
import { useToast } from "../components/Toast";
import {
  analyserSaisie,
  CATEGORIES,
  deviner,
  EMPLACEMENTS,
  emplacementPour,
  formatQuantite,
  type Emplacement,
} from "../lib/aliments";
import { ajouterJours, aujourdhui } from "../lib/dates";
import { useDonnees } from "../lib/donnees";
import { messageErreur, supabase, type ShoppingItem } from "../lib/supabase";

// Ordre d'un parcours de supermarché classique
const ORDRE_RAYONS = [
  "fruits_legumes",
  "boulangerie",
  "cremerie",
  "viande_poisson",
  "epicerie",
  "surgeles",
  "boissons",
  "autre",
];

export function Courses() {
  const { shopping, setShopping, chargement, recharger } = useDonnees();
  const toast = useToast();
  const [saisie, setSaisie] = useState("");
  const [edition, setEdition] = useState<ShoppingItem | null>(null);
  const [rangement, setRangement] = useState(false);

  const aAcheter = shopping.filter((s) => !s.checked);
  const panier = shopping.filter((s) => s.checked);
  const rayons = ORDRE_RAYONS.map((id) => ({
    id,
    label: CATEGORIES.find((c) => c.id === id)!.label,
    items: aAcheter.filter((s) => (ORDRE_RAYONS.includes(s.category) ? s.category : "autre") === id),
  })).filter((r) => r.items.length);

  async function ajouter(e: FormEvent) {
    e.preventDefault();
    const t = saisie.trim();
    if (!t) return;
    const s = analyserSaisie(t);
    const { categorie } = deviner(s.name);
    setSaisie("");
    const { data, error } = await supabase
      .from("shopping_items")
      .insert({ name: s.name, quantity: s.quantity, unit: s.unit, category: categorie })
      .select()
      .single();
    if (error) return toast(messageErreur(error), { erreur: true });
    setShopping((l) => [...l, data as ShoppingItem]);
  }

  async function basculer(item: ShoppingItem) {
    const checked = !item.checked;
    setShopping((l) => l.map((s) => (s.id === item.id ? { ...s, checked } : s)));
    const { error } = await supabase
      .from("shopping_items")
      .update({ checked, checked_at: checked ? new Date().toISOString() : null })
      .eq("id", item.id);
    if (error) {
      setShopping((l) => l.map((s) => (s.id === item.id ? item : s)));
      toast(messageErreur(error), { erreur: true });
    }
  }

  async function viderPanier() {
    const ids = panier.map((p) => p.id);
    const avant = shopping;
    setShopping((l) => l.filter((s) => !ids.includes(s.id)));
    const { error } = await supabase.from("shopping_items").delete().in("id", ids);
    if (error) {
      setShopping(avant);
      return toast(messageErreur(error), { erreur: true });
    }
    toast(`${ids.length} article${ids.length > 1 ? "s" : ""} retiré${ids.length > 1 ? "s" : ""} de la liste`);
  }

  async function partager() {
    const texte = rayons
      .map((r) => `${r.label}\n${r.items.map((i) => `- ${i.name} ${formatQuantite(i.quantity, i.unit)}`.trim()).join("\n")}`)
      .join("\n\n");
    try {
      if (navigator.share) await navigator.share({ title: "Liste de courses", text: texte });
      else {
        await navigator.clipboard.writeText(texte);
        toast("Liste copiée");
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") toast("Impossible de partager la liste", { erreur: true });
    }
  }

  return (
    <div className="ecran">
      <header className="ecran__tete ecran__tete--avec-action">
        <div>
          <h1>Courses</h1>
          <p className="ecran__sous-titre">
            {aAcheter.length === 0
              ? "Rien à acheter pour l'instant"
              : `${aAcheter.length} article${aAcheter.length > 1 ? "s" : ""} à acheter`}
          </p>
        </div>
        {aAcheter.length > 0 && (
          <button className="bouton bouton--discret" onClick={partager}>
            <Share size={18} aria-hidden /> Partager
          </button>
        )}
      </header>

      <form className="ajout-rapide" onSubmit={ajouter}>
        <label htmlFor="ajout-courses" className="visuellement-cache">
          Ajouter à la liste
        </label>
        <input
          id="ajout-courses"
          className="champ champ--grand"
          placeholder="Ajouter… ex. 2 kg de patates"
          value={saisie}
          onChange={(e) => setSaisie(e.target.value)}
          autoComplete="off"
          enterKeyHint="done"
        />
        <button className="bouton bouton--action" disabled={!saisie.trim()} aria-label="Ajouter">
          <Plus size={20} />
        </button>
      </form>

      {!chargement && shopping.length === 0 && (
        <div className="vide">
          <p className="vide__titre">La liste est vide</p>
          <p>
            Ajoute des articles ici, ou depuis une idée de plat : les ingrédients qui manquent y sont ajoutés
            d'un geste.
          </p>
        </div>
      )}

      {rayons.map((r) => (
        <section key={r.id} className="groupe" aria-label={r.label}>
          <h2 className="groupe__titre">{r.label}</h2>
          <ul className="liste">
            {r.items.map((s) => (
              <LigneCourse key={s.id} item={s} onBasculer={basculer} onEditer={setEdition} />
            ))}
          </ul>
        </section>
      ))}

      {panier.length > 0 && (
        <section className="groupe groupe--panier" aria-label="Dans le panier">
          <h2 className="groupe__titre">Dans le panier</h2>
          <ul className="liste">
            {panier.map((s) => (
              <LigneCourse key={s.id} item={s} onBasculer={basculer} onEditer={setEdition} />
            ))}
          </ul>
        </section>
      )}

      {panier.length > 0 && (
        <div className="barre-action">
          <button className="bouton bouton--discret" onClick={viderPanier}>
            Retirer sans ranger
          </button>
          <button className="bouton bouton--action" onClick={() => setRangement(true)}>
            Ranger {panier.length} achat{panier.length > 1 ? "s" : ""}
          </button>
        </div>
      )}

      <EditionArticle item={edition} onFermer={() => setEdition(null)} />
      <Rangement
        ouverte={rangement}
        items={panier}
        onFermer={() => setRangement(false)}
        onRange={() => {
          setRangement(false);
          recharger();
        }}
      />
    </div>
  );
}

function LigneCourse({
  item,
  onBasculer,
  onEditer,
}: {
  item: ShoppingItem;
  onBasculer: (i: ShoppingItem) => void;
  onEditer: (i: ShoppingItem) => void;
}) {
  const q = formatQuantite(item.quantity, item.unit);
  return (
    <li className={"ligne ligne--course" + (item.checked ? " ligne--coche" : "")}>
      <button
        className="case"
        role="checkbox"
        aria-checked={item.checked}
        aria-label={item.name}
        onClick={() => onBasculer(item)}
      >
        {item.checked && <Check size={16} strokeWidth={3} />}
      </button>
      <button className="ligne__principal" onClick={() => onEditer(item)}>
        <span className="ligne__nom">{item.name}</span>
        {q && <span className="ligne__detail">{q}</span>}
      </button>
    </li>
  );
}

function EditionArticle({ item, onFermer }: { item: ShoppingItem | null; onFermer: () => void }) {
  const { setShopping } = useDonnees();
  const toast = useToast();
  const [b, setB] = useState<ShoppingItem | null>(item);
  if (item && b?.id !== item.id) setB(item);

  async function enregistrer(e: FormEvent) {
    e.preventDefault();
    if (!b) return;
    const { error } = await supabase
      .from("shopping_items")
      .update({ name: b.name.trim(), quantity: b.quantity, unit: b.unit?.trim() || null, category: b.category })
      .eq("id", b.id);
    if (error) return toast(messageErreur(error), { erreur: true });
    setShopping((l) => l.map((s) => (s.id === b.id ? b : s)));
    onFermer();
  }

  async function supprimer() {
    if (!b) return;
    const { error } = await supabase.from("shopping_items").delete().eq("id", b.id);
    if (error) return toast(messageErreur(error), { erreur: true });
    setShopping((l) => l.filter((s) => s.id !== b.id));
    onFermer();
  }

  return (
    <Feuille
      ouverte={!!item}
      titre={item?.name ?? ""}
      onFermer={onFermer}
      pied={
        <>
          <button type="button" className="bouton bouton--discret" onClick={supprimer}>
            <Trash2 size={18} aria-hidden /> Supprimer
          </button>
          <button type="submit" form="form-article" className="bouton bouton--action">
            Enregistrer
          </button>
        </>
      }
    >
      {b && (
        <form id="form-article" className="formulaire" onSubmit={enregistrer}>
          <label className="champ-groupe">
            <span>Nom</span>
            <input
              className="champ"
              value={b.name}
              required
              maxLength={80}
              onChange={(e) => setB({ ...b, name: e.target.value })}
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
                onChange={(e) => setB({ ...b, quantity: e.target.value === "" ? null : Number(e.target.value) })}
              />
            </label>
            <label className="champ-groupe">
              <span>Unité</span>
              <input
                className="champ"
                maxLength={20}
                value={b.unit ?? ""}
                onChange={(e) => setB({ ...b, unit: e.target.value })}
              />
            </label>
          </div>
          <label className="champ-groupe">
            <span>Rayon</span>
            <select className="champ" value={b.category} onChange={(e) => setB({ ...b, category: e.target.value })}>
              {CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
        </form>
      )}
    </Feuille>
  );
}

interface LigneRangement {
  id: string;
  name: string;
  location: Emplacement;
  expires_on: string | null;
}

/** Range les articles cochés dans le garde-manger avec une date estimée par produit. */
function Rangement({
  ouverte,
  items,
  onFermer,
  onRange,
}: {
  ouverte: boolean;
  items: ShoppingItem[];
  onFermer: () => void;
  onRange: () => void;
}) {
  const toast = useToast();
  const [lignes, setLignes] = useState<LigneRangement[]>([]);
  const [ouvertAvant, setOuvertAvant] = useState(false);
  const [enCours, setEnCours] = useState(false);

  // Prépare les estimations à chaque ouverture
  if (ouverte && !ouvertAvant) {
    setOuvertAvant(true);
    setLignes(
      items.map((i) => {
        const d = deviner(i.name);
        return {
          id: i.id,
          name: i.name,
          location: i.category === d.categorie ? d.emplacement : emplacementPour(i.category),
          expires_on: d.jours != null ? ajouterJours(aujourdhui(), d.jours) : null,
        };
      }),
    );
  }
  if (!ouverte && ouvertAvant) setOuvertAvant(false);

  async function ranger() {
    setEnCours(true);
    const { data, error } = await supabase.rpc("store_shopping_items", { p_items: lignes });
    setEnCours(false);
    if (error) return toast(messageErreur(error), { erreur: true });
    toast(`${data ?? lignes.length} produit${lignes.length > 1 ? "s" : ""} rangé${lignes.length > 1 ? "s" : ""} dans le garde-manger`);
    onRange();
  }

  const maj = (id: string, p: Partial<LigneRangement>) =>
    setLignes((l) => l.map((x) => (x.id === id ? { ...x, ...p } : x)));

  return (
    <Feuille
      ouverte={ouverte}
      titre="Ranger les achats"
      onFermer={onFermer}
      large
      pied={
        <button className="bouton bouton--action bouton--plein" onClick={ranger} disabled={enCours}>
          Ranger dans le garde-manger
        </button>
      }
    >
      <p className="note">Les dates sont estimées selon le produit. Corrige-les avec celles des emballages.</p>
      <ul className="rangement">
        {lignes.map((l) => (
          <li key={l.id} className="rangement__ligne">
            <span className="rangement__nom">{l.name}</span>
            <select
              className="champ champ--compact"
              aria-label={`Emplacement de ${l.name}`}
              value={l.location}
              onChange={(e) => maj(l.id, { location: e.target.value as Emplacement })}
            >
              {EMPLACEMENTS.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.label}
                </option>
              ))}
            </select>
            <input
              type="date"
              className="champ champ--compact"
              aria-label={`Date de péremption de ${l.name}`}
              value={l.expires_on ?? ""}
              onChange={(e) => maj(l.id, { expires_on: e.target.value || null })}
            />
          </li>
        ))}
      </ul>
    </Feuille>
  );
}
