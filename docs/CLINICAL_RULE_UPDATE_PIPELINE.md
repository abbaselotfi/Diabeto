# GLYMIZE Clinical Rule Update Pipeline

## هدف

موتور بالینی باید قابل به‌روزرسانی باشد، اما هیچ محتوای دریافت‌شده از اینترنت نباید مستقیماً وارد مسیر تصمیم بیمار شود. منبع رسمی، Rule اجرایی و نسخه منتشرشده سه لایه جدا هستند.

## زنجیره حاکمیت

`Official source -> fingerprint/change detection -> extraction -> candidate rule pack -> validation -> regression/safety tests -> clinical review -> approved rule pack -> activation -> audit/rollback`

## وضعیت فعلی

- Registry واحد منابع علمی در `packages/clinical-engine/src/guideline-registry.ts` قرار دارد.
- Thresholdها و وزن‌های اجرایی از کد پراکنده خارج و در `packages/clinical-engine/src/rule-pack.ts` نسخه‌بندی شده‌اند.
- فقط Rule Pack با `status=approved`، `approvedAt` و `approvedBy` می‌تواند توسط `activateApprovedClinicalRulePack()` فعال شود.
- Admin API هنگام Check، URL رسمی منبع را واقعاً Fetch می‌کند و SHA-256/ETag/Last-Modified را برای تشخیص تغییر ثبت می‌کند.
- تشخیص تغییر هرگز Rule فعال را خودکار عوض نمی‌کند.
- هر Recommendation مسیر و هر کارت دارویی `sourceReference` دارد و منبع علمی موثر باید در خروجی پزشک قابل مشاهده باشد.

## Rule Pack

هر Rule Pack شامل این موارد است:

- schema version
- pack id/version/status/effective date
- approvedAt/approvedBy
- snapshot نسخه منابع علمی
- پارامترهای اجرایی Type 2 مثل آستانه‌ها و وزن‌ها
- Rule definitions با `sourceIds` و `engineEffect`

این ساختار اجازه می‌دهد نسخه بعدی گایدلاین به جای ویرایش مستقیم الگوریتم، یک Candidate Rule Pack تولید کند.

## اصول ایمنی

1. **No internet-to-patient path**: Fetch یا OCR/LLM extraction به تنهایی حق فعال‌سازی Rule ندارد.
2. **Source provenance required**: Rule بدون source id معتبر Reject می‌شود.
3. **Approved-only execution**: Draft/In-review قابل اجرا نیست.
4. **Regression required**: سناریوهای مرزی (eGFR، HbA1c، HF/ASCVD، fibrosis، hypoglycemia و ...) باید قبل از انتشار پاس شوند.
5. **Contradiction review**: تعارض بین ADA/KDIGO/ESC/EASL/IWGDF یا برچسب رگولاتوری باید به Clinical Review برود؛ سیستم نباید با رأی اکثریت خودکار حل کند.
6. **Dose rules separate**: تغییر Rule انتخاب درمان، مجوز تغییر دوز/تیتراسیون نیست. Dose rules همچنان provenance و approval مستقل دارند.
7. **Rollback**: هر نسخه منتشرشده باید قابل بازگشت به نسخه قبلی باشد.

## مرحله بعدی Update Automation

برای هر ناشر یک Source Adapter اختصاصی لازم است:

- ADA adapter
- EASD/ADA-EASD adapter
- KDIGO adapter
- ESC adapter
- EASL adapter
- IWGDF adapter
- EMA adapter

Adapter باید نسخه، تاریخ، لینک سند اصلی و hash را از منبع رسمی استخراج کند. پس از تشخیص نسخه جدید، سیستم تغییرات clinically relevant را جدا و Candidate Ruleها را تولید می‌کند. Candidateها باید همراه section/page/DOI یا URL دقیق ذخیره شوند.

## منابع نوع 2 فعلی

- ADA Standards of Care in Diabetes—2026
- ADA/EASD consensus report
- KDIGO CKD 2024
- KDIGO Diabetes in CKD 2022
- EASL–EASD–EASO MASLD 2024
- ESC CVD and Diabetes 2023
- IWGDF/IDSA Infection 2023
- IWGDF Wound Healing 2023
- EMA Rezdiffra/resmetirom regulatory source

IWGDF در موتور فعلی یک **parallel foot pathway** ایجاد می‌کند و به شکل مصنوعی امتیاز داروی کاهنده قند را بالا/پایین نمی‌برد.
