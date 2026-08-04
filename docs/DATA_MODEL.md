# مدل دادهٔ مفهومی

## اصول

- شناسه‌های داخلی پایدار (UUID) و مستقل از نام و ترجمه‌اند.
- محتوای بالینی و دادهٔ بازار با نسخه/بازهٔ زمانی نگهداری می‌شوند؛ رکورد منتشرشده درجا ویرایش نمی‌شود.
- زمان سامانه‌ای (`created_at`, `published_at`) از زمان اعتبار در جهان واقعی (`valid_from`, `valid_to`) جداست.
- دادهٔ بیمار از محتوای مرجع جدا و حداقل‌سازی می‌شود.
- همهٔ زمان‌ها UTC و همهٔ واحدهای بالینی صریح و قابل تبدیل‌اند.

## نمودار ارتباطی خلاصه

```text
Guideline 1--* GuidelineVersion 1--* Citation
                         |               |
                         *               *
                    RuleVersion *--1 ClinicalRule
                         |
RuleBundle *--* RuleVersion
    |
    +--* DecisionRecord *--1 PatientSnapshot

GenericDrug 1--* DrugProduct 1--* BrandMarketEntry *--1 Manufacturer
     |               |
     +----------* RuleMedicationReference

Organization 1--* User *--* Role
Organization/User 1--* DisplayPreference
TranslationEntry *--1 ContentKey
User 1--* UsageEvent --> DailyUsageAggregate
AuditEvent --> any versioned aggregate
```

## راهنما و قانون

### Guideline و GuidelineVersion

`Guideline` سازمان و مجموعهٔ پایدار (ADA یا EASD) را مشخص می‌کند. `GuidelineVersion` شامل `edition`, `publication_date`, `retrieved_at`, `source_url`, `document_checksum`, `license_status`, `review_due_at` و `status` است. checksum اثبات می‌کند قانون بر کدام artifact منبع استوار بوده است.

`Citation` نسخهٔ راهنما را با `section`, `page`, `table_or_figure`, `source_excerpt_summary` و locator پایدار به قانون متصل می‌کند. به دلیل حق نشر، متن کامل منبع فقط در صورت مجوز نگهداری می‌شود.

### ClinicalRule و RuleVersion

`ClinicalRule` هویت پایدار و حوزهٔ قانون را نگه می‌دارد. هر `RuleVersion` دارای این فیلدهاست:

| گروه | فیلدهای نمونه |
| --- | --- |
| نسخه | `version`, `status`, `valid_from`, `valid_to`, `supersedes_id` |
| منطق | `input_schema_version`, `condition_json`, `action_json`, `priority` |
| شواهد | `strength`, `certainty`, `rationale`, `citation_ids` |
| ایمنی | `contraindications`, `missing_data_behavior`, `conflict_group` |
| حاکمیت | `author_id`, `reviewer_id`, `approved_at`, `change_reason` |

متن نمایشی در منطق ذخیره نمی‌شود؛ action کد معنایی و پارامتر می‌دهد و `ContentKey` آن را به ترجمه متصل می‌کند. `RuleTestCase` ورودی ساختگی، خروجی مورد انتظار، نسخهٔ schema و نتیجهٔ آخرین اجرا را نگه می‌دارد.

### RuleBundle

`RuleBundle` یک manifest تغییرناپذیر از شناسهٔ دقیق RuleVersionها، نسخهٔ ترجمه، نسخهٔ کاتالوگ، checksum، وضعیت، محیط و زمان فعال‌سازی است. جدول `BundleActivation` تاریخچهٔ اشاره‌گر فعال هر محیط/سازمان را ثبت می‌کند تا فعال‌سازی و rollback اتمی باشد.

## دارو و بازار ایران

### موجودیت‌ها

- `GenericDrug`: ماده یا ترکیب مؤثره، کد مرجع در صورت وجود، کلاس و نام استاندارد؛
- `DrugProduct`: ژنریک، شکل دارویی، route، قدرت ساخت‌یافته و واحد؛
- `Brand`: هویت پایدار نام تجاری با نام‌های فارسی/انگلیسی؛
- `BrandMarketEntry`: اتصال برند به محصول، تولیدکننده، کشور/بازار (`IR`)، بسته‌بندی، شناسهٔ منبع، وضعیت، `valid_from/to` و `verified_at`؛
- `Manufacturer`: نام حقوقی/نمایشی و شناسهٔ معتبر در صورت وجود؛
- `MedicationCatalogVersion`: snapshot منتشرشده با checksum و provenance؛
- `RuleMedicationReference`: ارجاع RuleVersion به GenericDrug/DrugProduct، نه صرفاً رشتهٔ نام برند.

نام‌ها با جدول `LocalizedName(entity_type, entity_id, locale, name, normalized_name, is_preferred)` بومی‌سازی می‌شوند. نام فارسی و انگلیسی برای جست‌وجو normalize می‌شوند، اما مقدار اصلی حفظ می‌شود.

### قواعد تمامیت دارو

1. هر BrandMarketEntry دقیقاً به یک DrugProduct و یک منبع provenance متصل است.
2. بازه‌های فعال متناقض برای همان برند/محصول/بازار مجاز نیست.
3. حذف ژنریکِ مورد استفاده در قانون یا تصمیم تاریخی ممنوع است؛ فقط retire می‌شود.
4. وضعیت `unknown` از `unavailable` متمایز است و ادعای عرضه بدون تاریخ را مجاز نمی‌کند.
5. برند فقط نمایش و انتخاب محصول را غنی می‌کند و نمی‌تواند معنای قانون ژنریک را تغییر دهد.

## ترجمه و تنظیم نمایش

`ContentKey` کلید معنایی و نوع محتوا را نگه می‌دارد. `TranslationEntry` شامل locale، متن، متغیرهای مجاز، نسخه، وضعیت بازبینی و بازبین است. انتشار متن بالینی می‌تواند وجود هر دو locale را الزام کند.

`DisplayPreference` دارای scope (`system`, `organization`, `user`)، مقدار (`generic-first`, `brand-first`)، زمان اعتبار و actor است. resolve بر اساس خاص‌ترین scope انجام می‌شود. ترجیح مؤثر و نسخهٔ کاتالوگ در نتیجه ثبت می‌شوند؛ ترجیح، ورودی موتور قانون نیست.

## سازمان، هویت و دسترسی

`Organization`, `User`, `Role`, `Permission` و جداول اتصال، RBAC چندسازمانی را می‌سازند. شناسهٔ هویت خارجی جدا از پروفایل است. عضویت، نقش و لغو دسترسی تاریخچه‌دارند. مجوز مشاهدهٔ بیمار با عضویت صرف برابر نیست و باید در لایهٔ سیاست بررسی شود.

## تحلیل کاربران و میزان استفاده

`UsageEvent` رویداد حداقلی و append-only محصول است و شامل `event_id`, `event_type`, `occurred_at`, `organization_id`, شناسهٔ pseudonymous کاربر، `session_id`, نسخهٔ برنامه و metadata محدود و schema-validated می‌شود. `event_type`ها واژگان کنترل‌شده‌ای مانند `session_started`, `assessment_started` و `assessment_completed` دارند. این جدول نباید شناسهٔ بیمار، ورودی یا خروجی بالینی، متن آزاد، نام دارو یا جزئیات DecisionRecord را ذخیره کند.

`UsageMetricDefinition` نام و نسخهٔ شاخص، رویدادهای واجد شرایط، پنجرهٔ زمانی، منطقهٔ زمانی و قاعدهٔ distinct را نگه می‌دارد تا اعداد تاریخی قابل تفسیر باشند. `DailyUsageAggregate` مقادیر روزانه را بر اساس سازمان، نقش مجاز و نسخهٔ تعریف شاخص ذخیره می‌کند. برای نمونه، DAU تعداد کاربران pseudonymous یکتایی است که در روز حداقل یک رویداد واجد شرایط دارند؛ شمار حساب‌های ثبت‌شده مستقیماً از وضعیت تاریخچه‌دار User/Membership محاسبه می‌شود.

ردیف خام بر اساس سیاست مصوب پس از ساخت تجمیع حذف می‌شود و aggregateها نباید امکان بازیابی رفتار یک فرد را بدهند. آستانهٔ حداقل اندازهٔ گروه در query/report اعمال می‌شود. مجوز مشاهده به سازمان scope می‌شود و مشاهده یا export گزارش یک `AuditEvent` جدا ایجاد می‌کند. `last_activity_at` مقدار مشتق‌شده برای مدیریت چرخهٔ حساب است و منبع حقیقت فعالیت تفصیلی محسوب نمی‌شود.

## دادهٔ بیمار و تصمیم

`PatientSnapshot` یک snapshot حداقلی و immutable از داده‌های مؤثر بر محاسبه است؛ در صورت امکان به شناسهٔ pseudonymous پرونده اشاره می‌کند، نه مشخصات مستقیم. داده‌ها به شکل ساخت‌یافته همراه با کد، مقدار، واحد، زمان مشاهده و provenance ذخیره می‌شوند.

`DecisionRecord` شامل موارد زیر است:

- `patient_snapshot_id`, `organization_id`, `requested_by`, `evaluated_at`؛
- `rule_bundle_id`, `catalog_version_id`, `input_schema_version`, `engine_version`؛
- خروجی‌های کدگذاری‌شده، trace قوانین، هشدارها و داده‌های مفقود؛
- locale و DisplayPreference مؤثر؛
- checksum ورودی/خروجی و correlation ID؛
- پاسخ پزشک و دلیل انحراف در رکورد الحاقی جداگانه.

DecisionRecord و snapshot مطابق سیاست نگهداری حفاظت/حذف می‌شوند؛ حذف مجاز باید tombstone ممیزی بدون دادهٔ سلامت باقی بگذارد. دادهٔ واقعی بیمار هرگز برای RuleTestCase استفاده نمی‌شود.

## گردش‌کار و ممیزی

`ReviewRequest`, `ReviewComment`, `Approval` و `Publication` تغییر وضعیت محتوا را ثبت می‌کنند. constraint باید مانع تأیید مستقل‌نما توسط همان نویسنده شود. `AuditEvent` الحاقی شامل actor، action، aggregate ID/version، timestamp، reason، correlation ID و diff ساخت‌یافتهٔ redacted است.

## ایندکس‌ها و قیود پیشنهادی

- unique روی `(clinical_rule_id, version)` و `(content_key_id, locale, version)`؛
- unique جزئی برای یک activation فعال در هر environment/organization؛
- exclusion constraint برای بازه‌های هم‌پوشان BrandMarketEntry مشابه؛
- foreign key محدودکننده برای هر نسخهٔ مورد استفاده در bundle/decision؛
- index روی وضعیت و موعد بازبینی، نام normalize‌شدهٔ دارو، citation و correlation ID؛
- index روی `(organization_id, occurred_at, event_type)` برای رویداد استفاده و unique روی ابعاد هر تجمیع روزانه؛
- optimistic lock (`row_version`) فقط برای draftها.

## داده‌های خارج از دامنهٔ نسخهٔ اول

پروندهٔ کامل الکترونیک سلامت، صورتحساب، نسخه‌نویسی الکترونیک، موجودی لحظه‌ای داروخانه و ingestion خودکار دادهٔ بیمار جزو مدل اولیه نیستند. افزودن آن‌ها نیازمند threat model، رضایت، استاندارد تبادل و ارزیابی مقرراتی مستقل است.
# افزونه داده بازار و بیمه ایران

مدل نسخه‌بندی‌شدهٔ NFI، کدهای مستقل هر بیمه، قیمت تومان، سهم بیمار/سازمان،
اصلاحات دستی و اعلان‌های بازبینی در migration شماره 005 و سند
`IRAN_DRUG_DATA_PIPELINE.md` تعریف شده است. snapshotهای منبع immutable هستند؛
اصلاح ادمین فقط به‌صورت overlay ذخیره می‌شود.
