import type { MetadataRoute } from "next";
import { APP_DISPLAY_NAME, APP_TAGLINE } from "@/lib/config";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: APP_DISPLAY_NAME,
    short_name: APP_DISPLAY_NAME,
    description: APP_TAGLINE,
    start_url: "/today",
    scope: "/",
    display: "standalone",
    background_color: "#12110e",
    theme_color: "#12110e",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}
