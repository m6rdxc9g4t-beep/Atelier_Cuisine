// Dates en heure locale (jamais en UTC) : "aujourd'hui" doit être celui de la cuisine.

export function isoLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const j = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${j}`;
}

export const aujourdhui = () => isoLocal(new Date());

export function ajouterJours(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return isoLocal(new Date(y, m - 1, d + n));
}

export function versDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** Nombre de jours entre aujourd'hui et la date (négatif si passée). */
export function joursRestants(iso: string | null): number | null {
  if (!iso) return null;
  const diff = versDate(iso).getTime() - versDate(aujourdhui()).getTime();
  return Math.round(diff / 86_400_000);
}

export type Fraicheur = "perime" | "urgent" | "bientot" | "frais" | "sans_date";

export function fraicheur(iso: string | null, joursAlerte = 2): Fraicheur {
  const j = joursRestants(iso);
  if (j == null) return "sans_date";
  if (j < 0) return "perime";
  if (j <= 1) return "urgent";
  if (j <= joursAlerte) return "bientot";
  return "frais";
}

/** Compte à rebours court : chiffre + unité, pour l'affichage en grand. */
export function compteARebours(iso: string | null): { chiffre: string; unite: string } {
  const j = joursRestants(iso);
  if (j == null) return { chiffre: "–", unite: "sans date" };
  if (j < 0) return { chiffre: String(-j), unite: -j > 1 ? "jours passés" : "jour passé" };
  if (j === 0) return { chiffre: "0", unite: "aujourd'hui" };
  if (j === 1) return { chiffre: "1", unite: "demain" };
  if (j < 60) return { chiffre: String(j), unite: "jours" };
  return { chiffre: String(Math.round(j / 30)), unite: "mois" };
}

/** Libellé en une ligne pour les listes. */
export function libelleEcheance(iso: string | null): string {
  const j = joursRestants(iso);
  if (j == null) return "Sans date";
  if (j < -1) return `Périmé depuis ${-j} jours`;
  if (j === -1) return "Périmé depuis hier";
  if (j === 0) return "À consommer aujourd'hui";
  if (j === 1) return "Demain";
  if (j < 14) return `Dans ${j} jours`;
  return "Le " + versDate(iso!).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

export function jourCourt(iso: string): string {
  return versDate(iso).toLocaleDateString("fr-FR", { weekday: "short" }).replace(".", "");
}

export function jourLong(iso: string): string {
  const j = joursRestants(iso);
  if (j === 0) return "Aujourd'hui";
  if (j === -1) return "Hier";
  if (j === 1) return "Demain";
  const s = versDate(iso).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
  return s[0].toUpperCase() + s.slice(1);
}

/** Lundi de la semaine contenant la date. */
export function debutSemaine(iso: string): string {
  const d = versDate(iso);
  const decalage = (d.getDay() + 6) % 7;
  return ajouterJours(iso, -decalage);
}
