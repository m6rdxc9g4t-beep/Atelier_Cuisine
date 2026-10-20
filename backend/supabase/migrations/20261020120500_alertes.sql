-- Rappels quotidiens de péremption
--
-- 1. Accès aux secrets (Vault) réservé au rôle service, pour la fonction Edge.
-- 2. Tâche planifiée qui appelle la fonction chaque matin.
--
-- Les valeurs des secrets ne sont PAS dans ce fichier. Pour un nouveau projet :
--   select vault.create_secret('<clé publique VAPID>', 'alertes_vapid_publique');
--   select vault.create_secret('<clé privée VAPID>',   'alertes_vapid_privee');
--   select vault.create_secret('https://ton-site',     'alertes_vapid_sujet');
--   select vault.create_secret('<chaîne aléatoire>',   'alertes_cron_secret');
-- (générer les clés VAPID : npx web-push generate-vapid-keys)

create extension if not exists pg_cron;
create extension if not exists pg_net;

create or replace function public.secret_alertes(nom text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select decrypted_secret from vault.decrypted_secrets
  where name = nom and name like 'alertes\_%'
  limit 1
$$;

revoke execute on function public.secret_alertes(text) from public, anon, authenticated;
grant execute on function public.secret_alertes(text) to service_role;

-- Chaque jour à 7 h UTC (8 h ou 9 h à Paris selon la saison)
select cron.schedule(
  'alertes-peremption',
  '0 7 * * *',
  $$
  select net.http_post(
    url := 'https://hcdiuxznceuixindcvhp.supabase.co/functions/v1/alertes-peremption',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'alertes_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$
);
