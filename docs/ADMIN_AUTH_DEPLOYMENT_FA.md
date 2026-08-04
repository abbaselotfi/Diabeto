# راه‌اندازی احراز هویت مدیریت GLYMIZE

صفحات عمومی GLYMIZE بدون ورود کار می‌کنند. فقط مسیر `/admin` به Cloudflare
Worker متصل می‌شود و Worker فقط حساب GitHub با نام `abbaselotfi` را می‌پذیرد.

## ۱. ساخت GitHub OAuth App

در GitHub به مسیر **Settings → Developer settings → OAuth Apps → New OAuth
App** بروید و این مقادیر را ثبت کنید:

- Application name: `GLYMIZE Admin`
- Homepage URL: `https://abbaselotfi.github.io/GLYMIZE/`
- Authorization callback URL:
  `https://shiny-block-9d4a.abbaselotfi.workers.dev/auth/callback`

مقادیر Client ID و Client Secret را فقط برای ثبت Secretهای Worker استفاده
کنید و آن‌ها را داخل مخزن، فایل `.env` یا چت قرار ندهید.

## ۲. انتشار Cloudflare Worker

پس از checkout شاخهٔ پروژه:

```powershell
pnpm install
pnpm --filter @glymize/admin-worker exec wrangler login
pnpm --filter @glymize/admin-worker exec wrangler secret put GITHUB_CLIENT_ID
pnpm --filter @glymize/admin-worker exec wrangler secret put GITHUB_CLIENT_SECRET
pnpm --filter @glymize/admin-worker exec wrangler secret put SESSION_SECRET
pnpm --filter @glymize/admin-worker deploy
```

برای ساخت مقدار تصادفی `SESSION_SECRET` در PowerShell:

```powershell
$bytes = New-Object byte[] 32
$rng = [Security.Cryptography.RandomNumberGenerator]::Create()
$rng.GetBytes($bytes)
[Convert]::ToBase64String($bytes)
```

## ۳. اتصال GitHub Pages به Worker

نشانی نهایی Worker را به‌صورت Repository Variable ثبت کنید:

```powershell
gh variable set NEXT_PUBLIC_ADMIN_API_URL --repo abbaselotfi/GLYMIZE --body "https://shiny-block-9d4a.abbaselotfi.workers.dev"
gh workflow run "Deploy GLYMIZE to GitHub Pages" --repo abbaselotfi/GLYMIZE --ref main
```

تا وقتی این متغیر ثبت نشده باشد، workflow نسخه‌ای که پنل مدیریت آن backend
ندارد روی Pages منتشر نمی‌کند و نسخهٔ زندهٔ قبلی حفظ می‌شود.

## ۴. بعد از merge

Worker را فقط بعد از ادغام این تغییرات روی `main` دوباره deploy کنید؛ انتشار
کاتالوگ ادمین عمداً فقط روی شاخهٔ `main` انجام می‌شود.
