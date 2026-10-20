# Spécifications Fonctionnelles & Contexte Métier — `Atelier_Cuisine`

Ce document définit le contexte métier, les habitudes du foyer (**Auré et François**), les règles de gestion des 5 onglets et les données de référence pour l'application **Atelier_Cuisine**.

> Mise en œuvre : voir [CLAUDE.md](CLAUDE.md) pour la correspondance avec le code (React + Vite + Supabase).

---

## 1. Profil du Foyer & Habitudes
- **Membres :** Auré et François (2 adultes). Toutes les portions de recettes et calculs par défaut sont basés sur **2 personnes**.
- **Organisation des repas :**
  - Planification au format **Semainier** (Lundi au Dimanche, Midi et Soir) ou focus **Week-end** (Vendredi au Dimanche).
  - **3 types de repas possibles dans le planning :**
    1. **Recette détaillée** (ex: *Nouilles sautées crevettes*, *Gaufres*, *Crêpes*) qui déduit des quantités précises en grammes/ml/unités.
    2. **Assemblage rapide** (ex: *Pomme noisette et cordon bleu*, *Burger frites*, *Croque-monsieur salade*, *Saumon riz*, *Pâtes/saucisses*, *Steak poêlé*) qui déduit directement les produits correspondants du stock.
    3. **Repas extérieur / séparé** (ex: *Auré resto / François : MacDo*) qui ne déduit aucun ingrédient du stock mais peut être comptabilisé dans une catégorie budgétaire "Sorties/Resto".

---

## 2. Les 5 Onglets Fonctionnels & Algorithmes

### Onglet 1 : Inventaire & Dates de Péremption
- **Double suivi de péremption :**
  - `expirationDate` : Date limite de consommation inscrite sur l'emballage.
  - `openedAt` & `inContainer` : Suivi d'ouverture ou de mise en boîte hermétique (ex: *"Jambon périme le 04/10, mis dans la boîte le 22/09"*).
- **Niveaux de stock visuels (`stockLevel`) :**
  - Un article peut avoir une quantité exacte (`200g`, `2 paquets`) OU un niveau rapide :
    - `FULL` : Plein
    - `HALF` : Moitié (ex: *"Sauce salade (moitié)"*)
    - `ONE_MEAL` : Assez pour 1 repas (ex: *"Brocolis (assez pour 1 repas)"*, *"Haricot vert (assez pour 1 repas)"*)
    - `LOW` : Tends vers la fin (ex: *"Lessive noir (tends vers la fin mais assez)"*)
- **Notes personnalisées :** Champ libre par article (ex: *"racheter les pâtes que tu veux"*, *"je pense assez jusqu'aux prochaines courses"*).

### Onglet 2 : Planning Repas
- Vue calendrier avec statut `[ ] À faire` et `[x] Cuisiné`.
- **Action "Cuisiner ce repas" :** Déduit automatiquement les ingrédients du stock en priorisant ceux dont la date de péremption (ou la date de mise en boîte) est la plus proche (**FEFO** : *First Expired, First Out*).
- **Historique de repas favoris d'Auré & François (à proposer en autocomplétion) :**
  - *Poêlée poulet*, *Pizza*, *Nouilles sautées crevettes*, *Burger frites*, *Pâtes/saucisses*, *Salade composée*, *Moules frites*, *Croque-monsieur salade*, *Saumon riz*, *Pâtes Carbonara (Carbo)*, *Pomme noisette et cordon bleu*, *Raviolis*, *Steak poêlé*, *Omelette salade*, *Brunch*.

### Onglet 3 : Liste de Courses Active
- **Formule de calcul automatique :**
  `À acheter = Somme(Ingrédients des repas planifiés non cuisinés) - Somme(Stock disponible non périmé) + Articles marqués à racheter`
- Tri automatique selon les **11 catégories officielles** du foyer.
- **Mode Magasin (sur iPhone) :** Cocher un article (`[x]`) permet de saisir son prix réel et sa date de péremption.
- **Bouton "Valider & Archiver les courses" :**
  1. Crée automatiquement une entrée dans l'**Onglet 4 (Récapitulatif)**.
  2. Transfère tous les articles cochés (rayons 1 à 9) dans l'**Onglet 1 (Inventaire)**.
  3. Débite le montant total de l'**Onglet 5 (Budget)** et nettoie la liste active.

### Onglet 4 : Récapitulatif des Courses
Cet onglet sert de mémoire, d'archive de tickets de caisse et de bilan détaillé pour chaque session de courses :
- **Modèle de données (`ShoppingSession` & `ShoppingSessionItem`) :**
  - `id`, `date` (DateTime), `storeName` (ex: Carrefour Lille, Leclerc, Drive...), `paymentMethod` (ex: Carte bancaire), `totalAmount` (Float), `foodSubtotal` (Rayons 1 à 9), `homeSubtotal` (Rayons 10 & 11), `itemsCount` (Int), `notes` (String).
  - Liste exacte des produits achetés : `rawLabel`, `matchedIngredientName`, `brand`, `packagingSize`, `category`, `tvaRate`, `quantity`, `unitPrice`, `totalPrice`, `expirationDateSet`.
- **Fonctionnalités clés :**
  1. **Vue "Bilan du Dernier Panier" :** Résumé visuel des dernières courses (Montant total, nombre d'articles, répartition Alimentaire vs Maison/Hygiène, top 3 des articles les plus chers).
  2. **Historique des Tickets de Caisse :** Liste chronologique dépliable par rayon.
  3. **Import / Scan IA de Ticket de Caisse (PDF, Photo ou Texte) :** Upload d'un e-ticket PDF (ex: Carrefour) ou photo pour créer le récapitulatif, mettre à jour les prix unitaires de référence et remplir l'inventaire après validation dans une modale de prévisualisation.
  4. **Bouton "Reprendre des articles" & Export Markdown :** Permet de renvoyer des articles d'un ancien ticket vers la liste de courses active, ou de copier le récapitulatif en Markdown.

### Onglet 5 : Budget & Prix
- Définition d'un budget hebdomadaire ou mensuel.
- **Séparation analytique alimentée par les Récapitulatifs de courses :**
  - **Budget Alimentaire :** Rayons 1 à 9 (calcul du coût de revient par repas et du panier alimentaire moyen).
  - **Budget Maison & Hygiène :** Rayons 10 (`🧼 Hygiène`) et 11 (`🧽 Entretien maison`) suivis séparément.
- **Suivi de l'évolution des prix :** Historique du prix unitaire de chaque produit à chaque ticket enregistré.

---

## 3. Référentiel Initial des Produits (11 Catégories Strictes)
*Données chargées par `backend/catalogue/produits.json`.*

### 1. 🥬 Fruits & légumes
Gingembre, Tomate, Avocat, Salade, Compote, Nectarine, Pêche, Cerise, Myrtilles, Kaki, Fraise, Bleuet, Ananas, Banane, Raisins, Clémentine, Mangue, Concombre, Kiwi jaune, Kiwi vert, Maïs, Patates, Betterave, Citron, Oignon, Brocolis (note: *assez pour 1 repas*), Champignon, Choux fleur, Courgette, Haricot vert (note: *assez pour 1 repas*), Carottes, Échalote, Ail.

### 2. 🥩 Viandes / poissons / protéines
Jambon (qté hab: 2), Saumon, Poulet, Saumon fumé, Lardon, Saucisse (qté hab: 2), Crevettes, Cordon bleu, Moules, Steak haché (qté hab: 6), Calamar.

### 3. 🧀 Produits frais
Fromage, Beurre, Râpé, Œufs, Yaourt grecque, Cheddar, Yaourts, Crème liquide, Lait (qté hab: 2 bouteilles), Crème fraîche.

### 4. 🥖 Féculents / céréales
Céréales (Miel Pops), Riz (qté hab: 1), Pain burger, Vermicelles / nouilles, Pain de mie, Raviolis, Croque monsieur, Spaghettis, Penne / torsades / farfalle (note: *racheter les pâtes que tu veux*), Tagliatelles.

### 5. 🍟 Surgelés / plats rapides
Glace, Pomme noisette / duchesse / rissolée, Frites, Poêlée (note: *on a les légumes*).

### 6. 🍫 Épicerie sucrée
Nutella, Bonbons, Bready, Fondant chocolat, Biscuit Nutella, Pop corn, Chantilly, Sauce chocolat, Tablette chocolat pâtissier, Sucre, Sucre vanillé, Sucre glace, Miel.

### 7. 🧂 Épicerie salée / sauces
Vinaigre, Sauce tartare, Ciboulette, Huile d'olive, Ketchup, Sauce tomate, Sauce soja salée, Cornichons, Sauce barbecue, Mayo, Farine T45 ou 55, Échalote morceaux, Aneth, Sauce soja sucrée, Poivre, Levure, Sel, Ail moulu, Mix salade, Bouquet garni, Sauce salade (niveau: *moitié*), Persillade, Huile de sésame, Sauce huître, Vinaigre de riz, Extrait de vanille.

### 8. 🥤 Boissons
Eau, Limonade, Bières, Jus d'orange (qté hab: 2 bouteilles), Vin muscat / Sauternes, Grenadine.

### 9. 🍿 Apéro
Saucissons, Chips, Biscuits apéro (bretzels), Cacahuètes, Noix de cajou.

### 10. 🧼 Hygiène
Bain de bouche, Savon (note: *je pense assez jusqu'aux prochaines courses*), Dissolvant, Dentifrice, Crème pieds (vaseline), Gel douche, Papier humide, Déodorant, Démaquillant, Coton-tiges, Crème Nivea, Petit coton, Gros coton, Protections, Saforelle.

### 11. 🧽 Entretien maison
Pink Stuff, Pliz / Fée du logis, Alcool ménager citron, Vinaigre blanc (14° ménager), Soupline, Gel lave-vaisselle, Papier toilette, Mouchoirs, Glade spray toilette, Bloc WC, Éponges, Liquide vaisselle, Essuie-tout, Nettoyant multi-usage (Ajax), Lessive couleur, Lessive noir (note: *tends vers la fin mais assez*), Bicarbonate de soude, Harpic Active Fresh, Déboucheur canalisations.

---

## 4. Recettes de Référence (Base de Données Initiale)

### Recette 1 : 🍤 Nouilles sautées crevettes (2 personnes - 20 min)
- **Ingrédients :**
  - Nouilles / Vermicelles : 150–200 g
  - Crevettes (crues ou cuites) : 200 g
  - Carotte : 1 pièce
  - Brocoli : 1 petit
  - Ail : 2 gousses
  - Gingembre : 1 morceau (2–3 cm)
  - Huile de sésame : 1 càs (+ 1 filet finition)
  - Sauce soja salée : 1,5 càs
  - Sauce huître : 1 càs
  - Vinaigre de riz : 1 càc
- **Étapes :**
  1. **Préparation :** Cuire les nouilles selon le paquet et égoutter. Couper la carotte en fines lamelles et le brocoli en petits morceaux. Hacher l'ail et le gingembre.
  2. **Légumes :** Chauffer l'huile dans un wok/grande poêle. Faire sauter carotte + brocoli 4–5 min (doivent rester légèrement croquants).
  3. **Crevettes :** Ajouter ail + gingembre puis les crevettes. Cuire 2–3 min jusqu'à ce qu'elles rosissent.
  4. **Nouilles & Sauce :** Ajouter les nouilles, la sauce soja, la sauce huître et le vinaigre de riz. Mélanger à feu vif 2–3 min.
  5. **Finition :** Ajouter un filet d'huile de sésame et mélanger une dernière fois.

### Recette 2 : 🧇 Gaufres classiques (2 personnes)
- **Ingrédients :**
  - Œuf : 1 pièce
  - Farine : 120 g
  - Lait : 210 ml
  - Sucre : 0,5 càs (ou 1,5 càc)
  - Sel : 1 bonne pincée (1/8 càc)
  - Levure chimique : 2 càc
  - Extrait de vanille : 1/4 càc
  - Beurre fondu refroidi : 56 g
- **Étapes :**
  1. Battre l'œuf, le lait et le sucre pendant 2 à 3 minutes.
  2. Ajouter le beurre fondu refroidi et la vanille, mélanger.
  3. Dans un autre récipient, mélanger la farine, le sel et la levure chimique.
  4. Incorporer les ingrédients secs au mélange liquide doucement jusqu'à obtenir une pâte homogène.
  5. Préchauffer et graisser le gaufrier. Verser 5 càs de pâte par gaufre et cuire 3 à 5 minutes jusqu'à ce qu'elles soient bien dorées.

### Recette 3 : 🥞 Crêpes classiques (2 personnes)
- **Ingrédients :**
  - Farine : 90 g
  - Œuf : 1 pièce
  - Lait : 150 ml
  - Sucre : 0,5 càs
  - Sel : 1 pincée
  - Levure chimique : 1,5 càc
  - Beurre fondu : 22 g (1,5 càs)
  - Vanille (optionnel) : 1/4 càc d'extrait de vanille OU 1/2 sachet de sucre vanillé (3–4 g)
- **Étapes :**
  1. Battre l'œuf, le lait, le beurre fondu et le sucre.
  2. Dans un autre bol, mélanger la farine, le sel et la levure.
  3. Incorporer doucement les ingrédients secs au mélange liquide.
  4. Laisser reposer la pâte 15 à 30 minutes.
  5. Faire chauffer une poêle légèrement beurrée, verser une petite louche (3 càs) et cuire 4 à 6 minutes.

---

## 5. Spécifications de Lecture des Tickets de Caisse (Cas de Référence)

Dans l'onglet **4. Récapitulatif des Courses**, le système doit être capable d'extraire et de parser ce format exact de ticket de caisse **Carrefour** :

### Exemple de texte brut extrait d'un PDF Carrefour :
```text
Carrefour
LILLE
Tél: 03 28 52 99 79
Lun. au Sam.: 09:00 à 22:00
Dim.: 09:00 à 19:00
14/11/2025 à 14h11
TVA | Produit | QTE x P.U. | Montant €
5.5% DUCROS ANETH 13G | 1 x 2.19 | 2.19.
Total à payer | 2.19€
Payé par Carte bancaire | 2.19€
Clubs
Ma carte Club Carrefour
9135720000884879879
9999006812101012511141411
14.11.25 14:11 0068 121 101 0421
```

### Règles de gestion lors de l'import de ce ticket :
1. **Détection de l'enseigne et de la date :** Extraire `Carrefour Lille` et convertir `14/11/2025 à 14h11` en `DateTime` (`2025-11-14T14:11:00`).
2. **Nettoyage des lignes articles :**
   - Séparer le taux de TVA (`5.5%`), la marque (`DUCROS`), le produit (`ANETH`) et le conditionnement (`13G`).
   - Nettoyer les points parasites sur les montants (convertir `2.19.` en float `2.19`).
3. **Association au catalogue existant :**
   - Relier automatiquement `"5.5% DUCROS ANETH 13G"` à l'ingrédient existant **`Aneth`** de la catégorie **`7. 🧂 Épicerie salée / sauces`**.
   - Mettre à jour `estimatedPricePerUnit` de l'Aneth à `2.19` €.
   - Si un produit du ticket n'existe pas encore dans les 11 catégories d'Auré & François, l'IA propose de le créer en devinant sa catégorie parmi les 11 rayons (grâce au nom du produit et au taux de TVA : `5.5%` = Alimentaire, `20%` = souvent Hygiène/Entretien/Alcool).
4. **Validation avant enregistrement :**
   - Afficher une modale de prévisualisation du ticket décodé permettant à Auré ou François de vérifier les correspondances et d'ajouter rapidement les dates de péremption des produits frais avant de cliquer sur **"Confirmer et ajouter au stock & budget"**.
