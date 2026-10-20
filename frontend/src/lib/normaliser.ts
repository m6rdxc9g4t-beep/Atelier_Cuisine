// Même logique que public.normaliser / public.cle_aliment côté base de données
// (backend/supabase/migrations). Toute modification doit être faite des deux côtés.

const AVEC = "àâäáãåçéèêëíìîïñóòôöõúùûüýÿ'’-";
const SANS = "aaaaaaceeeeiiiinooooouuuuyy   ";
const TABLE = new Map([...AVEC].map((c, i) => [c, SANS[i]]));

/** Minuscules, sans accents, espaces propres. */
export function normaliser(texte: string | null | undefined): string {
  const bas = (texte ?? "").toLowerCase().replaceAll("œ", "oe").replaceAll("æ", "ae");
  let out = "";
  for (const c of bas) out += TABLE.get(c) ?? c;
  return out.replace(/\s+/g, " ").trim();
}

/** Clé de rapprochement : normalisée et au singulier (s/x final de chaque mot). */
export function cleAliment(texte: string | null | undefined): string {
  return normaliser(texte).replace(/([a-z]{3,})[sx]\b/g, "$1");
}

/** Le nom d'un aliment correspond-il à un mot-clé d'ingrédient ? */
export function correspond(nom: string, cle: string, exclusions: string[] = []): boolean {
  const n = " " + cleAliment(nom);
  if (!n.includes(" " + cleAliment(cle))) return false;
  return !exclusions.some((x) => n.includes(" " + cleAliment(x)));
}
