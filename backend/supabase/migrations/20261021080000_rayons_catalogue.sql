-- Les 11 rayons officiels du foyer (CONTEXT_SPEC.md §3) et le catalogue de produits.
--
-- * Rayons 1 à 9 : budget Alimentaire ; rayons 10 et 11 : budget Maison & Hygiène.
-- * Les anciennes catégories (cremerie, viande_poisson…) sont converties.
-- * La même liste existe côté app dans frontend/src/lib/rayons.ts.

-- ---------------------------------------------------------------------------
-- Rayons
-- ---------------------------------------------------------------------------
create table public.aisles (
  id                text primary key,
  position          int  not null unique,
  emoji             text not null,
  name              text not null unique,
  budget            text not null check (budget in ('alimentaire', 'maison')),
  default_location  text not null,
  shelf_life_days   int,
  is_hidden         boolean not null default false
);

insert into public.aisles (id, position, emoji, name, budget, default_location, shelf_life_days, is_hidden) values
  ('fruits_legumes',   1,  '🥬', 'Fruits & légumes',               'alimentaire', 'corbeille',   7,    false),
  ('viandes_poissons', 2,  '🥩', 'Viandes / poissons / protéines', 'alimentaire', 'frigo',       3,    false),
  ('produits_frais',   3,  '🧀', 'Produits frais',                 'alimentaire', 'frigo',       10,   false),
  ('feculents',        4,  '🥖', 'Féculents / céréales',           'alimentaire', 'placard',     null, false),
  ('surgeles',         5,  '🍟', 'Surgelés / plats rapides',       'alimentaire', 'congelateur', 90,   false),
  ('epicerie_sucree',  6,  '🍫', 'Épicerie sucrée',                'alimentaire', 'placard',     null, false),
  ('epicerie_salee',   7,  '🧂', 'Épicerie salée / sauces',        'alimentaire', 'placard',     null, false),
  ('boissons',         8,  '🥤', 'Boissons',                       'alimentaire', 'placard',     null, false),
  ('apero',            9,  '🍿', 'Apéro',                          'alimentaire', 'placard',     null, false),
  ('hygiene',          10, '🧼', 'Hygiène',                        'maison',      'maison',      null, false),
  ('entretien',        11, '🧽', 'Entretien maison',               'maison',      'maison',      null, false),
  ('autre',            99, '📦', 'Autre',                          'alimentaire', 'frigo',       null, true);

alter table public.aisles enable row level security;
create policy "lecture" on public.aisles for select to authenticated using (true);

-- ---------------------------------------------------------------------------
-- Conversion des anciennes catégories
-- ---------------------------------------------------------------------------
create or replace function public.rayon_depuis_ancienne_categorie(c text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case c
    when 'cremerie'       then 'produits_frais'
    when 'viande_poisson' then 'viandes_poissons'
    when 'boulangerie'    then 'feculents'
    when 'epicerie'       then 'epicerie_salee'
    else c
  end
$$;

update public.pantry_items       set category = public.rayon_depuis_ancienne_categorie(category);
update public.shopping_items     set category = public.rayon_depuis_ancienne_categorie(category);
update public.recipe_ingredients set category = public.rayon_depuis_ancienne_categorie(category);

update public.pantry_items   set category = 'autre' where category not in (select id from public.aisles);
update public.shopping_items set category = 'autre' where category not in (select id from public.aisles);
update public.recipe_ingredients set category = 'autre' where category not in (select id from public.aisles);

alter table public.pantry_items
  add constraint pantry_items_category_fkey foreign key (category) references public.aisles (id) on update cascade;
alter table public.shopping_items
  add constraint shopping_items_category_fkey foreign key (category) references public.aisles (id) on update cascade;
alter table public.recipe_ingredients
  add constraint recipe_ingredients_category_fkey foreign key (category) references public.aisles (id) on update cascade;

-- Ancienne fonction de rangement (catégories codées en dur), remplacée par store_shopping_items
drop function if exists public.store_checked_items(jsonb);

-- ---------------------------------------------------------------------------
-- Catalogue de produits : référentiel commun (user_id nul) + produits ajoutés
-- par chaque compte (par exemple depuis un ticket de caisse).
-- ---------------------------------------------------------------------------
create table public.products (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid default auth.uid() references auth.users (id) on delete cascade,
  name            text not null check (char_length(name) between 1 and 80),
  aisle_id        text not null default 'autre' references public.aisles (id) on update cascade,
  -- mots-clés de rapprochement (singulier, sans accents) : "penne", "torsade", "farfalle"
  keywords        text[] not null default '{}',
  default_unit    text check (default_unit is null or char_length(default_unit) <= 20),
  usual_quantity  numeric check (usual_quantity is null or usual_quantity > 0),
  usual_unit      text check (usual_unit is null or char_length(usual_unit) <= 20),
  note            text check (note is null or char_length(note) <= 200),
  created_at      timestamptz not null default now()
);
create unique index products_nom_unique
  on public.products (coalesce(user_id, '00000000-0000-0000-0000-000000000000'::uuid), public.cle_aliment(name));
create index products_user_idx on public.products (user_id);

alter table public.products enable row level security;
create policy "lecture" on public.products
  for select to authenticated
  using (user_id is null or (select auth.uid()) = user_id);
create policy "ajout" on public.products
  for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "modification" on public.products
  for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "suppression" on public.products
  for delete to authenticated
  using ((select auth.uid()) = user_id);
