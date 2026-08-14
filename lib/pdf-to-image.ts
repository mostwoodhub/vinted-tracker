const RENDER_TIMEOUT_MS = 20_000;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(`Przekroczono czas oczekiwania: ${label}`)), ms);
    }),
  ]);
}

// Renders page 1 of a PDF to a canvas, client-side, via pdfjs-dist. Shared
// between the interactive label-crop flow and the print/PDF-export pipeline,
// since some historical sales carry a raw shipping-label PDF as label_url —
// never converted to an image by the old system — which no <img>/canvas
// image decoder can read directly.
//
// Every pdfjs step that depends on its worker thread is wrapped in a
// timeout: if the worker fails to start (sandboxed/embedded browser
// contexts can silently never spin one up, with no error event to catch),
// pdfjs's promises just hang forever instead of rejecting. Without a
// timeout that turns into the whole PDF export freezing indefinitely.
export async function renderPdfFirstPageToCanvas(
  data: ArrayBuffer,
  scale = 2.5
): Promise<HTMLCanvasElement> {
  const pdfjsLib = await import("pdfjs-dist");
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url
  ).toString();

  const pdf = await withTimeout(
    pdfjsLib.getDocument({ data }).promise,
    RENDER_TIMEOUT_MS,
    "wczytywanie PDF"
  );
  const page = await pdf.getPage(1);
  const viewport = page.getViewport({ scale });

  const canvas = document.createElement("canvas");
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas nie jest obsługiwany w tej przeglądarce");

  await withTimeout(
    page.render({ canvasContext: ctx, viewport, canvas }).promise,
    RENDER_TIMEOUT_MS,
    "renderowanie PDF"
  );
  return canvas;
}

export function isPdfBytes(bytes: Uint8Array): boolean {
  return bytes.length >= 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46;
}
