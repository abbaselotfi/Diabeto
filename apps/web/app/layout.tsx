import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Diabeto | پشتیبان تصمیم بالینی دیابت",
  description: "پلتفرم پزشک‌محور و چندسازمانی برای پشتیبانی تصمیم بالینی دیابت"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fa" dir="rtl">
      <body>{children}</body>
    </html>
  );
}
