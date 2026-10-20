-- Courses en magasin, tickets de caisse archivés et budget
-- (CONTEXT_SPEC.md, onglets 3, 4 et 5).
--
-- Une session de courses validée (depuis la liste ou un ticket importé) :
--   1. est archivée dans shopping_sessions / shopping_session_items (Récap) ;
--   2. fait entrer les produits choisis dans le stock (rayons 1 à 9 par défaut) ;
--   3. alimente le budget, calculé à partir des sessions (pas de double saisie).

-- ---------------------------------------------------------------------------
-- Liste de courses : mode magasin et origine des articles
-- ---------------------------------------------------------------------------
alter table public.shopping_items
  add column product_id  uuid references public.products (id) on delete set null,
  add column source      text not null default 'manuel'
                         check (source in ('manuel', 'planning', 'a_racheter', 'ticket')),
  add column meal_id     uuid references public.meals (id) on delete set null,
  add column note        text check (note is null or char_length(note) <= 200),
  add column unit_price  numeric check (unit_price is null or unit_price >= 0),
  add column total_price numeric check (total_price is null or total_price >= 0),
  add column expires_on  date;

-- ---------------------------------------------------------------------------
-- Tickets de caisse archivés
-- ---------------------------------------------------------------------------
create table public.shopping_sessions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  purchased_at    timestamptz not null default now(),
  store_name      text not null check (char_length(store_name) between 1 and 80),
  payment_method  text check (payment_method is null or char_length(payment_method) <= 40),
  total_amount    numeric not null check (total_amount >= 0),
  food_subtotal   numeric not null default 0,
  home_subtotal   numeric not null default 0,
  items_count     int not null default 0,
  notes           text check (notes is null or char_length(notes) <= 500),
  source          text not null default 'liste'
                  check (source in ('liste', 'ticket_pdf', 'ticket_photo', 'ticket_texte', 'manuel')),
  raw_text        text,
  created_at      timestamptz not null default now()
);
create index shopping_sessions_user_idx on public.shopping_sessions (user_id, purchased_at desc);

create table public.shopping_session_items (
  id              uuid primary key default gen_random_uuid(),
  session_id      uuid not null references public.shopping_sessions (id) on delete cascade,
  user_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  position        int not null default 0,
  raw_label       text not null,
  matched_name    text,
  product_id      uuid references public.products (id) on delete set null,
  brand           text,
  packaging_size  text,
  category        text not null default 'autre' references public.aisles (id) on update cascade,
  tva_rate        numeric,
  quantity        numeric not null default 1 check (quantity > 0),
  unit_price      numeric not null check (unit_price >= 0),
  total_price     numeric not null check (total_price >= 0),
  is_food         boolean not null default true,
  expires_on      date
);
create index shopping_session_items_session_idx on public.shopping_session_items (session_id, position);
-- Historique des prix d'un produit
create index shopping_session_items_prix_idx on public.shopping_session_items (user_id, matched_name);

alter table public.pantry_items
  add column session_item_id uuid references public.shopping_session_items (id) on delete set null;

-- ---------------------------------------------------------------------------
-- Budget : un plafond par périmètre
-- ---------------------------------------------------------------------------
create table public.budgets (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  scope       text not null check (scope in ('global', 'alimentaire', 'maison', 'sorties')),
  period      text not null default 'mois' check (period in ('semaine', 'mois')),
  amount      numeric not null check (amount > 0),
  created_at  timestamptz not null default now(),
  unique (user_id, scope)
);

alter table public.shopping_sessions      enable row level security;
alter table public.shopping_session_items enable row level security;
alter table public.budgets                enable row level security;

create policy "proprietaire" on public.shopping_sessions
  for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "proprietaire" on public.shopping_session_items
  for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "proprietaire" on public.budgets
  for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- Dernier prix connu de chaque produit (prix de référence)
-- ---------------------------------------------------------------------------
create view public.product_prices
with (security_invoker = true)
as
select distinct on (i.user_id, lower(coalesce(i.matched_name, i.raw_label)))
  i.user_id,
  coalesce(i.matched_name, i.raw_label) as name,
  i.product_id,
  i.unit_price as last_unit_price,
  s.purchased_at as last_purchased_at,
  s.store_name as last_store,
  count(*) over (partition by i.user_id, lower(coalesce(i.matched_name, i.raw_label))) as purchases
from public.shopping_session_items i
join public.shopping_sessions s on s.id = i.session_id
order by i.user_id, lower(coalesce(i.matched_name, i.raw_label)), s.purchased_at desc;

grant select on public.product_prices to authenticated;

-- ---------------------------------------------------------------------------
-- Valider une session de courses, en une seule opération (tout ou rien).
--
-- p_session : {"purchased_at", "store_name", "payment_method", "total_amount"?,
--              "notes", "source", "raw_text"}
-- p_items   : [{"raw_label", "matched_name", "product_id", "brand", "packaging_size",
--               "category", "tva_rate", "quantity", "unit_price", "total_price",
--               "expires_on", "to_pantry", "location", "unit", "pantry_quantity"}]
-- p_shopping_ids : articles de la liste de courses à retirer (ceux qui ont été achetés)
--
-- Les sous-totaux Alimentaire (rayons 1 à 9) et Maison (10 et 11) sont
-- recalculés ici à partir des rayons, pour que le budget soit toujours juste.
-- ---------------------------------------------------------------------------
create or replace function public.archiver_courses(
  p_session jsonb,
  p_items jsonb,
  p_shopping_ids uuid[] default '{}'
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_session uuid;
begin
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Aucun article à archiver';
  end if;

  insert into public.shopping_sessions
    (purchased_at, store_name, payment_method, total_amount, notes, source, raw_text)
  values (
    coalesce(nullif(p_session->>'purchased_at', '')::timestamptz, now()),
    coalesce(nullif(trim(p_session->>'store_name'), ''), 'Courses'),
    nullif(trim(p_session->>'payment_method'), ''),
    0,
    nullif(trim(p_session->>'notes'), ''),
    coalesce(nullif(p_session->>'source', ''), 'liste'),
    nullif(p_session->>'raw_text', '')
  )
  returning id into v_session;

  with lignes as (
    select x, pos
    from jsonb_array_elements(p_items) with ordinality as t(x, pos)
  ),
  ins as (
    insert into public.shopping_session_items
      (session_id, position, raw_label, matched_name, product_id, brand, packaging_size,
       category, tva_rate, quantity, unit_price, total_price, is_food, expires_on)
    select
      v_session,
      l.pos::int,
      coalesce(nullif(trim(l.x->>'raw_label'), ''), nullif(trim(l.x->>'matched_name'), ''), 'Article'),
      nullif(trim(l.x->>'matched_name'), ''),
      nullif(l.x->>'product_id', '')::uuid,
      nullif(trim(l.x->>'brand'), ''),
      nullif(trim(l.x->>'packaging_size'), ''),
      coalesce(a.id, 'autre'),
      nullif(l.x->>'tva_rate', '')::numeric,
      coalesce(nullif(l.x->>'quantity', '')::numeric, 1),
      coalesce(nullif(l.x->>'unit_price', '')::numeric,
               nullif(l.x->>'total_price', '')::numeric / coalesce(nullif(l.x->>'quantity', '')::numeric, 1),
               0),
      coalesce(nullif(l.x->>'total_price', '')::numeric,
               nullif(l.x->>'unit_price', '')::numeric * coalesce(nullif(l.x->>'quantity', '')::numeric, 1),
               0),
      coalesce(a.budget, 'alimentaire') = 'alimentaire',
      nullif(l.x->>'expires_on', '')::date
    from lignes l
    left join public.aisles a on a.id = l.x->>'category'
    returning id, position
  )
  -- Entrée en stock des articles choisis (par défaut : les rayons alimentaires)
  insert into public.pantry_items
    (name, quantity, unit, category, location, expires_on, product_id, purchase_price, session_item_id)
  select
    left(coalesce(nullif(trim(l.x->>'matched_name'), ''), nullif(trim(l.x->>'raw_label'), ''), 'Article'), 80),
    coalesce(nullif(l.x->>'pantry_quantity', '')::numeric, nullif(l.x->>'quantity', '')::numeric),
    nullif(trim(l.x->>'unit'), ''),
    coalesce(a.id, 'autre'),
    coalesce(nullif(l.x->>'location', ''), a.default_location, 'frigo'),
    nullif(l.x->>'expires_on', '')::date,
    nullif(l.x->>'product_id', '')::uuid,
    nullif(l.x->>'unit_price', '')::numeric,
    i.id
  from lignes l
  join ins i on i.position = l.pos
  left join public.aisles a on a.id = l.x->>'category'
  where coalesce((l.x->>'to_pantry')::boolean, coalesce(a.budget, 'alimentaire') = 'alimentaire');

  -- Totaux de la session
  update public.shopping_sessions s
     set food_subtotal = t.food,
         home_subtotal = t.home,
         items_count   = t.nb,
         total_amount  = coalesce(nullif(p_session->>'total_amount', '')::numeric, t.food + t.home)
    from (
      select
        coalesce(sum(total_price) filter (where is_food), 0)     as food,
        coalesce(sum(total_price) filter (where not is_food), 0) as home,
        coalesce(sum(quantity), 0)::int                          as nb
      from public.shopping_session_items
      where session_id = v_session
    ) t
   where s.id = v_session;

  -- Les articles achetés quittent la liste de courses
  if coalesce(array_length(p_shopping_ids, 1), 0) > 0 then
    delete from public.shopping_items
     where id = any (p_shopping_ids) and user_id = (select auth.uid());
  end if;

  return v_session;
end;
$$;

grant execute on function public.archiver_courses(jsonb, jsonb, uuid[]) to authenticated;
revoke execute on function public.archiver_courses(jsonb, jsonb, uuid[]) from anon, public;

-- ---------------------------------------------------------------------------
-- Synchro en direct entre le Mac et l'iPhone
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table public.shopping_sessions;
alter publication supabase_realtime add table public.budgets;
