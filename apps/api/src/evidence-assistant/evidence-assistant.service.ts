import { Injectable } from "@nestjs/common";
import {
  activeGuidelineSources,
  getActiveClinicalRulePack,
} from "@glymize/clinical-engine";

type Locale = "fa" | "en";
type AssistantMode = "extractive_offline" | "local_llm" | "remote_llm";

type AssistantCitation = {
  sourceId: string;
  shortCode: string;
  title: string;
  activeVersion: string;
  sourceUrl: string;
  sourceKind: "guideline" | "consensus" | "regulatory";
};

type AssistantEvidence = {
  ruleId: string;
  domain: string;
  score: number;
  textFa: string;
  textEn: string;
  engineEffect: string;
  citations: AssistantCitation[];
};

const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "of", "to", "in", "for", "with", "is", "are", "be", "on", "by", "from",
  "treatment", "therapy", "patient", "clinical", "recommendation", "program", "about", "what", "which",
  "در", "از", "به", "با", "برای", "و", "یا", "که", "این", "آن", "است", "هست", "را", "یک",
  "درمان", "بیمار", "بالینی", "توصیه", "برنامه", "درباره", "چه", "کدام",
]);

const ALIASES: Record<string, string[]> = {
  ckd: ["kidney", "renal", "egfr", "uacr", "کلیه", "کلیوی"],
  kidney: ["ckd", "renal", "egfr", "uacr", "کلیه", "کلیوی"],
  renal: ["ckd", "kidney", "egfr", "کلیه", "کلیوی"],
  قلب: ["ascvd", "cardiovascular", "heart", "hf", "cvd"],
  قلبی: ["ascvd", "cardiovascular", "heart", "hf", "cvd"],
  hf: ["heart", "failure", "نارسایی", "قلبی"],
  ascvd: ["cardiovascular", "cvd", "mi", "stroke", "قلبی", "عروقی"],
  mash: ["masld", "liver", "fibrosis", "کبد", "فیبروز"],
  masld: ["mash", "liver", "fibrosis", "کبد", "فیبروز"],
  کبد: ["liver", "masld", "mash", "fibrosis"],
  زخم: ["foot", "wound", "iwgdf", "infection", "پای", "عفونت"],
  foot: ["wound", "infection", "iwgdf", "زخم", "پای"],
  wound: ["foot", "infection", "iwgdf", "زخم", "پای"],
  metformin: ["متفورمین", "egfr", "ckd", "kidney"],
  متفورمین: ["metformin", "egfr", "ckd", "کلیه"],
  sglt2: ["ckd", "heart", "failure", "cardiorenal", "کلیه", "قلب"],
  glp1: ["glp", "weight", "ascvd", "وزن", "قلبی"],
  insulin: ["انسولین", "hyperglycemia", "catabolism", "هایپرگلیسمی"],
  انسولین: ["insulin", "hyperglycemia", "catabolism", "هایپرگلیسمی"],
  resmetirom: ["mash", "fibrosis", "f2", "f3", "rezdiffra"],
};

function normalize(value: string) {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/ي/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/[^\p{L}\p{N}.+-]+/gu, " ")
    .trim();
}

function tokenize(value: string) {
  const base = normalize(value).split(/\s+/).filter((token) => token.length > 1 && !STOPWORDS.has(token));
  const expanded = new Set(base);
  for (const token of base) for (const alias of ALIASES[token] ?? []) expanded.add(alias);
  return [...expanded];
}

function detectLocale(question: string, requested?: Locale): Locale {
  if (requested) return requested;
  return /[\u0600-\u06ff]/.test(question) ? "fa" : "en";
}

function evidenceFor(question: string): AssistantEvidence[] {
  const pack = getActiveClinicalRulePack();
  const queryTokens = tokenize(question);

  return pack.rules
    .map((rule) => {
      const sources = activeGuidelineSources.filter((source) => rule.sourceIds.includes(source.id));
      const text = normalize([
        rule.domain,
        rule.descriptionFa,
        rule.descriptionEn,
        rule.engineEffect,
        ...sources.flatMap((source) => [source.shortCode, source.title, source.engineRoleFa, source.engineRoleEn, ...source.engineDomains]),
      ].join(" "));
      const haystack = new Set(tokenize(text));
      let score = 0;
      for (const token of queryTokens) {
        if (haystack.has(token)) score += 3;
        else if (token.length >= 4 && text.includes(token)) score += 1;
      }
      return {
        ruleId: rule.id,
        domain: rule.domain,
        score,
        textFa: rule.descriptionFa,
        textEn: rule.descriptionEn,
        engineEffect: rule.engineEffect,
        citations: sources.map((source) => ({
          sourceId: source.id,
          shortCode: source.shortCode,
          title: source.title,
          activeVersion: source.activeVersion,
          sourceUrl: source.sourceUrl,
          sourceKind: source.sourceKind,
        })),
      } satisfies AssistantEvidence;
    })
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score || left.ruleId.localeCompare(right.ruleId))
    .slice(0, 6);
}

function uniqueCitations(evidence: AssistantEvidence[]) {
  const seen = new Set<string>();
  return evidence.flatMap((item) => item.citations).filter((citation) => {
    if (seen.has(citation.sourceId)) return false;
    seen.add(citation.sourceId);
    return true;
  });
}

@Injectable()
export class EvidenceAssistantService {
  status() {
    const baseUrl = process.env.GLYMIZE_EVIDENCE_LLM_BASE_URL?.trim();
    return {
      available: true,
      generationBackend: baseUrl ? "openai_compatible" : "extractive_offline",
      configuredModel: process.env.GLYMIZE_EVIDENCE_LLM_MODEL ?? null,
      activeRulePackVersion: getActiveClinicalRulePack().version,
      engineInfluence: "none" as const,
      note: "Evidence Assistant is read-only and cannot change clinical-engine inputs, scores, or rule activation.",
    };
  }

  async ask(input: { question?: string; locale?: Locale }) {
    const question = input.question?.trim() ?? "";
    const locale = detectLocale(question, input.locale);
    if (!question) {
      return {
        question,
        locale,
        mode: "extractive_offline" as AssistantMode,
        answer: locale === "fa" ? "سؤال بالینی را وارد کنید." : "Enter a clinical question.",
        citations: [],
        evidence: [],
        sufficientEvidence: false,
        engineInfluence: "none" as const,
        rulePackVersion: getActiveClinicalRulePack().version,
      };
    }

    const evidence = evidenceFor(question);
    const sufficientEvidence = Boolean(evidence[0] && evidence[0].score >= 3);
    const citations = uniqueCitations(evidence);
    const baseUrl = process.env.GLYMIZE_EVIDENCE_LLM_BASE_URL?.trim().replace(/\/$/, "");

    if (baseUrl && sufficientEvidence) {
      try {
        const generated = await this.generateWithCompatibleEndpoint({ question, locale, evidence, baseUrl });
        return {
          question,
          locale,
          mode: baseUrl.includes("localhost") || baseUrl.includes("127.0.0.1") ? "local_llm" as const : "remote_llm" as const,
          answer: generated,
          citations,
          evidence,
          sufficientEvidence,
          engineInfluence: "none" as const,
          rulePackVersion: getActiveClinicalRulePack().version,
        };
      } catch {
        // A model failure must never remove access to the evidence itself.
      }
    }

    return {
      question,
      locale,
      mode: "extractive_offline" as const,
      answer: this.extractiveAnswer(locale, evidence, sufficientEvidence),
      citations,
      evidence,
      sufficientEvidence,
      engineInfluence: "none" as const,
      rulePackVersion: getActiveClinicalRulePack().version,
    };
  }

  private extractiveAnswer(locale: Locale, evidence: AssistantEvidence[], sufficient: boolean) {
    if (!sufficient) {
      return locale === "fa"
        ? "در مجموعه شواهد تاییدشده و فعال GLYMIZE اطلاعات کافی برای پاسخ قابل اتکا پیدا نشد. پاسخ حدسی تولید نمی‌شود؛ سؤال را دقیق‌تر کنید یا منبع مربوط را برای بازبینی علمی اضافه کنید."
        : "The approved active GLYMIZE evidence set does not contain enough support for a reliable answer. No speculative answer is generated; refine the question or add the relevant source for clinical review.";
    }
    const lines = evidence.slice(0, 3).map((item) => locale === "fa" ? item.textFa : item.textEn);
    return locale === "fa"
      ? `بر اساس Rule Pack تاییدشده فعلی:\n${lines.map((line) => `• ${line}`).join("\n")}\n\nاین حالت بدون مدل مولد کار می‌کند و فقط شواهد تاییدشده را بازیابی می‌کند.`
      : `Based on the currently approved Rule Pack:\n${lines.map((line) => `• ${line}`).join("\n")}\n\nThis mode uses no generative model and only retrieves approved evidence.`;
  }

  private async generateWithCompatibleEndpoint(input: {
    question: string;
    locale: Locale;
    evidence: AssistantEvidence[];
    baseUrl: string;
  }) {
    const model = process.env.GLYMIZE_EVIDENCE_LLM_MODEL ?? "Qwen3-1.7B";
    const apiKey = process.env.GLYMIZE_EVIDENCE_LLM_API_KEY?.trim();
    const evidenceText = input.evidence.map((item, index) => {
      const refs = item.citations.map((citation) => `${citation.shortCode} — ${citation.activeVersion}`).join("; ");
      return `[E${index + 1}] ${item.textEn}\nPersian: ${item.textFa}\nSources: ${refs}`;
    }).join("\n\n");

    const system = [
      "You are GLYMIZE Evidence Assistant, a read-only evidence-grounded clinical reference assistant for clinicians.",
      "Use ONLY the evidence passages supplied in this request. Never invent a dose, threshold, contraindication, recommendation, citation, guideline section, or patient-specific treatment order.",
      "If the evidence is insufficient, explicitly say that the approved GLYMIZE corpus does not contain enough information.",
      "Do not change or recommend changing GLYMIZE clinical-engine scores or rules.",
      "If the clinician asks in Persian, interpret/normalize the question in English internally, reason only over the supplied evidence, then answer in Persian. If asked in English, answer in English.",
      "Attach evidence markers such as [E1] to every clinical claim. Preserve uncertainty and distinguish guideline, consensus, and regulatory evidence when relevant.",
    ].join(" ");

    const response = await fetch(`${input.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
      },
      signal: AbortSignal.timeout(45_000),
      body: JSON.stringify({
        model,
        temperature: 0.1,
        max_tokens: 700,
        messages: [
          { role: "system", content: system },
          { role: "user", content: `Clinician question: ${input.question}\n\nApproved evidence:\n${evidenceText}` },
        ],
      }),
    });
    if (!response.ok) throw new Error(`LLM endpoint returned ${response.status}`);
    const body = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    const content = body.choices?.[0]?.message?.content?.trim();
    if (!content) throw new Error("LLM endpoint returned an empty answer");
    return content;
  }
}
