import type { MetadataRoute } from "next";
import { withBase } from "@/lib/base-path";

export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "DressIt — il tuo stylist AI",
    short_name: "DressIt",
    description: "Il tuo guardaroba digitale con consigli outfit basati su AI.",
    start_url: withBase("/"),
    scope: withBase("/"),
    display: "standalone",
    orientation: "portrait",
    background_color: "#141220",
    theme_color: "#141220",
    lang: "it",
    icons: [
      { src: withBase("/icons/icon-192.png"), sizes: "192x192", type: "image/png" },
      { src: withBase("/icons/icon-512.png"), sizes: "512x512", type: "image/png" },
      { src: withBase("/icons/maskable-512.png"), sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Aggiungi capo", url: withBase("/add/") },
      { name: "Cosa mi metto?", url: withBase("/assistant/") },
    ],
  };
}
