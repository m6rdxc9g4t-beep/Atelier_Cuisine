import { useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { CalendarDays, ChefHat, Refrigerator, Settings, ShoppingBasket } from "lucide-react";
import { FournisseurToast } from "./components/Toast";
import { FournisseurDonnees, useDonnees, useReglages } from "./lib/donnees";
import { fraicheur } from "./lib/dates";
import { alerterAuDemarrage } from "./lib/notifications";
import { estTauri } from "./lib/plateforme";
import { supabase } from "./lib/supabase";
import { Connexion, MarqueFraicheur, NouveauMotDePasse } from "./screens/Connexion";
import { Courses } from "./screens/Courses";
import { GardeManger } from "./screens/GardeManger";
import { Idees } from "./screens/Idees";
import { Reglages } from "./screens/Reglages";
import { Repas } from "./screens/Repas";

type Onglet = "garde-manger" | "courses" | "repas" | "idees";

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [recuperation, setRecuperation] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((evenement, s) => {
      if (evenement === "PASSWORD_RECOVERY") setRecuperation(true);
      setSession(s);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (estTauri) document.documentElement.classList.add("est-tauri");
  }, []);

  if (session === undefined) return <div className="demarrage" aria-busy="true" />;

  return (
    <FournisseurToast>
      {recuperation && session ? (
        <NouveauMotDePasse onFini={() => setRecuperation(false)} />
      ) : session ? (
        <FournisseurDonnees userId={session.user.id}>
          <Coque email={session.user.email ?? ""} />
        </FournisseurDonnees>
      ) : (
        <Connexion />
      )}
    </FournisseurToast>
  );
}

function lireOnglet(): Onglet {
  const h = window.location.hash.replace("#", "");
  return (["garde-manger", "courses", "repas", "idees"] as const).find((o) => o === h) ?? "garde-manger";
}

function Coque({ email }: { email: string }) {
  const { pantry, shopping, erreur } = useDonnees();
  const [{ joursAlerte }] = useReglages();
  const [onglet, setOnglet] = useState<Onglet>(lireOnglet);
  const [reglages, setReglages] = useState(false);

  useEffect(() => {
    const surHash = () => setOnglet(lireOnglet());
    window.addEventListener("hashchange", surHash);
    return () => window.removeEventListener("hashchange", surHash);
  }, []);

  const aller = (o: Onglet) => {
    if (window.location.hash !== "#" + o) window.history.replaceState(null, "", "#" + o);
    setOnglet(o);
    document.getElementById("contenu")?.scrollTo({ top: 0 });
    window.scrollTo({ top: 0 });
  };

  const nbAlertes = useMemo(
    () => pantry.filter((p) => ["perime", "urgent", "bientot"].includes(fraicheur(p.expires_on, joursAlerte))).length,
    [pantry, joursAlerte],
  );
  const nbCourses = shopping.filter((s) => !s.checked).length;

  // Notification système au démarrage, une fois par jour, s'il y a des produits à finir
  const pret = pantry.length > 0;
  useEffect(() => {
    if (pret) alerterAuDemarrage(pantry, joursAlerte).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pret]);

  // Pastille sur l'icône de l'app (iPhone installé, navigateurs compatibles)
  useEffect(() => {
    const nav = navigator as Navigator & { setAppBadge?: (n: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
    if (nbAlertes) nav.setAppBadge?.(nbAlertes).catch(() => {});
    else nav.clearAppBadge?.().catch(() => {});
  }, [nbAlertes]);

  const onglets: { id: Onglet; label: string; icone: typeof Refrigerator; compte?: number; alerte?: boolean }[] = [
    { id: "garde-manger", label: "Garde-manger", icone: Refrigerator, compte: nbAlertes, alerte: true },
    { id: "courses", label: "Courses", icone: ShoppingBasket, compte: nbCourses },
    { id: "repas", label: "Repas", icone: CalendarDays },
    { id: "idees", label: "Idées", icone: ChefHat },
  ];

  return (
    <div className="coque">
      <nav className="navigation" aria-label="Sections">
        <div className="navigation__marque" data-tauri-drag-region>
          <MarqueFraicheur petite />
          <span>Atelier Cuisine</span>
        </div>
        <ul className="navigation__liste">
          {onglets.map((o) => (
            <li key={o.id}>
              <button
                className="onglet"
                aria-current={onglet === o.id ? "page" : undefined}
                onClick={() => aller(o.id)}
              >
                <o.icone size={22} aria-hidden strokeWidth={onglet === o.id ? 2.4 : 1.8} />
                <span className="onglet__label">{o.label}</span>
                {!!o.compte && (
                  <span className={"onglet__compte" + (o.alerte ? " onglet__compte--alerte" : "")}>
                    {o.compte}
                    <span className="visuellement-cache">
                      {o.alerte ? " produits à finir" : " articles à acheter"}
                    </span>
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
        <button className="onglet navigation__reglages" onClick={() => setReglages(true)}>
          <Settings size={22} aria-hidden strokeWidth={1.8} />
          <span className="onglet__label">Réglages</span>
        </button>
      </nav>

      <button className="bouton-icone reglages-mobile" onClick={() => setReglages(true)} aria-label="Réglages">
        <Settings size={22} />
      </button>

      <main id="contenu" className="contenu">
        <div className="barre-glisser" data-tauri-drag-region aria-hidden />
        {erreur && (
          <p className="message message--erreur bandeau">
            Synchronisation impossible pour le moment. Les modifications reprendront dès le retour du réseau.
          </p>
        )}
        {onglet === "garde-manger" && <GardeManger versIdees={() => aller("idees")} />}
        {onglet === "courses" && <Courses />}
        {onglet === "repas" && <Repas />}
        {onglet === "idees" && <Idees versGardeManger={() => aller("garde-manger")} />}
      </main>

      <Reglages ouverte={reglages} onFermer={() => setReglages(false)} email={email} />
    </div>
  );
}
