import type { Metadata } from "next";
import AppShell from "./components/app-shell";
import { withBasePath } from "../lib/base-path";
import "./globals.css";

export const metadata: Metadata = {
  title: "DiaYar | پشتیبان تصمیم بالینی دیابت",
  description: "پلتفرم وب و قابل نصب برای پشتیبانی تصمیم بالینی دیابت",
  manifest: withBasePath("/manifest.webmanifest"),
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "DiaYar"
  },
  icons: {
    icon: withBasePath("/icon-192.png"),
    apple: withBasePath("/icon-192.png")
  }
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fa" dir="rtl">
      <body><AppShell>{children}</AppShell></body>
    </html>
  );
}
