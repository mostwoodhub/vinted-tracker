// Stub for the "server-only" package under Vitest — its real index.js
// unconditionally throws when imported outside a webpack/RSC bundle, which
// is exactly what a plain Node test runner looks like to it. The guard it
// provides (don't let server code leak into a client bundle) doesn't apply
// here, so this is a safe no-op replacement for tests only — see the alias
// in vitest.config.ts.
export {};
