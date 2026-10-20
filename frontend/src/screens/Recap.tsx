import { useMemo, useRef, useState } from "react";
import { AlertTriangle, Camera, ClipboardCopy, FileText, RotateCcw, Sparkles, Trash2, Type, Upload } from "lucide-react";
import { Feuille } from "../components/Feuille";
import { useToast } from "../components/Toast";
import { CATEGORIES, deviner, EMPLACEMENTS, formatPrix, type Emplacement } from "../lib/aliments";
import { useCatalogue } from "../lib/catalogue";
import { ajouterJours, aujourdhui, dateCourte } from "../lib/dates";
import { useDonnees, useReglages } from "../lib/donnees";
import { enBase64, photoAllegee, texteDuPdf } from "../lib/fichiers";
import { IAIndisponible, lireTicketIA, type EntreeTicket, type Moteur } from "../lib/ia";
import { cleAliment } from "../lib/normaliser";
import { estAlimentaire, rayon, RAYONS } from "../lib/rayons";
import { messageErreur, supabase, type Product, type ShoppingSession, type ShoppingSessionItem, type SourceSession } from "../lib/supabase";
import { decoderTicketTexte, versMarkdown, type TicketDecode } from "../lib/ticket";

export function Recap() {
  const { sessions, sessionItems, chargement } = useDonnees();
  const [importer, setImporter] = useState(false);
  const parSession = useMemo(() => {
    const m = new Map<string, ShoppingSessionItem[]>();
    for (const i of sessionItems) m.set(i.session_id, [...(m.get(i.session_id) ?? []), i]);
    return m;
  }, [sessionItems]);
  const dernier = sessions[0];

  return (
    <div className="ecran">
      <header className="ecran__tete ecran__tete--avec-action">
        <div>
          <h1>Récap</h1>
          <p className="ecran__sous-titre">
            {sessions.length === 0
              ? "Tes tickets de caisse, rangés et analysés"
              : `${sessions.length} ticket${sessions.length > 1 ? "s" : ""} archivé${sessions.length > 1 ? "s" : ""}`}
          </p>
        </div>
        <button className="bouton bouton--action" onClick={() => setImporter(true)}>
          <Upload size={18} aria-hidden /> Importer un ticket
        </button>
      </header>

      {!chargement && sessions.length === 0 && (
        <div className="vide">
          <p className="vide__titre">Aucun ticket pour l'instant</p>
          <p>
            Valide tes courses depuis l'onglet Courses, ou importe un e-ticket PDF, une photo ou le texte d'un ticket : les produits
            entrent dans le stock et les montants dans le budget.
          </p>
        </div>
      )}

      {dernier && <BilanPanier session={dernier} items={parSession.get(dernier.id) ?? []} />}

      {sessions.length > 0 && (
        <section aria-labelledby="historique-titre">
          <h2 id="historique-titre" className="section-titre">
            Historique des tickets
          </h2>
          <ol className="tickets">
            {sessions.map((s) => (
              <li key={s.id}>
                <Ticket session={s} items={parSession.get(s.id) ?? []} />
              </li>
            ))}
          </ol>
        </section>
      )}

      <ImportTicket ouverte={importer} onFermer={() => setImporter(false)} />
    </div>
  );
}

/** Bilan du dernier panier : total, articles, répartition, top 3. */
function BilanPanier({ session, items }: { session: ShoppingSession; items: ShoppingSessionItem[] }) {
  const top = [...items].sort((a, b) => b.total_price - a.total_price).slice(0, 3);
  const total = session.food_subtotal + session.home_subtotal || 1;
  const partAli = (session.food_subtotal / total) * 100;
  return (
    <section className="bilan panneau" aria-labelledby="bilan-titre">
      <div className="bilan__tete">
        <h2 id="bilan-titre">Dernier panier</h2>
        <span className="note">
          {session.store_name} · {dateCourte(session.purchased_at)}
        </span>
      </div>
      <div className="bilan__chiffres">
        <div className="chiffre">
          <span className="chiffre__valeur">{formatPrix(session.total_amount)}</span>
          <span className="chiffre__label">total TTC</span>
        </div>
        <div className="chiffre">
          <span className="chiffre__valeur">{session.items_count}</span>
          <span className="chiffre__label">article{session.items_count > 1 ? "s" : ""}</span>
        </div>
      </div>
      <div className="repartition" role="img" aria-label={`Alimentaire ${formatPrix(session.food_subtotal)}, maison et hygiène ${formatPrix(session.home_subtotal)}`}>
        <span className="repartition__ali" style={{ width: `${partAli}%` }} />
        <span className="repartition__maison" style={{ width: `${100 - partAli}%` }} />
      </div>
      <div className="legende">
        <span className="legende__ali">Alimentaire {formatPrix(session.food_subtotal)}</span>
        <span className="legende__maison">Maison & hygiène {formatPrix(session.home_subtotal)}</span>
      </div>
      {top.length > 0 && (
        <>
          <h3 className="bilan__sous-titre">Les plus chers</h3>
          <ol className="top3">
            {top.map((i, k) => (
              <li key={i.id}>
                <span className="top3__rang">{k + 1}</span>
                <span className="top3__nom">{i.matched_name ?? i.raw_label}</span>
                <span className="top3__prix">{formatPrix(i.total_price)}</span>
              </li>
            ))}
          </ol>
        </>
      )}
    </section>
  );
}

/** Un ticket archivé, présenté comme un ticket de caisse structuré. */
function Ticket({ session, items }: { session: ShoppingSession; items: ShoppingSessionItem[] }) {
  const { recharger } = useDonnees();
  const toast = useToast();
  const [reprise, setReprise] = useState<Set<string> | null>(null);
  const parRayon = RAYONS.map((r) => ({ r, items: items.filter((i) => rayon(i.category).id === r.id) })).filter((g) => g.items.length);
  const source: Record<SourceSession, string> = {
    liste: "Liste de courses",
    ticket_pdf: "E-ticket PDF",
    ticket_photo: "Photo",
    ticket_texte: "Texte",
    manuel: "Saisie",
  };

  async function copier() {
    try {
      await navigator.clipboard.writeText(versMarkdown(session, items));
      toast("Récapitulatif copié en Markdown");
    } catch {
      toast("Copie impossible sur cet appareil", { erreur: true });
    }
  }

  async function reprendre() {
    const choisis = items.filter((i) => reprise?.has(i.id));
    if (!choisis.length) return setReprise(null);
    const { error } = await supabase.from("shopping_items").insert(
      choisis.map((i) => ({
        name: i.matched_name ?? i.raw_label,
        category: i.category,
        product_id: i.product_id,
        source: "ticket",
        quantity: i.quantity > 1 ? i.quantity : null,
        note: `vu à ${formatPrix(i.unit_price)}`,
      })),
    );
    if (error) return toast(messageErreur(error), { erreur: true });
    setReprise(null);
    recharger("shopping_items");
    toast(`${choisis.length} article${choisis.length > 1 ? "s" : ""} ajouté${choisis.length > 1 ? "s" : ""} à la liste de courses`);
  }

  async function supprimer() {
    if (!window.confirm(`Supprimer le ticket ${session.store_name} du ${dateCourte(session.purchased_at)} ? Les produits déjà en stock restent.`)) return;
    const { error } = await supabase.from("shopping_sessions").delete().eq("id", session.id);
    if (error) return toast(messageErreur(error), { erreur: true });
    recharger("shopping_sessions");
  }

  return (
    <details className="ticket">
      <summary className="ticket__tete">
        <span className="ticket__magasin">{session.store_name}</span>
        <span className="ticket__date">
          {new Date(session.purchased_at).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" })}
        </span>
        <span className="ticket__total">{formatPrix(session.total_amount)}</span>
        <span className="ticket__meta">
          {session.items_count} article{session.items_count > 1 ? "s" : ""} · {source[session.source]}
        </span>
      </summary>
      <div className="ticket__corps">
        <dl className="ticket__sous-totaux">
          <div>
            <dt>Alimentaire</dt>
            <dd>{formatPrix(session.food_subtotal)}</dd>
          </div>
          <div>
            <dt>Maison & hygiène</dt>
            <dd>{formatPrix(session.home_subtotal)}</dd>
          </div>
          {session.payment_method && (
            <div>
              <dt>Paiement</dt>
              <dd>{session.payment_method}</dd>
            </div>
          )}
        </dl>
        {parRayon.map(({ r, items: l }) => (
          <div key={r.id} className="ticket__rayon">
            <h4>
              <span aria-hidden>{r.emoji}</span> {r.nom}
            </h4>
            <ul>
              {l.map((i) => (
                <li key={i.id} className="ticket__ligne">
                  {reprise && (
                    <input
                      type="checkbox"
                      aria-label={`Reprendre ${i.matched_name ?? i.raw_label}`}
                      checked={reprise.has(i.id)}
                      onChange={(e) => {
                        const n = new Set(reprise);
                        if (e.target.checked) n.add(i.id);
                        else n.delete(i.id);
                        setReprise(n);
                      }}
                    />
                  )}
                  <span className="ticket__produit">
                    {i.matched_name ?? i.raw_label}
                    <span className="ticket__brut">
                      {[i.brand, i.packaging_size, i.tva_rate != null && `TVA ${String(i.tva_rate).replace(".", ",")} %`].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                  <span className="ticket__qte">
                    {i.quantity} × {formatPrix(i.unit_price)}
                  </span>
                  <span className="ticket__montant">{formatPrix(i.total_price)}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
        <div className="ticket__actions">
          {reprise ? (
            <>
              <button className="bouton bouton--discret" onClick={() => setReprise(null)}>
                Annuler
              </button>
              <button className="bouton bouton--action" onClick={reprendre} disabled={!reprise.size}>
                Ajouter {reprise.size || ""} à la liste
              </button>
            </>
          ) : (
            <>
              <button className="bouton bouton--discret" onClick={() => setReprise(new Set())}>
                <RotateCcw size={16} aria-hidden /> Reprendre des articles
              </button>
              <button className="bouton bouton--discret" onClick={copier}>
                <ClipboardCopy size={16} aria-hidden /> Markdown
              </button>
              <button className="bouton-icone" onClick={supprimer} aria-label="Supprimer le ticket">
                <Trash2 size={18} />
              </button>
            </>
          )}
        </div>
      </div>
    </details>
  );
}

// ---------------------------------------------------------------------------
// Import d'un ticket (PDF, photo ou texte) et modale de vérification
// ---------------------------------------------------------------------------

type Mode = "pdf" | "photo" | "texte";

interface LigneApercu {
  cle: string;
  rawLabel: string;
  nom: string;
  productId: string | null;
  nouveau: boolean;
  brand: string | null;
  packagingSize: string | null;
  category: string;
  tvaRate: number | null;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  expires_on: string | null;
  toPantry: boolean;
  location: Emplacement;
}

function versApercu(t: TicketDecode, produits: Product[]): LigneApercu[] {
  return t.items.map((i, k) => {
    const d = deviner(i.matchedIngredientName);
    const alimentaire = estAlimentaire(i.category);
    const connu = i.productId != null || produits.some((p) => cleAliment(p.name) === cleAliment(i.matchedIngredientName));
    return {
      cle: String(k),
      rawLabel: i.rawLabel,
      nom: i.matchedIngredientName,
      productId: i.productId,
      nouveau: !connu,
      brand: i.brand,
      packagingSize: i.packagingSize,
      category: i.category,
      tvaRate: i.tvaRate,
      quantity: i.quantity,
      unitPrice: i.unitPrice,
      totalPrice: i.totalPrice,
      // Produits frais : date estimée, à corriger avec l'emballage
      expires_on: alimentaire && d.jours != null && d.jours <= 30 ? ajouterJours(aujourdhui(), d.jours) : null,
      toPantry: alimentaire,
      location: rayon(i.category).emplacement,
    };
  });
}

function ImportTicket({ ouverte, onFermer }: { ouverte: boolean; onFermer: () => void }) {
  const toast = useToast();
  const { recharger } = useDonnees();
  const { catalogue, recharger: rechargerCatalogue } = useCatalogue();
  const [reglages, majReglages] = useReglages();
  const [mode, setMode] = useState<Mode>("pdf");
  const [texte, setTexte] = useState("");
  const [lecture, setLecture] = useState<string | null>(null);
  const [erreur, setErreur] = useState<{ message: string; proposer: IAIndisponible["proposer"] } | null>(null);
  const [ticket, setTicket] = useState<TicketDecode | null>(null);
  const [lignes, setLignes] = useState<LigneApercu[]>([]);
  const [brut, setBrut] = useState<string | null>(null);
  const [moteur, setMoteur] = useState<Moteur | "sans_ia" | null>(null);
  const [source, setSource] = useState<SourceSession>("ticket_pdf");
  const [enCours, setEnCours] = useState(false);
  const derniereEntree = useRef<{ entree: EntreeTicket; source: SourceSession } | null>(null);
  const produits = catalogue?.produits ?? [];

  function reinitialiser() {
    setTicket(null);
    setLignes([]);
    setErreur(null);
    setLecture(null);
    setTexte("");
    setBrut(null);
  }

  function afficher(t: TicketDecode, m: Moteur | "sans_ia", texteBrut: string | null, s: SourceSession) {
    if (!t.items.length) {
      setErreur({ message: "Aucun article reconnu sur ce ticket.", proposer: m === "sans_ia" ? "auto" : null });
      return;
    }
    setTicket(t);
    setLignes(versApercu(t, produits));
    setMoteur(m);
    setBrut(texteBrut);
    setSource(s);
  }

  async function viaIA(entree: EntreeTicket, s: SourceSession) {
    derniereEntree.current = { entree, source: s };
    setLecture(reglages.modeIA === "cloud" ? "Lecture par Claude…" : "Lecture par l'IA…");
    try {
      const r = await lireTicketIA(entree, produits, reglages);
      afficher(r.ticket, r.moteur, entree.texte ?? null, s);
    } catch (e) {
      setErreur({
        message: e instanceof Error ? e.message : String(e),
        proposer: e instanceof IAIndisponible ? e.proposer : null,
      });
    } finally {
      setLecture(null);
    }
  }

  /** Texte d'e-ticket : décodeur sans IA d'abord, IA si rien n'est reconnu. */
  async function lireTexte(t: string, s: SourceSession) {
    setErreur(null);
    const local = decoderTicketTexte(t, produits);
    if (local.items.length) return afficher(local, "sans_ia", t, s);
    await viaIA({ texte: t }, s);
  }

  async function surFichier(f: File | undefined) {
    if (!f) return;
    setErreur(null);
    try {
      if (mode === "pdf") {
        setLecture("Extraction du texte du PDF…");
        const t = await texteDuPdf(f);
        setLecture(null);
        if (t.trim().length > 20) await lireTexte(t, "ticket_pdf");
        else await viaIA({ pdf: await enBase64(f) }, "ticket_pdf"); // PDF scanné, sans texte
      } else {
        setLecture("Préparation de la photo…");
        await viaIA({ image: await photoAllegee(f) }, "ticket_photo");
      }
    } catch (e) {
      setLecture(null);
      setErreur({ message: messageErreur(e), proposer: null });
    }
  }

  const majLigne = (cle: string, p: Partial<LigneApercu>) => setLignes((l) => l.map((x) => (x.cle === cle ? { ...x, ...p } : x)));
  const somme = Math.round(lignes.reduce((t, l) => t + l.totalPrice, 0) * 100) / 100;
  const ecart = ticket?.totalAmount != null ? Math.round((ticket.totalAmount - somme) * 100) / 100 : 0;

  async function confirmer() {
    if (!ticket) return;
    setEnCours(true);
    try {
      // Produits inconnus : ajoutés au catalogue du foyer
      const nouveaux = lignes.filter((l) => l.nouveau && l.nom.trim());
      const ids = new Map<string, string>();
      if (nouveaux.length) {
        const uniques = [...new Map(nouveaux.map((l) => [cleAliment(l.nom), l])).values()];
        const { data, error } = await supabase
          .from("products")
          .insert(uniques.map((l) => ({ name: l.nom.trim(), aisle_id: l.category, keywords: [cleAliment(l.nom)] })))
          .select("id, name");
        if (error) throw error;
        for (const p of data as { id: string; name: string }[]) ids.set(cleAliment(p.name), p.id);
      }
      const purchased = ticket.purchaseDate ? new Date(ticket.purchaseDate).toISOString() : new Date().toISOString();
      const { error } = await supabase.rpc("archiver_courses", {
        p_session: {
          purchased_at: purchased,
          store_name: ticket.storeName,
          payment_method: ticket.paymentMethod,
          total_amount: ticket.totalAmount,
          source,
          raw_text: brut,
          notes: moteur === "sans_ia" ? "Lu sans IA" : moteur === "ollama" ? "Lu par Ollama" : "Lu par Claude",
        },
        p_items: lignes.map((l) => ({
          raw_label: l.rawLabel,
          matched_name: l.nom.trim() || l.rawLabel,
          product_id: l.productId ?? ids.get(cleAliment(l.nom)) ?? null,
          brand: l.brand,
          packaging_size: l.packagingSize,
          category: l.category,
          tva_rate: l.tvaRate,
          quantity: l.quantity,
          unit_price: l.unitPrice,
          total_price: l.totalPrice,
          expires_on: l.expires_on,
          to_pantry: l.toPantry,
          location: l.location,
        })),
        p_shopping_ids: [],
      });
      if (error) throw error;
      const enStock = lignes.filter((l) => l.toPantry).length;
      toast(`Ticket archivé : ${formatPrix(ticket.totalAmount ?? somme)}, ${enStock} produit${enStock > 1 ? "s" : ""} en stock`);
      if (nouveaux.length) rechargerCatalogue(true);
      recharger();
      reinitialiser();
      onFermer();
    } catch (e) {
      toast(messageErreur(e), { erreur: true });
    } finally {
      setEnCours(false);
    }
  }

  const etiquetteMoteur = moteur === "sans_ia" ? "Lu sans IA" : moteur === "ollama" ? "Lu par Ollama (local)" : "Lu par Claude (cloud)";

  return (
    <Feuille
      ouverte={ouverte}
      titre={ticket ? "Vérifier le ticket" : "Importer un ticket"}
      onFermer={() => {
        reinitialiser();
        onFermer();
      }}
      large
      pied={
        ticket ? (
          <>
            <button className="bouton bouton--discret" onClick={reinitialiser}>
              Recommencer
            </button>
            <button className="bouton bouton--action" onClick={confirmer} disabled={enCours || !lignes.length}>
              Confirmer et ajouter au stock & budget
            </button>
          </>
        ) : undefined
      }
    >
      {!ticket ? (
        <div className="formulaire">
          <div className="segments" role="tablist" aria-label="Type de ticket">
            {(
              [
                ["pdf", "E-ticket PDF", FileText],
                ["photo", "Photo", Camera],
                ["texte", "Texte", Type],
              ] as const
            ).map(([id, label, Icone]) => (
              <button key={id} role="tab" className="segment" aria-selected={mode === id} onClick={() => setMode(id)}>
                <Icone size={16} aria-hidden /> {label}
              </button>
            ))}
          </div>
          {mode === "texte" ? (
            <>
              <label className="champ-groupe">
                <span>Colle le texte du ticket</span>
                <textarea
                  className="champ champ--mono"
                  rows={10}
                  placeholder={"Carrefour\nLILLE\n14/11/2025 à 14h11\n5.5% DUCROS ANETH 13G | 1 x 2.19 | 2.19\nTotal à payer | 2.19€"}
                  value={texte}
                  onChange={(e) => setTexte(e.target.value)}
                />
              </label>
              <button className="bouton bouton--action bouton--plein" disabled={!texte.trim() || !!lecture} onClick={() => lireTexte(texte, "ticket_texte")}>
                Lire le ticket
              </button>
            </>
          ) : (
            <label className="depot">
              {mode === "pdf" ? <FileText size={32} aria-hidden /> : <Camera size={32} aria-hidden />}
              <span className="depot__titre">{mode === "pdf" ? "Choisir l'e-ticket PDF" : "Prendre ou choisir une photo"}</span>
              <span className="note">
                {mode === "pdf"
                  ? "Le texte est extrait sur l'appareil et lu sans IA quand le format est connu (Carrefour)."
                  : "La photo est lue par l'IA : Ollama sur le Mac ou Claude."}
              </span>
              <input
                type="file"
                className="visuellement-cache"
                accept={mode === "pdf" ? "application/pdf" : "image/*"}
                capture={mode === "photo" ? "environment" : undefined}
                onChange={(e) => {
                  surFichier(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
            </label>
          )}
          {lecture && (
            <p className="message" role="status" aria-busy="true">
              <Sparkles size={16} aria-hidden /> {lecture}
            </p>
          )}
          {erreur && (
            <div className="message message--erreur" role="alert">
              <p>{erreur.message}</p>
              {erreur.proposer && erreur.proposer !== reglages.modeIA && (
                <button
                  className="bouton bouton--discret"
                  onClick={() => {
                    majReglages({ modeIA: erreur.proposer! });
                    setErreur(null);
                    if (derniereEntree.current) viaIA(derniereEntree.current.entree, derniereEntree.current.source);
                  }}
                >
                  {erreur.proposer === "cloud" ? "Passer en mode Cloud (Claude)" : erreur.proposer === "local" ? "Passer en mode Local (Ollama)" : "Essayer avec l'IA"}
                </button>
              )}
            </div>
          )}
          <p className="note">Mode IA actuel : {reglages.modeIA === "local" ? "Local (Ollama)" : reglages.modeIA === "cloud" ? "Cloud (Claude)" : "Automatique"}. Modifiable dans Réglages.</p>
        </div>
      ) : (
        <div className="formulaire apercu">
          <p className="pastille pastille--info">
            <Sparkles size={14} aria-hidden /> {etiquetteMoteur}
          </p>
          <div className="formulaire__ligne">
            <label className="champ-groupe">
              <span>Magasin</span>
              <input className="champ" value={ticket.storeName} onChange={(e) => setTicket({ ...ticket, storeName: e.target.value })} />
            </label>
            <label className="champ-groupe">
              <span>Date</span>
              <input
                className="champ"
                type="datetime-local"
                value={ticket.purchaseDate?.slice(0, 16) ?? ""}
                onChange={(e) => setTicket({ ...ticket, purchaseDate: e.target.value ? e.target.value + ":00" : null })}
              />
            </label>
          </div>
          <div className="formulaire__ligne">
            <label className="champ-groupe">
              <span>Paiement</span>
              <input className="champ" value={ticket.paymentMethod ?? ""} onChange={(e) => setTicket({ ...ticket, paymentMethod: e.target.value || null })} />
            </label>
            <label className="champ-groupe">
              <span>Total payé</span>
              <input
                className="champ"
                type="number"
                step="0.01"
                inputMode="decimal"
                value={ticket.totalAmount ?? ""}
                onChange={(e) => setTicket({ ...ticket, totalAmount: e.target.value === "" ? null : Number(e.target.value) })}
              />
            </label>
          </div>
          {Math.abs(ecart) >= 0.01 && (
            <p className="message message--alerte">
              <AlertTriangle size={16} aria-hidden /> La somme des lignes ({formatPrix(somme)}) diffère du total du ticket de {formatPrix(Math.abs(ecart))}.
              Vérifie les prix (remises, consignes).
            </p>
          )}
          <datalist id="catalogue-import">
            {produits.map((p) => (
              <option key={p.id} value={p.name} />
            ))}
          </datalist>
          <ul className="apercu__lignes">
            {lignes.map((l) => (
              <li key={l.cle} className="apercu__ligne">
                <p className="apercu__brut">
                  {l.rawLabel}
                  {l.nouveau && <span className="pastille pastille--nouveau">nouveau produit</span>}
                </p>
                <div className="apercu__champs">
                  <input
                    className="champ champ--compact"
                    aria-label={`Produit pour « ${l.rawLabel} »`}
                    list="catalogue-import"
                    value={l.nom}
                    onChange={(e) => {
                      const p = produits.find((x) => x.name === e.target.value);
                      majLigne(l.cle, {
                        nom: e.target.value,
                        productId: p?.id ?? null,
                        nouveau: !p,
                        ...(p ? { category: rayon(p.aisle_id).id, toPantry: estAlimentaire(p.aisle_id), location: rayon(p.aisle_id).emplacement } : {}),
                      });
                    }}
                  />
                  <select
                    className="champ champ--compact"
                    aria-label={`Rayon de ${l.nom}`}
                    value={l.category}
                    onChange={(e) => majLigne(l.cle, { category: e.target.value, toPantry: estAlimentaire(e.target.value), location: rayon(e.target.value).emplacement })}
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                  <span className="apercu__prix">
                    {l.quantity} × {formatPrix(l.unitPrice)} = <strong>{formatPrix(l.totalPrice)}</strong>
                  </span>
                </div>
                <div className="apercu__champs">
                  <label className="archivage__stock">
                    <input type="checkbox" checked={l.toPantry} onChange={(e) => majLigne(l.cle, { toPantry: e.target.checked })} />
                    <span>Stock</span>
                  </label>
                  {l.toPantry && (
                    <>
                      <select
                        className="champ champ--compact"
                        aria-label={`Emplacement de ${l.nom}`}
                        value={l.location}
                        onChange={(e) => majLigne(l.cle, { location: e.target.value as Emplacement })}
                      >
                        {EMPLACEMENTS.map((e) => (
                          <option key={e.id} value={e.id}>
                            {e.court}
                          </option>
                        ))}
                      </select>
                      <input
                        type="date"
                        className="champ champ--compact"
                        aria-label={`Date de péremption de ${l.nom}`}
                        value={l.expires_on ?? ""}
                        onChange={(e) => majLigne(l.cle, { expires_on: e.target.value || null })}
                      />
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Feuille>
  );
}
