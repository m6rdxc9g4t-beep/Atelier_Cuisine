import { useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { Calendar, Receipt, Refrigerator, Settings, ShoppingCart, Wallet } from "lucide-react";
import { FournisseurToast } from "./components/Toast";
import { FournisseurDonnees, useDonnees, useReglages } from "./lib/donnees";
import { useCatalogue } from "./lib/catalogue";
import { aAlerter } from "./lib/dates";
import { alerterAuDemarrage } from "./lib/notifications";
import { estTauri } from "./lib/plateforme";
import { supabase } from "./lib/supabase";
import { Connexion, MarqueFraicheur, NouveauMotDePasse } from "./screens/Connexion";
import { Budget } from "./screens/Budget";
import { Courses } from "./screens/Courses";
import { GardeManger } from "./screens/GardeManger";
import { Recap } from "./screens/Recap";
import { Reglages } from "./screens/Reglages";
import { Repas } from "./screens/Repas";

type Onglet = "garde-manger" | "repas" | "courses" | "recap" | "budget";
const ONGLETS: Onglet[] = ["garde-manger", "repas", "courses", "recap", "budget"];

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

function lireHash(): { onglet: Onglet; idees: boolean } {
  const h = window.location.hash.replace("#", "");
  // Ancien lien « #idees » : les idées vivent désormais dans l'onglet Repas
  if (h === "idees") return { onglet: "repas", idees: true };
  return { onglet: ONGLETS.find((o) => o === h) ?? "garde-manger", idees: false };
}

function Coque({ email }: { email: string }) {
  const { pantry, shopping, erreur } = useDonnees();
  const [{ joursAlerte }] = useReglages();
  const [onglet, setOnglet] = useState<Onglet>(() => lireHash().onglet);
  const [vueRepas, setVueRepas] = useState<"planning" | "idees">(() => (lireHash().idees ? "idees" : "planning"));
  const [reglages, setReglages] = useState(false);
  useCatalogue(); // charge le catalogue de produits (devinette des rayons)

  useEffect(() => {
    const surHash = () => {
      const h = lireHash();
      setOnglet(h.onglet);
      if (h.idees) setVueRepas("idees");
    };
    window.addEventListener("hashchange", surHash);
    return () => window.removeEventListener("hashchange", surHash);
  }, []);

  const aller = (o: Onglet, idees = false) => {
    setVueRepas(idees ? "idees" : "planning");
    if (window.location.hash !== "#" + o) window.history.replaceState(null, "", "#" + o);
    setOnglet(o);
    document.getElementById("contenu")?.scrollTo({ top: 0 });
    window.scrollTo({ top: 0 });
  };

  const nbAlertes = useMemo(
    () => pantry.filter((p) => aAlerter(p.expires_on, joursAlerte)).length,
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
    { id: "garde-manger", label: "Stock", icone: Refrigerator, compte: nbAlertes, alerte: true },
    { id: "repas", label: "Repas", icone: Calendar },
    { id: "courses", label: "Courses", icone: ShoppingCart, compte: nbCourses },
    { id: "recap", label: "Récap", icone: Receipt },
    { id: "budget", label: "Budget", icone: Wallet },
  ];

  return (
    <div className="coque">
      <nav className="navigation" aria-label="Sections">
        <div className="navigation__marque" data-tauri-drag-region>
          <MarqueFraicheur petite />
          <span className="navigation__nom">
            atelier_<strong>Cuisine</strong>
          </span>
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
        {onglet === "garde-manger" && <GardeManger versIdees={() => aller("repas", true)} />}
        {onglet === "repas" && <Repas key={vueRepas} vue={vueRepas} versGardeManger={() => aller("garde-manger")} />}
        {onglet === "courses" && <Courses />}
        {onglet === "recap" && <Recap />}
        {onglet === "budget" && <Budget />}
      </main>

      <Reglages ouverte={reglages} onFermer={() => setReglages(false)} email={email} />
    </div>
  );
}
