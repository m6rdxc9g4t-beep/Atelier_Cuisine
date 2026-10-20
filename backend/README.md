# Backend — Supabase

Le backend est un projet Supabase (Postgres + authentification + temps réel + fonctions Edge), hébergé à Paris (`eu-west-3`).

- Projet : `atelier-cuisine` (réf. `hcdiuxznceuixindcvhp`)
- API : `https://hcdiuxznceuixindcvhp.supabase.co`

## Ce qu'il fait

| Élément | Rôle |
|---|---|
| `pantry_items` | garde-manger : nom, quantité, emplacement, date de péremption |
| `shopping_items` | liste de courses, avec case cochée |
| `meals` | journal des repas par jour et par créneau |
| `recipes`, `recipe_ingredients` | catalogue commun de 34 recettes (`user_id` nul) et recettes personnelles |
| `push_subscriptions` | iPhone et navigateurs abonnés aux rappels |
| `suggest_recipes()` | suggestions classées : part d'ingrédients disponibles, plus un bonus par produit qui périme dans les 3 jours |
| `add_missing_to_shopping(recette)` | ajoute à la liste ce qui manque pour une recette (sans doublon) |
| `store_shopping_items(articles)` | range les achats cochés dans le garde-manger avec leur date, en une opération atomique |
| fonction Edge `alertes-peremption` | envoie chaque matin une notification Web Push aux appareils abonnés |
| tâche `pg_cron` `alertes-peremption` | appelle la fonction tous les jours à 7 h UTC |

**Sécurité :** RLS activée sur toutes les tables ; chaque compte ne voit que ses données. Le catalogue commun est en lecture seule. Les clés VAPID et le secret d'appel de la fonction sont dans Supabase Vault, lisibles uniquement par le rôle service.

**Synchro :** les tables `pantry_items`, `shopping_items` et `meals` sont publiées en temps réel. Une modification sur le Mac apparaît sur l'iPhone sans rafraîchir.

## Rapprochement garde-manger ↔ recettes

Chaque ingrédient a un mot-clé (`match_key`) au singulier, sans accent. Un produit correspond si l'un de ses mots **commence** par ce mot-clé, après mise au singulier des deux côtés :

- « Tomates cerises » correspond à `tomate` ;
- « Volaille » ne correspond pas à `ail` ;
- `exclude_keys` évite les confusions : `pomme` exclut « pomme de terre », `lait` exclut « lait de coco ».

La même logique existe côté app dans `frontend/src/lib/normaliser.ts`.

## Fichiers

```
supabase/
  migrations/                 schéma, fonctions, catalogue, alertes (dans l'ordre)
  functions/alertes-peremption/index.ts
recettes/
  recettes.json               le catalogue, facile à enrichir
  generer_sql.py              régénère la migration du catalogue
```

### Ajouter des recettes au catalogue

1. Ajoute une entrée dans `recettes/recettes.json`. Chaque ingrédient s'écrit `[nom, quantité, unité, mot-clé, catégorie]` ; la catégorie `base` désigne un produit de placard supposé toujours présent (sel, huile…).
2. Régénère la migration :
   ```bash
   python3 backend/recettes/generer_sql.py > backend/supabase/migrations/20261020120200_catalogue_recettes.sql
   ```
3. Exécute ce fichier dans l'éditeur SQL de Supabase. Il est relançable : les recettes existantes sont mises à jour, sans doublon.

## Recréer le backend sur un autre projet

```bash
npm i -g supabase
supabase link --project-ref <ref>
supabase db push                              # applique les migrations
supabase functions deploy alertes-peremption --no-verify-jwt
```

Puis crée les secrets dans l'éditeur SQL. Les commandes sont en tête de `20261020120500_alertes.sql`, et l'URL du projet est à adapter dans la tâche `cron.schedule` de ce même fichier.

## Réglage à faire une fois dans le tableau de bord

**Authentication → URL Configuration → Site URL** : mets l'adresse de l'app web, puis ajoute-la dans *Redirect URLs*. Les liens des e-mails de confirmation et de mot de passe oublié ramènent alors vers l'app. Sans ce réglage, le lien confirme quand même le compte mais ouvre une page `localhost` vide.
