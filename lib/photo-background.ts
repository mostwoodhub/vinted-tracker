import "server-only";
import { removeBackground } from "@imgly/background-removal-node";
import sharp from "sharp";

// Free, local background removal (ONNX model, no external API/account) — no
// per-photo cost and no rate limit, unlike remove.bg/Photoroom's paid tiers.
// Runs the whole photo through a segmentation model, then composites the
// isolated subject onto a plain white background with sharp (already a
// project dependency). Takes a few seconds per photo — only invoked when
// the publisher opts in via the "Białe tło" checkbox, never automatically.
// The package's ~127MB of ONNX model chunks default to being read off local
// disk (node_modules/@imgly/background-removal-node/dist/) — fine for a
// normal server, but on Vercel that directory isn't reliably present in the
// deployed function (build-time file tracing can't see the dynamic
// resources.json-driven reads that pick which chunk files to load), which
// failed with ENOENT the first time this ran in production. Pointing
// publicPath at IMG.LY's own CDN, hosting the identical version-pinned
// files, sidesteps bundling them at all.
const MODEL_PUBLIC_PATH = "https://staticimgly.com/@imgly/background-removal-data/1.4.5/dist/";

export async function removeBackgroundToWhite(imageBuffer: Buffer): Promise<Buffer> {
  const blob = new Blob([new Uint8Array(imageBuffer)], { type: "image/jpeg" });
  const resultBlob = await removeBackground(blob, { publicPath: MODEL_PUBLIC_PATH });
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

// Phone shots of shoes standing on the floor often have the pair sitting in
// the bottom half of the frame with a lot of empty floor/wall above it —
// fine at full size, but shrinks the actual product down in a marketplace
// thumbnail. Trimming a fixed slice off the top re-centers the subject
// without needing to detect where it actually is.
const CROP_TOP_PERCENT = 0.15;

export async function cropTopOfPhoto(imageBuffer: Buffer): Promise<Buffer> {
  const image = sharp(imageBuffer);
  const metadata = await image.metadata();
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  if (!width || !height) return imageBuffer;

  const cropHeight = Math.round(height * CROP_TOP_PERCENT);
  return image
    .extract({ left: 0, top: cropHeight, width, height: height - cropHeight })
    .jpeg({ quality: 90 })
    .toBuffer();
}
