#!/usr/bin/env python3
"""Génère la migration SQL du catalogue de recettes à partir de recettes.json.

Usage :
  python3 backend/recettes/generer_sql.py > backend/supabase/migrations/20261021080300_catalogue_recettes.sql

Les identifiants sont stables (uuid5) : relancer la migration met à jour les
recettes existantes au lieu de créer des doublons.
"""
import json
import pathlib
import uuid

ICI = pathlib.Path(__file__).parent
NS = uuid.UUID("6f1c2a4e-1d8b-4b55-9a39-6a7e0c3c7a11")

# Mots-clés à ne pas confondre : "pomme" ne doit pas trouver "pomme de terre", etc.
EXCLUSIONS = {
    "pomme": ["pomme de terre"],
    "lait": ["lait de coco"],
    "pate": ["pate brisee", "pate feuilletee", "pate a"],
    "creme": ["creme dessert"],
    "sauce soja": ["sauce soja sucree"],
}

RAYONS = {
    "fruits_legumes", "viandes_poissons", "produits_frais", "feculents", "surgeles", "epicerie_sucree",
    "epicerie_salee", "boissons", "apero", "hygiene", "entretien", "base",
}

SQL = """-- Catalogue de recettes commun (généré par backend/recettes/generer_sql.py)
-- user_id null = visible par tous les comptes. Relançable sans doublons.
with cat as (
  select $catalogue${json}$catalogue$::jsonb as j
),
recs as (
  select x from cat, jsonb_array_elements(cat.j) as x
),
up as (
  insert into public.recipes (id, user_id, title, summary, emoji, minutes, servings, steps, tags)
  select (x->>'id')::uuid, null, x->>'titre', x->>'resume', x->>'emoji',
         (x->>'minutes')::int, (x->>'portions')::int,
         array(select jsonb_array_elements_text(x->'etapes')),
         array(select jsonb_array_elements_text(x->'tags'))
  from recs
  on conflict (id) do update set
    title = excluded.title, summary = excluded.summary, emoji = excluded.emoji,
    minutes = excluded.minutes, servings = excluded.servings,
    steps = excluded.steps, tags = excluded.tags
  returning id
),
purge as (
  delete from public.recipe_ingredients ri
  using recs where ri.recipe_id = (recs.x->>'id')::uuid
  returning ri.id
),
ins as (
  insert into public.recipe_ingredients
    (recipe_id, name, quantity, unit, match_key, exclude_keys, category, is_staple, position,
     quantity_max, note, is_optional, alt_group)
  select (recs.x->>'id')::uuid,
         i->>0, (i->>1)::numeric, i->>2, i->>3,
         array(select jsonb_array_elements_text(coalesce(i->5, '[]'::jsonb))),
         case when i->>4 = 'base' then 'epicerie_salee' else i->>4 end,
         i->>4 = 'base',
         (pos - 1)::int,
         (i->6->>'max')::numeric, i->6->>'note',
         coalesce((i->6->>'optionnel')::boolean, false), i->6->>'groupe'
  from recs, jsonb_array_elements(recs.x->'ingredients') with ordinality as t(i, pos)
  returning id
)
select (select count(*) from up) as recettes,
       (select count(*) from ins) as ingredients,
       (select count(*) from purge) as anciens_ingredients;
"""


def main():
    data = json.loads((ICI / "recettes.json").read_text(encoding="utf-8"))
    compact = []
    for r in data["recettes"]:
        rec = {k: r[k] for k in ("titre", "resume", "emoji", "minutes", "portions", "etapes", "tags")}
        rec["id"] = str(uuid.uuid5(NS, r["titre"]))
        rec["ingredients"] = []
        for ing in r["ingredients"]:
            nom, qte, unite, cle, cat = ing[:5]
            options = ing[5] if len(ing) > 5 else {}
            assert cat in RAYONS, f"{r['titre']} / {nom} : rayon inconnu « {cat} »"
            assert set(options) <= {"max", "note", "optionnel", "groupe"}, f"{nom} : option inconnue"
            rec["ingredients"].append([nom, qte, unite, cle, cat, EXCLUSIONS.get(cle, []), options])
        compact.append(rec)
    payload = json.dumps(compact, ensure_ascii=False, separators=(",", ":"))
    assert "$catalogue$" not in payload
    print(SQL.replace("{json}", payload), end="")


if __name__ == "__main__":
    main()
