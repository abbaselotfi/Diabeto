"use client";

import { useEffect, useState } from "react";
import {
  clearAdminSession,
  consumeAdminSessionFromLocation,
  getAdminIdentity,
  getAdminLoginUrl,
  getAdminSession,
  isAdminApiConfigured,
  type AdminIdentity
} from "../../lib/admin-auth";

type AuthState =
  | { status: "checking" }
  | { status: "local_preview" }
  | { status: "signed_out" }
  | { status: "misconfigured" }
  | { status: "signed_in"; identity: AdminIdentity };

interface PublishEventDetail {
  status: "pending" | "publishing" | "success" | "error";
  message: string;
}

export default function AdminAuthGuard({ children }: Readonly<{ children: React.ReactNode }>) {
  const [auth, setAuth] = useState<AuthState>({ status: "checking" });
  const [publishMessage, setPublishMessage] = useState("");

  useEffect(() => {
    if (process.env.NODE_ENV === "development") {
      // Local preview is intentionally disconnected from the production GitHub
      // admin session so testing UI changes can never publish centrally.
      clearAdminSession();
      setAuth({ status: "local_preview" });
      return;
    }
    if (!isAdminApiConfigured()) {
      setAuth({ status: "misconfigured" });
      return;
    }
    consumeAdminSessionFromLocation();
    if (!getAdminSession()) {
      setAuth({ status: "signed_out" });
      return;
    }
    void getAdminIdentity()
      .then((identity) => setAuth({ status: "signed_in", identity }))
      .catch(() => setAuth({ status: "signed_out" }));
  }, []);

  useEffect(() => {
    const handler = (event: Event) => {
      setPublishMessage((event as CustomEvent<PublishEventDetail>).detail.message);
    };
    window.addEventListener("glymize-publish-status", handler);
    return () => window.removeEventListener("glymize-publish-status", handler);
  }, []);

  if (auth.status === "checking") {
    return <main className="admin-auth-page"><section className="admin-auth-card"><p>در حال بررسی دسترسی مدیریت…</p></section></main>;
  }

  if (auth.status === "local_preview") {
    return <>
      <section className="admin-session-bar">
        <span><b>Local Admin Preview</b> — فقط برای تست روی این دستگاه</span>
        <span>انتشار مرکزی و نشست GitHub در حالت development غیرفعال است.</span>
      </section>
      {children}
    </>;
  }

  if (auth.status === "misconfigured") {
    return <main className="admin-auth-page"><section className="admin-auth-card">
      <span className="eyebrow">Admin authentication</span>
      <h1>سرویس امن مدیریت هنوز متصل نشده است</h1>
      <p>نشانی Cloudflare Worker باید در متغیر <code>NEXT_PUBLIC_ADMIN_API_URL</code> ثبت و برنامه دوباره منتشر شود.</p>
    </section></main>;
  }

  if (auth.status === "signed_out") {
    return <main className="admin-auth-page"><section className="admin-auth-card">
      <span className="eyebrow">Admin only</span>
      <h1>ورود مدیر GLYMIZE</h1>
      <p>فقط حساب GitHub مجاز می‌تواند کاتالوگ، برندها و پوشش بیمه را تغییر داده و روی تمام دستگاه‌ها منتشر کند.</p>
      <a className="primary-button" href={getAdminLoginUrl(window.location.href)}>ورود امن با GitHub</a>
    </section></main>;
  }

  return <>
    <section className="admin-session-bar">
      <span>مدیر واردشده: <b>@{auth.identity.login}</b></span>
      {publishMessage && <span role="status">{publishMessage}</span>}
      <button className="secondary" onClick={() => {
        clearAdminSession();
        setAuth({ status: "signed_out" });
      }} type="button">خروج از مدیریت</button>
    </section>
    {children}
  </>;
}
