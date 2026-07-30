import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Diabeto | دستیار بالینی دیابت",
    short_name: "Diabeto",
    description: "فضای کار قابل نصب برای پشتیبانی تصمیم بالینی دیابت",
    start_url: "/",
    display: "standalone",
    background_color: "#f4f8f7",
    theme_color: "#0c766e",
    orientation: "portrait-primary",
    lang: "fa",
    dir: "rtl",
    icons: [
      { src: "/icon-192.png", sizes: "265x265", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" }
    ]
  };
}
