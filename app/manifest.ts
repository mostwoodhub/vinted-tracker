import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Vinted Tracker",
    short_name: "Vinted Tracker",
    description:
      "Magazyn, sprzedaż i ogłoszenia (Vinted, Allegro, OLX) w jednym miejscu.",
    start_url: "/sales",
    display: "standalone",
    background_color: "#f5f5f7",
    theme_color: "#7c5cff",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
