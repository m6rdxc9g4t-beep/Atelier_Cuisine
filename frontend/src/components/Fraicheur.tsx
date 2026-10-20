import { Package } from "lucide-react";
import { compteARebours, fraicheur, libelleEcheance, versDate } from "../lib/dates";

/**
 * Libellé d'échéance coloré : rouge (moins de 2 jours), orange (3 à 5 jours),
 * vert (au-delà), bleu pour un produit mis en boîte.
 */
export function Echeance({ date, boite, ouvertLe }: { date: string | null; boite?: boolean; ouvertLe?: string | null }) {
  const f = fraicheur(date);
  return (
    <>
      <span className={`echeance echeance--${f}`}>{libelleEcheance(date)}</span>
      {boite && (
        <span className="pastille pastille--boite" title={ouvertLe ? `Mis en boîte le ${versDate(ouvertLe).toLocaleDateString("fr-FR")}` : "Mis en boîte"}>
          <Package size={12} aria-hidden />
          {ouvertLe ? `boîte du ${versDate(ouvertLe).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}` : "en boîte"}
        </span>
      )}
    </>
  );
}

/** Compte à rebours en grand : la signature visuelle de l'app. */
export function CompteARebours({ date, taille = "grand" }: { date: string | null; taille?: "grand" | "moyen" }) {
  const f = fraicheur(date);
  const { chiffre, unite } = compteARebours(date);
  return (
    <span className={`rebours rebours--${f} rebours--${taille}`}>
      <span className="rebours__chiffre">{chiffre}</span>
      <span className="rebours__unite">{unite}</span>
    </span>
  );
}
