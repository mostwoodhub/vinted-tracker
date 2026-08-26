import { defineConfig } from "vitest/config";
import path from "node:path";

const rootDir = import.meta.dirname;

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(rootDir, "."),
      "server-only": path.resolve(rootDir, "test/stubs/server-only.ts"),
    },
  },
  test: {
    include: ["lib/**/*.test.ts"],
    // Some lib files under test transitively import lib/supabase-admin.ts
    // at module-load time (e.g. lib/batches.ts, which also has real
    // network-touching functions alongside the pure ones actually under
    // test here) — createClient() throws immediately on an empty URL, so
    // these just need to look valid, never connect to anything real.
    env: {
      NEXT_PUBLIC_SUPABASE_URL: "https://test.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
    },
  },
});
