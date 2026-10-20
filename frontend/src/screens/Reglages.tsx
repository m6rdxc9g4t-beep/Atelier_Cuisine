import { useEffect, useState } from "react";
import { Minus, Plus } from "lucide-react";
import { Feuille } from "../components/Feuille";
import { useToast } from "../components/Toast";
import { useReglages } from "../lib/donnees";
import {
  activerNotifications,
  desactiverPush,
  etatNotifications,
  majDelaiPush,
  type EtatNotif,
} from "../lib/notifications";
import { estInstallee, estIOS, estTauri } from "../lib/plateforme";
import { supabase } from "../lib/supabase";

export function Reglages({ ouverte, onFermer, email }: { ouverte: boolean; onFermer: () => void; email: string }) {
  const [r, maj] = useReglages();
  const toast = useToast();
  const [notif, setNotif] = useState<EtatNotif | null>(null);

  useEffect(() => {
    if (ouverte) etatNotifications().then(setNotif);
  }, [ouverte]);

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
          <h3>Apparence</h3>
          <div className="segments" role="radiogroup" aria-label="Thème">
            {(
              [
                ["auto", "Automatique"],
                ["light", "Clair"],
                ["dark", "Sombre"],
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
