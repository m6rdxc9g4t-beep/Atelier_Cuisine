import { useMemo, useState, type FormEvent } from "react";
import { ChevronLeft, ChevronRight, Pencil, Search, TrendingDown, TrendingUp } from "lucide-react";
import { Feuille } from "../components/Feuille";
import { useToast } from "../components/Toast";
import { formatPrix } from "../lib/aliments";
import { depenses, historiquePrix, produitsAchetes, suivis, type Suivi } from "../lib/budget";
import { aujourdhui, dateCourte, isoLocal, periode, versDate } from "../lib/dates";
import { useDonnees } from "../lib/donnees";
import { cleAliment } from "../lib/normaliser";
import { messageErreur, supabase, type Budget as LigneBudget, type PerimetreBudget } from "../lib/supabase";

const PERIMETRES: Record<PerimetreBudget, { label: string; aide: string }> = {
  global: { label: "Global", aide: "Toutes les dépenses" },
  alimentaire: { label: "Alimentaire", aide: "Rayons 1 à 9" },
  maison: { label: "Maison & hygiène", aide: "Rayons 10 et 11" },
  sorties: { label: "Sorties / Resto", aide: "Repas extérieurs du planning" },
};

export function Budget() {
  const { sessions, sessionItems, meals, budgets } = useDonnees();
  const [mois, setMois] = useState(() => periode(aujourdhui(), "mois").debut);
  const [edition, setEdition] = useState<PerimetreBudget | null>(null);
  const [produit, setProduit] = useState<string | null>(null);
  const [recherche, setRecherche] = useState("");

  const { debut, fin } = periode(mois, "mois");
  const dMois = depenses(sessions, meals, debut, fin);
  const suiviCourant = suivis(budgets, sessions, meals, aujourdhui());
  const estMoisCourant = debut === periode(aujourdhui(), "mois").debut;
  const titreMois = versDate(debut).toLocaleDateString("fr-FR", { month: "long", year: "numeric" });

  // 6 derniers mois jusqu'au mois affiché
  const historique = useMemo(() => {
    return Array.from({ length: 6 }, (_, k) => {
      const d = versDate(debut);
      const m = isoLocal(new Date(d.getFullYear(), d.getMonth() - (5 - k), 1));
      const p = periode(m, "mois");
      const x = depenses(sessions, meals, p.debut, p.fin);
      return {
        cle: m,
        label: versDate(m).toLocaleDateString("fr-FR", { month: "short" }).replace(".", ""),
        alimentaire: x.alimentaire,
        maison: x.maison,
      };
    });
  }, [debut, sessions, meals]);

  const produits = useMemo(() => produitsAchetes(sessionItems, sessions), [sessionItems, sessions]);
  const q = cleAliment(recherche);
  const produitsVisibles = produits.filter((p) => !q || cleAliment(p.nom).includes(q)).slice(0, q ? 50 : 12);

  const changerMois = (n: number) => {
    const d = versDate(debut);
    setMois(isoLocal(new Date(d.getFullYear(), d.getMonth() + n, 1)));
  };

  return (
    <div className="ecran">
      <header className="ecran__tete">
        <h1>Budget</h1>
        <p className="ecran__sous-titre">Alimentaire, maison & hygiène, sorties : où va l'argent</p>
      </header>

      <section aria-labelledby="budgets-titre">
        <h2 id="budgets-titre" className="section-titre">
          Période en cours
        </h2>
        <ul className="budgets">
          {suiviCourant.map((s) => (
            <li key={s.scope}>
              <CarteBudget suivi={s} onEditer={() => setEdition(s.scope)} />
            </li>
          ))}
        </ul>
      </section>

      <section className="panneau" aria-labelledby="mois-titre">
        <div className="panneau__tete">
          <button className="bouton-icone" onClick={() => changerMois(-1)} aria-label="Mois précédent">
            <ChevronLeft size={20} />
          </button>
          <h2 id="mois-titre" className="panneau__titre">
            {titreMois.charAt(0).toUpperCase() + titreMois.slice(1)}
          </h2>
          <button className="bouton-icone" onClick={() => changerMois(1)} aria-label="Mois suivant" disabled={estMoisCourant}>
            <ChevronRight size={20} />
          </button>
        </div>
        <div className="indicateurs">
          <Indicateur valeur={formatPrix(dMois.alimentaire)} label="Alimentaire" pastille="ali" />
          <Indicateur valeur={formatPrix(dMois.maison)} label="Maison & hygiène" pastille="maison" />
          <Indicateur valeur={formatPrix(dMois.sorties)} label="Sorties / Resto" />
          <Indicateur valeur={dMois.panierMoyen != null ? formatPrix(dMois.panierMoyen) : "–"} label="Panier alimentaire moyen" />
          <Indicateur
            valeur={dMois.coutParRepas != null ? formatPrix(dMois.coutParRepas) : "–"}
            label={`Coût par repas (${dMois.nbRepasCuisines} cuisiné${dMois.nbRepasCuisines > 1 ? "s" : ""})`}
          />
          <Indicateur valeur={String(dMois.nbTickets)} label={`Ticket${dMois.nbTickets > 1 ? "s" : ""}`} />
        </div>
        <GraphiqueMois donnees={historique} />
      </section>

      <section aria-labelledby="prix-titre">
        <h2 id="prix-titre" className="section-titre">
          Évolution des prix
        </h2>
        {produits.length === 0 ? (
          <p className="note">Les prix apparaissent ici dès le premier ticket archivé.</p>
        ) : (
          <>
            <label className="recherche">
              <Search size={18} aria-hidden />
              <span className="visuellement-cache">Rechercher un produit</span>
              <input className="champ" type="search" placeholder="Produit" value={recherche} onChange={(e) => setRecherche(e.target.value)} />
            </label>
            <ul className="liste">
              {produitsVisibles.map((p) => (
                <li key={p.nom} className="ligne">
                  <button className="ligne__principal ligne__principal--prix" onClick={() => setProduit(p.nom)}>
                    <span className="ligne__nom">{p.nom}</span>
                    <span className="ligne__detail">
                      {p.achats} achat{p.achats > 1 ? "s" : ""}
                    </span>
                    <span className="prix">
                      {formatPrix(p.dernier)}
                      {p.variation != null && p.variation !== 0 && (
                        <span className={p.variation > 0 ? "variation variation--hausse" : "variation variation--baisse"}>
                          {p.variation > 0 ? <TrendingUp size={14} aria-hidden /> : <TrendingDown size={14} aria-hidden />}
                          {p.variation > 0 ? "+" : "−"}
                          {formatPrix(Math.abs(p.variation))}
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <EditionBudget scope={edition} budgets={budgets} onFermer={() => setEdition(null)} />
      <Feuille ouverte={!!produit} titre={produit ?? ""} onFermer={() => setProduit(null)}>
        {produit && <HistoriquePrix nom={produit} />}
      </Feuille>
    </div>
  );
}

function Indicateur({ valeur, label, pastille }: { valeur: string; label: string; pastille?: "ali" | "maison" }) {
  return (
    <div className="indicateur">
      <span className="indicateur__valeur">{valeur}</span>
      <span className="indicateur__label">
        {pastille && <span className={`point point--${pastille}`} aria-hidden />}
        {label}
      </span>
    </div>
  );
}

function CarteBudget({ suivi, onEditer }: { suivi: Suivi; onEditer: () => void }) {
  const p = PERIMETRES[suivi.scope];
  const part = suivi.part ?? 0;
  const etat = suivi.part == null ? "" : part >= 1 ? "depasse" : part >= 0.85 ? "proche" : "ok";
  const reste = suivi.budget ? Number(suivi.budget.amount) - suivi.depense : null;
  return (
    <article className={`budget panneau budget--${suivi.scope}` + (etat ? ` budget--${etat}` : "")}>
      <div className="budget__tete">
        <h3>{p.label}</h3>
        <button className="bouton-icone" onClick={onEditer} aria-label={`Définir le budget ${p.label}`}>
          <Pencil size={16} />
        </button>
      </div>
      <p className="budget__montant">
        {formatPrix(suivi.depense)}
        {suivi.budget && <span className="budget__sur"> / {formatPrix(Number(suivi.budget.amount))}</span>}
      </p>
      {suivi.budget ? (
        <>
          <div
            className="jauge-budget"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(part * 100)}
            aria-label={`${p.label} : ${Math.round(part * 100)} % du budget`}
          >
            <span style={{ width: `${Math.min(100, part * 100)}%` }} />
          </div>
          <p className="budget__reste">
            {reste != null && reste >= 0 ? `Reste ${formatPrix(reste)}` : `Dépassé de ${formatPrix(Math.abs(reste ?? 0))}`} ·{" "}
            {suivi.budget.period === "semaine" ? "cette semaine" : "ce mois-ci"}
          </p>
        </>
      ) : (
        <button className="lien" onClick={onEditer}>
          Définir un budget · {p.aide}
        </button>
      )}
    </article>
  );
}

/** Dépenses des 6 derniers mois : barres groupées Alimentaire / Maison. */
function GraphiqueMois({ donnees }: { donnees: { cle: string; label: string; alimentaire: number; maison: number }[] }) {
  const [survol, setSurvol] = useState<number | null>(null);
  const max = Math.max(10, ...donnees.flatMap((d) => [d.alimentaire, d.maison]));
  const H = 140;
  const L = 320;
  const pas = L / donnees.length;
  const largeur = Math.min(18, pas / 3);
  const y = (v: number) => H - (v / max) * (H - 8);
  const vide = donnees.every((d) => d.alimentaire === 0 && d.maison === 0);
  return (
    <figure className="graphique">
      <figcaption className="graphique__legende">
        <span>
          <span className="point point--ali" aria-hidden /> Alimentaire
        </span>
        <span>
          <span className="point point--maison" aria-hidden /> Maison & hygiène
        </span>
      </figcaption>
      {vide ? (
        <p className="note">Pas encore de dépenses sur ces six mois.</p>
      ) : (
        <div className="graphique__zone">
          <svg viewBox={`0 0 ${L} ${H + 22}`} role="img" aria-label="Dépenses des six derniers mois" onMouseLeave={() => setSurvol(null)}>
            {[0.5, 1].map((f) => (
              <line key={f} x1={0} x2={L} y1={y(max * f)} y2={y(max * f)} className="graphique__grille" />
            ))}
            <line x1={0} x2={L} y1={H} y2={H} className="graphique__axe" />
            {donnees.map((d, i) => {
              const x = i * pas + pas / 2;
              return (
                <g key={d.cle} onMouseEnter={() => setSurvol(i)} onFocus={() => setSurvol(i)} tabIndex={0}>
                  <rect x={i * pas} y={0} width={pas} height={H} className="graphique__cible" />
                  {d.alimentaire > 0 && (
                    <path className="graphique__barre graphique__barre--ali" d={barre(x - largeur - 1, y(d.alimentaire), largeur, H - y(d.alimentaire))} />
                  )}
                  {d.maison > 0 && (
                    <path className="graphique__barre graphique__barre--maison" d={barre(x + 1, y(d.maison), largeur, H - y(d.maison))} />
                  )}
                  <text x={x} y={H + 16} className="graphique__label">
                    {d.label}
                  </text>
                </g>
              );
            })}
          </svg>
          {survol != null && (
            <div className="graphique__bulle" style={{ left: `${((survol + 0.5) / donnees.length) * 100}%` }} role="status">
              <strong>{donnees[survol].label}</strong>
              <span>
                <span className="point point--ali" aria-hidden /> {formatPrix(donnees[survol].alimentaire)}
              </span>
              <span>
                <span className="point point--maison" aria-hidden /> {formatPrix(donnees[survol].maison)}
              </span>
            </div>
          )}
        </div>
      )}
      <details className="graphique__tableau">
        <summary>Voir le tableau</summary>
        <table>
          <thead>
            <tr>
              <th>Mois</th>
              <th>Alimentaire</th>
              <th>Maison & hygiène</th>
            </tr>
          </thead>
          <tbody>
            {donnees.map((d) => (
              <tr key={d.cle}>
                <td>{d.label}</td>
                <td>{formatPrix(d.alimentaire)}</td>
                <td>{formatPrix(d.maison)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}

/** Barre avec un arrondi de 4 px en haut, ancrée à la ligne de base. */
function barre(x: number, y: number, l: number, h: number) {
  const r = Math.min(4, l / 2, h);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + l - r}Q${x + l},${y} ${x + l},${y + r}V${y + h}Z`;
}

function HistoriquePrix({ nom }: { nom: string }) {
  const { sessionItems, sessions } = useDonnees();
  const points = historiquePrix(nom, sessionItems, sessions);
  const [survol, setSurvol] = useState<number | null>(null);
  if (!points.length) return <p className="note">Aucun prix enregistré.</p>;
  const min = Math.min(...points.map((p) => p.prix));
  const max = Math.max(...points.map((p) => p.prix));
  const ecart = max - min || 1;
  const L = 300;
  const H = 90;
  const x = (i: number) => (points.length === 1 ? L / 2 : 12 + (i / (points.length - 1)) * (L - 24));
  const y = (v: number) => 10 + (1 - (v - min) / ecart) * (H - 20);
  return (
    <div className="formulaire">
      <p className="budget__montant">
        {formatPrix(points[points.length - 1].prix)}
        <span className="budget__sur"> dernier prix · min {formatPrix(min)} · max {formatPrix(max)}</span>
      </p>
      <div className="graphique__zone">
        <svg viewBox={`0 0 ${L} ${H}`} role="img" aria-label={`Prix de ${nom} au fil des achats`} onMouseLeave={() => setSurvol(null)}>
          <polyline className="graphique__ligne" points={points.map((p, i) => `${x(i)},${y(p.prix)}`).join(" ")} />
          {points.map((p, i) => (
            <g key={i} onMouseEnter={() => setSurvol(i)} onFocus={() => setSurvol(i)} tabIndex={0}>
              <circle cx={x(i)} cy={y(p.prix)} r={12} className="graphique__cible" />
              <circle cx={x(i)} cy={y(p.prix)} r={4} className="graphique__point" />
            </g>
          ))}
        </svg>
        {survol != null && (
          <div className="graphique__bulle" style={{ left: `${(x(survol) / L) * 100}%` }} role="status">
            <strong>{formatPrix(points[survol].prix)}</strong>
            <span>{dateCourte(points[survol].date)}</span>
            <span>{points[survol].magasin}</span>
          </div>
        )}
      </div>
      <ul className="liste">
        {[...points].reverse().map((p, i) => (
          <li key={i} className="ligne">
            <span className="ligne__principal">
              <span className="ligne__nom">{formatPrix(p.prix)}</span>
              <span className="ligne__detail">
                {dateCourte(p.date)} · {p.magasin}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function EditionBudget({
  scope,
  budgets,
  onFermer,
}: {
  scope: PerimetreBudget | null;
  budgets: LigneBudget[];
  onFermer: () => void;
}) {
  const { setBudgets } = useDonnees();
  const toast = useToast();
  const actuel = budgets.find((b) => b.scope === scope) ?? null;
  const [montant, setMontant] = useState("");
  const [periodeChoisie, setPeriode] = useState<LigneBudget["period"]>("mois");
  const [pour, setPour] = useState<string | null>(null);
  if (scope && pour !== scope) {
    setPour(scope);
    setMontant(actuel ? String(actuel.amount).replace(".", ",") : "");
    setPeriode(actuel?.period ?? "mois");
  }
  if (!scope && pour) setPour(null);

  async function enregistrer(e: FormEvent) {
    e.preventDefault();
    if (!scope) return;
    const amount = Number(montant.replace(",", "."));
    if (!amount || amount <= 0) return;
    const { data, error } = await supabase
      .from("budgets")
      .upsert({ scope, period: periodeChoisie, amount, ...(actuel ? { id: actuel.id } : {}) }, { onConflict: "user_id,scope" })
      .select()
      .single();
    if (error) return toast(messageErreur(error), { erreur: true });
    const b = { ...(data as LigneBudget), amount: Number((data as LigneBudget).amount) };
    setBudgets((l) => [...l.filter((x) => x.scope !== scope), b]);
    onFermer();
  }

  async function supprimer() {
    if (!actuel) return;
    const { error } = await supabase.from("budgets").delete().eq("id", actuel.id);
    if (error) return toast(messageErreur(error), { erreur: true });
    setBudgets((l) => l.filter((x) => x.id !== actuel.id));
    onFermer();
  }

  return (
    <Feuille
      ouverte={!!scope}
      titre={scope ? `Budget ${PERIMETRES[scope].label.toLowerCase()}` : ""}
      onFermer={onFermer}
      pied={
        <>
          {actuel && (
            <button type="button" className="bouton bouton--discret" onClick={supprimer}>
              Retirer
            </button>
          )}
          <button type="submit" form="form-budget" className="bouton bouton--action">
            Enregistrer
          </button>
        </>
      }
    >
      <form id="form-budget" className="formulaire" onSubmit={enregistrer}>
        <p className="note">{scope && PERIMETRES[scope].aide}</p>
        <label className="champ-groupe">
          <span>Plafond</span>
          <input className="champ" inputMode="decimal" required placeholder="400" value={montant} onChange={(e) => setMontant(e.target.value)} />
        </label>
        <div className="segments" role="radiogroup" aria-label="Période">
          {(
            [
              ["semaine", "Par semaine"],
              ["mois", "Par mois"],
            ] as const
          ).map(([v, l]) => (
            <button key={v} type="button" role="radio" className="segment" aria-checked={periodeChoisie === v} aria-selected={periodeChoisie === v} onClick={() => setPeriode(v)}>
              {l}
            </button>
          ))}
        </div>
      </form>
    </Feuille>
  );
}
