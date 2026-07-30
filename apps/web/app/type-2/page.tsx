"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import type {
  Type2AssessmentResult,
  Type2DecisionFactor,
  Type2MedicationConsideration,
  Type2Workflow
} from "@diabeto/contracts";

const workflowText: Record<Type2Workflow, { title: string; description: string }> = {
  initiation: {
    title: "شروع درمان",
    description: "انتخاب درمان آغازین با توجه به فاصلهٔ HbA1c از هدف و عوامل قلبی، کلیوی و وزن."
  },
  intensification: {
    title: "تشدید درمان",
    description: "مرور کنترل ناکافی و اولویت‌بندی درمان ترکیبی، GLP-1/GIP یا مسیر انسولین."
  }
};

const decisionFactors = [
  ["ascvd", "بیماری قلبی‌عروقی آترواسکلروتیک", "ascvd"],
  ["heartFailure", "نارسایی قلبی", "heart_failure"],
  ["ckd", "بیماری مزمن کلیه", "ckd"],
  ["hypoglycemia", "ریسک بالای هیپوگلیسمی", "hypoglycemia_risk"],
  ["weight", "کاهش وزن در اولویت است", "weight_priority"],
  ["insulin", "بررسی مسیر انسولین یا FRC", "insulin_pathway"]
] as const;

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

function medicationPriority(item: Type2MedicationConsideration, result: Type2AssessmentResult) {
  const group = item.therapyGroup;
  if (result.recommendation.priority === "consider_insulin") {
    return ["human_insulin", "basal_insulin_analog", "prandial_insulin_analog", "premixed_insulin", "fixed_ratio_combination"].includes(group) ? 0 : 1;
  }
  if (result.recommendation.priority === "glp1_based_therapy") {
    return ["glp_1_receptor_agonist", "dual_gip_glp_1_receptor_agonist", "fixed_ratio_combination"].includes(group) ? 0 : 1;
  }
  return 0;
}

export default function Type2Page() {
  const [workflow, setWorkflow] = useState<Type2Workflow>("initiation");
  const [selectedFactors, setSelectedFactors] = useState<string[]>([]);
  const [result, setResult] = useState<Type2AssessmentResult | null>(null);
  const [requestMessage, setRequestMessage] = useState("");
  const selectedLabels = useMemo(
    () => decisionFactors.filter(([key]) => selectedFactors.includes(key)).map(([, label]) => label),
    [selectedFactors]
  );
  const sortedMedications = useMemo(
    () => result ? [...result.medications].sort((left, right) => medicationPriority(left, result) - medicationPriority(right, result)) : [],
    [result]
  );

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const currentHba1c = Number(form.get("currentHba1c"));
    const targetHba1c = Number(form.get("targetHba1c"));
    const eGfrRaw = String(form.get("egfr") ?? "").trim();
    const eGfr = eGfrRaw ? Number(eGfrRaw) : undefined;
    if (!Number.isFinite(currentHba1c) || !Number.isFinite(targetHba1c) || currentHba1c < 3 || currentHba1c > 20 || targetHba1c < 4 || targetHba1c > 12) {
      setRequestMessage("HbA1c فعلی و هدف را با عدد معتبر وارد کنید.");
      setResult(null);
      return;
    }

    const factors = decisionFactors
      .filter(([key]) => selectedFactors.includes(key))
      .map(([, , clinicalKey]) => clinicalKey) as Type2DecisionFactor[];
    setRequestMessage("در حال اولویت‌بندی مسیر و داروهای فعال…");
    try {
      const response = await fetch(`${apiUrl}/v1/catalog/type-2/considerations`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          currentHba1c,
          targetHba1c,
          workflow,
          eGfr: Number.isFinite(eGfr) ? eGfr : undefined,
          hyperglycemiaSymptoms: form.get("hyperglycemiaSymptoms") === "on",
          catabolicFeatures: form.get("catabolicFeatures") === "on",
          factors
        })
      });
      if (!response.ok) throw new Error("API unavailable");
      setResult(await response.json() as Type2AssessmentResult);
      setRequestMessage("نتیجه بر اساس داده‌های همین نشست و داروهای فعال کاتالوگ آماده شد.");
    } catch {
      setResult(null);
      setRequestMessage("سرویس بالینی در دسترس نیست. API را اجرا و دوباره تلاش کنید.");
    }
  }

  function toggleFactor(key: string) {
    setSelectedFactors((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key]);
  }

  return (
    <main>
      <Link className="back-button" href="/">→ بازگشت به داشبورد</Link>
      <header className="page-heading">
        <div>
          <span className="eyebrow">Type 2 decision support</span>
          <h1>ارزیابی دیابت نوع ۲</h1>
          <p>HbA1c فعلی و هدف فردی را وارد کنید؛ هیچ نام یا شناسه‌ای از بیمار دریافت نمی‌شود.</p>
        </div>
        <span className="version-badge">ADA 2026</span>
      </header>

      <section className="workflow-switch" aria-label="نوع ارزیابی">
        {(Object.keys(workflowText) as Type2Workflow[]).map((key) => (
          <button className={workflow === key ? "selected" : "secondary"} key={key} onClick={() => { setWorkflow(key); setResult(null); }} type="button">
            {workflowText[key].title}
          </button>
        ))}
      </section>

      <div className="assessment-layout">
        <form className="calculator-card" onSubmit={submit}>
          <div className="form-section-title"><span>۱</span><div><strong>{workflowText[workflow].title}</strong><small>{workflowText[workflow].description}</small></div></div>
          <div className="field-grid">
            <label className="field"><span>HbA1c فعلی</span><span className="input-with-unit"><input inputMode="decimal" min="3" max="20" name="currentHba1c" placeholder="8.7" required step="0.1" type="number" /><b>٪</b></span></label>
            <label className="field"><span>HbA1c هدف (Goal)</span><span className="input-with-unit"><input defaultValue="7" inputMode="decimal" min="4" max="12" name="targetHba1c" required step="0.1" type="number" /><b>٪</b></span></label>
            <label className="field"><span>eGFR</span><span className="input-with-unit"><input inputMode="decimal" min="1" max="200" name="egfr" placeholder="58" type="number" /><b>mL/min</b></span></label>
          </div>

          <div className="form-divider" />
          <div className="form-section-title"><span>۲</span><div><strong>عوامل تصمیم‌گیری</strong><small>هر موردی که برای بیمار صدق می‌کند انتخاب شود</small></div></div>
          <div className="check-grid">
            {decisionFactors.map(([key, label]) => (
              <label className="checkbox-card" key={key}><input checked={selectedFactors.includes(key)} onChange={() => toggleFactor(key)} type="checkbox" /><span>{label}</span></label>
            ))}
            <label className="checkbox-card urgent"><input name="hyperglycemiaSymptoms" type="checkbox" /><span>علائم واضح هایپرگلیسمی</span></label>
            <label className="checkbox-card urgent"><input name="catabolicFeatures" type="checkbox" /><span>کاهش وزن ناخواسته یا شواهد کاتابولیسم</span></label>
          </div>
          <p className="form-message" role="status">{requestMessage}</p>
          <button className="primary-button calculate-button" type="submit"><span>نمایش مسیر و داروهای فعال</span><span>←</span></button>
        </form>

        <aside className="result-panel" aria-live="polite">
          {!result ? (
            <div className="empty-result"><div className="result-placeholder">⌁</div><h2>نتیجه اینجا نمایش داده می‌شود</h2><p>اطلاعات HbA1c و عوامل بالینی را تکمیل کنید.</p></div>
          ) : (
            <div className="result-content">
              <span className="result-label">اولویت مسیر</span>
              <h2>{result.recommendation.title}</h2>
              <div className={result.recommendation.urgentReview ? "clinical-warning danger" : "clinical-warning"}>
                <strong>فاصله از هدف: {result.recommendation.hba1cGap.toFixed(1)}٪</strong>
                <ul>{result.recommendation.rationale.map((item) => <li key={item}>{item}</li>)}</ul>
              </div>
              {selectedLabels.length > 0 && <p className="muted">عوامل انتخاب‌شده: {selectedLabels.join("، ")}</p>}
              <a className="source-link" href={result.recommendation.sourceUrl} rel="noreferrer" target="_blank">{result.recommendation.sourceReference}</a>
            </div>
          )}
        </aside>
      </div>

      {result && (
        <section className="medication-results">
          <div className="section-heading">
            <div><h2>داروهای فعال متناسب با انتخاب‌ها</h2><p>موارد اول فهرست با اولویت مسیر فعلی هماهنگ‌ترند؛ انتخاب نهایی و بررسی منع مصرف با پزشک است.</p></div>
            <span className="version-badge">{sortedMedications.length} دارو</span>
          </div>
          {sortedMedications.length > 0 ? <div className="consideration-grid">
            {sortedMedications.map((item) => (
              <article className="consideration-card" key={item.genericMedicationId}>
                <span className="group-chip">{item.therapyGroup.replaceAll("_", " ")}</span>
                <h3>{item.persianName}</h3>
                <p className="muted">{item.therapeuticClass}</p>
                <ul>{item.considerations.map((note) => <li key={note}>{note}</li>)}</ul>
                {item.cautions.length > 0 && <div className="caution"><strong>احتیاط‌ها</strong><ul>{item.cautions.map((note) => <li key={note}>{note}</li>)}</ul></div>}
                {item.blockedBy && <div className="blocked"><strong>اولویت پایین‌تر</strong><ul>{item.blockedBy.map((note) => <li key={note}>{note}</li>)}</ul></div>}
                <a href={item.sourceUrl} rel="noreferrer" target="_blank">مرجع دارو</a>
              </article>
            ))}
          </div> : <div className="empty-catalog"><strong>هنوز دارویی در کاتالوگ فعال نشده است.</strong><p>مدیر پروژه می‌تواند از مسیر مستقیم `/admin` وارد صفحهٔ انتخاب دارو شود.</p></div>}
        </section>
      )}
    </main>
  );
}
