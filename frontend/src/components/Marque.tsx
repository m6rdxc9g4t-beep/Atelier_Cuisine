import { useRef } from "react";
import { Utensils, X } from "lucide-react";

/** Icône de l'app : carré arrondi en dégradé de la signature, glyphe Lucide « utensils » blanc (atelier-brand.css). */
export function IconeApp({ grande }: { grande?: boolean }) {
  return (
    <span className={grande ? "atelier-about__icon atelier-brand__tile" : "atelier-brand__tile"} aria-hidden="true">
      <Utensils />
    </span>
  );
}

function Nom() {
  return (
    <>
      <span className="atelier-brand__prefix">Atelier </span>Cuisine
    </>
  );
}

/** Marque commune de la suite (icône + « Atelier Cuisine ») ; un clic ouvre la fenêtre « À propos ». */
export function Marque() {
  const ref = useRef<HTMLDialogElement>(null);
  return (
    <>
      <button type="button" className="atelier-brand" aria-haspopup="dialog" onClick={() => ref.current?.showModal()}>
        <IconeApp />
        <span className="atelier-brand__name">
          <Nom />
        </span>
      </button>
      <dialog
        ref={ref}
        className="atelier-about"
        aria-labelledby="a-propos-nom"
        onClick={(e) => {
          if (e.target === ref.current) ref.current?.close();
        }}
      >
        <div className="atelier-about__panel">
          <button type="button" className="atelier-about__close" aria-label="Fermer" onClick={() => ref.current?.close()}>
            <X size={18} />
          </button>
          <IconeApp grande />
          <h2 id="a-propos-nom" className="atelier-about__name">
            <Nom />
          </h2>
          <p className="atelier-about__tagline">Le stock, les repas, les courses, les tickets de caisse et le budget du foyer.</p>
          <p className="atelier-about__suite">Suite Atelier</p>
        </div>
      </dialog>
    </>
  );
}

/** Marque sans action (écrans de connexion). */
export function MarqueSimple() {
  return (
    <span className="atelier-brand">
      <IconeApp />
      <span className="atelier-brand__name">
        <Nom />
      </span>
    </span>
  );
}
