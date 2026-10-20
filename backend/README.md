# Backend — Supabase

Le backend est un projet Supabase (Postgres + authentification + temps réel + fonctions Edge), hébergé à Paris (`eu-west-3`).

- Projet : `atelier-cuisine` (réf. `hcdiuxznceuixindcvhp`)
- API : `https://hcdiuxznceuixindcvhp.supabase.co`

## Ce qu'il fait

| Élément | Rôle |
|---|---|
| `aisles` | les 11 rayons du foyer (+ « Autre »), avec leur budget (alimentaire pour 1 à 9, maison pour 10 et 11), l'emplacement et la conservation par défaut |
| `products` | catalogue de produits : les 152 produits habituels du foyer (`user_id` nul) et les produits ajoutés par chaque compte, avec leurs mots-clés de rapprochement |
| `pantry_items` | stock : nom, quantité **ou** niveau rapide, emplacement, date de l'emballage, date d'ouverture / de mise en boîte, note, prix d'achat |
| `shopping_items` | liste de courses : case cochée, origine (manuel, planning, à racheter, ancien ticket), prix et date saisis en magasin |
| `meals` | planning : jour, créneau, type (recette, assemblage, extérieur, libre), statut à faire / cuisiné, coût d'un repas extérieur |
| `meal_templates`, `meal_template_items` | repas types proposés dans le planning (les 15 favoris du foyer) et produits qu'un assemblage rapide déduit |
| `recipes`, `recipe_ingredients` | catalogue de 36 recettes (`user_id` nul) et recettes personnelles ; fourchettes de quantités, ingrédients facultatifs ou interchangeables |
| `shopping_sessions`, `shopping_session_items` | tickets archivés : magasin, date, paiement, totaux Alimentaire / Maison, et chaque ligne (libellé brut, produit reconnu, marque, conditionnement, rayon, TVA, prix) |
| `budgets` | un plafond par semaine ou par mois pour le global, l'alimentaire, la maison et les sorties |
| `product_prices` (vue) | dernier prix connu de chaque produit, d'après les tickets |
| `push_subscriptions` | iPhone et navigateurs abonnés aux rappels |
| `archiver_courses(session, articles, ids)` | valide des courses en une opération : ticket archivé, produits choisis en stock, liste nettoyée ; recalcule les sous-totaux selon les rayons |
| `cuisiner_repas(repas, consommation)` | marque un repas cuisiné et applique la déduction de stock choisie dans l'app (lot retiré, quantité restante ou niveau) |
| `suggest_recipes()` | suggestions classées : part d'ingrédients disponibles, plus un bonus par produit qui périme dans les 3 jours |
| `add_missing_to_shopping(recette)` | ajoute à la liste ce qui manque pour une recette (sans doublon, sans les facultatifs) |
| `store_shopping_items(articles)` | range des articles cochés dans le stock (ancien parcours, toujours disponible) |
| `ajouter_exemples_foyer()` | ajoute les exemples de la spec (jambon en boîte, niveaux de stock, pâtes à racheter), sans doublon |
| fonction Edge `lire-ticket` | lit un ticket (texte, photo ou PDF scanné) avec Claude et renvoie le JSON de la spec ; exige un utilisateur connecté |
| fonction Edge `alertes-peremption` | envoie chaque matin une notification Web Push aux appareils abonnés |
| tâche `pg_cron` `alertes-peremption` | appelle la fonction tous les jours à 7 h UTC |

**Sécurité :** RLS activée sur toutes les tables ; chaque compte ne voit que ses données. Les catalogues communs sont en lecture seule. Les fonctions SQL s'exécutent avec les droits de l'utilisateur (`security invoker`). La clé API Claude est un secret de la fonction `lire-ticket`, jamais dans l'app. Les clés VAPID et le secret d'appel des alertes sont dans Supabase Vault.

**Synchro :** stock, liste de courses, repas, tickets et budgets sont publiés en temps réel. Une modification sur le Mac apparaît sur l'iPhone sans rafraîchir.

## Rapprochement garde-manger ↔ recettes

Chaque ingrédient a un mot-clé (`match_key`) au singulier, sans accent. Un produit correspond si l'un de ses mots **commence** par ce mot-clé, après mise au singulier des deux côtés :

- « Tomates cerises » correspond à `tomate` ;
- « Volaille » ne correspond pas à `ail` ;
- `exclude_keys` évite les confusions : `pomme` exclut « pomme de terre », `lait` exclut « lait de coco ».

La même logique existe côté app dans `frontend/src/lib/normaliser.ts`.

## Fichiers

```
supabase/
  migrations/                 schéma, fonctions, catalogues, alertes (dans l'ordre)
  functions/alertes-peremption/index.ts
  functions/lire-ticket/index.ts
recettes/
  recettes.json               le catalogue de recettes, facile à enrichir
  generer_sql.py              régénère la migration du catalogue de recettes
catalogue/
  produits.json               les produits habituels, par rayon
  favoris.json                les repas favoris du planning
  generer_sql.py              régénère la migration produits + favoris
tests/
  migrations.test.mjs         rejoue toutes les migrations sur PGlite et teste RLS et fonctions
```

### Ajouter des recettes au catalogue

1. Ajoute une entrée dans `recettes/recettes.json`. Chaque ingrédient s'écrit `[nom, quantité, unité, mot-clé, rayon, options]` ; le rayon `base` désigne un produit de placard supposé toujours présent (sel, huile…), et les options facultatives précisent une borne haute (`max`), une note, un ingrédient facultatif ou interchangeable.
2. Régénère la migration, puis exécute-la dans l'éditeur SQL de Supabase (elle est relançable, sans doublon) :
   ```bash
   python3 backend/recettes/generer_sql.py > backend/supabase/migrations/20261021080300_catalogue_recettes.sql
   ```

### Ajouter des produits ou des favoris

Modifie `catalogue/produits.json` ou `catalogue/favoris.json`, puis :

```bash
python3 backend/catalogue/generer_sql.py > backend/supabase/migrations/20261021080400_catalogue_produits_favoris.sql
```

### Tester les migrations

```bash
cd backend/tests && npm install && npm test
```

Le test rejoue les migrations déjà en production puis les nouvelles sur un Postgres local (PGlite), avec de petites simulations de Supabase (auth, rôles, temps réel). Il vérifie la conversion des anciennes catégories, l'idempotence des catalogues, l'archivage d'un ticket, la déduction de stock et l'isolation entre comptes.

## Recréer le backend sur un autre projet

```bash
npm i -g supabase
supabase link --project-ref <ref>
supabase db push                              # applique les migrations
supabase functions deploy alertes-peremption --no-verify-jwt
supabase functions deploy lire-ticket
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
```

Puis crée les secrets dans l'éditeur SQL. Les commandes sont en tête de `20261020120500_alertes.sql`, et l'URL du projet est à adapter dans la tâche `cron.schedule` de ce même fichier.

## Réglage à faire une fois dans le tableau de bord

**Authentication → URL Configuration → Site URL** : mets l'adresse de l'app web, puis ajoute-la dans *Redirect URLs*. Les liens des e-mails de confirmation et de mot de passe oublié ramènent alors vers l'app. Sans ce réglage, le lien confirme quand même le compte mais ouvre une page `localhost` vide.
