-- Stock enrichi et planning des repas (CONTEXT_SPEC.md, onglets 1 et 2).
--
-- Stock : niveau rapide (plein, moitié, assez pour 1 repas, presque fini),
-- double suivi « date de l'emballage » + « mis dans une boîte le… », note libre.
-- Planning : semainier avec 3 types de repas (recette, assemblage rapide,
-- extérieur) et un statut à faire / cuisiné.

-- ---------------------------------------------------------------------------
-- Stock
-- ---------------------------------------------------------------------------
alter table public.pantry_items
  add column stock_level    text check (stock_level in ('plein', 'moitie', 'un_repas', 'fin')),
  add column opened_on      date,
  add column in_container   boolean not null default false,
  add column note           text check (note is null or char_length(note) <= 200),
  add column product_id     uuid references public.products (id) on delete set null,
  add column purchase_price numeric check (purchase_price is null or purchase_price >= 0);

-- Nouvel emplacement pour l'hygiène et l'entretien (salle de bain, buanderie)
alter table public.pantry_items drop constraint pantry_items_location_check;
alter table public.pantry_items
  add constraint pantry_items_location_check
  check (location in ('frigo', 'congelateur', 'placard', 'corbeille', 'maison'));

-- ---------------------------------------------------------------------------
-- Recettes : fourchettes de quantités, notes et ingrédients au choix
-- ---------------------------------------------------------------------------
alter table public.recipe_ingredients
  add column quantity_max numeric,
  add column note         text,
  add column is_optional  boolean not null default false,
  add column alt_group    text;

-- ---------------------------------------------------------------------------
-- Planning des repas
-- ---------------------------------------------------------------------------
alter table public.meals
  add column meal_type     text not null default 'libre'
                           check (meal_type in ('recette', 'assemblage', 'exterieur', 'libre')),
  add column status        text not null default 'cuisine' check (status in ('prevu', 'cuisine')),
  add column cooked_at     timestamptz,
  add column template_id   uuid,
  add column external_cost numeric check (external_cost is null or external_cost >= 0);

-- Repas types proposés en autocomplétion : catalogue commun + repas du compte
create table public.meal_templates (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid default auth.uid() references auth.users (id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 120),
  meal_type   text not null check (meal_type in ('recette', 'assemblage', 'exterieur')),
  recipe_id   uuid references public.recipes (id) on delete set null,
  is_favorite boolean not null default true,
  position    int not null default 0,
  created_at  timestamptz not null default now()
);
create index meal_templates_user_idx on public.meal_templates (user_id);

-- Produits déduits du stock par un assemblage rapide (quantité nulle = une portion)
create table public.meal_template_items (
  id           uuid primary key default gen_random_uuid(),
  template_id  uuid not null references public.meal_templates (id) on delete cascade,
  name         text not null,
  match_key    text not null,
  quantity     numeric,
  unit         text,
  position     int not null default 0
);
create index meal_template_items_template_idx on public.meal_template_items (template_id);

alter table public.meals
  add constraint meals_template_id_fkey foreign key (template_id)
  references public.meal_templates (id) on delete set null;

alter table public.meal_templates      enable row level security;
alter table public.meal_template_items enable row level security;

create policy "lecture" on public.meal_templates
  for select to authenticated using (user_id is null or (select auth.uid()) = user_id);
create policy "ajout" on public.meal_templates
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "modification" on public.meal_templates
  for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "suppression" on public.meal_templates
  for delete to authenticated using ((select auth.uid()) = user_id);

create policy "lecture" on public.meal_template_items
  for select to authenticated
  using (exists (
    select 1 from public.meal_templates t
    where t.id = template_id and (t.user_id is null or t.user_id = (select auth.uid()))
  ));
create policy "ecriture" on public.meal_template_items
  for all to authenticated
  using (exists (
    select 1 from public.meal_templates t where t.id = template_id and t.user_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.meal_templates t where t.id = template_id and t.user_id = (select auth.uid())
  ));

-- ---------------------------------------------------------------------------
-- « Cuisiner ce repas » : marque le repas cuisiné et déduit le stock en une
-- seule opération. L'app choisit les lots (premier périmé, premier utilisé)
-- et envoie pour chacun l'action à appliquer :
--   {"id": "...", "action": "retirer"}                     le lot est fini
--   {"id": "...", "action": "quantite", "quantity": 120}    il en reste 120
--   {"id": "...", "action": "niveau", "stock_level": "fin"} il en reste un peu
-- ---------------------------------------------------------------------------
create or replace function public.cuisiner_repas(p_meal uuid, p_consommation jsonb default '[]'::jsonb)
returns int
language plpgsql
security invoker
set search_path = ''
as $$
declare
  touches int := 0;
  n int;
begin
  update public.meals
     set status = 'cuisine', cooked_at = now()
   where id = p_meal and user_id = (select auth.uid());
  if not found then
    raise exception 'Repas introuvable';
  end if;

  delete from public.pantry_items p
   using jsonb_array_elements(coalesce(p_consommation, '[]'::jsonb)) x
   where p.id = (x->>'id')::uuid
     and p.user_id = (select auth.uid())
     and x->>'action' = 'retirer';
  get diagnostics n = row_count;
  touches := touches + n;

  update public.pantry_items p
     set quantity = greatest(0, (x->>'quantity')::numeric)
    from jsonb_array_elements(coalesce(p_consommation, '[]'::jsonb)) x
   where p.id = (x->>'id')::uuid
     and p.user_id = (select auth.uid())
     and x->>'action' = 'quantite';
  get diagnostics n = row_count;
  touches := touches + n;

  update public.pantry_items p
     set stock_level = x->>'stock_level', quantity = null
    from jsonb_array_elements(coalesce(p_consommation, '[]'::jsonb)) x
   where p.id = (x->>'id')::uuid
     and p.user_id = (select auth.uid())
     and x->>'action' = 'niveau';
  get diagnostics n = row_count;
  touches := touches + n;

  return touches;
end;
$$;

grant execute on function public.cuisiner_repas(uuid, jsonb) to authenticated;
revoke execute on function public.cuisiner_repas(uuid, jsonb) from anon, public;
