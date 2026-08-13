import type { SaleRow } from "@/lib/sales-types";

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function labelPageHtml(labelUrl: string): string {
  return `<div class="page label-page"><img class="label-img" src="${escapeHtml(labelUrl)}" alt="" /></div>`;
}

function cellSizeMm(count: number): number {
  if (count <= 2) return 42;
  if (count <= 4) return 30;
  if (count <= 6) return 24;
  return 18;
}

function photoPageHtml(sale: SaleRow): string {
  const photos =
    sale.photo_urls && sale.photo_urls.length > 0
      ? sale.photo_urls
      : sale.photo_url
        ? [sale.photo_url]
        : [];
  const items = sale.items && sale.items.length > 1 ? sale.items : null;
  const size = cellSizeMm(Math.max(photos.length, 1));

  const cells = (photos.length > 0 ? photos : [null])
    .map((url, i) => {
      const idLabel = escapeHtml(
        (items?.[i]?.shoeId?.trim() || (items ? "" : sale.legacy_shoe_id) || "—") as string
      );
      const photoHtml = url
        ? `<img class="cell-photo" style="width:${size}mm;height:${size}mm" src="${escapeHtml(url)}" alt="" />`
        : `<div class="cell-photo cell-photo-empty" style="width:${size}mm;height:${size}mm">👟</div>`;
      return `<div class="cell">${photoHtml}<div class="cell-id">${idLabel}</div></div>`;
    })
    .join("");

  const meta = [sale.buyer_name, sale.sale_date].filter(Boolean).map((v) => escapeHtml(String(v))).join(" · ");

  return `
    <div class="page photo-page">
      <div class="photo-grid">${cells}</div>
      ${meta ? `<div class="photo-meta">${meta}</div>` : ""}
    </div>
  `;
}

export function buildLabelPrintHtml(
  sales: SaleRow[],
  options: { includePhoto: boolean }
): string {
  const pages: string[] = [];

  for (const sale of sales) {
    const labels = [sale.label_url, sale.label_url2].filter(
      (url): url is string => Boolean(url)
    );
    for (const labelUrl of labels) {
      pages.push(labelPageHtml(labelUrl));
    }
    if (options.includePhoto) {
      pages.push(photoPageHtml(sale));
    }
  }

  return `<!doctype html>
<html>
  <head>
    <title>Etykiety do druku</title>
    <style>
      @page { size: 150mm 100mm; margin: 0; }
      * { box-sizing: border-box; }
      html, body { margin: 0; padding: 0; width: 150mm; }
      .page {
        width: 150mm;
        height: 100mm;
        page-break-after: always;
        page-break-inside: avoid;
        overflow: hidden;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .label-page .label-img { width: 100%; height: 100%; object-fit: contain; }
      .photo-page {
        flex-direction: column;
        padding: 4mm;
        gap: 2mm;
      }
      .photo-grid {
        flex: 1;
        width: 100%;
        display: flex;
        flex-wrap: wrap;
        align-content: center;
        justify-content: center;
        gap: 3mm;
      }
      .cell {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 1mm;
      }
      .cell-photo { object-fit: cover; border-radius: 2mm; }
      .cell-photo-empty {
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 20px;
        background: #f0f0f0;
        border-radius: 2mm;
      }
      .cell-id { font-weight: 700; font-size: 11px; color: #000; max-width: 40mm; text-align: center; }
      .photo-meta { font-size: 10px; color: #333; }
    </style>
  </head>
  <body>
    ${pages.join("\n") || '<div class="page"></div>'}
  </body>
</html>`;
}

export function openLabelPrintWindow(
  sales: SaleRow[],
  options: { includePhoto: boolean }
): boolean {
  const html = buildLabelPrintHtml(sales, options);
  const printWindow = window.open("", "_blank", "width=520,height=420");
  if (!printWindow) return false;

  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.onload = () => {
    printWindow.focus();
    printWindow.print();
  };
  return true;
}
