-- Compatibilité avec les apps pas encore mises à jour (app Mac déjà installée,
-- site iPhone en cache) : elles écrivent encore les anciennes catégories
-- (cremerie, viande_poisson, boulangerie, epicerie). On les convertit vers les
-- 11 rayons à l'écriture ; une valeur inconnue devient « autre » au lieu de
-- faire échouer l'enregistrement.

create or replace function public.convertir_categorie()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.category := public.rayon_depuis_ancienne_categorie(new.category);
  if new.category is null or not exists (select 1 from public.aisles a where a.id = new.category) then
    new.category := 'autre';
  end if;
  return new;
end;
$$;

create trigger convertir_categorie
  before insert or update of category on public.pantry_items
  for each row execute function public.convertir_categorie();

create trigger convertir_categorie
  before insert or update of category on public.shopping_items
  for each row execute function public.convertir_categorie();

create trigger convertir_categorie
  before insert or update of category on public.recipe_ingredients
  for each row execute function public.convertir_categorie();
