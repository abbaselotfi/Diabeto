"use client";

import type { ClinicalEvidenceSource } from "@glymize/clinical-engine";
import type {
  ClinicalProtocolBundle,
  GenericMedication,
  MasterDrugRegistryEntry,
  MedicationChecklistItem,
  MedicationTherapyGroup,
} from "@glymize/contracts";
import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { apiFetch } from "../../lib/api-client";
import styles from "./admin.module.css";

const groupLabels: Partial<Record<MedicationTherapyGroup, string>> = {
  oral_glucose_lowering: "داروهای خوراکی کاهنده قند",
  glp_1_receptor_agonist: "GLP-1 RA",
  dual_gip_glp_1_receptor_agonist: "Dual GIP/GLP-1",
  human_insulin: "انسولین انسانی",
  basal_insulin_analog: "انسولین بازال",
  prandial_insulin_analog: "انسولین پراندیال",
  premixed_insulin: "انسولین میکس",
  fixed_ratio_combination: "FRC انسولین/GLP-1",
  antihypertensive: "ضدفشارخون",
  raas_blocker: "RAAS blocker",
  mineralocorticoid_receptor_antagonist: "MRA",
  heart_failure_therapy: "درمان نارسایی قلبی",
  lipid_lowering: "کاهنده چربی",
  antiplatelet: "ضدپلاکت",
  anticoagulant: "ضدانعقاد",
  antianginal: "ضدآنژین",
  antiarrhythmic: "ضدآریتمی",
  liver_directed_therapy: "درمان اختصاصی کبد",
  weight_management: "مدیریت وزن",
  vitamin_or_mineral: "ویتامین/مینرال",
  other: "سایر",
};

const sourceKindLabel: Record<ClinicalEvidenceSource["sourceKind"], string> = {
  guideline: "Guideline",
  consensus: "Consensus",
  regulatory: "Regulatory",
};

export default function AdminPage() {
  const [message, setMessage] = useState("در حال دریافت وضعیت سامانه…");
  const [guidelineMessage, setGuidelineMessage] = useState("آخرین بررسی منبع در همین نشست نمایش داده می‌شود.");
  const [generics, setGenerics] = useState<GenericMedication[]>([]);
  const [protocols, setProtocols] = useState<ClinicalProtocolBundle[]>([]);
  const [guidelines, setGuidelines] = useState<ClinicalEvidenceSource[]>([]);
  const [medicationChecklist, setMedicationChecklist] = useState<MedicationChecklistItem[]>([]);
  const [masterRegistry, setMasterRegistry] = useState<MasterDrugRegistryEntry[]>([]);
  const [checkingAll, setCheckingAll] = useState(false);

  async function refresh() {
    try {
      const [genericResponse, protocolResponse, guidelineResponse, checklistResponse, masterRegistryResponse] = await Promise.all([
        apiFetch("/v1/catalog/generics"),
        apiFetch("/v1/protocols/type-2"),
        apiFetch("/v1/admin/guidelines"),
        apiFetch("/v1/admin/catalog/medication-checklist"),
        apiFetch("/v1/admin/catalog/master-registry"),
      ]);
      if (!genericResponse.ok || !protocolResponse.ok || !guidelineResponse.ok || !checklistResponse.ok || !masterRegistryResponse.ok) {
        throw new Error("API unavailable");
      }
      setGenerics(await genericResponse.json() as GenericMedication[]);
      setProtocols(await protocolResponse.json() as ClinicalProtocolBundle[]);
      setGuidelines(await guidelineResponse.json() as ClinicalEvidenceSource[]);
      setMedicationChecklist(await checklistResponse.json() as MedicationChecklistItem[]);
      setMasterRegistry(await masterRegistryResponse.json() as MasterDrugRegistryEntry[]);
      setMessage("اطلاعات WorldDrug، کاتالوگ، پروتکل‌ها و منابع علمی با موفقیت بازخوانی شد.");
    } catch {
      setMessage("داده‌های مدیریت خوانده نشد؛ اتصال API را بررسی و دوباره بازخوانی کنید.");
    }
  }

  useEffect(() => { void refresh(); }, []);

  async function addGeneric(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const response = await apiFetch("/v1/admin/catalog/generics", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        canonicalName: String(form.get("canonicalName") ?? ""),
        persianName: String(form.get("persianName") ?? ""),
        className: String(form.get("className") ?? ""),
        therapyGroup: String(form.get("therapyGroup") ?? "oral_glucose_lowering"),
        administrationRoute: String(form.get("administrationRoute") ?? "oral"),
        sourceUrl: String(form.get("sourceUrl") ?? ""),
        sourceReference: String(form.get("sourceReference") ?? "ورود دستی ادمین"),
      }),
    });
    if (!response.ok) {
      setMessage("ثبت ژنریک ناموفق بود؛ فیلدهای الزامی و منبع را بررسی کنید.");
      return;
    }
    const created = await response.json() as GenericMedication;
    setGenerics((current) => current.some((item) => item.id === created.id) ? current : [...current, created]);
    event.currentTarget.reset();
    setMessage(`ژنریک «${created.persianName}» برای بازبینی اضافه شد.`);
  }

  async function checkGuideline(sourceId: string) {
    try {
      const response = await apiFetch(`/v1/admin/guidelines/${sourceId}/check`, { method: "POST" });
      const result = await response.json() as { message: string };
      if (!response.ok) throw new Error(result.message);
      setGuidelineMessage(result.message);
      await refresh();
    } catch {
      setGuidelineMessage("بررسی منبع انجام نشد؛ اتصال API را بررسی کنید.");
    }
  }

  async function checkAllGuidelines() {
    setCheckingAll(true);
    try {
      const results = await Promise.all(guidelines.map(async (guideline) => {
        const response = await apiFetch(`/v1/admin/guidelines/${guideline.id}/check`, { method: "POST" });
        if (!response.ok) throw new Error(guideline.id);
        return response.json() as Promise<{ message: string }>;
      }));
      setGuidelineMessage(`${results.length} منبع برای بررسی نسخه جدید وارد صف بازبینی شد؛ هیچ Rule بالینی خودکار تغییر نکرد.`);
      await refresh();
    } catch {
      setGuidelineMessage("بررسی همه منابع کامل نشد؛ منابع را به‌صورت جداگانه بررسی کنید.");
    } finally {
      setCheckingAll(false);
    }
  }

  const activeMedicationCount = medicationChecklist.filter((item) => item.showInApp).length;
  const activeEvidenceCount = guidelines.filter((item) => item.engineInfluence).length;

  return (
    <main className={styles.page}>
      <header className={styles.hero}>
        <div className={styles.heroCopy}>
          <span className={styles.eyebrow}>GLYMIZE Administration</span>
          <h1>مرکز مدیریت GLYMIZE</h1>
          <p>
            مدیریت داده دارویی، نمایش فرآورده‌ها و حاکمیت منابع علمی از یک صفحه انجام می‌شود. عملیات تخصصی در صفحات جداگانه قرار گرفته‌اند تا کنترل‌های تکراری و شلوغی حذف شوند.
          </p>
        </div>
        <button className={styles.refreshButton} onClick={() => void refresh()} type="button">↻ بازخوانی وضعیت</button>
      </header>

      <nav className={styles.quickActions} aria-label="دسترسی سریع مدیریت">
        <Link className={styles.quickAction} href="/admin/data-updates">
          <span className={styles.actionIcon}>DB</span>
          <span><strong>داده و بازار ایران</strong><small>استخراج، Import، قیمت، بیمه و اجرای به‌روزرسانی‌ها</small></span>
        </Link>
        <Link className={styles.quickAction} href="/admin/master-registry">
          <span className={styles.actionIcon}>Rx</span>
          <span><strong>Master Registry و داروها</strong><small>WorldDrug، طبقه‌بندی ژنریک‌های جدید و ورود کنترل‌شده به فهرست بازار</small></span>
        </Link>
        <Link className={styles.quickAction} href="/type-2/preview">
          <span className={styles.actionIcon}>T2</span>
          <span><strong>پیش‌نمایش خروجی Type 2</strong><small>کنترل نتیجه بالینی پیش از انتشار تغییرات</small></span>
        </Link>
      </nav>

      <section className={styles.metrics} aria-label="شاخص‌های مدیریت">
        <article className={styles.metric}>
          <span>ژنریک‌های شناخته‌شده</span>
          <strong>{generics.length || "—"}</strong>
          <small>WorldDrug: {masterRegistry.length || "—"} · Seed/Market/Manual یکپارچه</small>
        </article>
        <article className={styles.metric}>
          <span>ردیف‌های دارویی قابل مدیریت</span>
          <strong>{activeMedicationCount || "—"}</strong>
          <small>Clinical Catalog + فرآورده‌های بازار، فعال برای نمایش</small>
        </article>
        <article className={styles.metric}>
          <span>پروتکل‌های Type 2</span>
          <strong>{protocols.length || "—"}</strong>
          <small>نسخه‌های مسیر بالینی موجود</small>
        </article>
        <article className={styles.metric}>
          <span>منابع علمی فعال در موتور</span>
          <strong>{activeEvidenceCount || "—"}</strong>
          <small>Guideline / consensus / regulatory source</small>
        </article>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeading}>
          <div><h2>مدیریت اصلی</h2><p>هر کار فقط در یک محل انجام می‌شود؛ صفحه اصلی Admin خلاصه و مسیر ورود به ابزارهای تخصصی است.</p></div>
        </div>
        <div className={styles.managementGrid}>
          <article className={styles.managementCard}>
            <span className={styles.cardBadge}>Market data</span>
            <h3>استخراج و به‌روزرسانی داده دارویی</h3>
            <p>منابع رسمی ایران، Import staging، خطاها، تطبیق و انتشار نسخه تاییدشده در مرکز Data Updates مدیریت می‌شوند.</p>
            <Link href="/admin/data-updates">رفتن به مرکز به‌روزرسانی <span>←</span></Link>
          </article>
          <article className={styles.managementCard}>
            <span className={styles.cardBadge}>Catalog</span>
            <h3>انتخاب دارو و برندهای قابل نمایش</h3>
            <p>نمایش در برنامه، برندهای منتخب، اولویت، قیمت، بیمه و اطلاعات بازار فقط در صفحه Medication Management ویرایش می‌شوند.</p>
            <Link href="/admin/medications">مدیریت داروها <span>←</span></Link>
          </article>
          <article className={styles.managementCard}>
            <span className={styles.cardBadge}>Clinical governance</span>
            <h3>منابع علمی و Ruleهای بالینی</h3>
            <p>منبع جدید ابتدا پایش و بازبینی می‌شود. هیچ Update اینترنتی اجازه ندارد مستقیماً Rule موتور یا دوز را تغییر دهد.</p>
            <a href="#clinical-evidence">مشاهده منابع فعال <span>↓</span></a>
          </article>
        </div>
      </section>

      <section className={styles.section} id="clinical-evidence">
        <div className={styles.sectionHeading}>
          <div>
            <h2>منابع علمی فعال در موتور</h2>
            <p>این فهرست همان منبعی است که Dashboard پزشک نیز نمایش می‌دهد؛ بنابراین نامی که اینجا دیده می‌شود باید Rule یا مسیر مشخصی در موتور داشته باشد.</p>
          </div>
          <button className={styles.sectionAction} disabled={checkingAll || !guidelines.length} onClick={() => void checkAllGuidelines()} type="button">
            {checkingAll ? "در حال بررسی…" : "بررسی نسخه جدید همه منابع"}
          </button>
        </div>

        <div className={styles.evidencePanel}>
          <div className={styles.evidenceNotice}>
            <span aria-hidden="true">✓</span>
            <span><b>قاعده حاکمیت:</b> بررسی Update فقط یک مورد بازبینی ایجاد می‌کند. اعمال نسخه جدید نیازمند بازبینی بالینی، تست و Rule version جدید است.</span>
          </div>
          <div className={styles.evidenceGrid}>
            {guidelines.map((source) => (
              <article className={styles.evidenceCard} key={source.id}>
                <div className={styles.evidenceTop}>
                  <span className={styles.evidenceCode}>{source.shortCode}</span>
                  <span className={styles.sourceKind}>{sourceKindLabel[source.sourceKind]}</span>
                </div>
                <h3>{source.title}</h3>
                <p>{source.engineRoleFa}</p>
                <p className={styles.evidenceVersion}>نسخه فعال: {source.activeVersion}</p>
                <div className={styles.evidenceActions}>
                  <a href={source.sourceUrl} rel="noreferrer" target="_blank">منبع رسمی</a>
                  <button onClick={() => void checkGuideline(source.id)} type="button">بررسی Update</button>
                </div>
              </article>
            ))}
          </div>
          <div className={styles.statusBar}>{guidelineMessage}</div>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeading}>
          <div><h2>وضعیت پروتکل‌های Type 2</h2><p>پروتکل فعال باید منبع مشخص، وضعیت بازبینی و مرز ایمنی قابل ردیابی داشته باشد.</p></div>
        </div>
        <div className={styles.protocolGrid}>
          {protocols.map((protocol) => (
            <article className={styles.protocolCard} key={protocol.id}>
              <strong>{protocol.title}</strong>
              <small>{protocol.sourceReference}</small>
              <span className={styles.protocolStatus}>{protocol.status === "approved" ? "تاییدشده" : protocol.status}</span>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <details className={styles.advanced}>
          <summary>ابزار پیشرفته: افزودن دستی ژنریک با منبع</summary>
          <div className={styles.advancedBody}>
            <p>ورود دستی مسیر اصلی به‌روزرسانی نیست و فقط برای موارد استثنایی استفاده می‌شود. ثبت این فرم به معنی تایید بازار یا تایید بالینی نیست.</p>
            <form onSubmit={addGeneric}>
              <div className={styles.formGrid}>
                <label>نام انگلیسی<input name="canonicalName" required /></label>
                <label>نام فارسی<input name="persianName" required /></label>
                <label>کلاس دارویی<input name="className" required /></label>
                <label>دسته
                  <input defaultValue="oral_glucose_lowering" list="therapy-groups" name="therapyGroup" required />
                </label>
                <label>راه مصرف
                  <select defaultValue="oral" name="administrationRoute">
                    <option value="oral">خوراکی</option>
                    <option value="subcutaneous">زیرجلدی</option>
                    <option value="intravenous">وریدی</option>
                    <option value="other">سایر</option>
                  </select>
                </label>
                <label>مرجع/نشانی<input name="sourceUrl" placeholder="https://…" required type="url" /></label>
              </div>
              <input name="sourceReference" readOnly type="hidden" value="ورود دستی ادمین" />
              <datalist id="therapy-groups">
                {Object.entries(groupLabels).map(([key, label]) => <option key={key} label={label} value={key} />)}
              </datalist>
              <button className={styles.submitButton} type="submit">افزودن برای بازبینی</button>
            </form>
          </div>
        </details>
      </section>

      <div className={styles.statusBar}>{message}</div>
    </main>
  );
}
