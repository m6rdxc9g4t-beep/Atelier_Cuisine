-- Rapprochement plus fiable entre garde-manger et ingrédients :
--  * le mot-clé doit commencer un mot ("ail" ne trouve plus "volaille")
--  * des exclusions par ingrédient ("pomme" ne trouve pas "pomme de terre")

alter table public.recipe_ingredients
  add column exclude_keys text[] not null default '{}';

create or replace function public.ingredient_matches(pantry_name text, match_key text, exclude_keys text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select (' ' || public.normaliser(pantry_name)) like ('% ' || match_key || '%')
     and not exists (
       select 1 from unnest(coalesce(exclude_keys, '{}')) as x(k)
       where (' ' || public.normaliser(pantry_name)) like ('% ' || x.k || '%')
     )
$$;

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
      ri.recipe_id, ri.name, ri.is_staple,
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
      count(*) filter (where not i.is_staple)::int                    as total,
      count(*) filter (where not i.is_staple and i.have)::int         as matched,
      coalesce(array_agg(i.name order by i.name)
        filter (where not i.is_staple and not i.have), '{}')          as missing,
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
  insert into public.shopping_items (name, quantity, unit, category, recipe_id)
  select ri.name, ri.quantity, ri.unit, ri.category, p_recipe
  from public.recipe_ingredients ri
  where ri.recipe_id = p_recipe
    and not ri.is_staple
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
