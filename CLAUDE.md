# Instructions pour Claude — Atelier Cuisine

Avant toute modification, lis [`CONTEXT_SPEC.md`](CONTEXT_SPEC.md) (cahier des charges du foyer d'Auré et François) et [`design/DESIGN.md`](design/DESIGN.md) (charte v2 « Linear » de la suite). Interface, libellés, messages et réponses de l'IA : **en français**.

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
- Design : charte v2 « Linear » de la suite Atelier (`design/DESIGN.md`, règles communes dans `Atelier_Deploy/DESIGN.md`) : structure neutre gris froid commune à la suite, clair et sombre, plate au repos, traits de 1 px, police Inter ; la signature de Cuisine, **lavande `#8568a7`** (`--atelier-sig-cuisine`), ne sert qu'au bouton principal (plein), à la sélection, au focus, aux liens et à l'icône (Lucide `utensils`). Pas de halo, de lueur, de grille de fond ni de barre de couleur à gauche. `frontend/src/styles/atelier-brand/` contient des **copies verbatim** de la suite (`atelier-brand.css`, `atelier-theme.js`, les deux woff2 Inter et leur licence) : ne jamais les éditer ici. `<html data-atelier-app="cuisine">` ; thème = préférence commune Système / Clair / Sombre de `atelier-theme.js` (`window.atelierTheme`, `localStorage["atelier:theme"]`), inséré en tête de `<head>` par `vite.config.ts`, qui pose `data-theme` + classe `dark`. `tokens.css` branche les jetons de l'app sur les `--atelier-*` ; `app.css` porte tous les composants. Les couleurs qui portent un sens ne changent pas : fraîcheur `--frais` / `--bientot` / `--urgent` (seuls l'urgent et le bientôt sont colorés), `--boite`, budgets `--data-ali` / `--data-maison`. Cibles tactiles de 44 px au téléphone, densité Mac (13 px, lignes de 40 px) avec une souris.

## Commandes

```bash
cd frontend && npm install && npm run dev      # http://localhost:1420
cd frontend && npm test && npx tsc -b && npm run lint && npm run build
cd backend/tests && npm install && npm test     # migrations sur PGlite
python3 backend/catalogue/generer_sql.py > backend/supabase/migrations/20261021080400_catalogue_produits_favoris.sql
python3 backend/recettes/generer_sql.py > backend/supabase/migrations/20261021080300_catalogue_recettes.sql
```

Un push sur `main` qui touche `frontend/` recompile l'app Mac : appliquer d'abord les migrations Supabase (`supabase db push`).
