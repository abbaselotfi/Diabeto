import Link from "next/link";
import PathwayMedicationCards from "../components/pathway-medication-cards";

export default function Type1Page() {
  return (
    <main>
      <Link className="back-button" href="/">→ بازگشت به داشبورد</Link>
      <header className="page-heading">
        <div><span className="eyebrow">Type 1 workspace</span><h1>دیابت نوع ۱</h1><p>فضای اختصاصی مرور درمان انسولین؛ این نسخه هیچ دوز یا تغییر خودکار رژیم تولید نمی‌کند.</p></div>
        <span className="version-badge">فعال</span>
      </header>
      <section className="compact-panel">
        <h2>مرور ایمن درمان</h2>
        <div className="check-grid static-checks">
          <span>✓ نوع و غلظت انسولین</span><span>✓ الگوی گلوکز و هیپوگلیسمی</span>
          <span>✓ زمان‌بندی وعده و تزریق</span><span>✓ برنامهٔ روز بیماری و کتون</span>
        </div>
        <p className="muted">انتخاب داروهای قابل نمایش از مسیر مستقیم `/admin` مدیریت می‌شود.</p>
      </section>
      <PathwayMedicationCards pathway="type1" />
    </main>
  );
}
