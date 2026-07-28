import Link from "next/link";

export default function AccessDeniedPage() {
  return (
    <main className="shell">
      <section className="panel access-denied">
        <p className="eyebrow">دسترسی محدود</p>
        <h1>پنل مدیریت فقط برای ادمین تأییدشده است</h1>
        <p className="muted">احراز هویت پزشک، OTP، کد نظام پزشکی و نقش ادمین هنوز به سرویس production متصل نشده‌اند. تا آن زمان، پنل در production به‌صورت پیش‌فرض بسته است.</p>
        <Link className="admin-link" href="/">بازگشت به صفحهٔ اصلی</Link>
      </section>
    </main>
  );
}
