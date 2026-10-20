import { cleAliment } from "./normaliser";
import { RAYONS, rayon, type RayonId } from "./rayons";
import type { Emplacement, NiveauStock, Product } from "./supabase";

export type { Emplacement } from "./supabase";

/** Rayons sous la forme {id, label, jours}, pour les listes déroulantes. */
export const CATEGORIES: { id: RayonId; label: string; jours: number | null }[] = RAYONS.map((r) => ({
  id: r.id,
  label: `${r.emoji} ${r.nom}`,
  jours: r.jours,
}));

export const EMPLACEMENTS: { id: Emplacement; label: string; court: string }[] = [
  { id: "frigo", label: "Frigo", court: "Frigo" },
  { id: "corbeille", label: "Corbeille à fruits", court: "Corbeille" },
  { id: "placard", label: "Placard", court: "Placard" },
  { id: "congelateur", label: "Congélateur", court: "Congélo" },
  { id: "maison", label: "Salle de bain & maison", court: "Maison" },
];

export const NIVEAUX: { id: NiveauStock; label: string; court: string; part: number }[] = [
  { id: "plein", label: "Plein", court: "Plein", part: 1 },
  { id: "moitie", label: "Moitié", court: "Moitié", part: 0.5 },
  { id: "un_repas", label: "Assez pour 1 repas", court: "1 repas", part: 0.3 },
  { id: "fin", label: "Presque fini", court: "Presque fini", part: 0.1 },
];

export const labelCategorie = (c: string) => `${rayon(c).emoji} ${rayon(c).nom}`;
export const labelEmplacement = (e: string) => EMPLACEMENTS.find((x) => x.id === e)?.label ?? e;
export const labelNiveau = (n: string | null) => NIVEAUX.find((x) => x.id === n)?.label ?? "";

/**
 * Dictionnaire de secours : mot-clé → rayon (+ durée de conservation typique en jours).
 * Le catalogue de produits du foyer (table products) est consulté en priorité ;
 * le mot-clé le plus long qui correspond l'emporte (« lait de coco » avant « lait »).
 */
const DICO: [string, RayonId, number?][] = [
  // Fruits et légumes
  ["tomate", "fruits_legumes", 6], ["carotte", "fruits_legumes", 14], ["courgette", "fruits_legumes", 6],
  ["poivron", "fruits_legumes", 7], ["aubergine", "fruits_legumes", 6], ["oignon", "fruits_legumes", 30],
  ["ail", "fruits_legumes", 30], ["echalote", "fruits_legumes", 30], ["salade", "fruits_legumes", 4],
  ["laitue", "fruits_legumes", 4], ["epinard", "fruits_legumes", 3], ["poireau", "fruits_legumes", 10],
  ["chou", "fruits_legumes", 14], ["brocoli", "fruits_legumes", 5], ["champignon", "fruits_legumes", 4],
  ["pomme", "fruits_legumes", 21], ["poire", "fruits_legumes", 7], ["banane", "fruits_legumes", 5],
  ["orange", "fruits_legumes", 14], ["citron", "fruits_legumes", 21], ["fraise", "fruits_legumes", 3],
  ["raisin", "fruits_legumes", 6], ["kiwi", "fruits_legumes", 10], ["avocat", "fruits_legumes", 4],
  ["concombre", "fruits_legumes", 7], ["radis", "fruits_legumes", 5], ["potiron", "fruits_legumes", 30],
  ["courge", "fruits_legumes", 30], ["butternut", "fruits_legumes", 30], ["haricot vert", "fruits_legumes", 4],
  ["persil", "fruits_legumes", 5], ["basilic", "fruits_legumes", 5], ["coriandre", "fruits_legumes", 5],
  ["menthe", "fruits_legumes", 5], ["pomme de terre", "fruits_legumes", 30], ["patate", "fruits_legumes", 30],
  ["navet", "fruits_legumes", 14], ["betterave", "fruits_legumes", 7], ["mangue", "fruits_legumes", 5],
  ["ananas", "fruits_legumes", 5], ["peche", "fruits_legumes", 4], ["abricot", "fruits_legumes", 4],
  ["cerise", "fruits_legumes", 4], ["clementine", "fruits_legumes", 10], ["mandarine", "fruits_legumes", 10],
  ["melon", "fruits_legumes", 5], ["fenouil", "fruits_legumes", 7], ["celeri", "fruits_legumes", 10],
  ["gingembre", "fruits_legumes", 21], ["myrtille", "fruits_legumes", 4], ["nectarine", "fruits_legumes", 4],
  ["compote", "fruits_legumes", 30],
  // Produits frais
  ["lait", "produits_frais", 7], ["beurre", "produits_frais", 30], ["creme", "produits_frais", 10],
  ["yaourt", "produits_frais", 14], ["fromage", "produits_frais", 14], ["fromage blanc", "produits_frais", 7],
  ["emmental", "produits_frais", 21], ["gruyere", "produits_frais", 21], ["comte", "produits_frais", 21],
  ["mozzarella", "produits_frais", 5], ["parmesan", "produits_frais", 30], ["reblochon", "produits_frais", 14],
  ["camembert", "produits_frais", 14], ["chevre", "produits_frais", 10], ["feta", "produits_frais", 10],
  ["ricotta", "produits_frais", 5], ["mascarpone", "produits_frais", 7], ["oeuf", "produits_frais", 21],
  ["skyr", "produits_frais", 14], ["cheddar", "produits_frais", 21], ["pate brisee", "produits_frais", 14],
  ["pate feuilletee", "produits_frais", 14], ["pate a pizza", "produits_frais", 10],
  // Viandes et poissons
  ["poulet", "viandes_poissons", 2], ["dinde", "viandes_poissons", 2], ["boeuf", "viandes_poissons", 3],
  ["steak", "viandes_poissons", 3], ["hache", "viandes_poissons", 1], ["porc", "viandes_poissons", 3],
  ["jambon", "viandes_poissons", 5], ["lardon", "viandes_poissons", 10], ["saucisse", "viandes_poissons", 4],
  ["chorizo", "viandes_poissons", 30], ["veau", "viandes_poissons", 2], ["agneau", "viandes_poissons", 3],
  ["canard", "viandes_poissons", 3], ["saumon", "viandes_poissons", 2], ["cabillaud", "viandes_poissons", 2],
  ["crevette", "viandes_poissons", 2], ["poisson", "viandes_poissons", 2], ["merguez", "viandes_poissons", 3],
  ["roti", "viandes_poissons", 3], ["escalope", "viandes_poissons", 2], ["moule", "viandes_poissons", 2],
  ["cordon bleu", "viandes_poissons", 5], ["calamar", "viandes_poissons", 2],
  // Féculents
  ["pain", "feculents", 3], ["baguette", "feculents", 1], ["brioche", "feculents", 5],
  ["croissant", "feculents", 2], ["pain de mie", "feculents", 10], ["pate", "feculents"],
  ["spaghetti", "feculents"], ["riz", "feculents"], ["semoule", "feculents"], ["quinoa", "feculents"],
  ["lentille", "feculents"], ["pois chiche", "feculents"], ["tortilla", "feculents"], ["lasagne", "feculents"],
  ["cereale", "feculents"], ["nouille", "feculents"], ["ravioli", "feculents", 5],
  // Surgelés
  ["surgele", "surgeles", 90], ["glace", "surgeles", 180], ["petit pois", "surgeles", 90],
  ["frite", "surgeles", 90], ["poelee", "surgeles", 90],
  // Épicerie sucrée
  ["sucre", "epicerie_sucree"], ["chocolat", "epicerie_sucree"], ["biscuit", "epicerie_sucree"],
  ["confiture", "epicerie_sucree"], ["miel", "epicerie_sucree"], ["nutella", "epicerie_sucree"],
  ["bonbon", "epicerie_sucree"], ["chantilly", "epicerie_sucree", 14],
  // Épicerie salée
  ["farine", "epicerie_salee"], ["sel", "epicerie_salee"], ["huile", "epicerie_salee"],
  ["vinaigre", "epicerie_salee"], ["conserve", "epicerie_salee"], ["thon", "epicerie_salee"],
  ["haricot rouge", "epicerie_salee"], ["cafe", "epicerie_salee"], ["the", "epicerie_salee"],
  ["moutarde", "epicerie_salee"], ["ketchup", "epicerie_salee"], ["mayonnaise", "epicerie_salee"],
  ["epice", "epicerie_salee"], ["bouillon", "epicerie_salee"], ["levure", "epicerie_salee"],
  ["lait de coco", "epicerie_salee"], ["tomate concassee", "epicerie_salee"], ["coulis", "epicerie_salee"],
  ["olive", "epicerie_salee"], ["sauce", "epicerie_salee"],
  // Boissons
  ["eau", "boissons"], ["jus", "boissons", 7], ["soda", "boissons"], ["vin", "boissons"],
  ["biere", "boissons"], ["sirop", "boissons"],
  // Apéro
  ["chip", "apero"], ["cacahuete", "apero"], ["saucisson", "apero", 30], ["noix de cajou", "apero"],
  // Hygiène
  ["savon", "hygiene"], ["shampo", "hygiene"], ["gel douche", "hygiene"], ["dentifrice", "hygiene"],
  ["deodorant", "hygiene"], ["coton", "hygiene"], ["brosse a dent", "hygiene"], ["rasoir", "hygiene"],
  // Entretien
  ["lessive", "entretien"], ["liquide vaisselle", "entretien"], ["eponge", "entretien"],
  ["papier toilette", "entretien"], ["essuie tout", "entretien"], ["mouchoir", "entretien"],
  ["sac poubelle", "entretien"], ["nettoyant", "entretien"], ["javel", "entretien"],
];

interface Entree {
  cle: string;
  cat: RayonId;
  jours?: number;
  produit?: Product;
}

const DICO_CLE: Entree[] = DICO.map(([mot, cat, jours]) => ({ cle: cleAliment(mot), cat, jours }));

let index: Entree[] = trierIndex(DICO_CLE);

function trierIndex(e: Entree[]) {
  return [...e].sort((a, b) => b.cle.length - a.cle.length || (a.produit ? -1 : 1));
}

/** Branche le catalogue de produits du foyer sur la devinette (appelé au chargement). */
export function definirCatalogue(produits: Product[]) {
  const depuisCatalogue: Entree[] = [];
  for (const p of produits) {
    const cles = p.keywords.length ? p.keywords : [cleAliment(p.name)];
    for (const c of cles) {
      const jours = DICO_CLE.find((d) => d.cle === cleAliment(c))?.jours;
      depuisCatalogue.push({ cle: cleAliment(c), cat: rayon(p.aisle_id).id, jours, produit: p });
    }
  }
  index = trierIndex([...depuisCatalogue, ...DICO_CLE]);
}

export interface Devinette {
  categorie: RayonId;
  jours: number | null;
  emplacement: Emplacement;
  produit: Product | null;
}

/** Devine le rayon, la durée de conservation, l'emplacement et le produit du catalogue. */
export function deviner(nom: string): Devinette {
  const n = " " + cleAliment(nom);
  if (n.includes(" surgel")) {
    return { categorie: "surgeles", jours: 90, emplacement: "congelateur", produit: null };
  }
  const trouve = index.find((d) => n.includes(" " + d.cle));
  const categorie = trouve?.cat ?? "autre";
  return {
    categorie,
    jours: trouve ? (trouve.jours ?? rayon(categorie).jours) : null,
    emplacement: emplacementPour(categorie),
    produit: trouve?.produit ?? null,
  };
}

export function emplacementPour(c: string): Emplacement {
  return rayon(c).emplacement;
}

const UNITES =
  "kg|g|gr|l|cl|ml|pots?|bo[iî]tes?|tranches?|paquets?|bouteilles?|sachets?|barquettes?|bottes?|filets?|douzaines?";

export interface Saisie {
  name: string;
  quantity: number | null;
  unit: string | null;
}

/** "2 kg pommes de terre" → { quantity: 2, unit: "kg", name: "Pommes de terre" } */
export function analyserSaisie(texte: string): Saisie {
  const t = texte.trim().replace(/\s+/g, " ");
  const m = t.match(new RegExp(`^(\\d+(?:[.,]\\d+)?)\\s*(${UNITES})?\\.?\\s+(?:de |d'|d’)?(.+)$`, "i"));
  if (m) {
    const quantity = Number(m[1].replace(",", "."));
    const unit = m[2] ? m[2].toLowerCase().replace("gr", "g") : null;
    return { name: capitaliser(m[3]), quantity, unit };
  }
  // "Lait x2"
  const x = t.match(/^(.+?)\s*[x×]\s*(\d+)$/i);
  if (x) return { name: capitaliser(x[1]), quantity: Number(x[2]), unit: null };
  return { name: capitaliser(t), quantity: null, unit: null };
}

export function capitaliser(s: string): string {
  const t = s.trim();
  return t ? t[0].toLocaleUpperCase("fr-FR") + t.slice(1) : t;
}

export function formatQuantite(q: number | null, u: string | null): string {
  if (q == null) return u ?? "";
  if (q === 1 && !u) return "";
  const n = Number.isInteger(q) ? String(q) : q.toLocaleString("fr-FR");
  return u ? `${n} ${u}` : `×${n}`;
}

export function formatPrix(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return "–";
  return v.toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
}
