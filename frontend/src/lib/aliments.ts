import { cleAliment } from "./normaliser";

export type Categorie =
  | "fruits_legumes"
  | "cremerie"
  | "viande_poisson"
  | "boulangerie"
  | "epicerie"
  | "surgeles"
  | "boissons"
  | "autre";

export type Emplacement = "frigo" | "congelateur" | "placard" | "corbeille";

export const CATEGORIES: { id: Categorie; label: string; jours: number | null }[] = [
  { id: "fruits_legumes", label: "Fruits et légumes", jours: 7 },
  { id: "cremerie", label: "Crèmerie et œufs", jours: 10 },
  { id: "viande_poisson", label: "Viande et poisson", jours: 3 },
  { id: "boulangerie", label: "Boulangerie", jours: 3 },
  { id: "epicerie", label: "Épicerie", jours: null },
  { id: "surgeles", label: "Surgelés", jours: 90 },
  { id: "boissons", label: "Boissons", jours: null },
  { id: "autre", label: "Autre", jours: null },
];

export const EMPLACEMENTS: { id: Emplacement; label: string }[] = [
  { id: "frigo", label: "Frigo" },
  { id: "corbeille", label: "Corbeille à fruits" },
  { id: "placard", label: "Placard" },
  { id: "congelateur", label: "Congélateur" },
];

export const labelCategorie = (c: string) =>
  CATEGORIES.find((x) => x.id === c)?.label ?? "Autre";
export const labelEmplacement = (e: string) =>
  EMPLACEMENTS.find((x) => x.id === e)?.label ?? e;

/**
 * Dictionnaire : mot-clé → catégorie (+ durée de conservation typique en jours).
 * Le mot-clé le plus long qui correspond l'emporte ("lait de coco" avant "lait").
 */
const DICO: [string, Categorie, number?][] = [
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
  // Crèmerie
  ["lait", "cremerie", 7], ["beurre", "cremerie", 30], ["creme", "cremerie", 10], ["yaourt", "cremerie", 14],
  ["fromage", "cremerie", 14], ["fromage blanc", "cremerie", 7], ["emmental", "cremerie", 21],
  ["gruyere", "cremerie", 21], ["comte", "cremerie", 21], ["mozzarella", "cremerie", 5],
  ["parmesan", "cremerie", 30], ["reblochon", "cremerie", 14], ["camembert", "cremerie", 14],
  ["chevre", "cremerie", 10], ["feta", "cremerie", 10], ["ricotta", "cremerie", 5],
  ["mascarpone", "cremerie", 7], ["oeuf", "cremerie", 21], ["skyr", "cremerie", 14],
  ["pate brisee", "cremerie", 14], ["pate feuilletee", "cremerie", 14], ["pate a pizza", "cremerie", 10],
  // Viande et poisson
  ["poulet", "viande_poisson", 2], ["dinde", "viande_poisson", 2], ["boeuf", "viande_poisson", 3],
  ["steak", "viande_poisson", 3], ["hache", "viande_poisson", 1], ["porc", "viande_poisson", 3],
  ["jambon", "viande_poisson", 5], ["lardon", "viande_poisson", 10], ["saucisse", "viande_poisson", 4],
  ["chorizo", "viande_poisson", 30], ["veau", "viande_poisson", 2], ["agneau", "viande_poisson", 3],
  ["canard", "viande_poisson", 3], ["saumon", "viande_poisson", 2], ["cabillaud", "viande_poisson", 2],
  ["crevette", "viande_poisson", 2], ["poisson", "viande_poisson", 2], ["merguez", "viande_poisson", 3],
  ["roti", "viande_poisson", 3], ["escalope", "viande_poisson", 2],
  // Boulangerie
  ["pain", "boulangerie", 3], ["baguette", "boulangerie", 1], ["brioche", "boulangerie", 5],
  ["croissant", "boulangerie", 2], ["pain de mie", "boulangerie", 10],
  // Épicerie
  ["pate", "epicerie"], ["spaghetti", "epicerie"], ["riz", "epicerie"], ["farine", "epicerie"],
  ["sucre", "epicerie"], ["sel", "epicerie"], ["huile", "epicerie"], ["vinaigre", "epicerie"],
  ["conserve", "epicerie"], ["thon", "epicerie"], ["lentille", "epicerie"], ["pois chiche", "epicerie"],
  ["haricot rouge", "epicerie"], ["cafe", "epicerie"], ["the", "epicerie"], ["chocolat", "epicerie"],
  ["biscuit", "epicerie"], ["cereale", "epicerie"], ["confiture", "epicerie"], ["miel", "epicerie"],
  ["moutarde", "epicerie"], ["ketchup", "epicerie"], ["mayonnaise", "epicerie"], ["epice", "epicerie"],
  ["bouillon", "epicerie"], ["levure", "epicerie"], ["lait de coco", "epicerie"],
  ["tomate concassee", "epicerie"], ["coulis", "epicerie"], ["olive", "epicerie"], ["semoule", "epicerie"],
  ["quinoa", "epicerie"], ["tortilla", "epicerie"], ["sauce", "epicerie"], ["lasagne", "epicerie"],
  ["compote", "epicerie"],
  // Surgelés
  ["surgele", "surgeles", 90], ["glace", "surgeles", 180], ["petit pois", "surgeles", 90],
  ["frite", "surgeles", 90],
  // Boissons
  ["eau", "boissons"], ["jus", "boissons", 7], ["soda", "boissons"], ["vin", "boissons"],
  ["biere", "boissons"], ["sirop", "boissons"],
];

const DICO_CLE = DICO.map(([mot, cat, jours]) => ({ cle: cleAliment(mot), cat, jours }))
  .sort((a, b) => b.cle.length - a.cle.length);

export interface Devinette {
  categorie: Categorie;
  jours: number | null;
  emplacement: Emplacement;
}

/** Devine la catégorie, la durée de conservation et l'emplacement d'un aliment. */
export function deviner(nom: string): Devinette {
  const n = " " + cleAliment(nom);
  if (n.includes(" surgel")) {
    return { categorie: "surgeles", jours: 90, emplacement: "congelateur" };
  }
  const trouve = DICO_CLE.find((d) => n.includes(" " + d.cle));
  const categorie = trouve?.cat ?? "autre";
  const jours =
    trouve?.jours ?? CATEGORIES.find((c) => c.id === categorie)?.jours ?? null;
  return { categorie, jours, emplacement: emplacementPour(categorie) };
}

export function emplacementPour(c: string): Emplacement {
  switch (c) {
    case "surgeles":
      return "congelateur";
    case "epicerie":
    case "boissons":
      return "placard";
    case "fruits_legumes":
      return "corbeille";
    default:
      return "frigo";
  }
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
