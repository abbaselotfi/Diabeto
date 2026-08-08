"use client";

import { FormEvent, useEffect, useState } from "react";
import { apiFetch } from "../../lib/api-client";
import { useGlymizeLocale } from "../components/use-glymize-locale";
import styles from "./evidence-assistant.module.css";

type Citation = {
  sourceId: string;
  shortCode: string;
  title: string;
  activeVersion: string;
  sourceUrl: string;
  sourceKind: "guideline" | "consensus" | "regulatory";
};

type AssistantResponse = {
  question: string;
  locale: "fa" | "en";
  mode: "extractive_offline" | "local_llm" | "remote_llm";
  answer: string;
  citations: Citation[];
  sufficientEvidence: boolean;
  engineInfluence: "none";
  rulePackVersion: string;
};

type Status = {
  generationBackend: "openai_compatible" | "extractive_offline";
  configuredModel: string | null;
  activeRulePackVersion: string;
  engineInfluence: "none";
};

const COPY = {
  fa: {
    eyebrow: "GLYMIZE EVIDENCE ASSISTANT",
    title: "دستیار علمی پزشک",
    intro: "سؤال بالینی را مطرح کنید. پاسخ فقط از منابع تاییدشده و متصل به GLYMIZE ساخته می‌شود و در انتخاب یا امتیازدهی دارو دخالت مستقیم ندارد.",
    label: "سؤال پزشک",
    placeholder: "مثلاً: در بیمار دیابت نوع ۲ همراه CKD، چه ملاحظاتی درباره SGLT2 و متفورمین وجود دارد؟",
    ask: "پاسخ بر اساس شواهد",
    asking: "در حال بازیابی شواهد…",
    answer: "پاسخ",
    sources: "منابع استفاده‌شده در این پاسخ",
    noAnswer: "پس از طرح سؤال، پاسخ و منابع مرتبط اینجا نمایش داده می‌شوند.",
    safety: "مرز ایمنی دستیار علمی",
    safetyText: "این دستیار فقط برای جستجو، توضیح و جمع‌بندی شواهد است. هیچ پاسخ AI نمی‌تواند Rule Pack فعال، رتبه دارو، ورودی بیمار یا تصمیم موتور بالینی را تغییر دهد. اگر شواهد تاییدشده کافی نباشد، سیستم باید صریحاً اعلام کند که پاسخ قابل اتکا ندارد.",
    failed: "دستیار علمی در دسترس نبود. موتور بالینی مستقل از این بخش به کار خود ادامه می‌دهد.",
    rulePack: "Rule Pack",
    mode: "حالت",
    model: "مدل",
    offline: "جستجوی شواهد بدون مدل مولد",
    local: "AI محلی",
    remote: "AI آنلاین",
  },
  en: {
    eyebrow: "GLYMIZE EVIDENCE ASSISTANT",
    title: "Clinician Evidence Assistant",
    intro: "Ask a clinical question. Answers are grounded only in approved GLYMIZE evidence and cannot directly alter drug selection or ranking.",
    label: "Clinician question",
    placeholder: "For example: What are the key SGLT2 and metformin considerations in type 2 diabetes with CKD?",
    ask: "Answer from approved evidence",
    asking: "Retrieving approved evidence…",
    answer: "Answer",
    sources: "Sources used for this answer",
    noAnswer: "Ask a question to see a grounded answer and its evidence sources here.",
    safety: "Evidence Assistant safety boundary",
    safetyText: "This assistant is limited to evidence search, explanation, and summarization. AI output cannot alter the active Rule Pack, medication ranking, patient inputs, or clinical-engine decisions. If approved evidence is insufficient, the system must say so explicitly.",
    failed: "The Evidence Assistant is unavailable. The clinical engine remains independent and continues to function.",
    rulePack: "Rule Pack",
    mode: "Mode",
    model: "Model",
    offline: "Evidence search without a generative model",
    local: "Local AI",
    remote: "Online AI",
  },
} as const;

const EXAMPLES = {
  fa: [
    "در CKD چه تاثیری بر انتخاب SGLT2 و متفورمین داریم؟",
    "در بیمار دارای ASCVD کدام کلاس‌ها اولویت بیشتری دارند؟",
    "اگر بیمار زخم پای دیابتی داشته باشد چه مسیر جداگانه‌ای باید فعال شود؟",
    "Resmetirom در چه مرحله‌ای از فیبروز قابل بررسی است؟",
  ],
  en: [
    "How does CKD affect SGLT2 and metformin considerations?",
    "Which drug classes receive priority in established ASCVD?",
    "What parallel pathway is needed for a diabetes-related foot ulcer?",
    "At what fibrosis stage can resmetirom be considered?",
  ],
} as const;

function modeLabel(mode: AssistantResponse["mode"] | undefined, locale: "fa" | "en") {
  if (mode === "local_llm") return COPY[locale].local;
  if (mode === "remote_llm") return COPY[locale].remote;
  return COPY[locale].offline;
}

export default function EvidenceAssistantPage() {
  const { locale, isRtl } = useGlymizeLocale();
  const copy = COPY[locale];
  const [question, setQuestion] = useState("");
  const [response, setResponse] = useState<AssistantResponse | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    void apiFetch("/v1/evidence-assistant/status")
      .then((result) => result.ok ? result.json() as Promise<Status> : null)
      .then((next) => setStatus(next))
      .catch(() => setStatus(null));
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!question.trim()) return;
    setLoading(true);
    setError("");
    try {
      const result = await apiFetch("/v1/evidence-assistant/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: question.trim(), locale }),
      });
      if (!result.ok) throw new Error("assistant_failed");
      setResponse(await result.json() as AssistantResponse);
    } catch {
      setResponse(null);
      setError(copy.failed);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className={styles.page} dir={isRtl ? "rtl" : "ltr"} lang={locale}>
      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <span className={styles.eyebrow}>{copy.eyebrow}</span>
          <h1>{copy.title}</h1>
          <p>{copy.intro}</p>
        </div>
        <span className={styles.modeBadge}>{modeLabel(response?.mode, locale)}</span>
      </section>

      <section className={styles.safetyCard}>
        <h2>{copy.safety}</h2>
        <p>{copy.safetyText}</p>
      </section>

      <form className={styles.askCard} onSubmit={submit}>
        <label>
          <span>{copy.label}</span>
          <textarea
            dir="auto"
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder={copy.placeholder}
          />
        </label>
        <div className={styles.examples}>
          {EXAMPLES[locale].map((item) => (
            <button className={styles.exampleButton} key={item} onClick={() => setQuestion(item)} type="button">
              {item}
            </button>
          ))}
        </div>
        <div className={styles.actions}>
          <button className={styles.askButton} disabled={loading || !question.trim()} type="submit">
            {loading ? copy.asking : copy.ask}
          </button>
          <span className={styles.statusText}>
            {copy.rulePack}: {response?.rulePackVersion ?? status?.activeRulePackVersion ?? "—"}
            {status?.configuredModel ? ` · ${copy.model}: ${status.configuredModel}` : ""}
          </span>
        </div>
        {error && <div className={styles.error} role="alert">{error}</div>}
      </form>

      <section className={styles.answerCard} aria-live="polite">
        <h2>{copy.answer}</h2>
        {response ? (
          <>
            <div className={styles.answerText}>{response.answer}</div>
            <div className={styles.answerMeta}>
              <span>{copy.mode}: {modeLabel(response.mode, locale)}</span>
              <span>{copy.rulePack}: {response.rulePackVersion}</span>
            </div>
          </>
        ) : <div className={styles.empty}>{copy.noAnswer}</div>}
      </section>

      {response && response.citations.length > 0 && (
        <section className={styles.sources}>
          <h2>{copy.sources}</h2>
          <div className={styles.sourceGrid}>
            {response.citations.map((source) => (
              <a className={styles.sourceCard} href={source.sourceUrl} key={source.sourceId} rel="noreferrer" target="_blank">
                <div className={styles.sourceTop}>
                  <strong>{source.shortCode}</strong>
                  <span className={styles.sourceKind}>{source.sourceKind}</span>
                </div>
                <p>{source.title}</p>
                <p>{source.activeVersion}</p>
              </a>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
