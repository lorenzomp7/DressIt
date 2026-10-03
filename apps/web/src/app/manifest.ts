import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "DressIt — il tuo stylist AI",
    short_name: "DressIt",
    description: "Il tuo guardaroba digitale con consigli outfit basati su AI.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#141220",
    theme_color: "#141220",
    lang: "it",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Aggiungi capo", url: "/add" },
      { name: "Cosa mi metto?", url: "/assistant" },
    ],
  };
}
