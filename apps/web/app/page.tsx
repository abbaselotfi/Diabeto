import Link from "next/link";

const pathways = [
  { key: "type_2", title: "دیابت نوع ۲", detail: "اولین مسیر فعال پس از انتشار و تأیید bundle بالینی.", status: "در اولویت انتشار" },
  { key: "type_1", title: "دیابت نوع ۱", detail: "ساختار مسیر آماده است؛ محتوای بالینی مستقل لازم دارد.", status: "در انتظار محتوای تأییدشده" },
  { key: "pregnancy", title: "دیابت بارداری", detail: "مسیر پرخطر با محتوای تخصصی و بازبینی مستقل.", status: "در انتظار محتوای تأییدشده" }
] as const;

export default function HomePage() {
  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Diabeto / نسخهٔ پایه</p>
          <h1>پشتیبان تصمیم، نه تجویز خودکار</h1>
        </div>
        <Link className="admin-link" href="/admin">پنل مدیریت</Link>
      </header>

      <section className="intro" aria-labelledby="pathway-heading">
        <p>دادهٔ بیمار در این نسخه ناشناس است و انتخاب نوع دیابت، تشخیص پزشکی محسوب نمی‌شود.</p>
        <h2 id="pathway-heading">مسیر کار را انتخاب کنید</h2>
        <div className="pathways">
          {pathways.map((pathway) => (
            <article className="card" key={pathway.key}>
              <span className={pathway.key === "type_2" ? "badge active" : "badge"}>{pathway.status}</span>
              <h3>{pathway.title}</h3>
              <p>{pathway.detail}</p>
              {pathway.key === "type_2" ? (
                <Link className="admin-link" href="/type-2">ورود به ارزیابی ناشناس</Link>
              ) : (
                <button type="button" disabled>فعلاً محتوای بالینی فعال نیست</button>
              )}
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
