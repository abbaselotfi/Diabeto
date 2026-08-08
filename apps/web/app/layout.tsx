import type { Metadata } from "next";

import { withBasePath } from "../lib/base-path";
import AppShell from "./components/app-shell";
import "./globals.css";
import "./internal-shell.css";
import "./theme-overrides.css";
import "./dark-readability.css";

export const metadata: Metadata = {
  title: "GLYMIZE | Diabetes Prescribing Intelligence",
  description:
    "A bilingual clinical decision-support platform for diabetes prescribing.",
  manifest: withBasePath("/manifest.webmanifest"),
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "GLYMIZE",
  },
  icons: {
    icon: withBasePath("/glymize-favicon.svg"),
    shortcut: withBasePath("/glymize-favicon.svg"),
    apple: withBasePath("/glymize-app-icon.png"),
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fa" dir="rtl" data-glymize-theme="clinical" data-glymize-mode="light">
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
