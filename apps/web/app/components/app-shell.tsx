"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import PwaInstall from "./pwa-install";

const navigation = [
  { href: "/", label: "داشبورد", icon: "⌂" },
  { href: "/type-2", label: "دیابت نوع ۲", icon: "T2" },
  { href: "/type-1", label: "دیابت نوع ۱", icon: "T1" },
  { href: "/pregnancy", label: "دیابت بارداری", icon: "◇" }
];

export default function AppShell({ children }: Readonly<{ children: React.ReactNode }>) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="app-shell">
      <aside className={menuOpen ? "sidebar open" : "sidebar"} aria-label="ناوبری اصلی">
        <Link className="brand" href="/" onClick={() => setMenuOpen(false)}>
          <span className="brand-mark" aria-hidden="true">D</span>
          <span><strong>Diabeto</strong><small>فضای کار بالینی</small></span>
        </Link>
        <nav className="main-nav">
          {navigation.map((item) => {
            const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            return (
              <Link className={active ? "nav-item active" : "nav-item"} href={item.href} key={item.href} onClick={() => setMenuOpen(false)}>
                <span>{item.icon}</span><span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="sidebar-note">
          <span className="status-dot" />
          <div><strong>نسخهٔ قابل نصب</strong><small>اطلاعات بیمار ذخیره نمی‌شود</small></div>
        </div>
      </aside>

      <div className="content-shell">
        <header className="global-topbar">
          <button className="mobile-menu" onClick={() => setMenuOpen((value) => !value)} type="button" aria-label="نمایش منو" aria-expanded={menuOpen}>☰</button>
          <div className="topbar-title"><strong>فضای کار بالینی</strong><span>تصمیم‌یار دیابت برای پزشک</span></div>
          <PwaInstall />
        </header>
        <div className="page-content">{children}</div>
      </div>
      {menuOpen && <button className="sidebar-overlay" onClick={() => setMenuOpen(false)} type="button" aria-label="بستن منو" />}
    </div>
  );
}
