// Rejoue les migrations Supabase sur PGlite (Postgres en WASM) avec de petites
// simulations de Supabase (auth, rôles, temps réel), puis teste RLS et fonctions.
// Usage : npm test (dans backend/tests)
import { PGlite } from "@electric-sql/pglite";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";

const dir = process.argv[2] ?? new URL("../supabase/migrations/", import.meta.url).pathname;
const db = new PGlite();
const A = "11111111-1111-1111-1111-111111111111";
const B = "22222222-2222-2222-2222-222222222222";

await db.exec(`
  create schema auth;
  create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create role authenticated; create role anon; create role service_role;
  grant usage on schema public, auth to authenticated, anon;
  grant execute on function auth.uid() to authenticated, anon;
  alter default privileges in schema public grant all on tables to authenticated, anon, service_role;
  alter default privileges in schema public grant all on functions to authenticated, anon, service_role;
  create publication supabase_realtime;
  insert into auth.users values ('${A}'), ('${B}');
`);

const fichiers = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
const anciennes = fichiers.filter((f) => f < "20261021");
const nouvelles = fichiers.filter((f) => f >= "20261021");

async function appliquer(f) {
  if (f.includes("alertes")) return console.log("  (ignorée : pg_cron / vault)", f);
  await db.exec(readFileSync(path.join(dir, f), "utf8"));
  console.log("  ✓", f);
}

async function en(user, sql, params = []) {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${user}', false);`);
  try {
    return (await db.query(sql, params)).rows;
  } finally {
    await db.exec("reset role;");
  }
}

console.log("Migrations en production :");
for (const f of anciennes) await appliquer(f);

// Données existantes avec les anciennes catégories
await en(A, `insert into public.pantry_items (name, category, location) values ('Lait', 'cremerie', 'frigo'), ('Steak', 'viande_poisson', 'frigo')`);
await en(A, `insert into public.shopping_items (name, category) values ('Baguette', 'boulangerie'), ('Truc', 'inconnue')`);

console.log("Nouvelles migrations :");
for (const f of nouvelles) await appliquer(f);

const un = async (sql) => (await db.query(sql)).rows[0];

// --- Référentiel
assert.equal((await un("select count(*)::int n from aisles")).n, 12);
assert.equal((await un("select count(*)::int n from products where user_id is null")).n, 152);
assert.equal((await un("select count(*)::int n from recipes where user_id is null")).n, 36);
assert.equal((await un("select count(*)::int n from meal_templates where user_id is null")).n, 18);
assert.equal((await un("select count(*)::int n from meal_templates where is_favorite")).n, 15);
const carbo = await un("select t.name, r.title from meal_templates t join recipes r on r.id = t.recipe_id where t.name like 'Pâtes Carbo%'");
assert.equal(carbo.title, "Pâtes carbonara");
const crepes = await un(`select count(*) filter (where is_optional)::int opt, count(*)::int n, min(r.servings) s
  from recipe_ingredients i join recipes r on r.id = i.recipe_id where r.title = 'Crêpes'`);
assert.deepEqual(crepes, { opt: 2, n: 9, s: 2 });
const nouilles = await un(`select quantity, quantity_max from recipe_ingredients i join recipes r on r.id = i.recipe_id
  where r.title = 'Nouilles sautées crevettes' and i.position = 0`);
assert.equal(Number(nouilles.quantity_max), 200);
console.log("✓ référentiel : 11 rayons + autre, 152 produits, 36 recettes, 18 repas types");

// --- Conversion des anciennes catégories
const conv = await en(A, "select name, category from pantry_items union all select name, category from shopping_items order by name");
assert.deepEqual(conv.map((r) => r.category), ["feculents", "produits_frais", "viandes_poissons", "autre"]);
console.log("✓ anciennes catégories converties :", conv.map((r) => `${r.name}→${r.category}`).join(", "));

// --- Idempotence des catalogues
await appliquer(nouvelles.find((f) => f.includes("catalogue_recettes")));
await appliquer(nouvelles.find((f) => f.includes("catalogue_produits")));
assert.equal((await un("select count(*)::int n from products")).n, 152);
assert.equal((await un("select count(*)::int n from meal_template_items")).n,
  (await un("select count(*)::int n from (select distinct template_id, position from meal_template_items) x")).n);
console.log("✓ catalogues relançables sans doublon");

// --- Exemples du foyer
const ex1 = (await en(A, "select ajouter_exemples_foyer() n"))[0].n;
const ex2 = (await en(A, "select ajouter_exemples_foyer() n"))[0].n;
assert.equal(ex1, 7);
assert.equal(ex2, 0);
const jambon = (await en(A, "select in_container, expires_on - opened_on as ecart from pantry_items where name = 'Jambon'"))[0];
assert.deepEqual(jambon, { in_container: true, ecart: 12 });
console.log("✓ exemples du foyer : 7 lignes, relance sans doublon, jambon en boîte (12 jours d'écart)");

// --- Suggestions
const sugg = await en(A, "select title, total, matched from suggest_recipes(50)");
assert.ok(sugg.length > 0);
console.log("✓ suggestions :", sugg.slice(0, 3).map((s) => `${s.title} ${s.matched}/${s.total}`).join(", "));

// --- Archivage d'une session (ticket Carrefour de référence + un article maison)
const panne = (await en(A, "select id from shopping_items where source = 'a_racheter'"))[0].id;
const session = (
  await en(A, "select archiver_courses($1::jsonb, $2::jsonb, $3::uuid[]) id", [
    JSON.stringify({ purchased_at: "2025-11-14T14:11:00+01:00", store_name: "Carrefour Lille", payment_method: "Carte bancaire", total_amount: 6.69, source: "ticket_pdf" }),
    JSON.stringify([
      { raw_label: "5.5% DUCROS ANETH 13G", matched_name: "Aneth", brand: "Ducros", packaging_size: "13g", category: "epicerie_salee", tva_rate: 5.5, quantity: 1, unit_price: 2.19, total_price: 2.19 },
      { raw_label: "20% PAIC LIQ VAISSELLE", matched_name: "Liquide vaisselle", category: "entretien", tva_rate: 20, quantity: 1, unit_price: 4.5, total_price: 4.5 },
    ]),
    `{${panne}}`,
  ])
)[0].id;
const s = (await en(A, "select food_subtotal, home_subtotal, items_count, total_amount from shopping_sessions where id = $1", [session]))[0];
assert.deepEqual(
  { f: Number(s.food_subtotal), h: Number(s.home_subtotal), n: s.items_count, t: Number(s.total_amount) },
  { f: 2.19, h: 4.5, n: 2, t: 6.69 },
);
const stock = await en(A, "select name, purchase_price, session_item_id is not null lie from pantry_items where name in ('Aneth', 'Liquide vaisselle')");
assert.deepEqual(stock.map((r) => r.name), ["Aneth"]);
assert.equal((await en(A, "select count(*)::int n from shopping_items where id = $1", [panne]))[0].n, 0);
const prix = (await en(A, "select last_unit_price, last_store from product_prices where name = 'Aneth'"))[0];
assert.equal(Number(prix.last_unit_price), 2.19);
console.log("✓ archivage : sous-totaux 2,19 € alimentaire / 4,50 € maison, Aneth en stock, liste nettoyée, prix de référence");

// --- Cuisiner un repas (déduction FEFO choisie par l'app)
const ids = Object.fromEntries((await en(A, "select name, id from pantry_items")).map((r) => [r.name, r.id]));
const meal = (await en(A, "insert into meals (title, meal_type, status, slot) values ('Nouilles sautées crevettes', 'recette', 'prevu', 'diner') returning id"))[0].id;
const nb = (await en(A, "select cuisiner_repas($1, $2::jsonb) n", [meal, JSON.stringify([
  { id: ids["Jambon"], action: "retirer" },
  { id: ids["Brocolis"], action: "niveau", stock_level: "fin" },
  { id: ids["Lait"], action: "quantite", quantity: 300 },
])]))[0].n;
assert.equal(nb, 3);
const apres = Object.fromEntries((await en(A, "select name, stock_level, quantity from pantry_items")).map((r) => [r.name, r]));
assert.ok(!apres["Jambon"]);
assert.equal(apres["Brocolis"].stock_level, "fin");
assert.equal(Number(apres["Lait"].quantity), 300);
assert.equal((await en(A, "select status from meals where id = $1", [meal]))[0].status, "cuisine");
console.log("✓ cuisiner_repas : repas cuisiné, lot retiré, niveau et quantité mis à jour");

// --- Isolation entre comptes (RLS)
assert.equal((await en(B, "select count(*)::int n from shopping_sessions"))[0].n, 0);
assert.equal((await en(B, "select count(*)::int n from pantry_items"))[0].n, 0);
assert.equal((await en(B, "select count(*)::int n from product_prices"))[0].n, 0);
assert.equal((await en(B, "select count(*)::int n from products"))[0].n, 152);
await assert.rejects(en(B, `insert into products (user_id, name) values ('${A}', 'Intrus')`));
await assert.rejects(en(B, "select cuisiner_repas($1)", [meal]));
await en(B, "insert into products (name, aisle_id) values ('Tofu fumé', 'produits_frais')");
assert.equal((await en(A, "select count(*)::int n from products where name = 'Tofu fumé'"))[0].n, 0);
await en(A, "insert into budgets (scope, period, amount) values ('alimentaire', 'mois', 400)");
assert.equal((await en(B, "select count(*)::int n from budgets"))[0].n, 0);
console.log("✓ RLS : chaque compte ne voit que ses données, le catalogue commun reste lisible");

// --- Anciennes apps : les anciennes catégories sont converties à l'écriture
await en(A, "insert into pantry_items (name, category, location) values ('Crème', 'cremerie', 'frigo'), ('Bidule', 'nimporte', 'placard')");
await en(A, "insert into shopping_items (name, category) values ('Farine', 'epicerie')");
const compat = await en(A, "select name, category from pantry_items where name in ('Crème', 'Bidule') union all select name, category from shopping_items where name = 'Farine' order by name");
assert.deepEqual(compat.map((r) => r.category), ["autre", "produits_frais", "epicerie_salee"]);
console.log("✓ anciennes apps : catégories converties à l'écriture (cremerie → produits_frais, inconnue → autre)");

const pub = (await db.query("select tablename from pg_publication_tables where pubname = 'supabase_realtime' order by 1")).rows.map((r) => r.tablename);
console.log("✓ temps réel :", pub.join(", "));
console.log("\nTous les tests passent.");
