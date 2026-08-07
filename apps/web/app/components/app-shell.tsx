"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import GlymizeLanguageSwitch from "./glymize-language-switch";
import PwaInstall from "./pwa-install";
import { useGlymizeLocale } from "./use-glymize-locale";

const NAVIGATION = [
  {
    href: "/dashboard",
    icon: "⌂",
    fa: "داشبورد",
    en: "Dashboard",
  },
  {
    href: "/type-2",
    icon: "T2",
    fa: "دیابت نوع ۲",
    en: "Type 2 diabetes",
  },
  {
    href: "/type-1",
    icon: "T1",
    fa: "دیابت نوع ۱",
    en: "Type 1 diabetes",
  },
  {
    href: "/pregnancy",
    icon: "◇",
    fa: "دیابت بارداری",
    en: "Gestational diabetes",
  },
  {
    href: "/insulin-tools",
    icon: "IU",
    fa: "ابزارهای انسولین",
    en: "Insulin tools",
  },
  {
    href: "/care-team",
    icon: "RN",
    fa: "دستیار / پرستار",
    en: "Assistant / nurse",
  },
] as const;

const COPY = {
  fa: {
    navLabel: "ناوبری اصلی",
    workspace: "فضای کار بالینی GLYMIZE",
    subtitle: "تصمیم‌یار دیابت برای پزشک",
    brandSubtitle: "فضای کار بالینی",
    installable: "نسخهٔ قابل نصب GLYMIZE",
    privacy: "اطلاعات بیمار ذخیره نمی‌شود",
    menu: "نمایش منو",
    close: "بستن منو",
  },
  en: {
    navLabel: "Primary navigation",
    workspace: "GLYMIZE Clinical Workspace",
    subtitle: "Decision support for diabetes prescribing",
    brandSubtitle: "Clinical workspace",
    installable: "Installable GLYMIZE version",
    privacy: "Patient information is not stored",
    menu: "Open navigation",
    close: "Close navigation",
  },
} as const;

export default function AppShell({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const { locale, isRtl } = useGlymizeLocale();
  const copy = COPY[locale];

  if (pathname === "/") {
    return <><div className="home-pwa-control"><PwaInstall /></div>{children}</>;
  }

  return (
    <div className="app-shell glymize-internal-shell" dir={isRtl ? "rtl" : "ltr"}>
      <aside
        className={menuOpen ? "sidebar open" : "sidebar"}
        aria-label={copy.navLabel}
      >
        <Link
          className="brand"
          href="/dashboard"
          onClick={() => setMenuOpen(false)}
        >
          <span className="brand-mark" aria-hidden="true">
            Y
          </span>
          <span>
            <strong>GLYMIZE</strong>
            <small>{copy.brandSubtitle}</small>
          </span>
        </Link>

        <nav className="main-nav">
          {NAVIGATION.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                className={active ? "nav-item active" : "nav-item"}
                href={item.href}
                key={item.href}
                onClick={() => setMenuOpen(false)}
              >
                <span>{item.icon}</span>
                <span>{item[locale]}</span>
              </Link>
            );
          })}
        </nav>

        <div className="sidebar-note">
          <span className="status-dot" />
          <div>
            <strong>{copy.installable}</strong>
            <small>{copy.privacy}</small>
          </div>
        </div>
      </aside>

      <div className="content-shell">
        <header className="global-topbar glymize-shared-topbar">
          <button
            className="mobile-menu"
            onClick={() => setMenuOpen((value) => !value)}
            type="button"
            aria-label={copy.menu}
            aria-expanded={menuOpen}
          >
            ☰
          </button>

          <div className="topbar-title">
            <strong>{copy.workspace}</strong>
            <span>{copy.subtitle}</span>
          </div>

          <div className="topbar-actions"><PwaInstall /><GlymizeLanguageSwitch /></div>
        </header>

        <div className="page-content">{children}</div>
      </div>

      {menuOpen && (
        <button
          className="sidebar-overlay"
          onClick={() => setMenuOpen(false)}
          type="button"
          aria-label={copy.close}
        />
      )}
    </div>
  );
}
