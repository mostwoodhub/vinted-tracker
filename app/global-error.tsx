"use client";

import { useEffect } from "react";

// Only fires if app/layout.tsx itself throws (error.tsx doesn't cover
// that case — it can only catch errors from the segment tree the layout
// successfully rendered). Has to render its own <html>/<body> since it
// replaces the entire root layout when active, and can't safely assume
// globals.css or any other app styling loaded — plain inline styles only.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="pl">
      <body
        style={{
          display: "flex",
          minHeight: "100vh",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "1rem",
          fontFamily: "system-ui, sans-serif",
          padding: "1.5rem",
          textAlign: "center",
        }}
      >
        <h1 style={{ fontSize: "1.5rem", fontWeight: 600 }}>Aplikacja nie mogła się załadować</h1>
        <p style={{ color: "#666", maxWidth: "28rem" }}>
          Wystąpił nieoczekiwany błąd. Spróbuj ponownie — jeśli się powtarza,
          zgłoś to administratorowi.
        </p>
        <button
          type="button"
          onClick={() => reset()}
          style={{
            borderRadius: "9999px",
            padding: "0.625rem 1.5rem",
            fontSize: "0.875rem",
            fontWeight: 500,
            color: "white",
            background: "#6d5bd0",
            border: "none",
            cursor: "pointer",
          }}
        >
          Spróbuj ponownie
        </button>
      </body>
    </html>
  );
}
