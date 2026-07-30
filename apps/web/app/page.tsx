import Link from "next/link";

const tools = [
  {
    href: "/type-2",
    icon: "T2",
    color: "teal",
    title: "دیابت نوع ۲",
    detail: "شروع یا تشدید درمان بر اساس HbA1c فعلی، هدف فردی، بیماری‌های همراه و داروهای فعال.",
    badge: "فعال"
  },
  {
    href: "/type-1",
    icon: "T1",
    color: "blue",
    title: "دیابت نوع ۱",
    detail: "فضای مستقل برای مرور درمان انسولین و ملاحظات ایمنی، بدون ذخیرهٔ اطلاعات هویتی.",
    badge: "فعال"
  },
  {
    href: "/pregnancy",
    icon: "◇",
    color: "amber",
    title: "دیابت و بارداری",
    detail: "نمای اختصاصی بارداری برای مرور گزینه‌های فعال‌شده و هشدارهای پرخطر.",
    badge: "فعال"
  }
] as const;

export default function HomePage() {
  return (
    <main>
      <section className="hero">
        <div>
          <span className="eyebrow">Clinical workspace</span>
          <h1>سلام دکتر، آماده‌اید؟</h1>
          <p>ابزارهای تصمیم‌یار دیابت را روی موبایل یا لپ‌تاپ باز کنید؛ این نسخه به‌صورت PWA نیز قابل نصب است.</p>
        </div>
        <Link className="primary-button" href="/type-2"><span>شروع ارزیابی Type 2</span><span>←</span></Link>
      </section>

      <div className="safety-banner" role="note">
        <span className="safety-icon">i</span>
        <div>
          <strong>تصمیم نهایی با پزشک است</strong>
          <p>خروجی برنامه پیشنهاد نسخه یا دوز خودکار نیست؛ وضعیت حاد، تداخل‌ها، منع مصرف و برچسب رسمی فرآورده باید بررسی شوند.</p>
        </div>
      </div>

      <div className="section-heading">
        <div><h2>مسیرهای بالینی</h2><p>همهٔ ماژول‌های نسخهٔ فعلی در دسترس هستند</p></div>
      </div>

      <section className="tool-grid">
        {tools.map((tool, index) => (
          <article className={index === 0 ? "tool-card featured" : "tool-card"} key={tool.href}>
            <div className={`tool-icon ${tool.color}`}>{tool.icon}</div>
            <span className="card-status available">{tool.badge}</span>
            <h3>{tool.title}</h3>
            <p>{tool.detail}</p>
            <Link className="text-button" href={tool.href}><span>باز کردن مسیر</span><span>←</span></Link>
          </article>
        ))}
      </section>

      <section className="version-strip">
        <div><span className="version-icon">✓</span><div><strong>وضعیت برنامه</strong><p>وب‌اپ واکنش‌گرا، قابل نصب و مناسب موبایل و لپ‌تاپ</p></div></div>
        <span className="version-badge">ADA 2026 / v0.2</span>
      </section>

      <section className="guideline-summary compact-panel">
        <span className="eyebrow">منابع علمی</span>
        <h2>قواعد قابل ردیابی</h2>
        <p>مسیر Type 2 بر مبنای ADA Standards of Care in Diabetes—2026 طراحی شده است و مرجع هر نتیجه در همان صفحه نمایش داده می‌شود.</p>
        <a href="https://diabetesjournals.org/care/article/49/Supplement_1/S183/163934/9-Pharmacologic-Approaches-to-Glycemic-Treatment" rel="noreferrer" target="_blank">مشاهدهٔ ADA 2026، بخش ۹</a>
      </section>
    </main>
  );
}
