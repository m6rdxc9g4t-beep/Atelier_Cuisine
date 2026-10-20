-- Atelier Cuisine — schéma principal
-- Garde-manger, liste de courses, repas, recettes et suggestions.
-- Toutes les données personnelles sont isolées par compte (Row Level Security).

-- ---------------------------------------------------------------------------
-- Normalisation des noms d'aliments (minuscules, sans accents, espaces propres)
-- Utilisée pour rapprocher "Tomates cerises" de l'ingrédient "tomate".
-- La même logique existe côté frontend (src/lib/normaliser.ts).
-- ---------------------------------------------------------------------------
create or replace function public.normaliser(t text)
returns text
language sql
immutable
set search_path = ''
as $$
  select trim(regexp_replace(
    translate(
      replace(replace(lower(coalesce(t, '')), 'œ', 'oe'), 'æ', 'ae'),
      'àâäáãåçéèêëíìîïñóòôöõúùûüýÿ''’-',
      'aaaaaaceeeeiiiinooooouuuuyy   '
    ),
    '\s+', ' ', 'g'
  ))
$$;

-- ---------------------------------------------------------------------------
-- Garde-manger : ce qu'il y a à la maison
-- ---------------------------------------------------------------------------
create table public.pantry_items (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 80),
  quantity    numeric check (quantity is null or quantity >= 0),
  unit        text check (unit is null or char_length(unit) <= 20),
  category    text not null default 'autre',
  location    text not null default 'frigo'
              check (location in ('frigo', 'congelateur', 'placard', 'corbeille')),
  expires_on  date,
  created_at  timestamptz not null default now()
);
create index pantry_items_user_idx on public.pantry_items (user_id, expires_on);

-- ---------------------------------------------------------------------------
-- Recettes : catalogue commun (user_id null) + recettes personnelles
-- ---------------------------------------------------------------------------
create table public.recipes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid default auth.uid() references auth.users (id) on delete cascade,
  title       text not null check (char_length(title) between 1 and 120),
  summary     text,
  emoji       text,
  minutes     int check (minutes is null or minutes between 0 and 1440),
  servings    int check (servings is null or servings between 1 and 50),
  steps       text[] not null default '{}',
  tags        text[] not null default '{}',
  created_at  timestamptz not null default now()
);
create index recipes_user_idx on public.recipes (user_id);

create table public.recipe_ingredients (
  id          uuid primary key default gen_random_uuid(),
  recipe_id   uuid not null references public.recipes (id) on delete cascade,
  name        text not null,
  quantity    numeric,
  unit        text,
  -- mot-clé au singulier utilisé pour le rapprochement avec le garde-manger
  match_key   text not null,
  category    text not null default 'autre',
  -- produits de base supposés toujours présents (sel, poivre, huile…)
  is_staple   boolean not null default false,
  position    int not null default 0
);
create index recipe_ingredients_recipe_idx on public.recipe_ingredients (recipe_id);

-- ---------------------------------------------------------------------------
-- Liste de courses
-- ---------------------------------------------------------------------------
create table public.shopping_items (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 80),
  quantity    numeric check (quantity is null or quantity >= 0),
  unit        text check (unit is null or char_length(unit) <= 20),
  category    text not null default 'autre',
  checked     boolean not null default false,
  checked_at  timestamptz,
  recipe_id   uuid references public.recipes (id) on delete set null,
  created_at  timestamptz not null default now()
);
create index shopping_items_user_idx on public.shopping_items (user_id, checked);

-- ---------------------------------------------------------------------------
-- Journal des repas
-- ---------------------------------------------------------------------------
create table public.meals (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  eaten_on    date not null default current_date,
  slot        text not null default 'diner'
              check (slot in ('petit_dejeuner', 'dejeuner', 'gouter', 'diner')),
  title       text not null check (char_length(title) between 1 and 120),
  recipe_id   uuid references public.recipes (id) on delete set null,
  servings    int check (servings is null or servings between 1 and 50),
  notes       text,
  created_at  timestamptz not null default now()
);
create index meals_user_idx on public.meals (user_id, eaten_on desc);

-- ---------------------------------------------------------------------------
-- Abonnements aux notifications (Web Push sur iPhone / navigateur)
-- ---------------------------------------------------------------------------
create table public.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  endpoint    text not null unique,
  p256dh      text not null,
  auth        text not null,
  alert_days  int not null default 2 check (alert_days between 0 and 14),
  created_at  timestamptz not null default now()
);
create index push_subscriptions_user_idx on public.push_subscriptions (user_id);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.pantry_items       enable row level security;
alter table public.recipes            enable row level security;
alter table public.recipe_ingredients enable row level security;
alter table public.shopping_items     enable row level security;
alter table public.meals              enable row level security;
alter table public.push_subscriptions enable row level security;

-- Données strictement personnelles
create policy "proprietaire" on public.pantry_items
  for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy "proprietaire" on public.shopping_items
  for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy "proprietaire" on public.meals
  for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy "proprietaire" on public.push_subscriptions
  for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- Recettes : lecture du catalogue commun + des siennes, écriture des siennes
create policy "lecture" on public.recipes
  for select to authenticated
  using (user_id is null or (select auth.uid()) = user_id);
create policy "ajout" on public.recipes
  for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "modification" on public.recipes
  for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "suppression" on public.recipes
  for delete to authenticated
  using ((select auth.uid()) = user_id);

create policy "lecture" on public.recipe_ingredients
  for select to authenticated
  using (exists (
    select 1 from public.recipes r
    where r.id = recipe_id and (r.user_id is null or r.user_id = (select auth.uid()))
  ));
create policy "ecriture" on public.recipe_ingredients
  for all to authenticated
  using (exists (
    select 1 from public.recipes r
    where r.id = recipe_id and r.user_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.recipes r
    where r.id = recipe_id and r.user_id = (select auth.uid())
  ));

-- ---------------------------------------------------------------------------
-- Suggestions de plats selon le garde-manger
-- Score = part des ingrédients disponibles + bonus pour chaque produit
-- qui périme dans les 3 jours (on cuisine d'abord ce qui presse).
-- ---------------------------------------------------------------------------
create or replace function public.suggest_recipes(max_results int default 30)
returns table (
  recipe_id      uuid,
  title          text,
  summary        text,
  emoji          text,
  minutes        int,
  tags           text[],
  total          int,
  matched        int,
  missing        text[],
  urgent         text[],
  score          numeric
)
language sql
stable
security invoker
set search_path = ''
as $$
  with pantry as (
    select public.normaliser(p.name) as n, p.expires_on
    from public.pantry_items p
    where p.user_id = (select auth.uid())
      and (p.expires_on is null or p.expires_on >= current_date)
  ),
  ing as (
    select
      ri.recipe_id,
      ri.name,
      ri.is_staple,
      exists (select 1 from pantry pa where pa.n like '%' || ri.match_key || '%') as have,
      (select min(pa.expires_on) from pantry pa where pa.n like '%' || ri.match_key || '%') as soonest
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

-- Ajoute à la liste de courses les ingrédients manquants d'une recette
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
        and public.normaliser(p.name) like '%' || ri.match_key || '%'
    )
    and not exists (
      select 1 from public.shopping_items s
      where s.user_id = (select auth.uid())
        and not s.checked
        and public.normaliser(s.name) like '%' || ri.match_key || '%'
    )
  order by ri.position;
  get diagnostics added = row_count;
  return added;
end;
$$;

-- Range les articles cochés dans le garde-manger, avec une date estimée
-- (jours de conservation fournis par l'app selon la catégorie).
create or replace function public.store_checked_items(shelf_life jsonb default '{}'::jsonb)
returns int
language plpgsql
security invoker
set search_path = ''
as $$
declare
  moved int;
begin
  with done as (
    delete from public.shopping_items s
    where s.user_id = (select auth.uid()) and s.checked
    returning s.name, s.quantity, s.unit, s.category
  )
  insert into public.pantry_items (name, quantity, unit, category, location, expires_on)
  select
    d.name, d.quantity, d.unit, d.category,
    case d.category
      when 'surgeles' then 'congelateur'
      when 'epicerie' then 'placard'
      when 'boissons' then 'placard'
      when 'fruits_legumes' then 'corbeille'
      else 'frigo'
    end,
    case when shelf_life ? d.category
      then current_date + (shelf_life ->> d.category)::int
    end
  from done d;
  get diagnostics moved = row_count;
  return moved;
end;
$$;

grant execute on function public.suggest_recipes(int)          to authenticated;
grant execute on function public.add_missing_to_shopping(uuid) to authenticated;
grant execute on function public.store_checked_items(jsonb)    to authenticated;
revoke execute on function public.suggest_recipes(int)          from anon, public;
revoke execute on function public.add_missing_to_shopping(uuid) from anon, public;
revoke execute on function public.store_checked_items(jsonb)    from anon, public;

-- ---------------------------------------------------------------------------
-- Synchro en direct entre le Mac et l'iPhone
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table public.pantry_items;
alter publication supabase_realtime add table public.shopping_items;
alter publication supabase_realtime add table public.meals;
