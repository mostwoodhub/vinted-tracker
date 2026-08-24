import type { NextConfig } from "next";

// @imgly/background-removal-node's onnxruntime-node dependency ships a
// native .so binary that Next.js's build-time file tracing doesn't detect on
// its own (it's loaded via a native N-API binding, not a plain `require`) —
// without this it's silently dropped from the deployed function, and the
// background-removal option fails at runtime with "cannot open shared
// object file" the first time anyone actually uses it. Scoped to the two
// routes that can reach prepareListingPhotoUrls (via publishOlxAdvert /
// publishAllegroOffer in app/drafts/actions.ts, shared by both pages)
// rather than every route, to avoid bloating unrelated functions.
const onnxRuntimeTracingIncludes = ["./node_modules/onnxruntime-node/bin/napi-v3/linux/**/*"];

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "15mb",
    },
  },
  outputFileTracingIncludes: {
    // Keys are picomatch globs, not literal paths — [id] would otherwise be
    // read as a character class, not this route's actual bracket segment.
    "/drafts": onnxRuntimeTracingIncludes,
    "/items/\\[id\\]": onnxRuntimeTracingIncludes,
  },
};

export default nextConfig;
