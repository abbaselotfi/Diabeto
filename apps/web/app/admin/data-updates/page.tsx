"use client";

import type { DrugDataUpdateRun, NormalizedDrugImportBundle } from "@glymize/contracts";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { apiFetch, beginCatalogPublishBatch, endCatalogPublishBatch } from "../../../lib/api-client";

const defaultRunnerUrl = "http://127.0.0.1:8765";

interface ImportPreview {
  valid: boolean;
  errors: string[];
  recordCount: number;
  ambiguous: number;
  canApply: boolean;
  ambiguousRecords: Array<{
    recordIndex: number;
    genericName: string;
    brandName?: string;
    candidates: Array<{ referencePresentationId: string; label: string }>;
  }>;
}

interface RunnerJob {
  id: string;
  status: "queued" | "running" | "succeeded" | "failed";
  message?: string;
  bundle?: NormalizedDrugImportBundle;
}

const sourceLabels = {
  iran_fda_nfi: "سازمان غذا و دارو (NFI)",
  health_insurance: "بیمه سلامت",
  armed_forces: "بیمه نیروهای مسلح",
  social_security: "بیمه تأمین اجتماعی"
} as const;

export default function DrugDataUpdatesPage() {
  const [runnerUrl, setRunnerUrl] = useState(defaultRunnerUrl);
  const [runnerConnected, setRunnerConnected] = useState(false);
  const [runnerJob, setRunnerJob] = useState<RunnerJob | null>(null);
  const [bundle, setBundle] = useState<NormalizedDrugImportBundle | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [runs, setRuns] = useState<DrugDataUpdateRun[]>([]);
  const [message, setMessage] = useState("ابتدا استخراج‌گر محلی را اجرا یا فایل استاندارد JSON را انتخاب کنید.");

  const refreshRuns = useCallback(async () => {
    const response = await apiFetch("/v1/admin/catalog/update-runs");
    if (response.ok) setRuns(await response.json() as DrugDataUpdateRun[]);
  }, []);

  useEffect(() => { void refreshRuns(); }, [refreshRuns]);

  async function checkRunner() {
    try {
      const response = await fetch(`${runnerUrl.replace(/\/$/, "")}/health`, { cache: "no-store" });
      if (!response.ok) throw new Error("runner unavailable");
      setRunnerConnected(true);
      setMessage("استخراج‌گر محلی متصل است و درخواست‌ها از همین کامپیوتر داخل ایران اجرا می‌شوند.");
    } catch {
      setRunnerConnected(false);
      setMessage("استخراج‌گر محلی پیدا نشد. Runner را روی کامپیوتر ادمین اجرا یا فایل خروجی را دستی انتخاب کنید.");
    }
  }

  async function pollRunnerJob(jobId: string) {
    for (let attempt = 0; attempt < 180; attempt += 1) {
      await new Promise((resolve) => window.setTimeout(resolve, 2_000));
      const response = await fetch(`${runnerUrl.replace(/\/$/, "")}/jobs/${encodeURIComponent(jobId)}`, { cache: "no-store" });
      if (!response.ok) throw new Error("runner job unavailable");
      const job = await response.json() as RunnerJob;
      setRunnerJob(job);
      setMessage(job.message ?? "استخراج در حال اجرا است…");
      if (job.status === "failed") throw new Error(job.message ?? "extraction failed");
      if (job.status === "succeeded" && job.bundle) {
        await prepareBundle(job.bundle);
        return;
      }
    }
    throw new Error("runner timeout");
  }

  async function startRunner() {
    try {
      setMessage("درخواست استخراج برای چهار منبع ارسال شد…");
      const response = await fetch(`${runnerUrl.replace(/\/$/, "")}/run`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ schemaVersion: 1 })
      });
      if (!response.ok) throw new Error("runner rejected request");
      const job = await response.json() as RunnerJob;
      setRunnerJob(job);
      await pollRunnerJob(job.id);
    } catch (error) {
      setMessage("استخراج کامل نشد؛ نسخهٔ سالم قبلی بدون تغییر فعال ماند. جزئیات Runner یا فایل‌های منبع را بررسی کنید.");
      await apiFetch("/v1/admin/notifications", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          severity: "error",
          title: "استخراج منابع دارویی کامل نشد",
          message: error instanceof Error ? error.message : "Runner یا یکی از منابع رسمی پاسخ معتبر نداد.",
          actionHref: "/admin/data-updates",
          actionLabel: "بررسی مرکز به‌روزرسانی"
        })
      }).catch(() => undefined);
    }
  }

  async function prepareBundle(nextBundle: NormalizedDrugImportBundle) {
    setBundle(nextBundle);
    const response = await apiFetch("/v1/admin/catalog/normalized-imports/preview", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(nextBundle)
    });
    const nextPreview = await response.json() as ImportPreview;
    setPreview(nextPreview);
    setMessage(nextPreview.canApply
      ? "کنترل اولیه کامل شد؛ ادمین می‌تواند نسخه را تأیید و منتشر کند."
      : "بسته قابل انتشار نیست؛ نسخهٔ سالم قبلی فعال می‌ماند تا خطاها اصلاح شوند.");
  }

  async function readBundleFile(file: File) {
    try {
      const parsed = JSON.parse(await file.text()) as NormalizedDrugImportBundle;
      await prepareBundle(parsed);
    } catch {
      setBundle(null);
      setPreview({ valid: false, errors: ["فایل JSON خوانده نشد یا ساختار معتبری ندارد."], recordCount: 0, ambiguous: 0, canApply: false, ambiguousRecords: [] });
      setMessage("فایل استاندارد معتبر نیست.");
    }
  }

  function selectImportCandidate(recordIndex: number, referencePresentationId: string) {
    if (!bundle) return;
    setBundle({
      ...bundle,
      records: bundle.records.map((record, index) => index === recordIndex
        ? { ...record, referencePresentationId: referencePresentationId || undefined }
        : record)
    });
    setMessage("تطبیق دستی در پیش‌نویس ثبت شد؛ برای کنترل مجدد دکمه بازبینی را بزنید.");
  }

  async function applyBundle() {
    if (!bundle || !preview?.canApply) return;
    beginCatalogPublishBatch();
    try {
      const response = await apiFetch("/v1/admin/catalog/normalized-imports/apply", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(bundle)
      });
      const result = await response.json() as { applied: boolean; errors: string[]; matched: number; ambiguous: number };
      if (!response.ok || !result.applied) throw new Error(result.errors.join("؛ "));
      setMessage(`${result.matched} رکورد تأیید شد؛ کاتالوگ جدید در صف انتشار مرکزی قرار گرفت.`);
      setPreview(null);
      setBundle(null);
      await refreshRuns();
    } catch {
      setMessage("انتشار انجام نشد؛ نسخهٔ سالم قبلی همچنان فعال است و اعلان بازبینی ایجاد شد.");
    } finally {
      endCatalogPublishBatch();
    }
  }

  return (
    <main className="shell admin-shell">
      <Link className="back-button" href="/admin">→ بازگشت به پنل مدیریت</Link>
      <header className="page-heading">
        <div><span className="eyebrow">Iran drug data pipeline</span><h1>استخراج و به‌روزرسانی اطلاعات دارویی</h1><p>دریافت منابع روی کامپیوتر ادمین داخل ایران انجام می‌شود؛ تا تکمیل هر چهار منبع و رفع تطبیق‌های مبهم، نسخهٔ فعال تغییر نمی‌کند.</p></div>
        <span className={`version-badge${runnerConnected ? " connected" : ""}`}>{runnerConnected ? "Runner متصل" : "Runner قطع"}</span>
      </header>

      <section className="panel runner-panel">
        <span className="eyebrow">Local runner</span><h2>اتصال به استخراج‌گر کامپیوتر ادمین</h2>
        <div className="runner-controls"><label>نشانی Runner<input dir="ltr" onChange={(event) => setRunnerUrl(event.target.value)} value={runnerUrl} /></label><button className="secondary" onClick={() => void checkRunner()} type="button">بررسی اتصال</button><button disabled={!runnerConnected || runnerJob?.status === "running"} onClick={() => void startRunner()} type="button">استخراج از چهار منبع</button></div>
        <p className="muted">دامنه یا Cloudflare جای IP ایران را نمی‌گیرد؛ این سرویس فقط روی `127.0.0.1` اجرا می‌شود و هیچ پورت عمومی باز نمی‌کند.</p>
      </section>

      <section className="panel">
        <span className="eyebrow">Fallback import</span><h2>ورود دستی خروجی استاندارد Runner</h2>
        <label className="file-picker"><span>انتخاب فایل `glymize-drug-bundle.json`</span><input accept=".json,application/json" onChange={(event) => { const file = event.target.files?.[0]; if (file) void readBundleFile(file); }} type="file" /></label>
      </section>

      {preview && <section className={preview.canApply ? "import-preview" : "import-preview has-errors"} id="ambiguous-matches">
        <div className="import-summary"><span><b>{preview.recordCount}</b> رکورد</span><span><b>{preview.ambiguous}</b> تطبیق مبهم</span><span><b>{preview.errors.length}</b> خطای مسدودکننده</span></div>
        {bundle && <div className="source-run-grid">{bundle.run.sources.map((source) => <article className={`source-run source-${source.status}`} key={source.sourceId}><strong>{sourceLabels[source.sourceId]}</strong><span>{source.status === "succeeded" ? "کامل" : source.status === "failed" ? "خطا" : "در حال بررسی"}</span><small>{source.rowCount !== undefined ? `${source.rowCount} ردیف` : source.error ?? "—"}</small></article>)}</div>}
        {preview.errors.length > 0 && <div className="import-errors"><strong>علت توقف انتشار</strong><ul>{preview.errors.map((error) => <li key={error}>{error}</li>)}</ul></div>}
        {preview.ambiguous > 0 && <div className="import-warning"><strong>تطبیق مبهم</strong><p>رکوردهای مبهم باید با کد NFI یا شناسهٔ فرآورده به یک محصول یکتا متصل شوند؛ انتشار ناقص مجاز نیست.</p></div>}
        {preview.ambiguousRecords.length > 0 && <div className="ambiguous-record-list">{preview.ambiguousRecords.slice(0, 100).map((record) => <label key={record.recordIndex}><span>{record.genericName}{record.brandName ? ` / ${record.brandName}` : ""}</span><select defaultValue={bundle?.records[record.recordIndex]?.referencePresentationId ?? ""} onChange={(event) => selectImportCandidate(record.recordIndex, event.target.value)}><option value="">انتخاب ارائهٔ صحیح…</option>{record.candidates.map((candidate) => <option key={candidate.referencePresentationId} value={candidate.referencePresentationId}>{candidate.label}</option>)}</select>{record.candidates.length === 0 && <small>نام در فهرست مجاز/کاتالوگ پیدا نشد؛ فایل تطبیق باید اصلاح شود.</small>}</label>)}</div>}
        {preview.ambiguousRecords.length > 0 && bundle && <button className="secondary" onClick={() => void prepareBundle(bundle)} type="button">بازبینی دوباره تطبیق‌ها</button>}
        <button disabled={!preview.canApply} onClick={() => void applyBundle()} type="button">تأیید ادمین و انتشار نسخه جدید</button>
      </section>}

      <p className="form-message" role="status">{message}</p>

      <section className="panel">
        <span className="eyebrow">Run history</span><h2>تاریخچه اجراها</h2>
        <div className="update-run-list">{runs.length ? runs.map((run) => <article key={run.id}><div><strong>{new Date(run.startedAt).toLocaleString("fa-IR")}</strong><span className={`badge status-${run.status}`}>{run.status}</span></div><small>{run.summary.genericCount} ژنریک · {run.summary.brandCount} برند · {run.summary.errorCount} خطا · {run.summary.ambiguousMatchCount} مبهم</small></article>) : <p className="muted">هنوز اجرای ثبت‌شده‌ای وجود ندارد.</p>}</div>
      </section>
    </main>
  );
}
