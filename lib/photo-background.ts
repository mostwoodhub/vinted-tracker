import "server-only";
import { removeBackground } from "@imgly/background-removal-node";
import sharp from "sharp";

// Free, local background removal (ONNX model, no external API/account) — no
// per-photo cost and no rate limit, unlike remove.bg/Photoroom's paid tiers.
// Runs the whole photo through a segmentation model, then composites the
// isolated subject onto a plain white background with sharp (already a
// project dependency). Takes a few seconds per photo — only invoked when
// the publisher opts in via the "Białe tło" checkbox, never automatically.
export async function removeBackgroundToWhite(imageBuffer: Buffer): Promise<Buffer> {
  const blob = new Blob([new Uint8Array(imageBuffer)], { type: "image/jpeg" });
  const resultBlob = await removeBackground(blob);
  const transparentBuffer = Buffer.from(await resultBlob.arrayBuffer());

  const metadata = await sharp(transparentBuffer).metadata();
  return sharp({
    create: {
      width: metadata.width ?? 1000,
      height: metadata.height ?? 1000,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    },
  })
    .composite([{ input: transparentBuffer }])
    .jpeg({ quality: 90 })
    .toBuffer();
}
