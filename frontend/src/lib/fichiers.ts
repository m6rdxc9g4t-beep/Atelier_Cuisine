// Préparation des fichiers de tickets de caisse avant lecture.

/** Texte d'un PDF (e-ticket), ligne par ligne, dans l'ordre de lecture. */
export async function texteDuPdf(fichier: Blob): Promise<string> {
  // Version « legacy » de pdf.js : compatible avec les WebView de macOS 11 et iOS 16
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const worker = (await import("pdfjs-dist/legacy/build/pdf.worker.min.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = worker;

  const tache = pdfjs.getDocument({ data: new Uint8Array(await fichier.arrayBuffer()) });
  const doc = await tache.promise;
  const lignes: string[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const contenu = await page.getTextContent();
    // Regroupe les fragments par ligne (même ordonnée), puis de gauche à droite
    const parLigne = new Map<number, { x: number; t: string }[]>();
    for (const item of contenu.items) {
      if (!("str" in item) || !item.str.trim()) continue;
      const y = Math.round(item.transform[5] / 2) * 2;
      parLigne.set(y, [...(parLigne.get(y) ?? []), { x: item.transform[4], t: item.str.trim() }]);
    }
    [...parLigne.entries()]
      .sort(([a], [b]) => b - a)
      .forEach(([, morceaux]) => lignes.push(morceaux.sort((a, b) => a.x - b.x).map((m) => m.t).join(" | ")));
  }
  await tache.destroy();
  return lignes.join("\n");
}

/** Contenu d'un fichier en base64 (sans l'en-tête data:). */
export async function enBase64(fichier: Blob): Promise<string> {
  const url = await new Promise<string>((ok, ko) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result));
    r.onerror = () => ko(r.error);
    r.readAsDataURL(fichier);
  });
  return url.slice(url.indexOf(",") + 1);
}

/**
 * Photo de ticket réduite à 2000 px de haut maximum, en JPEG : assez net pour
 * être lu, assez léger pour être envoyé depuis un iPhone.
 */
export async function photoAllegee(fichier: File): Promise<{ media_type: string; data: string }> {
  try {
    const image = await createImageBitmap(fichier);
    const echelle = Math.min(1, 2000 / Math.max(image.width, image.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(image.width * echelle);
    canvas.height = Math.round(image.height * echelle);
    canvas.getContext("2d")!.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, "image/jpeg", 0.85));
    if (blob) return { media_type: "image/jpeg", data: await enBase64(blob) };
  } catch {
    /* format non décodable ici : on envoie l'original */
  }
  return { media_type: fichier.type || "image/jpeg", data: await enBase64(fichier) };
}
