# atelier_Cuisine — design UI

L'app de cuisine du foyer d'Auré et François : le stock du frigo et des placards, le semainier des repas, la liste de courses, les tickets de caisse et le budget.

**Tâche principale de l'interface :** montrer d'un coup d'œil ce qu'il faut finir en premier, puis ce qu'on mange et ce qu'on achète.

## Direction : néon monochrome (charte v2 de la suite Atelier)

L'app suit la charte « néon monochrome » partagée par toutes les applications de la suite Atelier (Projets, Viz, Tab, Ciné, Trésorerie, Savoir, Nexus, Dates, Cuisine) : **chaque app est entièrement dans sa couleur signature**. Pour Cuisine, un **gris argent** (choix du foyer, à la place de le gris `#E056E2` prévue par la suite) : `#C3C8D0` en néon, `#868C96` en clair. Fond, barre latérale, verre, traits, textes secondaires, halos et grille en dérivent par mélange et transparence, en néon (sombre) comme en clair. Il n'y a plus ni fond bleu nuit ni structure cyan (la v1 « néon holographique » est remplacée).

- **Néon (défaut)** : fond quasi noir teinté d'gris avec une fine grille et une lueur en haut, panneaux de verre cerclés d'un trait gris lumineux avec halo, action principale en contour néon.
- **Clair** : fond gris très pâle avec la même grille, cartes blanches cerclées d'gris avec un léger halo, action principale pleine.

### Le kit commun

`frontend/src/styles/atelier-brand/atelier-brand.css` est une **copie exacte** du fichier de marque de la suite (source : Atelier_Projets `design-system/brand/`), avec la police `nunito-latin-wght-normal.woff2` (« Atelier Brand ») et sa licence `OFL-Nunito.txt`. Ne jamais l'éditer ici : toute modification se fait à la source puis dans chaque copie. Il définit, pour les deux thèmes, tous les jetons `--atelier-*` dérivés de la signature.

- Activation : `<html data-atelier-app="cuisine">` (`frontend/index.html`).
- Thème : néon = `data-theme="dark"` **et** classe `dark` ; clair = `data-theme="light"`. Le choix Néon / Clair / Selon le système reste dans les Réglages (préférence `atelier.reglages` en `localStorage`, néon par défaut) ; un script anti-flash dans `index.html` pose les marqueurs avant le premier rendu, puis `appliquerTheme` (`src/lib/donnees.tsx`) les tient à jour, y compris quand le système change de thème.
- Couleurs littérales obligatoires alignées sur `--atelier-bg` : `#0f1013` (signature à 6 % dans `#07070A`) pour la fenêtre Tauri (`backgroundColor`), le `theme-color` et le manifeste PWA ; `#f5f5f8` (5 % dans `#FBFBFD`) pour le `theme-color` en clair.

### Jetons de l'app (`tokens.css`)

Les noms de l'app sont branchés sur le kit ; leurs valeurs suivent le thème toutes seules.

| Jeton | Branché sur | Rôle |
|---|---|---|
| `--nuit` / `--bg` | `--atelier-bg` | fond des écrans (toujours `background: var(--atelier-backdrop), var(--atelier-bg)`, jamais en `background-image`) |
| `--nuit-2` / `--bg-creux` | `--atelier-sidebar` | barre latérale, zones creusées |
| `--verre` / `--verre-plein` / `--surface` | `--atelier-surface` (86 % / opaque) | panneaux, listes, feuilles |
| `--verre-haut` | gris à 7 % | reflet en haut des panneaux |
| `--survol` / `--selection` / `--champ-fond` | `--atelier-surface-2` / `-3` / `--atelier-field` | survol, sélection, champs |
| `--contour` | `--atelier-border` | contour des cartes et panneaux (+ `--halo`) |
| `--trait` | `--atelier-border-soft` | champs, boutons secondaires, puces |
| `--ligne` | `--atelier-line` | séparateurs, lignes de tableau, grille des graphiques |
| `--encre` / `--encre-2` / `--encre-3` | `--atelier-text` / `--atelier-muted` / muted adouci | texte, texte secondaire, texte tertiaire (≥ 4,5:1) |
| `--signature` / `--action` / `--focus` | `--atelier-signature` (`#C3C8D0` / `#868C96`) | couleur signature, action principale, contour de focus |
| `--signature-texte` / `--lavande-encre` | `--atelier-ink` | gris en texte ou en icône (lisible sur les deux fonds) |
| `--signature-douce` / `--lavande` | `--atelier-signature-soft` | élément actif, pastille |
| `--signature-legere` | `--atelier-signature-faint` | survol |
| `--signature-encre` | `--atelier-signature-contrast` | texte posé sur le gris pleine |
| `--halo` / `--halo-fort` / `--ombre-feuille` | `--atelier-glow` / `--atelier-glow-strong` | cartes ; feuilles, menus, bulles, toasts |
| `--glow-signature` / `--texte-neon` | `--atelier-signature-glow` / `--atelier-text-glow` | action principale ; titres d'écran |
| `--frais` / `--bientot` / `--urgent` | inchangés : `#3DDC97` / `#FFB347` / `#FF5C6C` (clair `#12804F` / `#A85F00` / `#CC2B3B`) | fraîcheur (et montants négatifs pour le rouge) |
| `--boite` | inchangé : `#78B4FF` (clair `#2F6FD6`) | produit mis dans une boîte |
| `--data-ali` / `--data-maison` | inchangés : `#22A86B` / `#9D7BF0` (clair `#1A8F5B` / `#7A56D8`) | budgets Alimentaire / Maison & hygiène |

La couche de matières et les composants sont dans [`neon.css`](../frontend/src/styles/neon.css).

### Couleur signature : le gris argent

La charte attribue une couleur à chaque app ; pour Cuisine elle prévoit le gris `#E056E2`. Le foyer a préféré du **gris** : `tokens.css` remplace `--atelier-signature` par un argent `#C3C8D0` en néon (garde la lueur) et un gris `#868C96` en clair (texte `#0B0B0F` posé dessus à 5,7:1), sans toucher au kit de la suite. Tout le reste (fond, verre, traits, halos) en dérive comme avant.

Depuis la v2, elle n'est plus une touche sur une base cyan : **toute l'interface en dérive**. Bouton principal (plein en clair, contour néon en sombre), onglet actif (barre à gauche ou au-dessus, fond en transparence, halo), liens, titres de groupe, icônes, cases cochées, focus, contours et halos des cartes, grille du fond, courbe des prix et jauge globale (une seule mesure, sans sens par couleur).

### Couleurs de données

- **Fraîcheur** (spec du foyer) : rouge à moins de 2 jours, orange de 2 à 5 jours, vert au-delà, **bleu** pour un produit mis en boîte. Ces couleurs ne prennent jamais le gris.
- **Budget** : vert pour l'Alimentaire (rayons 1 à 9), violet pour Maison & hygiène (rayons 10 et 11), gris de la signature pour Sorties / Resto. Palette validée (séparation pour les daltonismes, contraste sur les deux fonds) ; le graphique a une légende, une bulle au survol et une vue tableau.
- Le rouge ne sert qu'aux alertes et aux hausses de prix.

## Matières

1. **Verre** : panneaux translucides (flou d'arrière-plan), trait gris de 1 px et halo, reflet gris en haut. Remplacé par un fond opaque si l'utilisateur réduit la transparence.
2. **Néon** : les enseignes « À finir en premier » et les chiffres du compte à rebours brillent dans la couleur de **leur donnée** (rouge, orange, vert), l'action principale en gris.
3. **Fond** : quasi noir (ou très clair) teinté d'gris, fine grille de 32 px et lueur gris en haut.

## Typographie

**Nunito** (variable), la sans-serif arrondie de la charte, embarquée pour fonctionner hors ligne sur Mac. Titres d'écran 32 px (44 px sur Mac) en graisse 850 ; corps 17 px (taille iOS, pas de zoom automatique dans Safari) ; chiffres du compte à rebours 52 px en graisse 900, avec un halo de leur couleur ; montants en chiffres tabulaires. La marque suit le balisage commun de la suite (`.atelier-brand` : tuile cerclée d'gris avec l'icône Lucide `CookingPot`, puis le nom `atelier_Cuisine` en « Atelier Brand », « atelier_ » estompé).

## Les 5 onglets

| Onglet | Icône | Contenu |
|---|---|---|
| **Stock** | `Refrigerator` | « À finir en premier » en enseignes néon, saisie en une ligne, produits par emplacement (frigo, corbeille, placard, congélateur, maison) avec niveau rapide, date de l'emballage, mise en boîte et note |
| **Repas** | `Calendar` | semainier Lundi → Dimanche (ou focus week-end), Midi / Soir, trois types de repas (recette, assemblage rapide, extérieur), cases « cuisiné » ; idées de plats dans le même onglet |
| **Courses** | `ShoppingCart` | liste par les 11 rayons, articles proposés depuis le planning, mode magasin (prix et date en cochant), « Valider & archiver » |
| **Récap** | `Receipt` | bilan du dernier panier, tickets façon ticket de caisse (bord dentelé, pointillés, lignes par rayon), import PDF / photo / texte avec vérification |
| **Budget** | `Wallet` | plafonds par périmètre, indicateurs du mois, six mois en barres, évolution des prix |

Mise en page : barre d'onglets en bas sur iPhone (zone de sécurité respectée), barre latérale de 248 px sur Mac (≥ 860 px), contenu centré sur 760 px, feuilles qui montent du bas sur iPhone et dialogues centrés sur Mac.

## Principes

1. **Ce qui presse d'abord.** Tri par date partout, mêmes couleurs de fraîcheur partout, alertes à la même place.
2. **Saisie en une ligne.** « 2 kg de patates » donne quantité, unité, rayon, emplacement et date estimée, grâce au catalogue du foyer.
3. **Chaque action dit ce qu'elle fait.** « Valider & archiver », « C'est cuisiné », « Confirmer et ajouter au stock & budget » ; le toast reprend le même verbe.
4. **On vérifie avant d'enregistrer.** Un ticket lu (avec ou sans IA) passe toujours par une modale de vérification ; une déduction de stock se décoche.
5. **Accessibilité.** Cibles de 44 px, focus gris visible, contrastes vérifiés sur les deux thèmes, `prefers-reduced-motion` et `prefers-reduced-transparency` respectés.

## Icône

Sur Mac, l'icône de l'app (Dock, Finder, Launchpad) est le **logo complet** (`logo-atelier-cuisine.png`, contour argent, intérieur cyan), comme les autres apps de la suite : `icone/logo-mac-1024.png`, puis `npx tauri icon design/icone/logo-mac-1024.png`. La petite cocotte ci-dessous reste l'icône de l'app iPhone et des favicons.

Version simplifiée de la charte (le carré arrondi seul, lisible à 64 px) : fond anthracite, cadre chromé argent lumineux, cocotte et vapeur argent, étincelles sur les arêtes. Logo complet (avec l'étiquette `atelier_Cuisine`) : [`logo-atelier-cuisine.png`](logo-atelier-cuisine.png). Sources dans [`icone/`](icone/) : `icone-carre.svg` pour l'iPhone, `icone-mac.svg` et `icone-mac-1024.png` pour macOS. Les PNG de l'app se régénèrent avec `node frontend/scripts/icones.mjs` et `npx tauri icon design/icone/icone-mac-1024.png`.

## Captures

Ces captures montrent encore la v1 (fond bleu nuit, structure cyan) : à refaire avec la charte v2.

| iPhone | | |
|---|---|---|
| ![Stock](captures/iphone-1-stock.png) | ![Repas](captures/iphone-2-repas.png) | ![Courses en mode magasin](captures/iphone-3-courses.png) |
| ![Récap](captures/iphone-4-recap.png) | ![Ticket déplié](captures/iphone-4b-ticket.png) | ![Budget](captures/iphone-5-budget.png) |
| ![Import du ticket Carrefour](captures/iphone-6-import-ticket.png) | ![Planifier un repas](captures/iphone-7-planifier.png) | ![Cuisiner : déduction FEFO](captures/iphone-8-cuisiner.png) |
| ![Thème clair](captures/iphone-clair-stock.png) | | |

**Mac**

![Stock sur Mac](captures/mac-1-stock.png)
![Repas sur Mac](captures/mac-2-repas.png)
![Récap sur Mac](captures/mac-4-recap.png)
![Budget sur Mac](captures/mac-5-budget.png)
