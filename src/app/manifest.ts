import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Español Fast — Madrid B1 in 12 Weeks",
    short_name: "Español Fast",
    description:
      "Personal Spain Spanish (es-ES) FSRS vocabulary, AI tutor, pronunciation coach, and reader.",
    start_url: "/",
    display: "standalone",
    background_color: "#0D0E11",
    theme_color: "#FF4F17",
    orientation: "portrait",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
      },
    ],
  };
}
