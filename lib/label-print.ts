import { jsPDF } from "jspdf";
import type { SaleRow } from "@/lib/sales-types";
import { isPdfBytes, renderPdfFirstPageToCanvas } from "@/lib/pdf-to-image";

const PAGE_WIDTH_MM = 150;
const PAGE_HEIGHT_MM = 100;
// Split used when a label and its photos share one page (see addCombinedPage).
const COMBINED_LABEL_HEIGHT_MM = 56;
const COMBINED_PHOTO_HEIGHT_MM = PAGE_HEIGHT_MM - COMBINED_LABEL_HEIGHT_MM;

type LoadedImage = { dataUrl: string; width: number; height: number };

// jsPDF's built-in standard fonts (Helvetica) only cover WinAnsi — Polish
// diacritics (Latin Extended-A) aren't in that table and render as wrong
// glyphs instead of just being missing (e.g. "ł" comes out as "B"). Embedding
// a Unicode TTF would fix this properly, but until then, transliterate to
// plain ASCII so text we draw stays readable instead of silently corrupted.
const POLISH_DIACRITICS: Record<string, string> = {
  ą: "a", ć: "c", ę: "e", ł: "l", ń: "n", ó: "o", ś: "s", ź: "z", ż: "z",
  Ą: "A", Ć: "C", Ę: "E", Ł: "L", Ń: "N", Ó: "O", Ś: "S", Ź: "Z", Ż: "Z",
};
function toAscii(value: string): string;
function toAscii(value: string[]): string[];
function toAscii(value: string | string[]): string | string[] {
  if (Array.isArray(value)) return value.map((v) => toAscii(v));
  return value.replace(/[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/g, (ch) => POLISH_DIACRITICS[ch] ?? ch);
}

// Routed through our own origin — sale photo/label URLs live on Supabase
// Storage (current or, for migrated rows, the old project), neither of
// which reliably serves CORS headers permissive enough for canvas reads.
function proxiedUrl(url: string): string {
  return `/api/image-proxy?url=${encodeURIComponent(url)}`;
}

// Many carrier labels (DPD, Orlen Paczka, DHL BOX screenshots, …) are saved
// portrait. On a landscape 150x100mm card that leaves them tiny and
// letterboxed — rotate 90° so they fill the page instead, same as the
// crop-time rotation in LabelCropModal. This must happen here too since it
// also needs to apply to labels stored before that fix.
function canvasToLoadedImage(canvas: HTMLCanvasElement, forceLandscape?: boolean): LoadedImage {
  const rotate = Boolean(forceLandscape) && canvas.height > canvas.width;
  let final = canvas;
  if (rotate) {
    final = document.createElement("canvas");
    final.width = canvas.height;
    final.height = canvas.width;
    const ctx = final.getContext("2d");
    if (!ctx) throw new Error("Canvas nie jest obslugiwany w tej przegladarce");
    ctx.translate(final.width / 2, final.height / 2);
    ctx.rotate(Math.PI / 2);
    ctx.drawImage(canvas, -canvas.width / 2, -canvas.height / 2);
  }
  return { dataUrl: final.toDataURL("image/png"), width: final.width, height: final.height };
}

function decodeImageBlob(blob: Blob): Promise<HTMLCanvasElement> {
  const objectUrl = URL.createObjectURL(blob);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Canvas nie jest obslugiwany w tej przegladarce"));
        return;
      }
      ctx.drawImage(img, 0, 0);
      resolve(canvas);
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(
        new Error(`Uszkodzony plik obrazu (typ: ${blob.type || "?"}, rozmiar: ${blob.size} B)`)
      );
    };
    img.src = objectUrl;
  });
}

async function loadImageAsPng(
  url: string,
  options?: { forceLandscape?: boolean }
): Promise<LoadedImage> {
  // Fetch (rather than pointing an <img> straight at the proxy) so a failure
  // surfaces the real HTTP status instead of a generic "couldn't load" —
  // useful for telling apart "label deleted from storage" (404) from
  // "host not on the proxy allowlist" (400) from a network blip.
  const response = await fetch(proxiedUrl(url));
  if (!response.ok) {
    let detail = "";
    try {
      detail = (await response.text()).slice(0, 80);
    } catch {
      // ignore — body isn't essential to the error
    }
    throw new Error(`HTTP ${response.status}${detail ? ` (${detail})` : ""}`);
  }

  const buffer = await response.arrayBuffer();

  // A handful of historical sales carry the carrier's raw shipping-label PDF
  // as label_url — it was never converted to an image by the old system, so
  // no <img>/canvas decoder can read it directly. Render page 1 instead.
  const canvas = isPdfBytes(new Uint8Array(buffer))
    ? await renderPdfFirstPageToCanvas(buffer)
    : await decodeImageBlob(new Blob([buffer]));

  return canvasToLoadedImage(canvas, options?.forceLandscape);
}

function fitContain(imgW: number, imgH: number, boxW: number, boxH: number) {
  const scale = Math.min(boxW / imgW, boxH / imgH);
  const w = imgW * scale;
  const h = imgH * scale;
  return { w, h, x: (boxW - w) / 2, y: (boxH - h) / 2 };
}

function cellSizeMm(count: number, maxSize: number): number {
  let size: number;
  if (count <= 2) size = 42;
  else if (count <= 4) size = 30;
  else if (count <= 6) size = 24;
  else size = 18;
  return Math.min(size, maxSize);
}

// Draws the label image into the given box. Returns nothing — errors are
// caught and rendered as a marked placeholder so one broken label doesn't
// abort the whole batch.
async function drawLabel(
  doc: jsPDF,
  labelUrl: string,
  context: string,
  box: { x: number; y: number; w: number; h: number }
) {
  try {
    const img = await loadImageAsPng(labelUrl, { forceLandscape: true });
    const fit = fitContain(img.width, img.height, box.w, box.h);
    doc.addImage(img.dataUrl, "PNG", box.x + fit.x, box.y + fit.y, fit.w, fit.h);
  } catch (err) {
    const reason = err instanceof Error ? err.message : "nieznany blad";
    console.error(`[label-print] Nie udalo sie wczytac etykiety (${context}):`, err);
    doc.setFontSize(9);
    doc.setTextColor(180, 0, 0);
    doc.text(
      toAscii([`Nie udalo sie wczytac etykiety (${context})`, reason]),
      box.x + box.w / 2,
      box.y + box.h / 2,
      { align: "center" }
    );
  }
}

async function drawPhotoGrid(
  doc: jsPDF,
  sale: SaleRow,
  box: { top: number; height: number },
  maxCellSize: number,
  options?: { showMeta?: boolean }
) {
  const showMeta = options?.showMeta ?? true;
  const photos =
    sale.photo_urls && sale.photo_urls.length > 0
      ? sale.photo_urls
      : sale.photo_url
        ? [sale.photo_url]
        : [];
  const items = sale.items && sale.items.length > 1 ? sale.items : null;
  const entries = photos.length > 0 ? photos : [null];
  const size = cellSizeMm(entries.length, maxCellSize);
  const gap = 3;
  const labelGap = 5;
  const padding = 4;
  // Reserve room below the grid for the buyer/date line only when it's
  // actually drawn — on the combined label+photo page the strip is short
  // enough that reserving space for it anyway pushed the id-label line and
  // the meta line to within ~1mm of each other, so they overlapped.
  const metaReserve = showMeta ? 6 : 0;

  // Cap columns by both page width and actual entry count — using only the
  // width cap here made a single photo hug the left edge instead of sitting
  // centered, because the grid was sized as if it always had a full row.
  const maxCols = Math.max(1, Math.floor((PAGE_WIDTH_MM - padding * 2 + gap) / (size + gap)));
  const cols = Math.max(1, Math.min(entries.length, maxCols));
  const rows = Math.ceil(entries.length / cols);
  const gridW = cols * size + (cols - 1) * gap;
  const gridH = rows * (size + labelGap) + (rows - 1) * gap;
  const startX = (PAGE_WIDTH_MM - gridW) / 2;
  const startY = box.top + Math.max(padding, (box.height - metaReserve - gridH) / 2);

  for (let i = 0; i < entries.length; i++) {
    const url = entries[i];
    const col = i % cols;
    const row = Math.floor(i / cols);
    const cellX = startX + col * (size + gap);
    const cellY = startY + row * (size + labelGap + gap);

    if (url) {
      try {
        const img = await loadImageAsPng(url);
        const fit = fitContain(img.width, img.height, size, size);
        doc.addImage(img.dataUrl, "PNG", cellX + fit.x, cellY + fit.y, fit.w, fit.h);
      } catch (err) {
        console.error(`[label-print] Nie udalo sie wczytac zdjecia (sale ${sale.id}):`, err);
        doc.setDrawColor(200);
        doc.rect(cellX, cellY, size, size);
      }
    } else {
      doc.setDrawColor(200);
      doc.rect(cellX, cellY, size, size);
    }

    const idLabel = toAscii(
      String(items?.[i]?.shoeId?.trim() || (items ? "" : sale.legacy_shoe_id) || "-")
    );
    doc.setFontSize(9);
    doc.setTextColor(0, 0, 0);
    doc.text(idLabel, cellX + size / 2, cellY + size + 4, { align: "center" });
  }

  if (showMeta) {
    const meta = toAscii([sale.buyer_name, sale.sale_date].filter(Boolean).join(" - "));
    if (meta) {
      doc.setFontSize(8);
      doc.setTextColor(90, 90, 90);
      doc.text(meta, PAGE_WIDTH_MM / 2, box.top + box.height - 3, { align: "center" });
    }
  }
}

// Label-only export: one full-page card per label.
async function addLabelPage(doc: jsPDF, labelUrl: string, isFirstPage: boolean, context: string) {
  if (!isFirstPage) doc.addPage([PAGE_WIDTH_MM, PAGE_HEIGHT_MM], "landscape");
  await drawLabel(doc, labelUrl, context, { x: 0, y: 0, w: PAGE_WIDTH_MM, h: PAGE_HEIGHT_MM });
}

// Photo-only page, used when a sale has no label at all.
async function addPhotoPage(doc: jsPDF, sale: SaleRow, isFirstPage: boolean) {
  if (!isFirstPage) doc.addPage([PAGE_WIDTH_MM, PAGE_HEIGHT_MM], "landscape");
  await drawPhotoGrid(doc, sale, { top: 0, height: PAGE_HEIGHT_MM }, 42);
}

// Label + photos together on a single card, one page per label (matches the
// old program's layout instead of splitting label and photos across pages).
async function addCombinedPage(
  doc: jsPDF,
  labelUrl: string,
  sale: SaleRow,
  isFirstPage: boolean,
  context: string
) {
  if (!isFirstPage) doc.addPage([PAGE_WIDTH_MM, PAGE_HEIGHT_MM], "landscape");
  await drawLabel(doc, labelUrl, context, {
    x: 0,
    y: 0,
    w: PAGE_WIDTH_MM,
    h: COMBINED_LABEL_HEIGHT_MM,
  });
  doc.setDrawColor(220);
  doc.line(4, COMBINED_LABEL_HEIGHT_MM, PAGE_WIDTH_MM - 4, COMBINED_LABEL_HEIGHT_MM);
  await drawPhotoGrid(
    doc,
    sale,
    { top: COMBINED_LABEL_HEIGHT_MM, height: COMBINED_PHOTO_HEIGHT_MM },
    32,
    { showMeta: false }
  );
}

export async function buildLabelPdf(
  sales: SaleRow[],
  options: { includePhoto: boolean }
): Promise<jsPDF> {
  const doc = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: [PAGE_WIDTH_MM, PAGE_HEIGHT_MM],
  });
  let firstPage = true;

  for (const sale of sales) {
    const labels = [sale.label_url, sale.label_url2].filter(
      (url): url is string => Boolean(url)
    );
    const context = sale.legacy_shoe_id || sale.buyer_name || sale.id;

    if (options.includePhoto) {
      if (labels.length > 0) {
        for (const labelUrl of labels) {
          await addCombinedPage(doc, labelUrl, sale, firstPage, context);
          firstPage = false;
        }
      } else {
        await addPhotoPage(doc, sale, firstPage);
        firstPage = false;
      }
    } else {
      for (const labelUrl of labels) {
        await addLabelPage(doc, labelUrl, firstPage, context);
        firstPage = false;
      }
    }
  }

  return doc;
}

export async function downloadLabelPdf(
  sales: SaleRow[],
  options: { includePhoto: boolean },
  filename: string
): Promise<void> {
  const doc = await buildLabelPdf(sales, options);
  doc.save(filename);
}
