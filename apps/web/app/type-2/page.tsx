"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";

type Workflow = "initiation" | "intensification";

const workflowText: Record<Workflow, { title: string; description: string }> = {
  initiation: {
    title: "شروع درمان",
    description: "مرور عوامل فردی و گزینه‌های درمان آغازین بر اساس نسخهٔ تأییدشدهٔ پروتکل."
  },
  intensification: {
    title: "تشدید درمان",
    description: "ارزیابی علت کنترل ناکافی و گزینه‌های تشدید درمان، از جمله مسیر انسولین."
  }
};

const safetyFactors = [
  ["ascvd", "بیماری قلبی‌عروقی آترواسکلروتیک"],
  ["heartFailure", "نارسایی قلبی"],
  ["ckd", "بیماری مزمن کلیه"],
  ["hypoglycemia", "ریسک بالای هیپوگلیسمی"],
  ["weight", "نیاز به مدیریت وزن"],
  ["insulin", "نیاز به بررسی مسیر انسولین/FRC"]
] as const;

export default function Type2Page() {
  const [workflow, setWorkflow] = useState<Workflow>("initiation");
  const [submitted, setSubmitted] = useState(false);
  const [selectedFactors, setSelectedFactors] = useState<string[]>([]);
  const selectedLabels = useMemo(
    () => safetyFactors.filter(([key]) => selectedFactors.includes(key)).map(([, label]) => label),
    [selectedFactors]
  );

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitted(true);
  }

  function toggleFactor(key: string) {
    setSelectedFactors((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key]);
  }

  return (
    <main className="shell type2-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Diabeto / پزشکان تأییدشده</p>
          <h1>ارزیابی ناشناس دیابت نوع ۲</h1>
          <p className="muted">این فرم هیچ نام، شماره تماس یا شناسهٔ بیمار ذخیره نمی‌کند.</p>
        </div>
        <Link className="admin-link" href="/">بازگشت</Link>
      </header>

      <section className="workflow-switch" aria-label="نوع ارزیابی">
        {(Object.keys(workflowText) as Workflow[]).map((key) => (
          <button className={workflow === key ? "selected" : "secondary"} key={key} onClick={() => { setWorkflow(key); setSubmitted(false); }} type="button">
            {workflowText[key].title}
          </button>
        ))}
      </section>

      <section className="panel">
        <h2>{workflowText[workflow].title}</h2>
        <p className="muted">{workflowText[workflow].description}</p>
        <form onSubmit={submit}>
          <div className="form-grid">
            <label>HbA1c (اختیاری؛ فقط برای این نشست)<input inputMode="decimal" name="hba1c" placeholder="مثلاً 8.2" /></label>
            <label>eGFR (اختیاری؛ فقط برای این نشست)<input inputMode="decimal" name="egfr" placeholder="مثلاً 58" /></label>
          </div>
          <fieldset>
            <legend>عوامل تصمیم‌گیری گزارش‌شده توسط پزشک</legend>
            <div className="check-grid">
              {safetyFactors.map(([key, label]) => (
                <label className="checkbox" key={key}><input checked={selectedFactors.includes(key)} onChange={() => toggleFactor(key)} type="checkbox" /> {label}</label>
              ))}
            </div>
          </fieldset>
          <button type="submit">آماده‌سازی جمع‌بندی برای پروتکل</button>
        </form>
      </section>

      {submitted && (
        <section className="panel result-panel" aria-live="polite">
          <p className="eyebrow">وضعیت خروجی</p>
          <h2>پروتکل بالینی هنوز در وضعیت پیش‌نویس است</h2>
          <p>این نشست برای مسیر «{workflowText[workflow].title}» آماده شد. پیش از نمایش هر پیشنهاد درمانی یا نسخهٔ قابل چاپ، پزشک مسئول باید پروتکل نسخه‌دار را تأیید و منتشر کند.</p>
          {selectedLabels.length > 0 && <p className="muted">عوامل ثبت‌شده برای مرور پزشک: {selectedLabels.join("، ")}</p>}
          <ul>
            <li>هیچ دادهٔ بیمار ذخیره یا ارسال نشده است.</li>
            <li>نام‌های ژنریک، انسولین‌ها و FRCها در کاتالوگ قابل بازبینی هستند.</li>
            <li>انتخاب برند فقط پس از تأیید ادمین سازمان و بدون تغییر منطق پروتکل انجام می‌شود.</li>
          </ul>
          <Link className="admin-link" href="/admin">مشاهدهٔ کاتالوگ و وضعیت پروتکل‌ها</Link>
        </section>
      )}
    </main>
  );
}
