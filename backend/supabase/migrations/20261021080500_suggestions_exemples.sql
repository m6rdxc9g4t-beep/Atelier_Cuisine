-- 1. Les ingrédients facultatifs (vanille des crêpes…) ne comptent plus dans
--    les suggestions ni dans « Ajouter le manquant ».
-- 2. Exemples du foyer (CONTEXT_SPEC.md) à charger à la demande depuis Réglages.

create or replace function public.suggest_recipes(max_results int default 30)
returns table (
  recipe_id uuid, title text, summary text, emoji text, minutes int, tags text[],
  total int, matched int, missing text[], urgent text[], score numeric
)
language sql
stable
security invoker
set search_path = ''
as $$
  with pantry as (
    select p.name, p.expires_on
    from public.pantry_items p
    where p.user_id = (select auth.uid())
      and (p.expires_on is null or p.expires_on >= current_date)
  ),
  ing as (
    select
      ri.recipe_id, ri.name, ri.is_staple or ri.is_optional as accessoire,
      exists (
        select 1 from pantry pa
        where public.ingredient_matches(pa.name, ri.match_key, ri.exclude_keys)
      ) as have,
      (
        select min(pa.expires_on) from pantry pa
        where public.ingredient_matches(pa.name, ri.match_key, ri.exclude_keys)
      ) as soonest
    from public.recipe_ingredients ri
  ),
  agg as (
    select
      r.id, r.title, r.summary, r.emoji, r.minutes, r.tags,
      count(*) filter (where not i.accessoire)::int                   as total,
      count(*) filter (where not i.accessoire and i.have)::int        as matched,
      coalesce(array_agg(i.name order by i.name)
        filter (where not i.accessoire and not i.have), '{}')         as missing,
      coalesce(array_agg(i.name order by i.soonest)
        filter (where i.have and i.soonest <= current_date + 3), '{}') as urgent
    from public.recipes r
    join ing i on i.recipe_id = r.id
    where r.user_id is null or r.user_id = (select auth.uid())
    group by r.id
  )
  select
    id, title, summary, emoji, minutes, tags, total, matched, missing, urgent,
    round((matched::numeric / greatest(total, 1)) + 0.25 * cardinality(urgent), 3) as score
  from agg
  where matched > 0
  order by score desc, cardinality(missing) asc, minutes asc nulls last
  limit greatest(1, least(max_results, 100));
$$;

create or replace function public.add_missing_to_shopping(p_recipe uuid)
returns int
language plpgsql
security invoker
set search_path = ''
as $$
declare
  added int;
begin
  insert into public.shopping_items (name, quantity, unit, category, recipe_id, source)
  select ri.name, ri.quantity, ri.unit, ri.category, p_recipe, 'planning'
  from public.recipe_ingredients ri
  where ri.recipe_id = p_recipe
    and not ri.is_staple
    and not ri.is_optional
    and not exists (
      select 1 from public.pantry_items p
      where p.user_id = (select auth.uid())
        and (p.expires_on is null or p.expires_on >= current_date)
        and public.ingredient_matches(p.name, ri.match_key, ri.exclude_keys)
    )
    and not exists (
      select 1 from public.shopping_items s
      where s.user_id = (select auth.uid())
        and not s.checked
        and public.ingredient_matches(s.name, ri.match_key, ri.exclude_keys)
    )
  order by ri.position;
  get diagnostics added = row_count;
  return added;
end;
$$;

-- ---------------------------------------------------------------------------
-- Exemples du foyer : la boîte de jambon (double suivi de péremption), les
-- niveaux de stock notés dans la spec et les pâtes à racheter.
-- N'ajoute que ce qui n'existe pas déjà. Renvoie le nombre de lignes créées.
-- ---------------------------------------------------------------------------
create or replace function public.ajouter_exemples_foyer()
returns int
language plpgsql
security invoker
set search_path = ''
as $$
declare
  n int := 0;
  k int;
begin
  insert into public.pantry_items (name, quantity, unit, category, location, expires_on, opened_on, in_container, stock_level, note)
  select v.name, v.quantity, v.unit, v.category, v.location, v.expires_on, v.opened_on, v.in_container, v.stock_level, v.note
  from (values
    -- « Jambon périme le 04/10, mis dans la boîte le 22/09 » : même écart, recalé sur aujourd'hui
    ('Jambon',       1::numeric, 'paquet', 'viandes_poissons', 'frigo',  current_date + 4, current_date - 8, true,  null,       'Mis dans la boîte hermétique'),
    ('Brocolis',     null,       null,     'fruits_legumes',   'frigo',  null::date,       null::date,       false, 'un_repas', 'assez pour 1 repas'),
    ('Haricot vert', null,       null,     'fruits_legumes',   'frigo',  null,             null,             false, 'un_repas', 'assez pour 1 repas'),
    ('Sauce salade', null,       null,     'epicerie_salee',   'frigo',  null,             null,             false, 'moitie',   null),
    ('Savon',        null,       null,     'hygiene',          'maison', null,             null,             false, null,       'je pense assez jusqu’aux prochaines courses'),
    ('Lessive noir', null,       null,     'entretien',        'maison', null,             null,             false, 'fin',      'tends vers la fin mais assez')
  ) as v(name, quantity, unit, category, location, expires_on, opened_on, in_container, stock_level, note)
  where not exists (
    select 1 from public.pantry_items p
    where p.user_id = (select auth.uid()) and public.cle_aliment(p.name) = public.cle_aliment(v.name)
  );
  get diagnostics k = row_count;
  n := n + k;

  insert into public.shopping_items (name, category, source, note)
  select 'Penne / torsades / farfalle', 'feculents', 'a_racheter', 'racheter les pâtes que tu veux'
  where not exists (
    select 1 from public.shopping_items s
    where s.user_id = (select auth.uid()) and not s.checked
      and public.ingredient_matches(s.name, 'penne', '{}')
  );
  get diagnostics k = row_count;
  return n + k;
end;
$$;

grant execute on function public.ajouter_exemples_foyer() to authenticated;
revoke execute on function public.ajouter_exemples_foyer() from anon, public;
