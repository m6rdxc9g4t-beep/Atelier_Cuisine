import { ajouterJours, aujourdhui } from "../lib/dates";

const RACCOURCIS: { label: string; jours: number }[] = [
  { label: "Demain", jours: 1 },
  { label: "3 jours", jours: 3 },
  { label: "1 semaine", jours: 7 },
  { label: "2 semaines", jours: 14 },
  { label: "1 mois", jours: 30 },
];

/** Choix de la date de péremption : raccourcis + calendrier. */
export function ChoixDate({
  valeur,
  onChange,
  id,
}: {
  valeur: string | null;
  onChange: (d: string | null) => void;
  id?: string;
}) {
  const auj = aujourdhui();
  return (
    <div className="choix-date">
      <div className="puces" role="group" aria-label="Raccourcis de date">
        {RACCOURCIS.map((r) => {
          const d = ajouterJours(auj, r.jours);
          return (
            <button
              key={r.label}
              type="button"
              className="puce"
              aria-pressed={valeur === d}
              onClick={() => onChange(d)}
            >
              {r.label}
            </button>
          );
        })}
        <button type="button" className="puce" aria-pressed={valeur === null} onClick={() => onChange(null)}>
          Sans date
        </button>
      </div>
      <input
        id={id}
        type="date"
        className="champ"
        value={valeur ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
      />
    </div>
  );
}
