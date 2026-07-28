"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import type { Type2DecisionFactor, Type2MedicationConsideration } from "@diabeto/contracts";

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
  ["ascvd", "بیماری قلبی‌عروقی آترواسکلروتیک", "ascvd"],
  ["heartFailure", "نارسایی قلبی", "heart_failure"],
  ["ckd", "بیماری مزمن کلیه", "ckd"],
  ["hypoglycemia", "ریسک بالای هیپوگلیسمی", "hypoglycemia_risk"],
  ["weight", "نیاز به مدیریت وزن", "weight_priority"],
  ["insulin", "نیاز به بررسی مسیر انسولین/FRC", "insulin_pathway"]
] as const;

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export default function Type2Page() {
  const [workflow, setWorkflow] = useState<Workflow>("initiation");
  const [submitted, setSubmitted] = useState(false);
  const [selectedFactors, setSelectedFactors] = useState<string[]>([]);
  const [considerations, setConsiderations] = useState<Type2MedicationConsideration[]>([]);
  const [requestMessage, setRequestMessage] = useState("");
  const selectedLabels = useMemo(
    () => safetyFactors.filter(([key]) => selectedFactors.includes(key)).map(([, label]) => label),
    [selectedFactors]
  );

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const eGfrRaw = String(form.get("egfr") ?? "").trim();
    const eGfr = eGfrRaw ? Number(eGfrRaw) : undefined;
    const factors = safetyFactors
      .filter(([key]) => selectedFactors.includes(key))
      .map(([, , clinicalKey]) => clinicalKey) as Type2DecisionFactor[];
    setSubmitted(true);
    setRequestMessage("در حال آماده‌سازی ملاحظات کلاس‌های دارویی…");
    try {
      const response = await fetch(`${apiUrl}/v1/catalog/type-2/considerations`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ eGfr: Number.isFinite(eGfr) ? eGfr : undefined, factors })
      });
      if (!response.ok) throw new Error("API unavailable");
      setConsiderations(await response.json() as Type2MedicationConsideration[]);
      setRequestMessage("ملاحظات اطلاعاتی بر اساس کاتالوگ فعال و عوامل واردشده آماده شد.");
    } catch {
      setConsiderations([]);
      setRequestMessage("API محلی در دسترس نیست. برنامه را با pnpm dev اجرا و صفحه را refresh کنید.");
    }
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
          <button className={workflow === key ? "selected" : "secondary"} key={key} onClick={() => { setWorkflow(key); setSubmitted(false); setConsiderations([]); }} type="button">
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
          <button type="submit">نمایش ملاحظات کاتالوگ و پروتکل</button>
        </form>
      </section>

      {submitted && (
        <section className="panel result-panel" aria-live="polite">
          <p className="eyebrow">وضعیت خروجی</p>
          <h2>ملاحظات بالینی برای بازبینی پزشک</h2>
          <p>این نشست برای مسیر «{workflowText[workflow].title}» آماده شد. محتوای زیر فقط ملاحظات کلاس دارویی و محدودیت‌هاست؛ پیش از هر پیشنهاد درمانی یا نسخهٔ قابل چاپ، پزشک مسئول باید پروتکل نسخه‌دار را تأیید و منتشر کند.</p>
          {selectedLabels.length > 0 && <p className="muted">عوامل ثبت‌شده برای مرور پزشک: {selectedLabels.join("، ")}</p>}
          <ul>
            <li>هیچ دادهٔ بیمار ذخیره یا ارسال نشده است.</li>
            <li>فقط داروهای فعال‌شده در چک‌لیست Admin در این فهرست ظاهر می‌شوند.</li>
            <li>انتخاب برند فقط پس از تأیید ادمین سازمان و بدون تغییر منطق پروتکل انجام می‌شود.</li>
          </ul>
          <p className="muted">{requestMessage}</p>
          {considerations.length > 0 && <div className="consideration-grid">
            {considerations.map((item) => <article className="consideration-card" key={item.genericMedicationId}>
              <h3>{item.persianName}</h3>
              <p className="muted">{item.therapeuticClass}</p>
              <ul>{item.considerations.map((note) => <li key={note}>{note}</li>)}</ul>
              {item.cautions.length > 0 && <div className="caution"><strong>احتیاط‌ها</strong><ul>{item.cautions.map((note) => <li key={note}>{note}</li>)}</ul></div>}
              {item.blockedBy && <div className="blocked"><strong>نیازمند بازبینی پیش از پیشنهاد</strong><ul>{item.blockedBy.map((note) => <li key={note}>{note}</li>)}</ul></div>}
              <a href={item.sourceUrl} rel="noreferrer" target="_blank">{item.sourceReference}</a>
            </article>)}
          </div>}
          {requestMessage.startsWith("ملاحظات") && considerations.length === 0 && <p className="caution">در چک‌لیست Admin هنوز هیچ فرآوردهٔ متناظر با مسیر Type 2 فعال نشده است.</p>}
          <Link className="admin-link" href="/admin">مدیریت چک‌لیست و پروتکل‌ها</Link>
        </section>
      )}
    </main>
  );
}
