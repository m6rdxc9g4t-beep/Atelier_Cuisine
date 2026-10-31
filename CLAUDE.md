# Instructions pour Claude — `atelier_Cuisine`

Avant toute modification, lis [`CONTEXT_SPEC.md`](CONTEXT_SPEC.md) (cahier des charges du foyer d'Auré et François) et [`design/DESIGN.md`](design/DESIGN.md) (charte néon). Interface, libellés, messages et réponses de l'IA : **en français**.

## Stack (celle de l'app en production)

Le cahier des charges initial proposait Next.js + Prisma + SQLite. L'app existante tourne sur une autre stack, conservée pour garder la synchro Mac ↔ iPhone, l'app Mac et l'hébergement :

| Besoin de la spec | Mise en œuvre |
|---|---|
| Frontend | React 19 + TypeScript + Vite (`frontend/`), PWA iPhone sur Vercel, app Mac Tauri |
| Base de données | Supabase Postgres + RLS (`backend/supabase/migrations/`), temps réel entre appareils |
| `prisma/schema.prisma` | migrations SQL datées ; types côté app dans `frontend/src/lib/supabase.ts` |
| `prisma/seed.ts` | catalogues JSON + générateurs SQL (`backend/catalogue/`, `backend/recettes/`) ; exemples du foyer : `ajouter_exemples_foyer()` |
| `inventory-calculator.ts` | `frontend/src/lib/stock.ts` (FEFO, liste depuis le planning) et `budget.ts`, testés avec Vitest |
| `receipt-parser.ts` | `frontend/src/lib/ticket.ts` (Carrefour sans IA, normalisation, rapprochement) + `fichiers.ts` (PDF, photos) |
| `ai-provider.ts` | `frontend/src/lib/ia.ts` : Ollama (local) / Claude via la fonction `lire-ticket` (cloud) / auto, bascule si Ollama ne répond pas en 3 s |
| Valider les courses | RPC `archiver_courses` : ticket archivé + stock + budget en une transaction |
| Cuisiner un repas | RPC `cuisiner_repas` avec la consommation calculée par `stock.ts` |

Correspondances de noms : `stockLevel` FULL / HALF / ONE_MEAL / LOW → `plein` / `moitie` / `un_repas` / `fin` ; `inContainer` → `in_container` ; `openedAt` → `opened_on` ; rayons → table `aisles` (identifiants `fruits_legumes` … `entretien`, + `autre`).

## Règles

- TypeScript strict, pas de `any`. Les 11 rayons existent en double (table `aisles` et `frontend/src/lib/rayons.ts`) ; la normalisation des noms aussi (`normaliser.ts` et fonctions SQL) : modifier les deux côtés.
- Toute nouvelle table : RLS activée, politiques par `user_id`, fonctions SQL en `security invoker` avec `search_path = ''`.
- Une session de courses validée (liste ou ticket importé) passe toujours par `archiver_courses` : Récap, Stock et Budget restent cohérents.
- Design : charte « néon monochrome » de la suite Atelier (`design/DESIGN.md`) : **toute l'app est dans un gris argent** (`--atelier-signature` remplacée dans `tokens.css` : `#C3C8D0` en néon, `#868C96` en clair, au lieu de l'orchidée `#E056E2` de la suite), en néon (sombre) comme en clair, sans bleu nuit ni cyan de structure. `frontend/src/styles/atelier-brand/atelier-brand.css` est une copie exacte du fichier de la suite (avec la police Nunito « Atelier Brand ») : ne jamais l'éditer ici. `<html data-atelier-app="cuisine">` ; thème = `data-theme="dark"` + classe `dark` (néon, défaut) ou `data-theme="light"`, posés par le script anti-flash d'`index.html` et `appliquerTheme` (`lib/donnees.tsx`). `tokens.css` branche les jetons de l'app sur les `--atelier-*` du kit : fond `background: var(--atelier-backdrop), var(--atelier-bg)` (jamais en `background-image`), cartes `--contour` + `--halo`, champs et boutons secondaires `--trait`, séparateurs `--ligne`, texte ou icône en couleur `--signature-texte` (jamais `--signature` pour un texte), actif `--signature-douce`, survol `--signature-legere`, focus `--atelier-focus`. Action principale (`.bouton--action`) pleine en clair, contour néon en sombre. Les couleurs qui portent un sens ne changent pas : fraîcheur `--frais` / `--bientot` / `--urgent` (les enseignes « À finir en premier » et le compte à rebours gardent leur halo dans ces couleurs), `--boite`, budgets `--data-ali` / `--data-maison`. Cibles tactiles de 44 px.

## Commandes

```bash
cd frontend && npm install && npm run dev      # http://localhost:1420
cd frontend && npm test && npx tsc -b && npm run lint && npm run build
cd backend/tests && npm install && npm test     # migrations sur PGlite
python3 backend/catalogue/generer_sql.py > backend/supabase/migrations/20261021080400_catalogue_produits_favoris.sql
python3 backend/recettes/generer_sql.py > backend/supabase/migrations/20261021080300_catalogue_recettes.sql
```

Un push sur `main` qui touche `frontend/` recompile l'app Mac : appliquer d'abord les migrations Supabase (`supabase db push`).
