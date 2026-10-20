import { useState, type FormEvent } from "react";
import { URL_APP } from "../lib/plateforme";
import { messageErreur, supabase } from "../lib/supabase";

type Mode = "connexion" | "inscription" | "oubli";

export function Connexion() {
  const [mode, setMode] = useState<Mode>("connexion");
  const [email, setEmail] = useState("");
  const [mdp, setMdp] = useState("");
  const [message, setMessage] = useState<{ texte: string; erreur?: boolean } | null>(null);
  const [enCours, setEnCours] = useState(false);

  async function envoyer(e: FormEvent) {
    e.preventDefault();
    setEnCours(true);
    setMessage(null);
    try {
      if (mode === "connexion") {
        const { error } = await supabase.auth.signInWithPassword({ email, password: mdp });
        if (error) throw error;
      } else if (mode === "inscription") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password: mdp,
          options: URL_APP ? { emailRedirectTo: URL_APP } : undefined,
        });
        if (error) throw error;
        if (!data.session) {
          setMessage({
            texte: `Un e-mail de confirmation a été envoyé à ${email}. Ouvre le lien qu'il contient, puis reviens te connecter ici.`,
          });
          setMode("connexion");
        }
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: URL_APP || undefined,
        });
        if (error) throw error;
        setMessage({ texte: `Un lien pour choisir un nouveau mot de passe a été envoyé à ${email}.` });
        setMode("connexion");
      }
    } catch (err) {
      setMessage({ texte: messageErreur(err), erreur: true });
    } finally {
      setEnCours(false);
    }
  }

  const titres: Record<Mode, string> = {
    connexion: "Se connecter",
    inscription: "Créer un compte",
    oubli: "Mot de passe oublié",
  };

  return (
    <main className="connexion" data-tauri-drag-region>
      <div className="connexion__marque">
        <MarqueFraicheur />
        <h1 className="connexion__nom">
          Atelier
          <br />
          Cuisine
        </h1>
        <p className="connexion__accroche">
          Le frigo, les courses et les repas de la maison, au même endroit sur ton Mac et ton iPhone.
        </p>
      </div>

      <form className="connexion__form formulaire" onSubmit={envoyer}>
        <h2>{titres[mode]}</h2>
        <label className="champ-groupe">
          <span>E-mail</span>
          <input
            className="champ"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        {mode !== "oubli" && (
          <label className="champ-groupe">
            <span>Mot de passe</span>
            <input
              className="champ"
              type="password"
              autoComplete={mode === "inscription" ? "new-password" : "current-password"}
              minLength={6}
              required
              value={mdp}
              onChange={(e) => setMdp(e.target.value)}
            />
          </label>
        )}
        {message && (
          <p className={message.erreur ? "message message--erreur" : "message"} role="alert">
            {message.texte}
          </p>
        )}
        <button className="bouton bouton--action bouton--plein" disabled={enCours}>
          {titres[mode]}
        </button>
        <div className="connexion__liens">
          {mode === "connexion" ? (
            <>
              <button type="button" className="lien" onClick={() => setMode("inscription")}>
                Créer un compte
              </button>
              <button type="button" className="lien" onClick={() => setMode("oubli")}>
                Mot de passe oublié
              </button>
            </>
          ) : (
            <button type="button" className="lien" onClick={() => setMode("connexion")}>
              J'ai déjà un compte
            </button>
          )}
        </div>
      </form>
    </main>
  );
}

/** L'icône de l'app : trois bocaux, du plus frais au plus urgent. */
export function MarqueFraicheur({ petite }: { petite?: boolean }) {
  return <img className={"marque" + (petite ? " marque--petite" : "")} src="/icone.svg" alt="" />;
}

/** Choix d'un nouveau mot de passe après un lien de réinitialisation. */
export function NouveauMotDePasse({ onFini }: { onFini: () => void }) {
  const [mdp, setMdp] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  async function valider(e: FormEvent) {
    e.preventDefault();
    const { error } = await supabase.auth.updateUser({ password: mdp });
    if (error) setErreur(messageErreur(error));
    else onFini();
  }
  return (
    <main className="connexion">
      <form className="connexion__form formulaire" onSubmit={valider}>
        <h2>Nouveau mot de passe</h2>
        <label className="champ-groupe">
          <span>Mot de passe</span>
          <input
            className="champ"
            type="password"
            autoComplete="new-password"
            minLength={6}
            required
            value={mdp}
            onChange={(e) => setMdp(e.target.value)}
          />
        </label>
        {erreur && <p className="message message--erreur">{erreur}</p>}
        <button className="bouton bouton--action bouton--plein">Enregistrer le mot de passe</button>
      </form>
    </main>
  );
}
