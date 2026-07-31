# GLYMIZE — Project Overview and Improvement Roadmap

> **Purpose of this document**  
> This file is the shared reference for understanding the current state of GLYMIZE, its architecture, implemented capabilities, known limitations, and the step-by-step improvement plan. It should be updated whenever a major architectural, clinical, product, branding, or deployment decision changes.

**Repository:** `abbaselotfi/GLYMIZE`  
**Document status:** Living document  
**Initial review date:** 2026-07-31  
**Current product maturity:** Advanced prototype / pre-clinical decision-support platform

---

## 1. Product definition

GLYMIZE is intended to become a bilingual Persian/English clinical decision-support platform for diabetes management, with a primary focus on physicians practicing in Iran.

The system is designed to:

- receive a minimum set of anonymous patient information;
- identify an appropriate treatment pathway;
- rank medication options;
- explain why each option is presented;
- show cautions, limitations, and supporting guideline references;
- consider cost, insurance coverage, administration route, and availability in Iran;
- display generic products and approved Iranian brands;
- preserve the physician's responsibility for the final clinical decision.

GLYMIZE must remain a **clinical decision-support tool**, not an autonomous diagnosis or prescribing system.

---

## 2. Current repository architecture

GLYMIZE is a TypeScript monorepo using `pnpm` and Turborepo.

```text
apps/
  web/                 Next.js physician interface and admin panel
  api/                 NestJS/Fastify API
  admin-worker/        Cloudflare Worker for secure admin publishing

packages/
  clinical-engine/     Clinical pathway and medication ranking logic
  contracts/           Shared type-safe contracts

infra/
  postgres/            Initial PostgreSQL and multi-tenant infrastructure plans

docs/                  Product, clinical, governance, and architecture documents
```

### Core technologies

- TypeScript
- Node.js 22+
- pnpm
- Turborepo
- Next.js 16
- React 19
- NestJS 11
- Fastify
- Cloudflare Workers
- GitHub Actions
- GitHub Pages
- PostgreSQL architecture foundation

### Standard local commands

```bash
pnpm install
pnpm build
pnpm test
pnpm typecheck
pnpm dev
```

Expected development endpoints:

- Web: `http://localhost:3000`
- API: `http://localhost:3001`
- Type 2 pathway: `http://localhost:3000/type-2`
- Admin panel: `http://localhost:3000/admin`

---

## 3. Current implemented capabilities

The repository is no longer documentation-only. Important working features already exist.

### Physician-facing application

- Clinical dashboard
- Type 2 diabetes assessment page
- Current HbA1c input
- Individual target HbA1c input
- HbA1c gap calculation
- eGFR input
- Initiation versus intensification workflow selection
- ASCVD, heart failure, CKD, hypoglycemia, weight, and insulin-pathway factors
- Oral-only versus oral-and-injectable preference
- Cost preference
- Insurance-aware medication display
- Medication ranking cards
- Clinical rationale and guideline link display
- PWA installation support

### Medication catalogue

- Generic medication records
- Therapeutic class and therapy-group classification
- Route of administration
- Iranian brand records
- Manufacturer and market metadata foundation
- Generic-first or brand-first display concepts
- Multiple active brand cards per generic medication
- Generic-level and brand-level insurance coverage
- Admin-added generic medications
- Excel import foundation

### Admin panel

- Medication visibility control
- Add, edit, and remove brands
- Brand display instead of generic
- Brand ordering
- Insurance provider and percentage configuration
- Local draft storage
- Central publishing through GitHub
- Direct `/admin` route without public navigation link

### Deployment and publishing

- Static Next.js deployment to GitHub Pages
- GitHub Actions build pipeline
- Typecheck and test execution before deployment
- PWA build version generation
- Service-worker version replacement
- Cloudflare Worker admin API
- GitHub OAuth authentication
- Restricted GitHub administrator account
- Publishing catalogue changes to:

```text
apps/web/public/data/admin-catalog.json
```

---

## 4. Current runtime models

GLYMIZE currently supports two different runtime modes.

### 4.1 Server/API mode

The web application communicates with the NestJS API. The API provides catalogue, guideline, admin, and Type 2 assessment endpoints.

Important endpoint groups include:

```text
GET    /v1/catalog/generics
POST   /v1/catalog/type-2/considerations
GET    /v1/protocols/type-2

GET    /v1/admin/catalog/medication-checklist
PATCH  /v1/admin/catalog/medication-checklist/:id
PATCH  /v1/admin/catalog/medication-checklist/:id/insurance
POST   /v1/admin/catalog/medication-checklist/:id/brands
PATCH  /v1/admin/catalog/medication-checklist/:id/brands/:brandId
DELETE /v1/admin/catalog/medication-checklist/:id/brands/:brandId
POST   /v1/admin/catalog/generics
POST   /v1/admin/catalog/imports
```

### 4.2 Static browser mode

GitHub Pages cannot run NestJS. For the public static deployment:

- medication seeds are bundled with the web app;
- the clinical engine runs in the browser;
- the published catalogue is loaded from JSON;
- local changes are stored in `localStorage`;
- authenticated admin changes are sent to the Cloudflare Worker;
- the Worker commits the catalogue JSON to GitHub;
- GitHub Actions rebuilds the PWA.

This is a practical prototype architecture, but it is not the intended final production architecture for a clinical system.

---

## 5. Current clinical engine behaviour

The clinical engine is isolated from presentation contracts, which is an important architectural strength. Medication presentation and brand selection should not alter the underlying clinical rule result.

### 5.1 Type 2 pathway logic

Current major pathway rules include:

#### Severe hyperglycemia / catabolic pathway

The engine highlights insulin consideration when one or more of the following are present:

- current HbA1c above 10%;
- clear symptoms of hyperglycemia;
- catabolic features.

#### HbA1c gap of at least 1.5 percentage points

The current implementation prioritizes a GLP-1-based or dual GIP/GLP-1 pathway when severe hyperglycemia is absent.

#### HbA1c above target but gap below 1.5

The engine returns either:

- single or stepwise therapy for initiation; or
- combination therapy for intensification.

#### HbA1c at or below target

The engine returns maintenance and monitoring.

### 5.2 Medication ranking

Medications currently start from a base score and gain or lose points based on factors such as:

- insulin pathway alignment;
- basal glargine preference;
- GLP-1 pathway alignment;
- HF and CKD benefit;
- ASCVD benefit;
- weight priority;
- hypoglycemia risk;
- eGFR;
- heart-failure cautions;
- relative cost;
- insurance coverage.

The score is constrained to a 0–100 range and translated into display tiers.

### Important interpretation

The current score is a **hand-authored heuristic ranking model**. It is not yet equivalent to:

- an official guideline strength-of-recommendation score;
- a validated prediction model;
- a clinically validated prescribing algorithm;
- an evidence-grade calculation.

---

## 6. Current data model summary

### Generic medication

Current fields include:

- internal ID
- canonical English name
- Persian name
- ATC code
- class name
- therapy group
- administration route
- catalogue status

### Therapy groups currently present

```text
oral_glucose_lowering
glp_1_receptor_agonist
dual_gip_glp_1_receptor_agonist
human_insulin
basal_insulin_analog
prandial_insulin_analog
premixed_insulin
fixed_ratio_combination
```

### Brand record foundation

- brand name
- Persian brand name
- manufacturer
- Iranian market
- availability
- review state
- source URL and source reference
- observation and verification dates

### Admin display configuration

- show/hide medication
- generic insurance coverage
- one or more brands
- show brand instead of generic
- brand priority
- inherited or custom brand insurance

---

## 7. Strong aspects of the project

The project already has several valuable foundations.

### Product and clinical strengths

- Clear decision-support positioning
- Explicit physician responsibility
- Anonymous-data-first approach
- Attention to Iranian market realities
- Insurance-aware display
- Cost-aware ranking
- Generic and brand separation
- Explanation and source display
- Clinical caution messaging

### Engineering strengths

- Monorepo architecture
- Shared TypeScript contracts
- Separate clinical-engine package
- PWA support
- Automated deployment
- Browser and API execution options
- Secure Worker-based publishing foundation
- Input and catalogue validation
- Version file and service-worker update support

### Governance strengths in documentation

The architecture documents correctly identify the need for:

- immutable rule bundles;
- versioned rules;
- clinical review;
- author/reviewer separation;
- audit records;
- rollback;
- PostgreSQL RLS;
- multi-organization support;
- no health data in product analytics;
- explainability and traceability.

---

## 8. Known inconsistencies and weaknesses

The following issues should be addressed one by one. Their order will be refined as the project progresses.

### 8.1 Incomplete GLYMIZE rebranding

The repository name is GLYMIZE, but old identities remain in the codebase:

- root package name `diabeto`;
- package namespace `@diabeto/*`;
- `DiaYar` strings;
- `diayar-browser-catalog-v2` localStorage key;
- `DiaYar-Admin-Worker` user agent;
- old wording in build, Worker, documentation, UI, and configuration files.

**Required outcome:** one consistent GLYMIZE identity across code, package names, storage keys, environment variables, metadata, UI, PWA, documentation, and deployment.

---

### 8.2 Unclear final product scope

The repository currently behaves as a broad Type 2 medication decision-support platform. Recent product decisions also considered temporarily limiting visible functionality to insulin conversion.

The final scope must explicitly state whether GLYMIZE V1 is:

1. a comprehensive Type 2 medication assistant;
2. an insulin-conversion tool;
3. a modular platform whose first active module is insulin conversion;
4. another clearly defined combination.

**Required outcome:** a single approved V1 product scope, reflected in navigation, routes, clinical engine, documentation, and tests.

---

### 8.3 GLP-1 and weight logic conflict

Current code still includes:

- GLP-1 and dual GIP/GLP-1 therapy groups;
- GLP-1-first logic for HbA1c gap ≥1.5%;
- weight-priority input;
- GLP-1 ranking bonuses;
- GLP-1 text in the interface;
- GLP-1 in triple-therapy content.

This conflicts with the more recent decision to temporarily hide or remove GLP-1 functionality and the weight input.

**Required outcome:** resolve the product decision and remove, hide, or retain these elements consistently across contracts, engine, UI, catalogue, admin, tests, and documentation.

---

### 8.4 Insulin-conversion module is not yet the central implemented workflow

The reviewed repository does not yet contain the complete insulin conversion workflow required by recent decisions, including:

- basal-to-basal conversion;
- mix-to-FRC conversion;
- Soliqua default destination;
- multiple daily injection handling;
- dose aggregation;
- permitted and prohibited category conversions;
- prevention of prandial-to-basal conversion;
- mix-to-FRC availability;
- clear source-based dose adjustment rules.

**Required outcome:** implement a dedicated, tested, traceable insulin conversion module if it remains inside GLYMIZE V1.

---

### 8.5 Heuristic scores are not evidence-grade rules

Current numeric bonuses and penalties are manually selected. Their meaning and evidence basis are not formally defined.

Examples include fixed values such as:

- insulin pathway bonus;
- glargine bonus;
- HF/CKD bonus;
- ASCVD bonus;
- heart-failure penalty;
- eGFR penalty;
- cost and insurance adjustments.

**Risks:**

- false precision;
- unexplained ranking changes;
- inability to defend why one medicine scored above another;
- cost or insurance accidentally overpowering a clinical safety concern;
- display tiers being mistaken for formal recommendation strength.

**Required outcome:** replace or formalize scoring through explicit, versioned, source-linked clinical rules with documented precedence.

---

### 8.6 Hard contraindications are mixed with soft ranking penalties

Some clinically blocking conditions currently reduce a score instead of preventing display or generating a hard block.

Example pattern:

```text
contraindication → negative score
```

Safer pattern:

```text
contraindication → blocked
major caution → explicit warning and lower rank
preference → rank adjustment
cost/insurance → presentation adjustment after safety
```

**Required outcome:** create a clear hierarchy:

1. hard clinical block;
2. urgent review;
3. major caution;
4. clinical preference;
5. patient preference;
6. affordability and insurance;
7. display ordering.

---

### 8.7 Current input set is insufficient for real prescribing support

The current Type 2 assessment does not yet cover all inputs potentially required for safe individualized recommendations.

Examples that may need inclusion or explicit exclusion from scope:

- current medications and doses;
- treatment duration;
- previous treatment failure;
- adverse reactions;
- age and frailty;
- pregnancy;
- history of DKA;
- liver disease;
- pancreatitis history;
- recurrent infection risk;
- volume status;
- UACR;
- BMI or weight status;
- patient preferences;
- actual local availability;
- drug interactions.

**Required outcome:** define a minimum safe input dataset per active clinical pathway.

---

### 8.8 Source traceability is too broad

Many rules currently refer to a general guideline section instead of a precise source location.

Each clinical rule should ideally include:

- guideline publisher;
- guideline version;
- recommendation/table/figure identifier;
- section and page when available;
- exact rule interpretation;
- source URL;
- access date;
- reviewer;
- rule version;
- expected test cases.

**Required outcome:** every active clinical rule becomes individually traceable and reviewable.

---

### 8.9 Browser and API logic may diverge

There are parallel implementations and data paths for:

- NestJS server mode;
- static browser fallback mode.

This can produce different outcomes depending on deployment mode.

**Required outcome:** define one source of truth for clinical logic and catalogue behaviour, with contract tests proving equivalent results across runtimes.

---

### 8.10 Cross-app imports create architectural coupling

The web application imports seed and source files from inside the API application tree.

This weakens boundaries between apps and increases build and maintenance risk.

**Required outcome:** move shared data, seeds, schemas, and rule bundles into dedicated packages.

Suggested direction:

```text
packages/
  clinical-engine/
  clinical-rules/
  medication-catalog/
  contracts/
  shared-config/
```

---

### 8.11 Local drafts can override the published catalogue

The browser prefers an existing local draft over the latest published state. An administrator may therefore see stale local data after a newer central publication.

**Required outcome:** introduce revision-aware draft handling:

- published revision;
- local draft base revision;
- conflict detection;
- restore published version;
- discard local draft;
- explicit save draft and publish actions.

---

### 8.12 Admin changes publish too automatically

Current changes can be scheduled for central publishing shortly after editing.

For clinical content, the expected workflow should be closer to:

```text
Edit → Save Draft → Validate → Review Changes → Approve → Publish
```

**Required outcome:** separate local editing, draft persistence, validation, clinical approval, and publication.

---

### 8.13 Admin security is not production-complete

Current strengths include OAuth, encrypted state/session, allowed-login restriction, CORS validation, payload validation, and path restriction.

Remaining limitations include:

- single-admin model;
- no complete RBAC;
- no author/reviewer separation;
- no independent append-only audit store;
- no organization-level permissions;
- no visible NestJS guards in the reviewed admin controller;
- direct catalogue publication to the main branch;
- limited session revocation model.

**Required outcome:** implement production identity, RBAC, approval separation, audit, and protected API routes before clinical deployment.

---

### 8.14 GitHub JSON publishing will not scale indefinitely

A single JSON file committed for every catalogue update is useful for the prototype, but will become difficult for:

- large Iranian medication datasets;
- frequent pricing changes;
- insurance history;
- review history;
- concurrent editors;
- rollback at record level;
- data validation and querying.

**Required outcome:** keep GitHub publishing for preview if useful, but move the production catalogue to a versioned database-backed service.

---

### 8.15 Triple-therapy display is not a true regimen builder

The current triple-therapy section displays generic examples when the HbA1c gap is large. It does not yet construct a patient-specific, contraindication-aware three-drug regimen.

**Required outcome:** either clearly label it as educational content or implement a validated regimen-composition engine.

---

### 8.16 Recommendation labels may imply excessive certainty

Labels such as “recommended” or “stronger suggestion” can be interpreted as formal guideline strength even though they currently derive from internal scoring.

**Required outcome:** use wording that distinguishes:

- guideline recommendation strength;
- system fit score;
- safety status;
- affordability;
- availability;
- clinician review requirement.

---

### 8.17 Clinical testing is not yet comprehensive enough

The project needs systematic rule-level and pathway-level testing.

Minimum future clinical test groups should include:

- HbA1c threshold boundaries;
- eGFR threshold boundaries;
- urgent hyperglycemia cases;
- contradictory patient preferences and clinical needs;
- HF with TZD;
- CKD with SGLT2;
- hypoglycemia-risk combinations;
- oral-only with insulin-required pathway;
- insured-only with no covered medicine;
- generic and multiple-brand outputs;
- brand-specific insurance;
- mix-to-FRC conversion;
- repeated daily insulin doses;
- deterministic output for the same rule bundle;
- historical rule-bundle replay;
- clinician-approved golden cases.

---

### 8.18 Documentation is ahead of implementation

The documented target architecture includes:

- immutable rule bundles;
- atomic activation;
- rollback;
- DecisionRecord;
- PostgreSQL RLS;
- object storage;
- queue workers;
- multi-organization tenancy;
- audit event store;
- clinical review workflow;
- canary publication.

Most of these are not yet the primary runtime implementation.

**Required outcome:** clearly mark each architectural item as:

- implemented;
- partially implemented;
- planned;
- deferred;
- out of scope.

---

## 9. Proposed step-by-step improvement sequence

The order below is the initial working roadmap. It may be adjusted after each stage.

### Phase 1 — Identity and scope stabilization

- [ ] Complete GLYMIZE rebranding
- [ ] Define the exact V1 product scope
- [ ] Decide the status of GLP-1 and weight functionality
- [ ] Decide whether insulin conversion is the first active module
- [ ] Update README and product-scope documentation
- [ ] Remove contradictory UI and documentation text

### Phase 2 — Clinical logic safety foundation

- [ ] Define rule precedence
- [ ] Separate hard blocks, cautions, preferences, cost, and display
- [ ] Replace unexplained score constants
- [ ] Create traceable rule metadata
- [ ] Define minimum safe inputs per pathway
- [ ] Add source versioning and review fields
- [ ] Add clinical golden cases

### Phase 3 — Insulin conversion module, if confirmed in V1

- [ ] Define supported insulin categories
- [ ] Define prohibited conversions
- [ ] Implement basal conversions
- [ ] Implement mix-to-FRC conversion
- [ ] Keep Soliqua available for basal and mix source regimens
- [ ] Set intended default destination
- [ ] Handle multiple daily injections
- [ ] Aggregate doses safely
- [ ] Add dose reduction and rounding rules
- [ ] Add references and warnings
- [ ] Add complete tests

### Phase 4 — Shared architecture cleanup

- [ ] Move shared seeds out of `apps/api`
- [ ] Create shared catalogue/rule packages
- [ ] Eliminate browser/API behaviour divergence
- [ ] Add contract and equivalence tests
- [ ] Version all schemas
- [ ] Clarify runtime source of truth

### Phase 5 — Admin workflow and catalogue integrity

- [ ] Add explicit Save Draft
- [ ] Add validation screen
- [ ] Add difference review
- [ ] Add author and reviewer roles
- [ ] Add approve and publish steps
- [ ] Add revision conflict handling
- [ ] Add discard/restore controls
- [ ] Add catalogue history
- [ ] Add record-level source and verification metadata

### Phase 6 — Production backend foundation

- [ ] Connect PostgreSQL persistence
- [ ] Implement migrations
- [ ] Implement RLS and tenant boundaries
- [ ] Add identity provider integration
- [ ] Protect admin endpoints
- [ ] Add append-only audit records
- [ ] Add rule-bundle storage
- [ ] Add atomic publication and rollback
- [ ] Add decision record persistence

### Phase 7 — UI and brand redesign

- [ ] Apply the final GLYMIZE design system
- [ ] Add final logo and application icon
- [ ] Redesign welcome/dashboard experience
- [ ] Implement modern geometric English typography
- [ ] Implement compatible Persian typography
- [ ] Review RTL/LTR behaviour
- [ ] Review mirrored button and icon issues
- [ ] Improve clinical hierarchy and whitespace
- [ ] Review accessibility against WCAG 2.2 AA

### Phase 8 — Validation and release readiness

- [ ] Clinical review of each rule
- [ ] Usability testing with physicians
- [ ] Medication-catalogue verification for Iran
- [ ] Insurance data verification
- [ ] Security review and threat model
- [ ] Privacy and legal review
- [ ] Performance and offline testing
- [ ] PWA update reliability testing
- [ ] Incident and rollback procedure
- [ ] Release checklist and clinical disclaimer review

---

## 10. Recommended definition of done for each improvement

An improvement should not be marked complete until all relevant items below are satisfied:

- code implementation completed;
- typecheck passes;
- automated tests added and passing;
- clinical source documented when applicable;
- UI text updated in Persian and English;
- documentation updated;
- migration or backward compatibility considered;
- PWA/static and API runtime behaviour checked;
- security impact reviewed;
- no old brand terminology remains in modified scope;
- final behaviour manually verified.

---

## 11. Immediate next task

The recommended first task is:

> **Complete the GLYMIZE rebranding inventory and replace all obsolete Diabeto/DiaYar identities in a controlled change without breaking package resolution, deployments, local storage migration, or admin publishing.**

This task should include a search-based inventory before edits and should distinguish between:

- user-visible branding;
- package identifiers;
- storage keys;
- environment variables;
- deployment variables;
- OAuth configuration;
- Worker configuration;
- documentation;
- migration compatibility.

Package namespace changes should be handled carefully because changing `@diabeto/*` affects imports, lockfiles, workspace dependencies, GitHub Actions, and deployment scripts.

---

## 12. Change log

### 2026-07-31

- Initial repository-wide overview recorded.
- Current architecture and implemented capabilities summarized.
- Major clinical, engineering, admin, security, product, and branding weaknesses listed.
- Initial phased remediation roadmap created.
