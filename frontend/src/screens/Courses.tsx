import { useMemo, useState, type FormEvent } from "react";
import { CalendarPlus, Check, Plus, Share, Store, Trash2 } from "lucide-react";
import { Feuille } from "../components/Feuille";
import { useToast } from "../components/Toast";
import {
  analyserSaisie,
  CATEGORIES,
  deviner,
  EMPLACEMENTS,
  formatPrix,
  formatQuantite,
  type Emplacement,
} from "../lib/aliments";
import { useCatalogue } from "../lib/catalogue";
import { ajouterJours, aujourdhui, isoLocal } from "../lib/dates";
import { useDonnees, useRecettes } from "../lib/donnees";
import { besoinsDe, quoiPourRepas } from "../lib/repas";
import { estAlimentaire, RAYONS, rayon } from "../lib/rayons";
import { aAcheterPourPlanning } from "../lib/stock";
import { messageErreur, supabase, type ShoppingItem } from "../lib/supabase";

const SOURCES: Record<ShoppingItem["source"], string | null> = {
  manuel: null,
  planning: "planning",
  a_racheter: "à racheter",
  ticket: "ancien ticket",
};

/** « 6 œufs » = 6 articles ; « 500 g de lardons » = 1 article. */
const nbArticles = (s: { quantity: number | null; unit: string | null }) => (s.unit ? 1 : (s.quantity ?? 1));

export function Courses() {
  const { shopping, setShopping, meals, pantry, chargement, recharger } = useDonnees();
  const { recettes } = useRecettes();
  const { catalogue } = useCatalogue();
  const toast = useToast();
  const [saisie, setSaisie] = useState("");
  const [edition, setEdition] = useState<ShoppingItem | null>(null);
  const [archivage, setArchivage] = useState(false);
  const [magasin, setMagasin] = useState(false);

  const aAcheter = shopping.filter((s) => !s.checked);
  const panier = shopping.filter((s) => s.checked);
  const rayons = RAYONS.map((r) => ({
    ...r,
    items: aAcheter.filter((s) => rayon(s.category).id === r.id),
  })).filter((r) => r.items.length);
  const totalPanier = panier.reduce((t, s) => t + (s.total_price ?? (s.unit_price ?? 0) * nbArticles(s)), 0);

  // Repas prévus des 7 prochains jours : ce qui manque pour les cuisiner
  const manquePlanning = useMemo(() => {
    const auj = aujourdhui();
    const fin = ajouterJours(auj, 7);
    const repas = meals
      .filter((m) => m.status === "prevu" && m.eaten_on >= auj && m.eaten_on <= fin)
      .map((meal) => {
        const quoi = quoiPourRepas(meal, recettes ?? [], catalogue?.repasTypes ?? []);
        return { meal, besoins: quoi ? besoinsDe(quoi, meal.servings ?? 2) : [] };
      });
    return aAcheterPourPlanning(repas, pantry, shopping);
  }, [meals, recettes, catalogue, pantry, shopping]);

  async function ajouter(e: FormEvent) {
    e.preventDefault();
    const t = saisie.trim();
    if (!t) return;
    const s = analyserSaisie(t);
    const d = deviner(s.name);
    setSaisie("");
    const { data, error } = await supabase
      .from("shopping_items")
      .insert({
        name: d.produit && d.produit.name.toLowerCase() === s.name.toLowerCase() ? d.produit.name : s.name,
        quantity: s.quantity,
        unit: s.unit,
        category: d.categorie,
        product_id: d.produit?.id ?? null,
      })
      .select()
      .single();
    if (error) return toast(messageErreur(error), { erreur: true });
    setShopping((l) => [...l, data as ShoppingItem]);
  }

  async function depuisPlanning() {
    if (!manquePlanning.length) return;
    const lignes = manquePlanning.map(({ besoin, meal }) => ({
      name: besoin.nom,
      quantity: besoin.quantite,
      unit: besoin.unite,
      category: rayon(besoin.categorie).id,
      source: "planning",
      meal_id: meal.id,
      note: meal.title,
    }));
    const { error } = await supabase.from("shopping_items").insert(lignes);
    if (error) return toast(messageErreur(error), { erreur: true });
    await recharger("shopping_items");
    toast(`${lignes.length} article${lignes.length > 1 ? "s" : ""} ajouté${lignes.length > 1 ? "s" : ""} pour les repas prévus`);
  }

  async function maj(item: ShoppingItem, p: Partial<ShoppingItem>) {
    setShopping((l) => l.map((s) => (s.id === item.id ? { ...s, ...p } : s)));
    const { error } = await supabase.from("shopping_items").update(p).eq("id", item.id);
    if (error) {
      setShopping((l) => l.map((s) => (s.id === item.id ? item : s)));
      toast(messageErreur(error), { erreur: true });
    }
  }

  const basculer = (item: ShoppingItem) =>
    maj(item, { checked: !item.checked, checked_at: item.checked ? null : new Date().toISOString() });

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
      .map((r) => `${r.emoji} ${r.nom}\n${r.items.map((i) => `- ${i.name} ${formatQuantite(i.quantity, i.unit)}`.trim()).join("\n")}`)
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

      <div className="courses__outils">
        <button
          className={"bascule" + (magasin ? " bascule--actif" : "")}
          role="switch"
          aria-checked={magasin}
          onClick={() => setMagasin(!magasin)}
        >
          <Store size={18} aria-hidden />
          <span>Mode magasin</span>
          <span className="bascule__piste" aria-hidden>
            <span className="bascule__curseur" />
          </span>
        </button>
        {manquePlanning.length > 0 && (
          <button className="bouton bouton--discret" onClick={depuisPlanning}>
            <CalendarPlus size={18} aria-hidden /> Ajouter {manquePlanning.length} article{manquePlanning.length > 1 ? "s" : ""} des repas prévus
          </button>
        )}
      </div>
      {magasin && (
        <p className="note">En cochant un article, saisis son prix et sa date de péremption : ils iront au récapitulatif et au stock.</p>
      )}

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
          list="catalogue-produits"
        />
        <datalist id="catalogue-produits">
          {catalogue?.produits.map((p) => <option key={p.id} value={p.name} />)}
        </datalist>
        <button className="bouton bouton--action" disabled={!saisie.trim()} aria-label="Ajouter">
          <Plus size={20} />
        </button>
      </form>

      {!chargement && shopping.length === 0 && (
        <div className="vide">
          <p className="vide__titre">La liste est vide</p>
          <p>Ajoute des articles ici, ou planifie des repas : ce qui manque pour les cuisiner sera proposé d'un geste.</p>
        </div>
      )}

      {rayons.map((r) => (
        <section key={r.id} className="groupe" aria-label={r.nom}>
          <h2 className="groupe__titre">
            <span aria-hidden>{r.emoji}</span> {r.nom}
          </h2>
          <ul className="liste">
            {r.items.map((s) => (
              <LigneCourse key={s.id} item={s} onBasculer={basculer} onEditer={setEdition} />
            ))}
          </ul>
        </section>
      ))}

      {panier.length > 0 && (
        <section className="groupe groupe--panier" aria-label="Dans le panier">
          <h2 className="groupe__titre">
            Dans le panier{totalPanier > 0 && <span className="groupe__total">{formatPrix(totalPanier)}</span>}
          </h2>
          <ul className="liste">
            {panier.map((s) => (
              <LigneCourse key={s.id} item={s} onBasculer={basculer} onEditer={setEdition} magasin={magasin} onMaj={maj} />
            ))}
          </ul>
        </section>
      )}

      {panier.length > 0 && (
        <div className="barre-action">
          <button className="bouton bouton--discret" onClick={viderPanier}>
            Retirer sans archiver
          </button>
          <button className="bouton bouton--action" onClick={() => setArchivage(true)}>
            Valider & archiver ({panier.length})
          </button>
        </div>
      )}

      <EditionArticle item={edition} onFermer={() => setEdition(null)} />
      <Archivage
        ouverte={archivage}
        items={panier}
        onFermer={() => setArchivage(false)}
        onFini={() => {
          setArchivage(false);
          setMagasin(false);
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
  magasin,
  onMaj,
}: {
  item: ShoppingItem;
  onBasculer: (i: ShoppingItem) => void;
  onEditer: (i: ShoppingItem) => void;
  magasin?: boolean;
  onMaj?: (i: ShoppingItem, p: Partial<ShoppingItem>) => void;
}) {
  const q = formatQuantite(item.quantity, item.unit);
  const origine = SOURCES[item.source];
  return (
    <li className={"ligne ligne--course" + (item.checked ? " ligne--coche" : "")}>
      <button className="case" role="checkbox" aria-checked={item.checked} aria-label={item.name} onClick={() => onBasculer(item)}>
        {item.checked && <Check size={16} strokeWidth={3} />}
      </button>
      <button className="ligne__principal" onClick={() => onEditer(item)}>
        <span className="ligne__nom">{item.name}</span>
        {(q || origine || item.note || item.unit_price != null) && (
          <span className="ligne__detail">
            {q && <span>{q}</span>}
            {item.checked && item.unit_price != null && <span>{formatPrix(item.unit_price)}</span>}
            {origine && <span className="pastille">{origine}</span>}
            {item.note && <span>{item.note}</span>}
          </span>
        )}
      </button>
      {magasin && item.checked && onMaj && (
        <div className="ligne__magasin">
          <label>
            <span className="visuellement-cache">Prix de {item.name}</span>
            <input
              className="champ champ--compact"
              inputMode="decimal"
              placeholder="Prix €"
              defaultValue={item.unit_price ?? ""}
              onBlur={(e) => {
                const v = e.target.value.trim().replace(",", ".");
                const prix = v === "" ? null : Number(v);
                if (prix !== item.unit_price && (prix === null || !Number.isNaN(prix))) {
                  onMaj(item, { unit_price: prix, total_price: prix == null ? null : Math.round(prix * nbArticles(item) * 100) / 100 });
                }
              }}
            />
          </label>
          {estAlimentaire(item.category) && (
            <label>
              <span className="visuellement-cache">Date de péremption de {item.name}</span>
              <input
                type="date"
                className="champ champ--compact"
                value={item.expires_on ?? ""}
                onChange={(e) => onMaj(item, { expires_on: e.target.value || null })}
              />
            </label>
          )}
        </div>
      )}
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
      .update({ name: b.name.trim(), quantity: b.quantity, unit: b.unit?.trim() || null, category: b.category, note: b.note?.trim() || null })
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
            <input className="champ" value={b.name} required maxLength={80} onChange={(e) => setB({ ...b, name: e.target.value })} />
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
              <input className="champ" maxLength={20} value={b.unit ?? ""} onChange={(e) => setB({ ...b, unit: e.target.value })} />
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
          <label className="champ-groupe">
            <span>Note</span>
            <input className="champ" maxLength={200} value={b.note ?? ""} onChange={(e) => setB({ ...b, note: e.target.value })} />
          </label>
        </form>
      )}
    </Feuille>
  );
}

interface LigneArchive {
  id: string;
  name: string;
  category: string;
  quantity: number;
  unit: string | null;
  unit_price: string;
  expires_on: string | null;
  location: Emplacement;
  to_pantry: boolean;
  product_id: string | null;
}

/**
 * « Valider & archiver les courses » : crée le ticket dans le Récapitulatif,
 * fait entrer les articles alimentaires dans le stock et alimente le budget.
 */
function Archivage({
  ouverte,
  items,
  onFermer,
  onFini,
}: {
  ouverte: boolean;
  items: ShoppingItem[];
  onFermer: () => void;
  onFini: () => void;
}) {
  const toast = useToast();
  const { sessions } = useDonnees();
  const [lignes, setLignes] = useState<LigneArchive[]>([]);
  const [magasin, setMagasin] = useState("");
  const [paiement, setPaiement] = useState("Carte bancaire");
  const [jour, setJour] = useState(aujourdhui());
  const [ouvertAvant, setOuvertAvant] = useState(false);
  const [enCours, setEnCours] = useState(false);

  if (ouverte && !ouvertAvant) {
    setOuvertAvant(true);
    setMagasin(sessions[0]?.store_name ?? "");
    setJour(aujourdhui());
    setLignes(
      items.map((i) => {
        const d = deviner(i.name);
        return {
          id: i.id,
          name: i.name,
          category: i.category,
          quantity: i.quantity ?? 1,
          unit: i.unit,
          unit_price: i.unit_price != null ? String(i.unit_price).replace(".", ",") : "",
          expires_on: i.expires_on ?? (d.jours != null ? ajouterJours(aujourdhui(), d.jours) : null),
          location: rayon(i.category).emplacement,
          to_pantry: estAlimentaire(i.category),
          product_id: i.product_id ?? d.produit?.id ?? null,
        };
      }),
    );
  }
  if (!ouverte && ouvertAvant) setOuvertAvant(false);

  const prix = (l: LigneArchive) => {
    const v = Number(l.unit_price.replace(",", "."));
    return l.unit_price.trim() === "" || Number.isNaN(v) ? 0 : v;
  };
  const total = lignes.reduce((t, l) => t + prix(l) * (l.unit ? 1 : l.quantity), 0);
  const alimentaire = lignes.filter((l) => estAlimentaire(l.category)).reduce((t, l) => t + prix(l) * (l.unit ? 1 : l.quantity), 0);

  async function valider() {
    setEnCours(true);
    const heure = new Date();
    const [a, m, j] = jour.split("-").map(Number);
    const date = new Date(a, m - 1, j, heure.getHours(), heure.getMinutes());
    const { error } = await supabase.rpc("archiver_courses", {
      p_session: {
        purchased_at: date.toISOString(),
        store_name: magasin.trim() || "Courses",
        payment_method: paiement.trim() || null,
        source: "liste",
      },
      p_items: lignes.map((l) => {
        const pu = prix(l);
        const qte = l.unit ? 1 : l.quantity; // « 500 g » = un article
        return {
          raw_label: l.name,
          matched_name: l.name,
          product_id: l.product_id,
          category: l.category,
          quantity: qte,
          unit_price: pu,
          total_price: Math.round(pu * qte * 100) / 100,
          expires_on: l.expires_on,
          to_pantry: l.to_pantry,
          location: l.location,
          unit: l.unit,
          pantry_quantity: l.quantity,
        };
      }),
      p_shopping_ids: lignes.map((l) => l.id),
    });
    setEnCours(false);
    if (error) return toast(messageErreur(error), { erreur: true });
    const enStock = lignes.filter((l) => l.to_pantry).length;
    toast(`Courses archivées : ${formatPrix(total)}, ${enStock} produit${enStock > 1 ? "s" : ""} en stock`);
    onFini();
  }

  const majLigne = (id: string, p: Partial<LigneArchive>) => setLignes((l) => l.map((x) => (x.id === id ? { ...x, ...p } : x)));

  return (
    <Feuille
      ouverte={ouverte}
      titre="Valider & archiver les courses"
      onFermer={onFermer}
      large
      pied={
        <button className="bouton bouton--action bouton--plein" onClick={valider} disabled={enCours}>
          Archiver {formatPrix(total)}
        </button>
      }
    >
      <div className="formulaire">
        <div className="formulaire__ligne">
          <label className="champ-groupe">
            <span>Magasin</span>
            <input className="champ" placeholder="Carrefour Lille, Leclerc, Drive…" value={magasin} onChange={(e) => setMagasin(e.target.value)} />
          </label>
          <label className="champ-groupe">
            <span>Jour</span>
            <input className="champ" type="date" value={jour} max={isoLocal(new Date())} onChange={(e) => setJour(e.target.value || aujourdhui())} />
          </label>
        </div>
        <label className="champ-groupe">
          <span>Paiement</span>
          <input className="champ" value={paiement} onChange={(e) => setPaiement(e.target.value)} />
        </label>
        <p className="note">
          Alimentaire {formatPrix(alimentaire)} · Maison & hygiène {formatPrix(total - alimentaire)}. Les articles cochés « stock »
          entrent dans l'inventaire avec leur date.
        </p>
        <ul className="archivage">
          {lignes.map((l) => (
            <li key={l.id} className="archivage__ligne">
              <span className="archivage__nom">
                {l.name}
                <span className="note">
                  {rayon(l.category).emoji} {formatQuantite(l.quantity, l.unit)}
                </span>
              </span>
              <input
                className="champ champ--compact archivage__prix"
                inputMode="decimal"
                aria-label={`Prix de ${l.name}`}
                placeholder="Prix €"
                value={l.unit_price}
                onChange={(e) => majLigne(l.id, { unit_price: e.target.value })}
              />
              <label className="archivage__stock">
                <input type="checkbox" checked={l.to_pantry} onChange={(e) => majLigne(l.id, { to_pantry: e.target.checked })} />
                <span>Stock</span>
              </label>
              {l.to_pantry && (
                <>
                  <select
                    className="champ champ--compact"
                    aria-label={`Emplacement de ${l.name}`}
                    value={l.location}
                    onChange={(e) => majLigne(l.id, { location: e.target.value as Emplacement })}
                  >
                    {EMPLACEMENTS.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.court}
                      </option>
                    ))}
                  </select>
                  <input
                    type="date"
                    className="champ champ--compact"
                    aria-label={`Date de péremption de ${l.name}`}
                    value={l.expires_on ?? ""}
                    onChange={(e) => majLigne(l.id, { expires_on: e.target.value || null })}
                  />
                </>
              )}
            </li>
          ))}
        </ul>
      </div>
    </Feuille>
  );
}
