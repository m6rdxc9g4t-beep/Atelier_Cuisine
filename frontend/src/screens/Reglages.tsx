import { useEffect, useState } from "react";
import { Cloud, Cpu, Minus, Plus, Sparkles, Wand2 } from "lucide-react";
import { Feuille } from "../components/Feuille";
import { useToast } from "../components/Toast";
import { useDonnees, useReglages } from "../lib/donnees";
import { ollamaDisponible, type ModeIA } from "../lib/ia";
import {
  activerNotifications,
  desactiverPush,
  etatNotifications,
  majDelaiPush,
  type EtatNotif,
} from "../lib/notifications";
import { estInstallee, estIOS, estTauri } from "../lib/plateforme";
import { messageErreur, supabase } from "../lib/supabase";

export function Reglages({ ouverte, onFermer, email }: { ouverte: boolean; onFermer: () => void; email: string }) {
  const [r, maj] = useReglages();
  const toast = useToast();
  const { recharger } = useDonnees();
  const [notif, setNotif] = useState<EtatNotif | null>(null);
  const [ollama, setOllama] = useState<boolean | null>(null);

  useEffect(() => {
    if (ouverte) etatNotifications().then(setNotif);
  }, [ouverte]);

  // Ollama répond-il ? Vérifié à l'ouverture et quand l'adresse change.
  useEffect(() => {
    if (!ouverte || r.modeIA === "cloud") return;
    let annule = false;
    setOllama(null);
    ollamaDisponible(r.ollamaUrl).then((ok) => !annule && setOllama(ok));
    return () => {
      annule = true;
    };
  }, [ouverte, r.modeIA, r.ollamaUrl]);

  async function exemples() {
    const { data, error } = await supabase.rpc("ajouter_exemples_foyer");
    if (error) return toast(messageErreur(error), { erreur: true });
    recharger();
    toast(data ? `${data} exemple${data > 1 ? "s" : ""} ajouté${data > 1 ? "s" : ""}` : "Les exemples sont déjà là");
  }

  const iPhoneNonInstalle = estIOS && !estInstallee && !estTauri;

  async function activer() {
    const e = await activerNotifications(r.joursAlerte);
    setNotif(e);
    if (e === "accordee") toast("Alertes activées");
    else if (e === "refusee")
      toast("Les notifications sont bloquées. Autorise-les dans les réglages du système.", { erreur: true });
  }

  function changerDelai(n: number) {
    const v = Math.min(7, Math.max(1, n));
    maj({ joursAlerte: v });
    majDelaiPush(v).catch(() => {});
  }

  return (
    <Feuille ouverte={ouverte} titre="Réglages" onFermer={onFermer}>
      <div className="reglages">
        <section>
          <h3>Alertes de péremption</h3>
          <div className="reglage">
            <span id="delai-label">Prévenir avant la date</span>
            <div className="pas-a-pas" role="group" aria-labelledby="delai-label">
              <button
                className="bouton-icone"
                onClick={() => changerDelai(r.joursAlerte - 1)}
                aria-label="Un jour de moins"
                disabled={r.joursAlerte <= 1}
              >
                <Minus size={18} />
              </button>
              <output aria-live="polite">
                {r.joursAlerte} jour{r.joursAlerte > 1 ? "s" : ""}
              </output>
              <button
                className="bouton-icone"
                onClick={() => changerDelai(r.joursAlerte + 1)}
                aria-label="Un jour de plus"
                disabled={r.joursAlerte >= 7}
              >
                <Plus size={18} />
              </button>
            </div>
          </div>
          {iPhoneNonInstalle ? (
            <p className="note">
              Sur iPhone, les notifications fonctionnent une fois l'app ajoutée à l'écran d'accueil : dans Safari,
              touche Partager puis « Sur l'écran d'accueil », et ouvre l'app depuis son icône.
            </p>
          ) : notif === "accordee" ? (
            <div className="reglage">
              <span>
                Notifications activées
                <span className="note">
                  {estTauri
                    ? "Un rappel s'affiche à l'ouverture de l'app quand des produits arrivent à échéance."
                    : "Un rappel arrive chaque matin quand des produits arrivent à échéance, même app fermée."}
                </span>
              </span>
              {!estTauri && (
                <button
                  className="bouton bouton--discret"
                  onClick={async () => {
                    await desactiverPush();
                    toast("Rappels quotidiens désactivés sur cet appareil");
                  }}
                >
                  Désactiver
                </button>
              )}
            </div>
          ) : notif === "indisponible" ? (
            <p className="note">Ce navigateur ne gère pas les notifications. Les alertes restent visibles dans l'app.</p>
          ) : (
            <div className="reglage">
              <span>Recevoir une notification quand un produit arrive à échéance</span>
              <button className="bouton bouton--action" onClick={activer}>
                Activer
              </button>
            </div>
          )}
        </section>

        <section>
          <h3>Lecture des tickets par l'IA</h3>
          <div className="segments" role="radiogroup" aria-label="Moteur IA">
            {(
              [
                ["auto", "Auto", Sparkles],
                ["local", "Local", Cpu],
                ["cloud", "Cloud", Cloud],
              ] as const
            ).map(([v, l, Icone]) => (
              <button
                key={v}
                role="radio"
                aria-checked={r.modeIA === v}
                aria-selected={r.modeIA === v}
                className="segment"
                onClick={() => maj({ modeIA: v as ModeIA })}
              >
                <Icone size={16} aria-hidden /> {l}
              </button>
            ))}
          </div>
          <p className="note">
            {r.modeIA === "local"
              ? "Ollama sur ce Mac, hors ligne et gratuit."
              : r.modeIA === "cloud"
                ? "Claude, via la fonction sécurisée de l'app : fonctionne partout, iPhone compris."
                : "Ollama s'il répond en moins de 3 secondes, sinon Claude."}{" "}
            Les e-tickets Carrefour sont lus sans IA.
          </p>
          {r.modeIA !== "cloud" && (
            <>
              <p className={"etat-ia" + (ollama ? " etat-ia--ok" : ollama === false ? " etat-ia--ko" : "")} role="status">
                {ollama == null ? "Recherche d'Ollama…" : ollama ? "Ollama répond" : "Ollama ne répond pas"}
              </p>
              {ollama === false && (
                <p className="note">
                  Lance l'app Ollama (ou « ollama serve »), puis installe les modèles : « ollama pull {r.ollamaModele} » et « ollama pull{" "}
                  {r.ollamaModeleVision} » pour les photos.{!estTauri && " Dans le navigateur, autorise aussi cette adresse avec la variable OLLAMA_ORIGINS."}
                </p>
              )}
              <div className="formulaire">
                <label className="champ-groupe">
                  <span>Adresse d'Ollama</span>
                  <input className="champ" value={r.ollamaUrl} onChange={(e) => maj({ ollamaUrl: e.target.value })} />
                </label>
                <div className="formulaire__ligne">
                  <label className="champ-groupe">
                    <span>Modèle texte</span>
                    <input className="champ" value={r.ollamaModele} onChange={(e) => maj({ ollamaModele: e.target.value })} />
                  </label>
                  <label className="champ-groupe">
                    <span>Modèle photo</span>
                    <input className="champ" value={r.ollamaModeleVision} onChange={(e) => maj({ ollamaModeleVision: e.target.value })} />
                  </label>
                </div>
              </div>
            </>
          )}
        </section>

        <section>
          <h3>Apparence</h3>
          <div className="segments" role="radiogroup" aria-label="Thème">
            {(
              [
                ["dark", "Néon"],
                ["light", "Clair"],
                ["auto", "Selon le système"],
              ] as const
            ).map(([v, l]) => (
              <button
                key={v}
                role="radio"
                aria-checked={r.theme === v}
                className="segment"
                aria-selected={r.theme === v}
                onClick={() => maj({ theme: v })}
              >
                {l}
              </button>
            ))}
          </div>
        </section>

        {iPhoneNonInstalle && (
          <section>
            <h3>Installer sur l'iPhone</h3>
            <ol className="etapes etapes--compactes">
              <li>Ouvre cette page dans Safari.</li>
              <li>Touche le bouton Partager, en bas de l'écran.</li>
              <li>Choisis « Sur l'écran d'accueil », puis « Ajouter ».</li>
            </ol>
          </section>
        )}

        <section>
          <h3>Données d'exemple</h3>
          <div className="reglage">
            <span>
              Ajouter les exemples du foyer
              <span className="note">La boîte de jambon, les niveaux de stock et les pâtes à racheter. Rien n'est ajouté en double.</span>
            </span>
            <button className="bouton bouton--discret" onClick={exemples}>
              <Wand2 size={16} aria-hidden /> Ajouter
            </button>
          </div>
        </section>

        <section>
          <h3>Compte</h3>
          <div className="reglage">
            <span>{email}</span>
            <button className="bouton bouton--discret" onClick={() => supabase.auth.signOut()}>
              Se déconnecter
            </button>
          </div>
        </section>
      </div>
    </Feuille>
  );
}
