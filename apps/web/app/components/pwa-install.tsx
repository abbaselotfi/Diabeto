"use client";

import { useEffect, useState } from "react";
import { withBasePath } from "../../lib/base-path";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export default function PwaInstall() {
  const [installPrompt, setInstallPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined;
    let registration: ServiceWorkerRegistration | undefined;

    const watchInstallingWorker = (worker: ServiceWorker | null) => {
      if (!worker) return;
      worker.addEventListener("statechange", () => {
        if (
          worker.state === "installed" &&
          navigator.serviceWorker.controller
        ) {
          setWaitingWorker(worker);
        }
      });
    };

    const localDevelopment =
      process.env.NODE_ENV !== "production" ||
      ["localhost", "127.0.0.1"].includes(window.location.hostname);

    if (localDevelopment) {
      const resetLocalPwa = async () => {
        if ("serviceWorker" in navigator) {
          const registrations = await navigator.serviceWorker.getRegistrations();
          await Promise.all(registrations.map((item) => item.unregister()));
        }

        if ("caches" in window) {
          const keys = await caches.keys();
          await Promise.all(keys.map((key) => caches.delete(key)));
        }

        const resetKey = "glymize-local-pwa-reset-v2";
        if (
          navigator.serviceWorker?.controller &&
          window.sessionStorage.getItem(resetKey) !== "done"
        ) {
          window.sessionStorage.setItem(resetKey, "done");
          window.location.reload();
        }
      };

      void resetLocalPwa();
    } else if ("serviceWorker" in navigator) {
      void navigator.serviceWorker
        .register(withBasePath("/sw.js"), {
          scope: withBasePath("/"),
          updateViaCache: "none",
        })
        .then((registered) => {
          registration = registered;
          if (
            registered.waiting &&
            navigator.serviceWorker.controller
          ) {
            setWaitingWorker(registered.waiting);
          }
          registered.addEventListener("updatefound", () =>
            watchInstallingWorker(registered.installing),
          );
          interval = setInterval(
            () => void registered.update(),
            30 * 60 * 1000,
          );
        });
    }

    const standalone = window.matchMedia("(display-mode: standalone)").matches;
    setInstalled(standalone);

    const handler = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };

    const installedHandler = () => setInstalled(true);
    const visibilityHandler = () => {
      if (document.visibilityState === "visible") {
        void registration?.update();
      }
    };

    let reloading = false;
    const controllerHandler = () => {
      if (localDevelopment || reloading) return;
      reloading = true;
      window.location.reload();
    };

    window.addEventListener("beforeinstallprompt", handler);
    window.addEventListener("appinstalled", installedHandler, { once: true });
    document.addEventListener("visibilitychange", visibilityHandler);
    navigator.serviceWorker?.addEventListener(
      "controllerchange",
      controllerHandler,
    );

    return () => {
      if (interval) clearInterval(interval);
      window.removeEventListener("beforeinstallprompt", handler);
      window.removeEventListener("appinstalled", installedHandler);
      document.removeEventListener("visibilitychange", visibilityHandler);
      navigator.serviceWorker?.removeEventListener(
        "controllerchange",
        controllerHandler,
      );
    };
  }, []);

  if (waitingWorker) {
    return (
      <div className="update-toast" role="status">
        <span>
          <b>نسخهٔ جدید GLYMIZE آماده است</b>
          <small>داده‌ها و تنظیمات تازه دریافت می‌شوند.</small>
        </span>
        <button
          onClick={() =>
            waitingWorker.postMessage({ type: "SKIP_WAITING" })
          }
          type="button"
        >
          به‌روزرسانی
        </button>
      </div>
    );
  }

  if (installed) {
    return <span className="install-status">✓ نصب شده</span>;
  }

  if (!installPrompt) {
    return (
      <span className="avatar" aria-label="پزشک">
        د
      </span>
    );
  }

  return (
    <button
      className="install-button"
      onClick={async () => {
        await installPrompt.prompt();
        const choice = await installPrompt.userChoice;
        if (choice.outcome === "accepted") {
          setInstallPrompt(null);
        }
      }}
      type="button"
    >
      نصب برنامه
    </button>
  );
}
