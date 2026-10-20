-- Rangement des achats : chaque article coché passe de la liste de courses
-- au garde-manger avec la date et l'emplacement choisis dans l'app.
-- Opération atomique (tout ou rien).
-- Remplace store_checked_items (gardée pour compatibilité, plus utilisée par l'app).

create or replace function public.store_shopping_items(p_items jsonb)
returns int
language plpgsql
security invoker
set search_path = ''
as $$
declare
  moved int;
begin
  with choix as (
    select (x->>'id')::uuid as id,
           nullif(x->>'expires_on', '')::date as expires_on,
           coalesce(nullif(x->>'location', ''), 'frigo') as location
    from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) as x
  ),
  sortis as (
    delete from public.shopping_items s
    using choix c
    where s.id = c.id and s.user_id = (select auth.uid())
    returning s.name, s.quantity, s.unit, s.category, c.location, c.expires_on
  )
  insert into public.pantry_items (name, quantity, unit, category, location, expires_on)
  select name, quantity, unit, category, location, expires_on
  from sortis;
  get diagnostics moved = row_count;
  return moved;
end;
$$;

grant execute on function public.store_shopping_items(jsonb) to authenticated;
revoke execute on function public.store_shopping_items(jsonb) from anon, public;
