"use client";

import type { AdminNotification } from "@glymize/contracts";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "../../../lib/api-client";

const severityLabels: Record<AdminNotification["severity"], string> = {
  error: "خطا",
  warning: "نیازمند بازبینی",
  info: "اطلاع"
};

export default function AdminNotificationsPage() {
  const [items, setItems] = useState<AdminNotification[]>([]);
  const [message, setMessage] = useState("در حال دریافت اعلان‌ها…");

  const refresh = useCallback(async () => {
    const response = await apiFetch("/v1/admin/notifications");
    if (!response.ok) throw new Error("unavailable");
    const data = await response.json() as AdminNotification[];
    setItems(data);
    setMessage(data.length ? `${data.filter((item) => item.status !== "resolved").length} مورد باز وجود دارد.` : "اعلانی ثبت نشده است.");
  }, []);

  useEffect(() => { void refresh().catch(() => setMessage("اعلان‌ها در دسترس نیستند.")); }, [refresh]);

  const grouped = useMemo(() => ({
    open: items.filter((item) => item.status !== "resolved"),
    resolved: items.filter((item) => item.status === "resolved")
  }), [items]);

  async function setStatus(item: AdminNotification, status: AdminNotification["status"]) {
    const response = await apiFetch(`/v1/admin/notifications/${item.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status })
    });
    if (!response.ok) {
      setMessage("وضعیت اعلان ذخیره نشد.");
      return;
    }
    await refresh();
  }

  function notificationCard(item: AdminNotification) {
    return (
      <article className={`admin-notification-card severity-${item.severity}`} key={item.id}>
        <div>
          <span>{severityLabels[item.severity]}</span>
          <time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString("fa-IR")}</time>
        </div>
        <h2>{item.title}</h2>
        <p>{item.message}</p>
        <footer>
          {item.actionHref && <Link href={item.actionHref}>{item.actionLabel ?? "بررسی"}</Link>}
          {item.status === "unread" && <button className="secondary" onClick={() => void setStatus(item, "read")} type="button">خوانده شد</button>}
          {item.status !== "resolved" && <button onClick={() => void setStatus(item, "resolved")} type="button">رفع شد</button>}
        </footer>
      </article>
    );
  }

  return (
    <main className="shell admin-shell">
      <Link className="back-button" href="/admin">→ بازگشت به پنل مدیریت</Link>
      <header className="page-heading">
        <div><span className="eyebrow">Update & review center</span><h1>اعلان‌های مدیریت</h1><p>خطاهای استخراج، تطبیق‌های مبهم و اصلاحات دستی نیازمند بازبینی در این صفحه جمع می‌شوند.</p></div>
        <span className="version-badge">{grouped.open.length} باز</span>
      </header>
      <p className="muted" role="status">{message}</p>
      <section className="admin-notification-list">
        {grouped.open.length ? grouped.open.map(notificationCard) : <div className="empty-catalog"><strong>مورد بازی وجود ندارد.</strong><p>آخرین نسخهٔ سالم کاتالوگ بدون خطای باز فعال است.</p></div>}
      </section>
      {grouped.resolved.length > 0 && <details className="resolved-notifications"><summary>موارد رفع‌شده ({grouped.resolved.length})</summary><div className="admin-notification-list">{grouped.resolved.map(notificationCard)}</div></details>}
    </main>
  );
}
