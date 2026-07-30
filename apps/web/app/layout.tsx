import type { Metadata } from "next";
import AppShell from "./components/app-shell";
import "./globals.css";

export const metadata: Metadata = {
  title: "Diabeto | پشتیبان تصمیم بالینی دیابت",
  description: "پلتفرم وب و قابل نصب برای پشتیبانی تصمیم بالینی دیابت",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Diabeto"
  },
  icons: {
    icon: "/icon-192.png",
    apple: "/icon-192.png"
  }
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fa" dir="rtl">
      <body><AppShell>{children}</AppShell></body>
    </html>
  );
}
