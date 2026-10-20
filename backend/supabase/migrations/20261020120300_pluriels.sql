-- Tolérance aux pluriels : "Pommes de terre" doit correspondre à "pomme de terre".
-- On met au singulier chaque mot (s/x final) des deux côtés de la comparaison.
-- La même logique existe côté frontend (src/lib/normaliser.ts).

create or replace function public.cle_aliment(t text)
returns text
language sql
immutable
set search_path = ''
as $$
  select regexp_replace(public.normaliser(t), '([a-z]{3,})[sx]\M', '\1', 'g')
$$;

create or replace function public.ingredient_matches(pantry_name text, match_key text, exclude_keys text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select (' ' || public.cle_aliment(pantry_name)) like ('% ' || public.cle_aliment(match_key) || '%')
     and not exists (
       select 1 from unnest(coalesce(exclude_keys, '{}')) as x(k)
       where (' ' || public.cle_aliment(pantry_name)) like ('% ' || public.cle_aliment(x.k) || '%')
     )
$$;
