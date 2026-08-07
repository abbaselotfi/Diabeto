# GLYMIZE Clinical Platform v2

## هدف

GLYMIZE از یک decision-support دیابت تک‌دامنه‌ای به یک سامانهٔ چندلایهٔ cardio-kidney-metabolic تبدیل می‌شود. اصل طراحی این است که **هویت دارو، شواهد بالینی، وضعیت بازار ایران، بیمه/قیمت، دوز و اطلاعات بیمار از هم جدا بمانند** و فقط در Recommendation Engine به‌صورت قابل ردگیری ترکیب شوند.

## 1. پنج لایهٔ دارویی

### Clinical Knowledge Registry
منبع اولیه می‌تواند فایل `WorldDrug` باشد. فیلدهایی مانند Therapeutic Area، Drug Class، Primary Indication، Guideline Role، ASCVD/HF/Kidney benefit، Weight effect، MASLD/MASH role، renal/hepatic notes، safety و guideline source در این لایه نگهداری می‌شوند.

این لایه **وضعیت بازار ایران یا دوز اجرایی را تعیین نمی‌کند**.

### Master Drug Registry
هر مادهٔ فعال، ترکیب ثابت و formulation بالینی یک identity پایدار می‌گیرد. FDC دو یا سه‌جزئی یک entity واقعی است و نباید در UI در کارت جداگانهٔ «چندجزئی‌ها» نمایش داده شود.

### Iran Market Registry
NFI منبع اصلی product identity بازار ایران است: IRC/GTIN، فرم، قدرت، بسته، برند، سازنده، وضعیت و تاریخ پروانه و قیمت رسمی. دادهٔ سه بیمه به همان product/generic identity متصل می‌شود.

### Dose & Titration Knowledge Base
دوز باید از Market Identity و Clinical Knowledge جدا باشد. هر Rule نسخه، indication، formulation، starting/target/max dose، titration interval، renal/hepatic/weight adjustment، hold/stop criteria، monitoring و source provenance دارد. Ruleهای draft قابل اجرا نیستند.

### Recommendation Engine
Patient Context + Current Regimen + Clinical Knowledge + Approved Dose Rules + Iran Market + Insurance/Cost را ترکیب می‌کند و خروجی شامل `why`, `why not`, dose plan, titration, monitoring و هزینهٔ تقریبی بیمار می‌شود.

## 2. Clinical Effect Matrix به‌جای Domain checkbox ساده

یک دارو می‌تواند در چند محور نقش متفاوت داشته باشد. برای نمونه، «renal dose convenience» با «kidney outcome benefit» یک مفهوم نیست. بنابراین هر Drug می‌تواند Effectهای مستقلی در این محورها داشته باشد:

- glycemic control
- ASCVD
- heart failure
- CKD
- weight
- MASLD/MASH
- hypertension
- lipids
- hypoglycemia
- retinopathy
- neuropathy
- diabetic foot

هر Effect شامل direction، evidence strength، phenotype، practical note و guideline provenance است.

## 3. اطلاعات فعلی بیمار و درمان فعلی

Current medications یک ورودی ضروری موتور است. بدون آن، موتور نمی‌تواند initiation را از optimization/intensification تشخیص دهد، duplicate therapy را بفهمد، دوز فعلی را تیتراسیون کند یا switch منطقی پیشنهاد دهد.

برای هر داروی فعلی باید در صورت دسترس ثبت شود:

- generic/product identity
- brand/form/strength در صورت اهمیت
- dose و unit
- frequency و timing
- total daily dose برای insulin
- duration
- adherence
- tolerance
- active/held/stopped status

قاعدهٔ UI: اگر داروی فعال وجود داشته باشد، workflow به‌طور خودکار **intensification/optimization** است؛ گزینهٔ دستی «شروع/تشدید» لازم نیست.

خروجی برای داروی فعلی ابتدا `review_current_therapy` است؛ پس از فعال شدن Dose Engine می‌تواند به `titrate`, `continue`, `deintensify` یا `switch` تبدیل شود. برای داروی جدید خروجی `consider_addition` یا `consider_initiation` است.

## 4. Progressive disclosure برای عوامل تصمیم‌گیری

صفحهٔ اصلی خلوت باقی می‌ماند. هر عامل یک checkbox/card است و فقط پس از انتخاب، داده‌های لازم همان Domain با animation باز می‌شود.

### ASCVD
- prior MI
- stroke/TIA
- PAD
- revascularization

### Heart failure
- LVEF
- HF phenotype
- NYHA
- blood pressure
- potassium/eGFR در صورت نیاز

### Kidney
- eGFR
- UACR
- potassium
- dialysis
- transplant
- recent AKI

### Liver / MASLD / MASH
- AST
- ALT
- platelets
- auto-calculated FIB-4
- liver stiffness when available
- fibrosis stage
- cirrhosis/decompensation

### Weight/metabolic
- weight
- height
- BMI calculated automatically
- optional waist circumference

داده‌ای که برای یک تصمیم لازم نیست نباید به‌صورت پیش‌فرض از پزشک درخواست شود.

## 5. Recommendation card و Drug Detail Drawer

کارت اصلی باید کوتاه باشد:

- drug/FDC name
- rank
- clinical reasons
- major cautions
- recommended dose/titration summary when approved
- cost band
- insurance summary

کلیک روی کارت یک Drawer در دسکتاپ یا Bottom Sheet در موبایل باز می‌کند:

1. Clinical
2. Dose & Titration
3. Iran Market
4. Price & Insurance
5. Codes & License
6. Evidence

جزئیات می‌تواند IRC/GTIN، generic code در هر بیمه، brand code، manufacturer، license status/date، dosage forms/strengths، price، insurance share و source dates را نشان دهد.

## 6. Cost Engine

قیمت بسته به‌تنهایی قابل مقایسه نیست. Cost Engine باید با regimen/dose، units per pack و frequency هزینهٔ تقریبی 30 روزه را بسازد و سپس patient out-of-pocket را با پوشش بیمه تخمین بزند.

Cost band پیشنهادی:

- low
- reasonable
- high
- very_high

Band بهتر است نسبی به گزینه‌های clinically eligible و در کنار عدد واقعی هزینه باشد تا با تغییر قیمت‌ها و تورم بی‌معنی نشود.

## 7. FDCهای دو و سه‌جزئی

FDCها دقیقاً مثل هر داروی دیگر یک Recommendation Card دارند؛ Badge مانند `2-in-1` یا `3-in-1` کافی است. کارت جداگانهٔ «درمان چندجزئی» حذف می‌شود.

FDC bonus فقط وقتی اعمال می‌شود که:

- همهٔ components برای بیمار مناسب باشند؛
- dose/formulation موجود با نیاز بیمار سازگار باشد؛
- نیاز به titration مستقل اجزا مزیت FDC را خنثی نکند.

## 8. Insulin Converter integration

Repository `abbaselotfi/Insulin-Converter` دارای clinical engine مستقل و تست‌شده برای basal، premix، prandial و FRC است. قواعد شامل direction-specific conversion، 20% reduction در مسیرهای مشخص، premix basal fraction، rapid/Regular interchange و Soliqua/Suliqua pen selection است.

ادغام پیشنهادی:

- کد محاسباتی به TypeScript و package `@glymize/clinical-engine` منتقل شود؛
- Product/strength identities از Master Registry گرفته شود و hard-code brand list به مرور حذف شود؛
- تست‌های `therapy-expansion` به regression suite GLYMIZE منتقل شوند؛
- از Dashboard یک ابزار مستقل **Insulin conversion** در دسترس باشد؛
- اگر Current Regimen بیمار insulin/premix/FRC داشته باشد، همان ابزار contextually داخل Type 1/Type 2 با دادهٔ prefilled باز شود؛
- conversion result به Dose/Titration layer متصل شود، نه اینکه یک calculator جدا و disconnected باقی بماند.

بنابراین محل مناسب فقط یک tile کنار Type 1/Type 2 نیست؛ ابزار هم global است و هم داخل workflow بیمار قابل فراخوانی است.

## 9. پنل آیندهٔ Assistant / Nurse

این قابلیت بعد از تثبیت موتور v2 پیاده می‌شود چون برنامه را از anonymous decision support به سامانهٔ دارای patient-linked clinical data تبدیل می‌کند.

مدل پیشنهادی:

- Clinic/Organization tenant
- Physician account
- Assistant/Nurse account با permission محدود
- PatientCase با internal code الزامی و نام اختیاری
- EncounterPreparation برای labs, vitals, current medications و history
- physician assignment
- immutable audit trail
- timestamps و source/user attribution برای هر entry

Workflow:

1. Assistant/Nurse بیمار را با کد داخلی یا نام ثبت/پیدا می‌کند.
2. labs, vitals, medication list و اطلاعات پایه را قبل از ویزیت وارد می‌کند.
3. پزشک patient code/name را جستجو می‌کند و یک pre-visit summary می‌بیند.
4. پزشک داده را review/confirm می‌کند؛ Recommendation Engine فقط با دادهٔ تاییدشده یا واضحاً labelled به‌عنوان unverified اجرا می‌شود.

### Lab scan / camera / OCR

پنل Assistant/Nurse باید بتواند علاوه بر ورود دستی، برگهٔ آزمایش را با دوربین موبایل اسکن کند یا عکس/PDF آزمایش را بارگذاری کند. مسیر پیشنهادی:

1. capture/upload تصویر یا PDF؛
2. document preprocessing شامل crop، deskew، rotation و quality check؛
3. OCR متن خام؛
4. استخراج ساختاریافتهٔ نام آزمایش، مقدار، واحد، reference range و تاریخ؛
5. نگاشت synonymها به کد داخلی استاندارد آزمایش؛
6. unit normalization بدون از بین بردن مقدار/واحد اصلی؛
7. confidence score در سطح هر فیلد؛
8. صفحهٔ Review که مقدار OCR کنار تصویر اصلی نمایش داده می‌شود؛
9. تایید/اصلاح توسط Assistant/Nurse و در صورت استفادهٔ بالینی، تایید پزشک؛
10. فقط دادهٔ تاییدشده وارد Recommendation Engine شود.

OCR یک ابزار ورود داده است، نه منبع حقیقت بالینی. مقدار با confidence پایین، واحد نامشخص، reference range غیرمعمول یا conflict با دادهٔ قبلی باید flag شود و هیچ‌گاه silently وارد محاسبات دوز یا Recommendation نشود.

برای موبایل PWA می‌توان از camera capture مستقیم استفاده کرد. در نسخهٔ کامل بهتر است multi-page lab، PDF، barcode/QR در صورت وجود، تشخیص نام آزمایشگاه و تاریخ نمونه‌گیری نیز پشتیبانی شود. تصویر اصلی باید با دسترسی محدود و retention policy مشخص نگهداری شود یا پس از استخراج/تایید طبق سیاست مرکز حذف شود.

### Privacy/Security boundary

این مرحله نیازمند RBAC واقعی، encryption in transit/at rest، audit log، session controls، organization isolation، retention policy و backup/restore است. برای کاهش ریسک بهتر است identity (نام/تماس) از clinical case data جدا و patient code شناسهٔ اصلی باشد.

## 10. ترتیب اجرا

### Foundation A — اکنون
- Master Registry contracts
- Clinical Effect Matrix
- structured patient clinical context
- current medication regimen
- workflow inference from current therapy

### Foundation B
- WorldDrug clinical-knowledge importer در Admin
- Master Registry UI و discovered-drug review
- dynamic decision-factor accordions
- drug detail drawer

### Engine C
- Dose & Titration Knowledge Base
- approved dosing rules
- renal/hepatic/weight adjustments
- titrate/add/switch/deintensify actions

### Engine D
- port Insulin-Converter rules/tests
- contextual insulin conversion/titration

### Product E
- monthly cost + out-of-pocket engine
- FDC ranking
- compare/why/why-not UI

### Future F
- assistant/nurse pre-visit panel + patient case persistence
- camera/PDF lab capture + OCR + structured lab review

## Safety invariant

No source majority, market import or UI preference can create a clinical dose rule. Market consensus is valid for product identity and market facts; dose/titration requires an approved clinical evidence rule with provenance and review state.
