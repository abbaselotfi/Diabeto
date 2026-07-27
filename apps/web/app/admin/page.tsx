"use client";

import { FormEvent, useState } from "react";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export default function AdminPage() {
  const [message, setMessage] = useState("هنوز importی درخواست نشده است.");
  const [displayMode, setDisplayMode] = useState<"generic_first" | "brand_first">("generic_first");

  async function requestCatalogUpdate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const sourceUrl = String(form.get("sourceUrl") ?? "").trim();
    const response = await fetch(`${apiUrl}/v1/admin/catalog/imports`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sourceKind: sourceUrl ? "approved_export" : "manual_csv", sourceUrl: sourceUrl || undefined, requestedBy: "admin-demo" })
    });
    const result = (await response.json()) as { message: string };
    setMessage(result.message);
  }

  return (
    <main className="shell admin-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">پنل مدیریت / چندسازمانی</p>
          <h1>کاتالوگ دارو، نمایش و آمار استفاده</h1>
        </div>
      </header>

      <section className="metric-grid" aria-label="شاخص‌های استفاده">
        <article><span>کاربران ثبت‌شده</span><strong>—</strong><small>پس از فعال‌شدن احراز هویت</small></article>
        <article><span>کاربران فعال ۳۰ روز</span><strong>—</strong><small>فقط دادهٔ تجمیعی</small></article>
        <article><span>ارزیابی تکمیل‌شده</span><strong>—</strong><small>بدون ذخیرهٔ دادهٔ بیمار</small></article>
      </section>

      <div className="admin-grid">
        <section className="panel">
          <p className="eyebrow">نمایش دارو</p>
          <h2>امپاگلیفلوزین</h2>
          <p>منطق بالینی همیشه با نام ژنریک اجرا می‌شود؛ برند فقط در خروجی نمایش تغییر می‌کند.</p>
          <label className="radio"><input checked={displayMode === "generic_first"} name="display" onChange={() => setDisplayMode("generic_first")} type="radio" /> نمایش ژنریک در اولویت</label>
          <label className="radio"><input checked={displayMode === "brand_first"} name="display" onChange={() => setDisplayMode("brand_first")} type="radio" /> نمایش برند تأییدشده در اولویت</label>
          <p className="muted">حالت فعلی: {displayMode === "generic_first" ? "فقط ژنریک" : "برندِ اولویت‌دار پس از تأیید"}</p>
        </section>

        <section className="panel">
          <p className="eyebrow">به‌روزرسانی بازار ایران</p>
          <h2>ورود و تطبیق برندها</h2>
          <form onSubmit={requestCatalogUpdate}>
            <label htmlFor="sourceUrl">نشانی API یا export تأییدشده</label>
            <input id="sourceUrl" name="sourceUrl" placeholder="https://…" type="url" />
            <button type="submit">بازخوانی و ورود به صف</button>
          </form>
          <p className="muted">{message}</p>
        </section>
      </div>

      <section className="panel">
        <p className="eyebrow">حاکمیت کاتالوگ</p>
        <h2>پیش از نمایش برند چه اتفاقی می‌افتد؟</h2>
        <ol>
          <li>ورود از منبع تأییدشده یا CSV دستی همراه provenance</li>
          <li>تطبیق با ژنریک، شکل و قدرت دارو</li>
          <li>بازبینی ادمین و انتشار نسخهٔ کاتالوگ</li>
          <li>اولویت‌دهی برند در سطح سازمان، بدون تغییر قانون بالینی</li>
        </ol>
      </section>
    </main>
  );
}
