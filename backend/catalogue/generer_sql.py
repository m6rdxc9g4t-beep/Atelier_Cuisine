#!/usr/bin/env python3
"""Génère la migration SQL du catalogue de produits et des repas favoris.

Usage :
  python3 backend/catalogue/generer_sql.py > backend/supabase/migrations/20261021080400_catalogue_produits_favoris.sql

Les identifiants sont stables (uuid5) : relancer la migration met à jour le
catalogue au lieu de créer des doublons.
"""
import json
import pathlib
import re
import sys
import uuid

ICI = pathlib.Path(__file__).parent
NS = uuid.UUID("0b7e7f0e-6a59-4d6b-9f2a-0d1f4c6f2b10")
# Même espace de noms que backend/recettes/generer_sql.py, pour retrouver les recettes
NS_RECETTES = uuid.UUID("6f1c2a4e-1d8b-4b55-9a39-6a7e0c3c7a11")

RAYONS = [
    "fruits_legumes", "viandes_poissons", "produits_frais", "feculents", "surgeles", "epicerie_sucree",
    "epicerie_salee", "boissons", "apero", "hygiene", "entretien",
]

# Même logique que public.normaliser / public.cle_aliment et frontend/src/lib/normaliser.ts
AVEC = "àâäáãåçéèêëíìîïñóòôöõúùûüýÿ'’-"
SANS = "aaaaaaceeeeiiiinooooouuuuyy   "
TABLE = str.maketrans(AVEC, SANS)


def normaliser(t: str) -> str:
    t = t.lower().replace("œ", "oe").replace("æ", "ae").translate(TABLE)
    return re.sub(r"\s+", " ", t).strip()


def cle(t: str) -> str:
    return re.sub(r"([a-z]{3,})[sx]\b", r"\1", normaliser(t))


def cles_par_defaut(nom: str) -> list[str]:
    """« Penne / torsades / farfalle » → penne, torsade, farfalle ; parenthèses ignorées."""
    sans_parentheses = re.sub(r"\(.*?\)", " ", nom)
    return [c for c in (cle(x) for x in sans_parentheses.split("/")) if c]


SQL = """-- Catalogue de produits et repas favoris (généré par backend/catalogue/generer_sql.py)
-- user_id null = référentiel visible par tous les comptes. Relançable sans doublons.

-- Produits habituels, par rayon
insert into public.products (id, user_id, name, aisle_id, keywords, default_unit, usual_quantity, usual_unit, note)
select (x->>'id')::uuid, null, x->>'nom', x->>'rayon',
       array(select jsonb_array_elements_text(x->'cles')),
       x->>'unite', (x->>'qte_hab')::numeric, x->>'unite_hab', x->>'note'
from jsonb_array_elements($produits${produits}$produits$::jsonb) as x
on conflict (id) do update set
  name = excluded.name, aisle_id = excluded.aisle_id, keywords = excluded.keywords,
  default_unit = excluded.default_unit, usual_quantity = excluded.usual_quantity,
  usual_unit = excluded.usual_unit, note = excluded.note;

-- Repas favoris
with fav as (
  select x, pos from jsonb_array_elements($favoris${favoris}$favoris$::jsonb) with ordinality as t(x, pos)
),
up as (
  insert into public.meal_templates (id, user_id, name, meal_type, recipe_id, is_favorite, position)
  select (x->>'id')::uuid, null, x->>'nom', x->>'type',
         (select r.id from public.recipes r where r.id = (x->>'recette_id')::uuid),
         (x->>'favori')::boolean, pos::int
  from fav
  on conflict (id) do update set
    name = excluded.name, meal_type = excluded.meal_type, recipe_id = excluded.recipe_id,
    is_favorite = excluded.is_favorite, position = excluded.position
  returning id
),
purge as (
  delete from public.meal_template_items i
  using fav where i.template_id = (fav.x->>'id')::uuid
  returning i.id
)
insert into public.meal_template_items (template_id, name, match_key, quantity, unit, position)
select (fav.x->>'id')::uuid, p->>0, p->>1, (p->>2)::numeric, p->>3, (n - 1)::int
from fav, jsonb_array_elements(coalesce(fav.x->'produits', '[]'::jsonb)) with ordinality as t(p, n);
"""


def main():
    data = json.loads((ICI / "produits.json").read_text(encoding="utf-8"))
    vus = set()
    produits = []
    for rayon, noms in data["rayons"].items():
        assert rayon in RAYONS, f"rayon inconnu : {rayon}"
        for nom in noms:
            assert cle(nom) not in vus, f"produit en double : {nom}"
            vus.add(cle(nom))
            d = data["details"].get(nom, {})
            produits.append({
                "id": str(uuid.uuid5(NS, "produit:" + nom)),
                "nom": nom,
                "rayon": rayon,
                "cles": data["cles"].get(nom) or cles_par_defaut(nom),
                "unite": d.get("unite"),
                "qte_hab": d.get("qte_hab"),
                "unite_hab": d.get("unite_hab"),
                "note": d.get("note"),
            })
    inconnus = (set(data["details"]) | set(data["cles"])) - {p["nom"] for p in produits}
    assert not inconnus, f"détails pour des produits absents : {inconnus}"

    favoris = []
    for f in json.loads((ICI / "favoris.json").read_text(encoding="utf-8"))["favoris"]:
        assert f["type"] in ("recette", "assemblage", "exterieur"), f["nom"]
        favoris.append({
            "id": str(uuid.uuid5(NS, "favori:" + f["nom"])),
            "nom": f["nom"],
            "type": f["type"],
            "recette_id": str(uuid.uuid5(NS_RECETTES, f["recette"])) if f.get("recette") else None,
            "favori": f.get("favori", True),
            "produits": f.get("produits", []),
        })

    p = json.dumps(produits, ensure_ascii=False, separators=(",", ":"))
    f = json.dumps(favoris, ensure_ascii=False, separators=(",", ":"))
    assert "$produits$" not in p and "$favoris$" not in f
    print(SQL.replace("{produits}", p).replace("{favoris}", f), end="")
    print(f"{len(produits)} produits, {len(favoris)} repas types", file=sys.stderr)


if __name__ == "__main__":
    main()
