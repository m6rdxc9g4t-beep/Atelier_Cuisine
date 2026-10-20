import { describe, expect, it } from "vitest";
import { decoderTicketTexte, montant, normaliserTicket, rapprocher, versMarkdown } from "./ticket";
import type { Product } from "./supabase";

const p = (name: string, aisle_id: string, keywords: string[] = []): Product => ({
  id: "id-" + name,
  user_id: null,
  name,
  aisle_id,
  keywords,
  default_unit: null,
  usual_quantity: null,
  usual_unit: null,
  note: null,
});

const CATALOGUE = [
  p("Aneth", "epicerie_salee", ["aneth"]),
  p("Ail", "fruits_legumes", ["ail"]),
  p("Ail moulu", "epicerie_salee", ["ail moulu"]),
  p("Liquide vaisselle", "entretien", ["liquide vaisselle"]),
  p("Steak haché", "viandes_poissons", ["steak hache", "hache"]),
];

// Texte brut extrait du PDF Carrefour de référence (CONTEXT_SPEC.md §5)
const CARREFOUR = `Carrefour
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
14.11.25 14:11 0068 121 101 0421`;

describe("ticket Carrefour de référence", () => {
  const t = decoderTicketTexte(CARREFOUR, CATALOGUE);

  it("détecte l'enseigne, la date et le paiement", () => {
    expect(t.storeName).toBe("Carrefour Lille");
    expect(t.purchaseDate).toBe("2025-11-14T14:11:00");
    expect(t.paymentMethod).toBe("Carte bancaire");
    expect(t.totalAmount).toBe(2.19);
  });

  it("ignore le bruit et décode la ligne article", () => {
    expect(t.items).toHaveLength(1);
    expect(t.items[0]).toMatchObject({
      rawLabel: "5.5% DUCROS ANETH 13G",
      matchedIngredientName: "Aneth",
      productId: "id-Aneth",
      brand: "Ducros",
      packagingSize: "13g",
      category: "epicerie_salee",
      tvaRate: 5.5,
      quantity: 1,
      unitPrice: 2.19,
      totalPrice: 2.19,
      isFoodBudget: true,
    });
  });
});

describe("décodage d'autres lignes", () => {
  it("lit les lignes sans barres verticales et les quantités multiples", () => {
    const t = decoderTicketTexte(
      "Leclerc\nTOURCOING\n02/03/2026 à 9h05\n5.5% CHARAL STEAK HACHE 5% X6 2 x 4,15 8,30\n20% PAIC LIQUIDE VAISSELLE 750ML 1 x 2.49 2.49\nTotal à payer 10.79",
      CATALOGUE,
    );
    expect(t.storeName).toBe("Leclerc Tourcoing");
    expect(t.items).toHaveLength(2);
    expect(t.items[0]).toMatchObject({ matchedIngredientName: "Steak haché", quantity: 2, unitPrice: 4.15, totalPrice: 8.3 });
    expect(t.items[1]).toMatchObject({ matchedIngredientName: "Liquide vaisselle", category: "entretien", isFoodBudget: false, packagingSize: "750ml" });
  });

  it("tolère les fragments séparés par pdf.js", () => {
    const t = decoderTicketTexte("Carrefour | LILLE\n14/11/2025 | à 14h11\n5.5% | DUCROS ANETH 13G | 1 x 2.19 | 2.19.", CATALOGUE);
    expect(t.purchaseDate).toBe("2025-11-14T14:11:00");
    expect(t.items[0]).toMatchObject({ rawLabel: "5.5% DUCROS ANETH 13G", matchedIngredientName: "Aneth", totalPrice: 2.19 });
  });

  it("propose un rayon alimentaire pour un produit inconnu à 5,5 %", () => {
    const t = decoderTicketTexte("Carrefour\n5.5% BONNE MAMAN MADELEINES 1 x 2.99 2.99", CATALOGUE);
    expect(t.items[0]).toMatchObject({ productId: null, category: "epicerie_salee", isFoodBudget: true });
  });
});

describe("rapprochement", () => {
  it("préfère le mot-clé le plus long", () => {
    expect(rapprocher("DUCROS AIL MOULU 40G", CATALOGUE).produit?.name).toBe("Ail moulu");
    expect(rapprocher("AIL BLANC FILET 250G", CATALOGUE).produit?.name).toBe("Ail");
  });
  it("ne confond pas un mot qui contient le mot-clé", () => {
    expect(rapprocher("VOLAILLE ROTIE", CATALOGUE).produit).toBeNull();
  });
});

describe("normalisation d'une réponse d'IA", () => {
  it("nettoie les montants et retrouve le produit du catalogue", () => {
    const t = normaliserTicket(
      {
        storeName: "Carrefour Lille",
        purchaseDate: "2025-11-14T14:11:00",
        paymentMethod: "Carte bancaire",
        totalAmount: "2.19.",
        items: [
          { rawLabel: "5.5% DUCROS ANETH 13G", matchedIngredientName: "Aneth", brand: "Ducros", packagingSize: "13g", category: "🧂 Épicerie salée / sauces", tvaRate: 5.5, quantity: 1, unitPrice: "2.19.", totalPrice: 2.19, isFoodBudget: true },
        ],
      },
      CATALOGUE,
    );
    expect(t.totalAmount).toBe(2.19);
    expect(t.items[0]).toMatchObject({ productId: "id-Aneth", unitPrice: 2.19, category: "epicerie_salee" });
  });
  it("supporte une réponse incomplète", () => {
    expect(normaliserTicket({ items: [{ rawLabel: "TRUC", totalPrice: 3 }] }, CATALOGUE)).toMatchObject({
      storeName: "Magasin",
      totalAmount: 3,
      items: [{ quantity: 1, unitPrice: 3 }],
    });
  });
});

describe("utilitaires", () => {
  it("convertit les montants mal formés", () => {
    expect(montant("2.19.")).toBe(2.19);
    expect(montant("2,19 €")).toBe(2.19);
    expect(montant(null)).toBeNull();
  });
  it("exporte en Markdown par rayon", () => {
    const md = versMarkdown(
      { store_name: "Carrefour Lille", purchased_at: "2025-11-14T13:11:00Z", payment_method: "Carte bancaire", total_amount: 2.19, food_subtotal: 2.19, home_subtotal: 0 },
      [{ raw_label: "5.5% DUCROS ANETH 13G", matched_name: "Aneth", category: "epicerie_salee", quantity: 1, unit_price: 2.19, total_price: 2.19 }],
    );
    expect(md).toContain("## 🧾 Carrefour Lille");
    expect(md).toContain("### 🧂 Épicerie salée / sauces");
    expect(md).toContain("| Aneth | 1 | 2,19 € | 2,19 € |");
  });
});
