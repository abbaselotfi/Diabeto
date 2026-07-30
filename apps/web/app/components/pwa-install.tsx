"use client";

import { useEffect, useState } from "react";
import { withBasePath } from "../../lib/base-path";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export default function PwaInstall() {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    if ("serviceWorker" in navigator) void navigator.serviceWorker.register(withBasePath("/sw.js"), { scope: withBasePath("/") });
    const standalone = window.matchMedia("(display-mode: standalone)").matches;
    setInstalled(standalone);
    const handler = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);
    window.addEventListener("appinstalled", () => setInstalled(true), { once: true });
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  if (installed) return <span className="install-status">✓ نصب شده</span>;
  if (!installPrompt) return <span className="avatar" aria-label="پزشک">د</span>;

  return (
    <button className="install-button" onClick={async () => {
      await installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      if (choice.outcome === "accepted") setInstallPrompt(null);
    }} type="button">نصب برنامه</button>
  );
}
