import type { MetadataRoute } from "next";
import { withBasePath } from "../lib/base-path";

export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "DiaYar | دستیار بالینی دیابت",
    short_name: "DiaYar",
    description: "فضای کار قابل نصب برای پشتیبانی تصمیم بالینی دیابت",
    start_url: withBasePath("/"),
    scope: withBasePath("/"),
    display: "standalone",
    background_color: "#f4f8f7",
    theme_color: "#0c766e",
    orientation: "portrait-primary",
    lang: "fa",
    dir: "rtl",
    icons: [
      { src: withBasePath("/icon-192.png"), sizes: "265x265", type: "image/png" },
      { src: withBasePath("/icon-512.png"), sizes: "512x512", type: "image/png" }
    ]
  };
}
