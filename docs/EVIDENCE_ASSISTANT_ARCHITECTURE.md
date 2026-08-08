# GLYMIZE Evidence Assistant Architecture

## Purpose

The Evidence Assistant is a clinician-facing, read-only question-answering layer over the approved clinical evidence corpus. It is deliberately separated from the deterministic Clinical Recommendation Engine.

It may:
- search approved guideline / consensus / regulatory evidence;
- explain a recommendation already produced by the engine;
- summarize retrieved evidence;
- translate a Persian clinician question for retrieval and return the final answer in Persian;
- cite the exact evidence sources used in the answer.

It must never:
- directly change a patient input;
- directly change medication scores, tiers, contraindications or thresholds;
- activate a new Clinical Rule Pack;
- infer a new dose/titration rule from an unreviewed document;
- answer from model memory when the approved GLYMIZE corpus does not support the claim.

## Runtime modes

### 1. Extractive offline mode — zero cost, always available

No generative model is required. The assistant searches the approved GLYMIZE evidence index and returns the most relevant reviewed evidence statements plus their sources.

This is the minimum safe offline behavior and the fallback whenever an LLM is unavailable or fails.

### 2. Local LLM mode — zero API cost

The API can connect to any local OpenAI-compatible endpoint through:

- `GLYMIZE_EVIDENCE_LLM_BASE_URL`
- `GLYMIZE_EVIDENCE_LLM_MODEL`
- optional `GLYMIZE_EVIDENCE_LLM_API_KEY`

Recommended initial desktop backend: `llama.cpp` with an Apache-2.0 Qwen multilingual model. The LLM is used only to translate, synthesize and format retrieved evidence. Retrieval and citations remain controlled by GLYMIZE.

Example local endpoint shape:

`http://127.0.0.1:8080/v1`

### 3. Browser-local WebGPU mode — planned

A future PWA provider can use a quantized multilingual model through Transformers.js or WebLLM/WebGPU. Model assets must be explicitly downloaded and cached before offline use.

Because browser/mobile memory and WebGPU support vary, browser-local generation is optional. Failure to load a model must fall back to extractive offline mode rather than disable the assistant.

### 4. Remote/community endpoint — future

The same provider contract can later point to an OpenAI-compatible community-funded or institutional endpoint. The answer remains grounded in the same retrieved evidence and cannot modify the engine.

## Retrieval corpus

The current first executable corpus is the approved Clinical Rule Pack plus the shared evidence registry. This is intentionally conservative.

The next corpus version should add `ApprovedEvidenceChunk` records generated from reviewed source documents:

- chunk id
- source id
- source version
- source type: guideline / consensus / regulatory / scientific paper
- document title
- section / recommendation / table identifier
- page when stable
- English normalized text
- optional reviewed Persian translation
- checksum
- review status
- reviewer
- reviewed at
- effective / retired dates

Only `approved` chunks enter production retrieval.

Full copyrighted guideline documents must not be blindly redistributed inside the PWA. The ingestion process must respect source access and redistribution terms. Where bundling the full document is not appropriate, GLYMIZE should store reviewed evidence excerpts/structured evidence statements and a locator to the official source.

## Persian / English pipeline

Preferred behavior when an LLM is available:

1. detect Persian clinician input;
2. normalize/translate the query to English internally;
3. perform multilingual/hybrid retrieval against the approved corpus;
4. provide only retrieved evidence to the LLM;
5. generate the answer in English internally if helpful;
6. return a Persian answer for a Persian question;
7. attach source markers to each clinical claim.

When no LLM is available, multilingual retrieval should search Persian and English evidence aliases directly and return extractive evidence without pretending that translation/generation occurred.

## Recommended model strategy

### Generator / translator

Primary free local model family: Qwen3.

- Qwen3-1.7B: practical first local model for modest hardware; explicit multilingual support includes Persian.
- Qwen3-4B: preferred when hardware permits because synthesis quality is more important than raw speed for clinician Q&A.
- very small browser models may be used only as translators/formatters over retrieved evidence, not as an independent medical knowledge source.

### Retrieval embedding

Browser / low-resource first choice: `multilingual-e5-small` because it supports multilingual retrieval with a substantially smaller footprint than large embedding models.

Higher-resource local/server option: `Qwen3-Embedding-0.6B` or BGE-M3, with hybrid lexical+dense retrieval and optional reranking.

Document embeddings should be precomputed during evidence publication so the runtime device only needs to embed the clinician query.

## Relationship to the Clinical Rule Update Pipeline

Guideline monitoring and the Evidence Assistant should share a single evidence-governance flow:

`official source -> snapshot/checksum -> extraction -> candidate evidence chunks -> clinical review -> approved evidence corpus`

A guideline update may also produce a Candidate Rule Pack, but evidence publication and executable rule publication remain separately reviewable.

`official source -> candidate rules -> validation/regression/safety tests -> clinical approval -> approved Rule Pack`

The Evidence Assistant can explain both the active evidence and the active Rule Pack, but it cannot approve or activate either one.

## Controlled influence on future clinical workflow

The assistant should not influence medication ranking directly.

A safe optional future interaction is a clinician-confirmed context suggestion. Example:

> “Your question mentions CKD. Would you like to open the CKD clinical factor?”

Only an explicit clinician action may populate/activate the factor. The AI itself never changes engine state.

## Auditability

Every generated answer should retain:
- question language;
- assistant mode;
- model/provider identifier when used;
- Rule Pack version;
- evidence corpus revision;
- retrieved chunk/rule ids;
- cited source ids and versions;
- timestamp;
- no-engine-influence marker.

This makes the assistant explainable without turning probabilistic generation into the source of truth.
