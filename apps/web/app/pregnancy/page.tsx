import Link from "next/link";
import PathwayMedicationCards from "../components/pathway-medication-cards";
import ClinicalDomainMedications from "../components/clinical-domain-medications";

export default function PregnancyPage() {
  return (
    <main>
      <Link className="back-button" href="/dashboard">→ بازگشت به داشبورد</Link>
      <header className="page-heading">
        <div><span className="eyebrow">Pregnancy workspace</span><h1>دیابت و بارداری</h1><p>نمای پرخطر برای مرور درمان پیش از بارداری، دوران بارداری و پس از زایمان.</p></div>
        <span className="version-badge">فعال</span>
      </header>
      <div className="clinical-warning">
        <strong>مسیر پرخطر</strong>
        <p>انسولین درمان ترجیحی دیابت نوع ۲ در بارداری و دیابت بارداری است. داروهای فعال‌شده در کاتالوگ به معنی مناسب‌بودن در بارداری نیستند و باید جداگانه ارزیابی شوند.</p>
      </div>
      <section className="compact-panel">
        <h2>چک‌لیست جلسه</h2>
        <div className="check-grid static-checks">
          <span>✓ سن بارداری و هدف گلوکز</span><span>✓ سابقهٔ هیپوگلیسمی</span>
          <span>✓ داروهای فعلی و منع مصرف</span><span>✓ برنامهٔ پایش مادر و جنین</span>
        </div>
      </section>
      <PathwayMedicationCards pathway="pregnancy" />
      <ClinicalDomainMedications />
    </main>
  );
}
