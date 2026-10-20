import { compteARebours, fraicheur, libelleEcheance } from "../lib/dates";

/** Libellé d'échéance coloré selon la fraîcheur, pour les lignes de liste. */
export function Echeance({ date, joursAlerte }: { date: string | null; joursAlerte: number }) {
  const f = fraicheur(date, joursAlerte);
  return <span className={`echeance echeance--${f}`}>{libelleEcheance(date)}</span>;
}

/** Compte à rebours en grand : la signature visuelle de l'app. */
export function CompteARebours({
  date,
  joursAlerte,
  taille = "grand",
}: {
  date: string | null;
  joursAlerte: number;
  taille?: "grand" | "moyen";
}) {
  const f = fraicheur(date, joursAlerte);
  const { chiffre, unite } = compteARebours(date);
  return (
    <span className={`rebours rebours--${f} rebours--${taille}`}>
      <span className="rebours__chiffre">{chiffre}</span>
      <span className="rebours__unite">{unite}</span>
    </span>
  );
}
